const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Ensure database directory exists
const dbPath = path.join(__dirname, "../games");
if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath, { recursive: true });
}
const gameDataPath = path.join(dbPath, "points.json");

// Triggers configuration
const TRIGGERS = {
    askPolice: [
        "who is police", "police kon", "tell me who is police",
        "who is police?", "police kon?", "police?", "who's police",
        "police kon h", "police kon hai", "police kon hai?"
    ],
    replyPolice: ["me", "i am", "it's me", "i'm police", "me police", "me hu", "mai", "main", "its me"],
    findChor: ["find chor", "catch chor", "chor ko dhundho", "find the chor", "chor?"],
    findDaket: ["find daket", "catch daket", "daket ko dhundho", "find the daket", "daket?"]
};

// Role messages
const ROLE_MESSAGES = {
    Chor: "🔐 YOUR ROLE 🔐\n> Chor\nDon't tell anyone",
    Daket: "🔐 YOUR ROLE 🔐\n> Daket\nDon't tell anyone",
    Officer: "🔐 YOUR ROLE 🔐\n> Officer\nAsk who is police",
    Police: "🔐 YOUR ROLE 🔐\n> Police\nIf officer asks:\nwho is police\nReply with: me"
};

// Load game data from JSON file
function loadGameData() {
    try {
        if (fs.existsSync(gameDataPath)) {
            return JSON.parse(fs.readFileSync(gameDataPath, "utf-8"));
        }
    } catch (error) {
        console.error("Error loading game data:", error);
    }
    return {};
}

