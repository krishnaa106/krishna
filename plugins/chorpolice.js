module.exports = {
    name: "cpg",
    desc: "Chor Police Game",
    utility: "game",
    fromMe: false,
    gameData: {},
    async execute(sock, msg, args) {
        const groupJID = msg.key.remoteJid;
        if (!this.gameData[groupJID]) this.gameData[groupJID] = { active: false, participants: {}, scores: {}, suspects: [], listener: null };
        
        const SUDO = process.env.SUDO ? process.env.SUDO.split(",") : []; // Get SUDO users

        if (args[0] === "stop") {
            const senderJID = msg.key.participant;
            const botJID = sock.user.id.split(":")[0] + "@s.whatsapp.net";
            const isSudo = SUDO.includes(senderJID.split("@")[0]) || senderJID === botJID;
        
            if (!this.gameData[groupJID].participants[senderJID] && !isSudo) {
                return await sock.sendMessage(groupJID, { text: "_Only a joined player or a SUDO user can stop the game!_" });
            }
        
            this.gameData[groupJID] = { active: false, participants: {}, scores: {}, suspects: [], listener: null };
            return await sock.sendMessage(groupJID, { text: "_Game stopped! All scores reset._" });
        }        

        
        if (this.gameData[groupJID].active) return await sock.sendMessage(groupJID, { text: "_A game is already running!_" });
        
        this.gameData[groupJID].active = true;
        this.gameData[groupJID].participants = {};
        this.gameData[groupJID].scores = {};
        
        await sock.sendMessage(groupJID, { text: "🎮 \`CHOR POLICE GAME\` 🎮\nType 'join' to participate!\n(_4 players required_)" });
        
        if (this.gameData[groupJID].listener) sock.ev.off("messages.upsert", this.gameData[groupJID].listener);

        this.gameData[groupJID].listener = async ({ messages }) => {
            for (const newMsg of messages) {
                if (newMsg.key.remoteJid !== groupJID) continue;
                const senderJID = newMsg.key.participant;
                const messageText = (newMsg.message.conversation || newMsg.message.extendedTextMessage?.text || "").toLowerCase();
                
                if (messageText === "join" && Object.keys(this.gameData[groupJID].participants).length < 4) {
                    if (!this.gameData[groupJID].participants[senderJID]) {
                        this.gameData[groupJID].participants[senderJID] = { jid: senderJID };
                        this.gameData[groupJID].scores[senderJID] = this.gameData[groupJID].scores[senderJID] || 0;
                        
                        const joinCount = Object.keys(this.gameData[groupJID].participants).length;
                        const numberEmojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
                        await sock.sendMessage(groupJID, { text: `✅ @${senderJID.split("@")[0]} joined!`, mentions: [senderJID] });
                        await sock.sendMessage(groupJID, { react: { text: numberEmojis[joinCount - 1], key: newMsg.key } });
                    }
                    if (Object.keys(this.gameData[groupJID].participants).length === 4) this.assignRoles(sock, groupJID);
                }
            }
        };
        
        sock.ev.on("messages.upsert", this.gameData[groupJID].listener);
    },


    async assignRoles(sock, groupJID) {
        if (!this.gameData[groupJID].roundNumber) this.gameData[groupJID].roundNumber = 1;
        else this.gameData[groupJID].roundNumber++;
    
        await sock.sendMessage(groupJID, { text: `🎮 *ROUND ${this.gameData[groupJID].roundNumber} STARTS!*` });
    
        const roles = ["Officer", "Police", "Daket", "Chor"];
        roles.sort(() => Math.random() - 0.5); // Shuffle roles fairly
    
        const shuffledPlayers = Object.keys(this.gameData[groupJID].participants);
        shuffledPlayers.sort(() => Math.random() - 0.5); // Shuffle players as well
    
        shuffledPlayers.forEach((jid, index) => {
            this.gameData[groupJID].participants[jid].role = roles[index];
            sock.sendMessage(jid, { text: `🔐 Your role: ${roles[index]}` });
        });
    
        this.startRound(sock, groupJID);
    },    
    
    async startRound(sock, groupJID) {
        await sock.sendMessage(groupJID, { text: "🚨 `GAME STARTS!`" });
        setTimeout(async () => {
            await sock.sendMessage(groupJID, { text: "NOW `OFFICER` WILL ASSIGN DUTY" });
        }, 500);
    
        if (this.gameData[groupJID].listener) sock.ev.off("messages.upsert", this.gameData[groupJID].listener);
    
        this.gameData[groupJID].hasAskedWhoIsPolice = false;
        this.gameData[groupJID].policeReplied = false;
        this.gameData[groupJID].reactionEnabled = false;
    
        this.gameData[groupJID].listener = async ({ messages }) => {
            for (const newMsg of messages) {
                if (newMsg.key.remoteJid !== groupJID) continue;
                const senderJID = newMsg.key.participant;
                const messageText = (newMsg.message.conversation || newMsg.message.extendedTextMessage?.text || "").toLowerCase();
                const participants = this.gameData[groupJID].participants;
    
                if (participants[senderJID]?.role === "Officer" && messageText === "who is police" && !this.gameData[groupJID].hasAskedWhoIsPolice) {
                    this.gameData[groupJID].hasAskedWhoIsPolice = true;
                    await sock.sendMessage(groupJID, { react: { text: "🧑🏻‍💼", key: newMsg.key } });
                }
                if (participants[senderJID]?.role === "Police" && messageText === "me" && this.gameData[groupJID].hasAskedWhoIsPolice && !this.gameData[groupJID].policeReplied) {
                    this.gameData[groupJID].policeReplied = true;
                    this.gameData[groupJID].reactionEnabled = true;
                    await sock.sendMessage(groupJID, { react: { text: "👮🏻‍♂", key: newMsg.key } });
                }
                if (this.gameData[groupJID].reactionEnabled) {
                    if (participants[senderJID]?.role === "Officer" && messageText === "officer") {
                        await sock.sendMessage(groupJID, { react: { text: "🧑🏻‍💼", key: newMsg.key } });
                    }
                    if (participants[senderJID]?.role === "Police" && messageText === "police") {
                        await sock.sendMessage(groupJID, { react: { text: "👮🏻‍♂", key: newMsg.key } });
                    }
                }
                if (participants[senderJID]?.role === "Officer" && ["find chor", "find daket"].includes(messageText)) {
                    this.findSuspects(sock, groupJID, messageText);
                }
                if (participants[senderJID]?.role === "Police" && ["1", "2"].includes(messageText)) {
                    this.evaluateGuess(sock, groupJID, senderJID, this.gameData[groupJID].suspects[parseInt(messageText) - 1]);
                }
            }
        };
    
        sock.ev.on("messages.upsert", this.gameData[groupJID].listener);
    },    

    async findSuspects(sock, groupJID, target) {
        const participants = this.gameData[groupJID].participants;
        const suspects = Object.keys(participants).filter(jid => ["Chor", "Daket"].includes(participants[jid].role)).sort(() => Math.random() - 0.5);
        
        this.gameData[groupJID].target = target.includes("chor") ? "Chor" : "Daket";
        this.gameData[groupJID].suspects = suspects;
        
        await sock.sendMessage(groupJID, { text: `\`SUSPECTS:\`
1️⃣ @${suspects[0].split("@")[0]}
2️⃣ @${suspects[1].split("@")[0]}`, mentions: suspects });
    },

    async evaluateGuess(sock, groupJID, policeJID, suspectJID) {
        const target = this.gameData[groupJID].target;
        const participants = this.gameData[groupJID].participants;
        const scores = this.gameData[groupJID].scores;
    
        if (!target || !suspectJID) return;
        const suspectRole = participants[suspectJID].role;
        const officerJID = Object.keys(participants).find(jid => participants[jid].role === "Officer");
    
        let resultMessage = "";
    
        if ((target === "Chor" && suspectRole === "Chor") || (target === "Daket" && suspectRole === "Daket")) {
            scores[officerJID] += 50;
            scores[policeJID] += 10;
            scores[suspectJID] -= 5;
    
            for (const [jid, player] of Object.entries(participants)) {
                if (jid !== suspectJID) {
                    if (player.role === "Daket") scores[jid] += 5;
                    if (player.role === "Chor") scores[jid] += 1;
                }
            }
    
            resultMessage = `✅ _Correct! @${suspectJID.split("@")[0]} was the ${target}!_ 🎉`;
        } else {
            scores[officerJID] -= 30;
            scores[policeJID] -= 6;
    
            for (const [jid, player] of Object.entries(participants)) {
                if (player.role === "Daket") scores[jid] += 5;
                if (player.role === "Chor") scores[jid] += 1;
            }
    
            resultMessage = `❌ _Wrong guess! @${suspectJID.split("@")[0]} was actually the ${suspectRole}._`;
        }
    
        await sock.sendMessage(groupJID, { text: resultMessage, mentions: [suspectJID, policeJID, officerJID] });
        await this.showScores(sock, groupJID);
    
        await new Promise(resolve => setTimeout(resolve, 5000));
    
        this.assignRoles(sock, groupJID);
    },    

    async showScores(sock, groupJID) {
        const scores = this.gameData[groupJID].scores;
        let scoreMessage = "📊 \`Current Scores:\`\n";
        
        for (const [jid, score] of Object.entries(scores)) {
            scoreMessage += `@${jid.split("@")[0]}: ${score} points\n`;
        }
        
        await sock.sendMessage(groupJID, { text: scoreMessage, mentions: Object.keys(scores) });
    },
};
// 9th full working, with reaction