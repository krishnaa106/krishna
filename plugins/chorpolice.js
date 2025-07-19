const { addPoints, getPoints, getTopPlayers } = require("../games/pointsManager");
const crypto = require("crypto");
const gameLock = require("../games/gameLock");

if (!globalThis.chorPoliceActiveGames) globalThis.chorPoliceActiveGames = {};
const activeGames = globalThis.chorPoliceActiveGames;

const TRIGGERS = {
    askPolice: ["who is police", "police kon", "who is police?", "police?", "police kon hai"],
    replyPolice: ["me", "i am", "its me", "me police", "me hu", "mai", "main"],
    findChor: ["find chor", "catch chor", "chor?", "chor ko dhundo"],
    findDaket: ["find daket", "catch daket", "daket?", "daket ko dhundo"]
};

const ROLE_MESSAGES = {
    Chor: "🔐 YOUR ROLE 🔐\n> Chor\nDon't tell anyone",
    Daket: "🔐 YOUR ROLE 🔐\n> Daket\nDon't tell anyone",
    Officer: "🔐 YOUR ROLE 🔐\n> Officer\nAsk who is police",
    Police: "🔐 YOUR ROLE 🔐\n> Police\nIf officer asks:\nwho is police\nReply with: me"
};

function matchesTrigger(message, triggers) {
    const txt = message.toLowerCase().replace(/[^\w\s]/g, '');
    return triggers.some(t => txt.includes(t));
}