// Save game data to JSON file
function saveGameData(data) {
    try {
        fs.writeFileSync(gameDataPath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
        console.error("Error saving game data:", error);
    }
}

// Initialize or update player data
function initPlayerData(jid, gameData) {
    if (!gameData[jid]) {
        gameData[jid] = { points: 0, gamesPlayed: 0 };
    }
    return gameData;
}

// Check if message matches any trigger
function matchesTrigger(message, triggers) {
    const cleanMsg = message.toLowerCase().replace(/[^\w\s]/g, '');
    return triggers.some(trigger => 
        cleanMsg.includes(trigger.toLowerCase())
    );
}

module.exports = [
    {
        name: "cpg",
        desc: "Chor Police Game",
        utility: "game",
        fromMe: false,
        gameData: {},
        persistentData: loadGameData(),

        async execute(sock, msg, args) {
            const groupJID = msg.key.remoteJid;
            if (!this.gameData[groupJID]) {
                this.gameData[groupJID] = { 
                    active: false, 
                    participants: {}, 
                    scores: {}, 
                    suspects: [], 
                    listener: null,
                    roundNumber: 0
                };
            }

            const SUDO = process.env.SUDO ? process.env.SUDO.split(",") : [];

            if (args[0] === "stop") {
                const senderJID = msg.key.participant || msg.key.remoteJid;
                const botJID = sock.user.id.split(":")[0] + "@s.whatsapp.net";
                const isSudo = SUDO.includes(senderJID.split("@")[0]) || senderJID === botJID;

                if (!this.gameData[groupJID].participants[senderJID] && !isSudo) {
                    return await sock.sendMessage(groupJID, { text: "_Only a joined player or a SUDO user can stop the game!_" });
                }

                this.saveFinalScores(groupJID);
                this.gameData[groupJID] = { active: false, participants: {}, scores: {}, suspects: [], listener: null, roundNumber: 0 };
                return await sock.sendMessage(groupJID, { text: "_Game stopped! Scores have been saved._" });
            }

            if (this.gameData[groupJID].active) {
                return await sock.sendMessage(groupJID, { text: "_A game is already running!_" });
            }

            this.gameData[groupJID].active = true;
            this.gameData[groupJID].participants = {};
            this.gameData[groupJID].scores = {};
            this.gameData[groupJID].roundNumber = 0;

            await sock.sendMessage(groupJID, { text: "🎮 `CHOR POLICE GAME` 🎮\nType 'join' to participate!\n(_4 players required_)" });

            if (this.gameData[groupJID].listener) {
                sock.ev.off("messages.upsert", this.gameData[groupJID].listener);
            }

            this.gameData[groupJID].listener = async ({ messages }) => {
                for (const newMsg of messages) {
                    if (newMsg.key.remoteJid !== groupJID || !newMsg.message) continue;
                    
                    const senderJID = newMsg.key.participant || newMsg.key.remoteJid;
                    const messageText = (newMsg.message.conversation || newMsg.message.extendedTextMessage?.text || "").toLowerCase();

                    if (messageText === "join" && Object.keys(this.gameData[groupJID].participants).length < 4) {
                        if (!this.gameData[groupJID].participants[senderJID]) {
                            this.persistentData = initPlayerData(senderJID, this.persistentData);
                            this.gameData[groupJID].participants[senderJID] = { jid: senderJID };
                            this.gameData[groupJID].scores[senderJID] = 0;

                            const joinCount = Object.keys(this.gameData[groupJID].participants).length;
                            const numberEmojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
                            
                            await sock.sendMessage(groupJID, { 
                                text: `✅ @${senderJID.split("@")[0]} joined!\n> Total points: ${this.persistentData[senderJID].points}`, 
                                mentions: [senderJID] 
                            });
                            await sock.sendMessage(groupJID, { 
                                react: { text: numberEmojis[joinCount - 1], key: newMsg.key } 
                            });
                        }
                        
                        if (Object.keys(this.gameData[groupJID].participants).length === 4) {
                            this.assignRoles(sock, groupJID);
                        }
                    }
                }
            };

            sock.ev.on("messages.upsert", this.gameData[groupJID].listener);
        },

        saveFinalScores(groupJID) {
            const gameScores = this.gameData[groupJID].scores;
            for (const [jid, scoreEarnedThisRound] of Object.entries(gameScores)) {
                this.persistentData = initPlayerData(jid, this.persistentData);
                this.persistentData[jid].points += scoreEarnedThisRound;
                this.persistentData[jid].gamesPlayed += 1;
            }
            saveGameData(this.persistentData);
        },

        getUltraRandomIndex(length) {
            const randomBytes = crypto.randomBytes(4);
            return randomBytes.readUInt32BE(0) % length;
        },

        async assignRoles(sock, groupJID) {
            this.gameData[groupJID].roundNumber++;
            await sock.sendMessage(groupJID, { text: `🎮 ROUND ${this.gameData[groupJID].roundNumber} STARTS!` });

            const roles = ["Officer", "Police", "Daket", "Chor"];
            const players = Object.keys(this.gameData[groupJID].participants);
            const assigned = new Set();

            for (let i = players.length - 1; i > 0; i--) {
                const j = this.getUltraRandomIndex(i + 1);
                [players[i], players[j]] = [players[j], players[i]];
            }

            for (const role of roles) {
                let index;
                do {
                    index = this.getUltraRandomIndex(players.length);
                } while (assigned.has(index));
                assigned.add(index);

                const jid = players[index];
                this.gameData[groupJID].participants[jid].role = role;
                await sock.sendMessage(jid, { text: ROLE_MESSAGES[role] });
            }

            this.startRound(sock, groupJID);
        },

        async startRound(sock, groupJID) {
            if (this.gameData[groupJID].listener) {
                sock.ev.off("messages.upsert", this.gameData[groupJID].listener);
            }

            this.gameData[groupJID].hasAskedWhoIsPolice = false;
            this.gameData[groupJID].policeReplied = false;
            this.gameData[groupJID].reactionEnabled = false;

            this.gameData[groupJID].listener = async ({ messages }) => {
                for (const newMsg of messages) {
                    if (newMsg.key.remoteJid !== groupJID || !newMsg.message) continue;
                    
                    const senderJID = newMsg.key.participant || newMsg.key.remoteJid;
                    const messageText = (newMsg.message.conversation || newMsg.message.extendedTextMessage?.text || "").toLowerCase();
                    const participants = this.gameData[groupJID].participants;

                    if (!participants[senderJID]) continue;

                    if (participants[senderJID].role === "Officer" && 
                        matchesTrigger(messageText, TRIGGERS.askPolice) && 
                        !this.gameData[groupJID].hasAskedWhoIsPolice) {
                        this.gameData[groupJID].hasAskedWhoIsPolice = true;
                        await sock.sendMessage(groupJID, { react: { text: "🧑🏻‍💼", key: newMsg.key } });
                    }
                    
                    if (participants[senderJID].role === "Police" && 
                        matchesTrigger(messageText, TRIGGERS.replyPolice) && 
                        this.gameData[groupJID].hasAskedWhoIsPolice && 
                        !this.gameData[groupJID].policeReplied) {
                        this.gameData[groupJID].policeReplied = true;
                        this.gameData[groupJID].reactionEnabled = true;
                        await sock.sendMessage(groupJID, { react: { text: "👮🏻‍♂", key: newMsg.key } });
                    }
                    
                    if (this.gameData[groupJID].reactionEnabled) {
                        if (participants[senderJID].role === "Officer" && messageText === "officer") {
                            await sock.sendMessage(groupJID, { react: { text: "🧑🏻‍💼", key: newMsg.key } });
                        }
                        if (participants[senderJID].role === "Police" && messageText === "police") {
                            await sock.sendMessage(groupJID, { react: { text: "👮🏻‍♂", key: newMsg.key } });
                        }
                    }
                    
                    if (participants[senderJID].role === "Officer") {
                        if (matchesTrigger(messageText, TRIGGERS.findChor)) {
                            await this.findSuspects(sock, groupJID, "find chor");
                        } else if (matchesTrigger(messageText, TRIGGERS.findDaket)) {
                            await this.findSuspects(sock, groupJID, "find daket");
                        }
                    }
                    
                    if (participants[senderJID].role === "Police" && ["1", "2"].includes(messageText)) {
                        await this.evaluateGuess(sock, groupJID, senderJID, this.gameData[groupJID].suspects[parseInt(messageText) - 1]);
                    }
                }
            };

            sock.ev.on("messages.upsert", this.gameData[groupJID].listener);
        },

        async findSuspects(sock, groupJID, target) {
            const participants = this.gameData[groupJID].participants;
            const suspects = Object.keys(participants)
                .filter(jid => ["Chor", "Daket"].includes(participants[jid].role))
                .sort(() => 0.5 - Math.random());

            this.gameData[groupJID].target = target.includes("chor") ? "Chor" : "Daket";
            this.gameData[groupJID].suspects = suspects.slice(0, 2);

            await sock.sendMessage(groupJID, {
                text: `\`SUSPECTS:\`\n1️⃣ @${suspects[0].split("@")[0]}\n2️⃣ @${suspects[1].split("@")[0]}`,
                mentions: suspects.slice(0, 2)
            });
        },

        async evaluateGuess(sock, groupJID, policeJID, suspectJID) {
            const target = this.gameData[groupJID].target;
            const participants = this.gameData[groupJID].participants;
            const scores = this.gameData[groupJID].scores;

            if (!target || !suspectJID) return;
            
            const suspectRole = participants[suspectJID]?.role;
            if (!suspectRole) return;

            const officerJID = Object.keys(participants).find(jid => participants[jid].role === "Officer");
            if (!officerJID) return;

            const scoreChanges = {};
            let resultMessage = "";

            if ((target === "Chor" && suspectRole === "Chor") || (target === "Daket" && suspectRole === "Daket")) {
                scoreChanges[officerJID] = (scoreChanges[officerJID] || 0) + 50;
                scoreChanges[policeJID] = (scoreChanges[policeJID] || 0) + 10;
                scoreChanges[suspectJID] = (scoreChanges[suspectJID] || 0) - 5;

                for (const [jid, player] of Object.entries(participants)) {
                    if (jid !== suspectJID) {
                        if (player.role === "Daket") scoreChanges[jid] = (scoreChanges[jid] || 0) + 5;
                        if (player.role === "Chor") scoreChanges[jid] = (scoreChanges[jid] || 0) + 1;
                    }
                }

                resultMessage = `✅ CORRECT!\n> @${suspectJID.split("@")[0]} was the ${target}!\n+50 Officer, +10 Police, -5 ${target} 🎉`;
            } else {
                scoreChanges[officerJID] = (scoreChanges[officerJID] || 0) - 30;
                scoreChanges[policeJID] = (scoreChanges[policeJID] || 0) - 6;

                for (const [jid, player] of Object.entries(participants)) {
                    if (player.role === "Daket") scoreChanges[jid] = (scoreChanges[jid] || 0) + 5;
                    if (player.role === "Chor") scoreChanges[jid] = (scoreChanges[jid] || 0) + 1;
                }

                resultMessage = `❌ WRONG GUESS!\n> @${suspectJID.split("@")[0]} was actually the ${suspectRole}.\n-30 Officer, -6 Police`;
            }

            for (const [jid, change] of Object.entries(scoreChanges)) {
                this.gameData[groupJID].scores[jid] = (this.gameData[groupJID].scores[jid] || 0) + change;
            }

            this.saveFinalScores(groupJID);

            await sock.sendMessage(groupJID, { 
                text: resultMessage, 
                mentions: [suspectJID, policeJID, officerJID] 
            });
            
            await this.showScores(sock, groupJID);

            await new Promise(resolve => setTimeout(resolve, 10000));
            this.assignRoles(sock, groupJID);
        },

        async showScores(sock, groupJID) {
            const scores = this.gameData[groupJID].scores;
            let scoreMessage = "📊 CURRENT SCORES:\n";

            const sortedScores = Object.entries(scores).sort((a, b) => b[1] - a[1]);
            
            for (const [jid, score] of sortedScores) {
                const totalPoints = this.persistentData[jid]?.points || 0;
                scoreMessage += `@${jid.split("@")[0]}: ${totalPoints}\n`;
            }

            await sock.sendMessage(groupJID, { 
                text: scoreMessage, 
                mentions: Object.keys(scores) 
            });
        }
    },
    {
        name: "leaderboard",
        desc: "Show top players",
        utility: "game",
        fromMe: false,

        async execute(sock, msg, args) {
            const gameData = loadGameData();
            const topPlayers = Object.entries(gameData)
                .sort((a, b) => b[1].points - a[1].points)
                .slice(0, 10)
                .map(([jid, data]) => ({ jid, ...data }));

            let leaderboard = "🏁 TOP 10 PLAYERS 🏁\n\n";
            topPlayers.forEach((player, index) => {
                leaderboard += `${index + 1}. @${player.jid.split("@")[0]}\n`;
                leaderboard += `> Points: ${player.points}\n`;
                leaderboard += `> Games Played: ${player.gamesPlayed}\n\n`;
            });

            await sock.sendMessage(msg.key.remoteJid, {
                text: leaderboard.trim(),
                mentions: topPlayers.map(p => p.jid)
            });
        }
    }
];