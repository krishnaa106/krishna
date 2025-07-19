const fs = require("fs");
const path = require("path");
const gameLock = require("../games/gameLock");

const wordFilePath = path.join(__dirname, "../media/assets/wordlist.txt");

if (!globalThis.wordGameActive) globalThis.wordGameActive = {};
const activeWG = globalThis.wordGameActive;

const gameDataPath = path.join(__dirname, "../games");
if (!fs.existsSync(gameDataPath)) fs.mkdirSync(gameDataPath, { recursive: true });
const scoreFile = path.join(gameDataPath, "points.json");

function loadPoints() {
    try {
        return fs.existsSync(scoreFile) ? JSON.parse(fs.readFileSync(scoreFile, "utf-8")) : {};
    } catch (e) {
        console.error("Error reading score DB:", e);
        return {};
    }
}

function savePoints(data) {
    try {
        fs.writeFileSync(scoreFile, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
        console.error("Error saving score DB:", e);
    }
}

function initPlayerData(jid, db) {
    if (!db[jid]) db[jid] = { points: 0, gamesPlayed: 0 };
    return db;
}

function getRandomWord() {
    const words = fs.readFileSync(wordFilePath, "utf-8")
        .split("\n").map(w => w.trim().toLowerCase()).filter(Boolean);
    return words[Math.floor(Math.random() * words.length)];
}

function getMaskedWord(word) {
    const len = word.length;
    let dashCount = 1;

    if (len <= 2) dashCount = 1;
    else if (len <= 4) dashCount = 1;
    else if (len <= 6) dashCount = 2;
    else dashCount = Math.random() < 0.5 ? 2 : 3;

    let available = [];
    for (let i = 1; i < word.length; i++) available.push(i); // skip first letter

    const dashes = [];
    while (dashes.length < dashCount && available.length > 0) {
        const i = available.splice(Math.floor(Math.random() * available.length), 1)[0];

        // avoid placing dash next to another dash
        if (dashes.includes(i - 1) || dashes.includes(i + 1)) continue;
        dashes.push(i);
    }

    const chars = word.split("");
    for (const i of dashes) chars[i] = "_";
    return chars.join("");
}

module.exports = [
    {
        name: "wg",
        desc: "Word guessing game",
        utility: "game",
        fromMe: false,
        persistentData: loadPoints(),

        async execute(sock, msg, args) {
            const groupJID = msg.key.remoteJid;

            const cooldown = gameLock.isOnCooldown("wordGame", groupJID);
            if (cooldown) {
                const mins = Math.floor(cooldown.remaining / 60000);
                const secs = Math.floor((cooldown.remaining % 60000) / 1000);
                return await sock.sendMessage(groupJID, {
                    text: `⚠️ *WORD GAME is on maintenance break!*\n> Remaining time: ${mins}m ${secs}s`
                });
            }

            if (gameLock.isGameActive(groupJID)) {
                return await sock.sendMessage(groupJID, { text: "_Another game is already running in this chat!_" });
            }

            gameLock.setGameActive(groupJID, "wordGame");


            const word = getRandomWord();
            const masked = getMaskedWord(word);
            const firstLetter = word[0];
            const that = this;

            activeWG[groupJID] = {
                word,
                masked,
                firstLetter,
                listener: null,
                timeout: null
            };

            const questionMsg = await sock.sendMessage(groupJID, {
                text: `🧠 *WORD GAME!* 🧠\nGuess the word:\n> \`${masked}\`\n\nStart your guesses with \`*${firstLetter.toUpperCase()}*\``,
            });

            const endGame = async (message = null, quoted = null) => {
                sock.ev.off("messages.upsert", activeWG[groupJID].listener);
                clearTimeout(activeWG[groupJID].timeout);
                delete activeWG[groupJID];
                gameLock.clearGame(groupJID); // 🧹 remove from global lock
                gameLock.increaseMatchCount("wordGame", groupJID, 30, 10); // 30 matches → 10 min cooldown
                if (message) {
                    await sock.sendMessage(groupJID, { text: message }, { quoted });
                }
            };


            const resetTimeout = async () => {
                if (activeWG[groupJID].timeout) clearTimeout(activeWG[groupJID].timeout);
                activeWG[groupJID].timeout = setTimeout(async () => {
                    await endGame(`⌛ *TIME's UP!*\n> The word was: \`*${word.toUpperCase()}*\``, questionMsg);
                }, 60000);

            };

            resetTimeout();

            const listener = async ({ messages }) => {
                for (const newMsg of messages) {
                    if (newMsg.key.remoteJid !== groupJID || !newMsg.message) continue;

                    const senderJID = newMsg.key.participant || newMsg.key.remoteJid;
                    const text = (newMsg.message.conversation || newMsg.message.extendedTextMessage?.text || "").trim().toLowerCase();

                    if (!text.startsWith(firstLetter)) continue;

                    if (text === word) {
                        that.persistentData = initPlayerData(senderJID, that.persistentData);
                        that.persistentData[senderJID].points += 10;
                        that.persistentData[senderJID].gamesPlayed += 1;
                        savePoints(that.persistentData);

                        await sock.sendMessage(
                            groupJID,
                            {
                                text: `✅ *CORRECT!*\n> @${senderJID.split("@")[0]}\n> guessed the word: \`*${word.toUpperCase()}*\`\n+10 Points!`,
                                mentions: [senderJID],
                            },
                            { quoted: newMsg }
                        );

                        await endGame();
                    } else {
                        that.persistentData = initPlayerData(senderJID, that.persistentData);
                        that.persistentData[senderJID].points -= 5;
                        savePoints(that.persistentData);

                        await sock.sendMessage(
                            groupJID,
                            {
                                text: `❌ *WRONG!*\n> Guess by: @${senderJID.split("@")[0]}!\n-5 Points.`,
                                mentions: [senderJID],
                            },
                            { quoted: newMsg }
                        );

                        resetTimeout();
                    }
                }
            };

            activeWG[groupJID].listener = listener;
            sock.ev.on("messages.upsert", listener);
        }
    }
];