module.exports = [
    {
        name: "cpg",
        desc: "Chor Police Game",
        utility: "game",
        fromMe: false,
        gameData: {},

        async execute(sock, msg, args) {
            const groupJID = msg.key.remoteJid;

            if (args[0] === "stop") {
                const senderJID = msg.key.participant || msg.key.remoteJid;
                const botJID = sock.user.id.split(":")[0] + "@s.whatsapp.net";
                const SUDO = process.env.SUDO ? process.env.SUDO.split(",") : [];
                const isSudo = SUDO.includes(senderJID.split("@")[0]) || senderJID === botJID;
                const isPlayer = this.gameData[groupJID]?.participants?.[senderJID];

                if (!activeGames[groupJID]) {
                    return await sock.sendMessage(groupJID, { text: "_No game running here._" });
                }

                if (!isPlayer && !isSudo) {
                    return await sock.sendMessage(groupJID, {
                        text: "_Only a joined player can stop the game!_"
                    });
                }

                if (this.gameData[groupJID]?.listener)
                    sock.ev.off("messages.upsert", this.gameData[groupJID].listener);

                await this.saveFinalScores(groupJID);
                delete this.gameData[groupJID];
                delete activeGames[groupJID];
                gameLock.clearGame(groupJID);

                return await sock.sendMessage(groupJID, { text: "_Game stopped! Scores saved._" });
            }

            if (gameLock.isGameActive(groupJID)) {
                return await sock.sendMessage(groupJID, {
                    text: "_Another game is already running in this chat!_"
                });
            }

            activeGames[groupJID] = true;
            gameLock.setGameActive(groupJID, "chorpolice");

            const data = this.gameData[groupJID] = {
                participants: {},
                scores: {},
                hasAskedWhoIsPolice: false,
                policeReplied: false,
                reactionEnabled: false,
                suspects: [],
                listener: null
            };

            await sock.sendMessage(groupJID, { text: "🎮 `CHOR POLICE GAME` 🎮\n> Type: 'join' to participate!" });

            let joinTimeout;
            const resetJoinTimeout = () => {
                if (joinTimeout) clearTimeout(joinTimeout);
                joinTimeout = setTimeout(async () => {
                    if (Object.keys(data.participants).length < 4) {
                        await sock.sendMessage(groupJID, { text: "_Game canceled due to not enough players!_" });
                        if (data.listener) sock.ev.off("messages.upsert", data.listener);
                        delete this.gameData[groupJID];
                        delete activeGames[groupJID];
                        gameLock.clearGame(groupJID);
                    }
                }, 60000);
            };
            resetJoinTimeout();

            const listener = async ({ messages }) => {
                for (const newMsg of messages) {
                    if (newMsg.key.remoteJid !== groupJID || !newMsg.message) continue;

                    const senderJID = newMsg.key.participant || newMsg.key.remoteJid;
                    const text = (newMsg.message.conversation || newMsg.message.extendedTextMessage?.text || "").toLowerCase();

                    if (text === "leave" && data.participants[senderJID]) {
                        await sock.sendMessage(groupJID, { text: "_Game stopped by a player!_" });
                        if (data.listener) sock.ev.off("messages.upsert", data.listener);
                        await this.saveFinalScores(groupJID);
                        delete this.gameData[groupJID];
                        delete activeGames[groupJID];
                        gameLock.clearGame(groupJID);
                        return;
                    }

                    if (text === "join" && Object.keys(data.participants).length < 4) {
                        if (!data.participants[senderJID]) {
                            data.participants[senderJID] = { jid: senderJID };
                            data.scores[senderJID] = 0;

                            const joined = Object.keys(data.participants).length;
                            const totalPlayers = 4;
                            const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
                            const userPoints = await getPoints(senderJID);
                            await sock.sendMessage(groupJID, {
                                text: `✅ @${senderJID.split("@")[0]} joined!\n> Total points: ${userPoints}\n> ${joined}/${totalPlayers}`,
                                mentions: [senderJID]
                            });
                            await sock.sendMessage(groupJID, {
                                react: { text: emojis[joined - 1], key: newMsg.key }
                            });
                            resetJoinTimeout();
                        }

                        if (Object.keys(data.participants).length === 4) {
                            clearTimeout(joinTimeout);
                            await this.assignRoles(sock, groupJID);
                        }
                    }
                }
            };

            data.listener = listener;
            sock.ev.on("messages.upsert", listener);
        },

        async saveFinalScores(groupJID) {
            const scores = this.gameData[groupJID]?.scores || {};
            for (const [jid, delta] of Object.entries(scores)) {
                await addPoints(jid, delta);
            }
        },

        getUltraRandomIndex(len) {
            const rand = crypto.randomBytes(4).readUInt32BE(0);
            return rand % len;
        },

        async assignRoles(sock, groupJID) {
            const players = Object.keys(this.gameData[groupJID].participants);
            const roles = ["Officer", "Police", "Daket", "Chor"];
            players.sort(() => 0.5 - Math.random());

            for (let i = 0; i < 4; i++) {
                const jid = players[i];
                this.gameData[groupJID].participants[jid].role = roles[i];
                await sock.sendMessage(jid, { text: ROLE_MESSAGES[roles[i]] });
            }

            await sock.sendMessage(groupJID, { text: `🎮 ROUND STARTS! 🎮` });
            await this.startRound(sock, groupJID);
        },

        async startRound(sock, groupJID) {
            const data = this.gameData[groupJID];
            if (data.listener) sock.ev.off("messages.upsert", data.listener);

            data.hasAskedWhoIsPolice = false;
            data.policeReplied = false;
            data.reactionEnabled = false;

            const listener = async ({ messages }) => {
                for (const m of messages) {
                    if (m.key.remoteJid !== groupJID || !m.message) continue;

                    const jid = m.key.participant || m.key.remoteJid;
                    const txt = (m.message.conversation || m.message.extendedTextMessage?.text || "").toLowerCase();
                    const p = data.participants;

                    if (!p[jid]) continue;

                    if (p[jid].role === "Officer" && matchesTrigger(txt, TRIGGERS.askPolice) && !data.hasAskedWhoIsPolice) {
                        data.hasAskedWhoIsPolice = true;
                        await sock.sendMessage(groupJID, { react: { text: "🧑🏻‍💼", key: m.key } });
                    }

                    if (p[jid].role === "Police" && matchesTrigger(txt, TRIGGERS.replyPolice) && data.hasAskedWhoIsPolice && !data.policeReplied) {
                        data.policeReplied = true;
                        data.reactionEnabled = true;
                        await sock.sendMessage(groupJID, { react: { text: "👮🏻‍♂", key: m.key } });
                    }

                    if (data.reactionEnabled) {
                        if (p[jid].role === "Officer" && txt === "officer") {
                            await sock.sendMessage(groupJID, { react: { text: "🧑🏻‍💼", key: m.key } });
                        } else if (p[jid].role === "Police" && txt === "police") {
                            await sock.sendMessage(groupJID, { react: { text: "👮🏻‍♂", key: m.key } });
                        }
                    }

                    if (p[jid].role === "Officer") {
                        if (matchesTrigger(txt, TRIGGERS.findChor)) await this.findSuspects(sock, groupJID, "chor");
                        else if (matchesTrigger(txt, TRIGGERS.findDaket)) await this.findSuspects(sock, groupJID, "daket");
                    }

                    if (p[jid].role === "Police" && ["1", "2"].includes(txt)) {
                        const suspect = data.suspects[parseInt(txt) - 1];
                        if (suspect) await this.evaluateGuess(sock, groupJID, jid, suspect);
                    }
                }
            };

            data.listener = listener;
            sock.ev.on("messages.upsert", listener);
        },

        async findSuspects(sock, groupJID, targetType) {
            const p = this.gameData[groupJID].participants;
            const suspects = Object.keys(p)
                .filter(jid => ["Chor", "Daket"].includes(p[jid].role))
                .sort(() => 0.5 - Math.random())
                .slice(0, 2);

            this.gameData[groupJID].target = targetType === "chor" ? "Chor" : "Daket";
            this.gameData[groupJID].suspects = suspects;

            await sock.sendMessage(groupJID, {
                text: `\`SUSPECTS:\`\n1️⃣ @${suspects[0].split("@")[0]}\n2️⃣ @${suspects[1].split("@")[0]}`,
                mentions: suspects
            });
        },

        async evaluateGuess(sock, groupJID, policeJID, suspectJID) {
            const { participants, scores, target } = this.gameData[groupJID];
            const officerJID = Object.keys(participants).find(j => participants[j].role === "Officer");
            const suspectRole = participants[suspectJID]?.role;

            const change = {};
            let result = "";

            if (suspectRole === target) {
                change[officerJID] = 30;
                change[policeJID] = 20;
                change[suspectJID] = -20;
                result = `✅ CORRECT!\n> @${suspectJID.split("@")[0]} was the ${target}! 🎉`;
            } else {
                change[officerJID] = -30;
                change[policeJID] = -20;
                result = `❌ WRONG GUESS!\n> @${suspectJID.split("@")[0]} was the ${suspectRole}.`;
            }

            for (const jid of Object.keys(participants)) {
                if (participants[jid].role === "Daket") change[jid] = (change[jid] || 0) + 5;
                if (participants[jid].role === "Chor") change[jid] = (change[jid] || 0) + 1;
            }

            for (const [jid, delta] of Object.entries(change)) {
                scores[jid] = (scores[jid] || 0) + delta;
            }

            await sock.sendMessage(groupJID, {
                text: result,
                mentions: [suspectJID, policeJID, officerJID]
            });

            await this.showScores(sock, groupJID);
            await this.saveFinalScores(groupJID);
            if (this.gameData[groupJID].listener)
                sock.ev.off("messages.upsert", this.gameData[groupJID].listener);
            delete this.gameData[groupJID];
            delete activeGames[groupJID];
            gameLock.clearGame(groupJID);
        },

        async showScores(sock, groupJID) {
            const scores = this.gameData[groupJID]?.scores || {};
            let text = "📊 CURRENT SCORES:\n";
            const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);

            for (const [jid, scr] of sorted) {
                const total = await getPoints(jid);
                text += `@${jid.split("@")[0]}: ${total}\n`;
            }

            await sock.sendMessage(groupJID, { text, mentions: Object.keys(scores) });
        }
    },
    {
        name: "leaderboard",
        desc: "Show top players",
        utility: "game",
        fromMe: false,
        async execute(sock, msg) {
            const top = await getTopPlayers(10);
            let text = "🏁 TOP 10 PLAYERS 🏁\n\n";
            top.forEach((data, i) => {
                text += `${i + 1}. @${data.jid.split("@")[0]}\n> Points: ${data.points}\n> Games Played: ${data.games_played}\n\n`;
            });
            await sock.sendMessage(msg.key.remoteJid, {
                text: text.trim(),
                mentions: top.map(data => data.jid)
            });
        }
    },
    {
        name: "point",
        desc: "Show user points",
        utility: "game",
        fromMe: false,
        async execute(sock, msg) {
            const targetJID =
                msg.message?.extendedTextMessage?.contextInfo?.participant ||
                msg.key.participant ||
                msg.key.remoteJid;
            const points = await getPoints(targetJID);
            await sock.sendMessage(
                msg.key.remoteJid,
                {
                    text: `• Points: *${points}*`,
                },
            );
        }
    }
];