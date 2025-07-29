const gameLock = require("../games/gameLock");
const { addPoints } = require("../games/pointsManager");

if (!globalThis.mathGameActive) globalThis.mathGameActive = {};
const activeMG = globalThis.mathGameActive;

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomOp() {
    return ["+", "-", "*", "/"][Math.floor(Math.random() * 4)];
}

function generateMathExpression() {
    let a = getRandomInt(10, 99); // First 2-digit number
    let b = getRandomInt(10, 99); // Second 2-digit number
    let op = randomOp();

    if (op === "/") {
        // Ensure division with no remainder
        let divisors = [];
        for (let i = 2; i <= a; i++) {
            if (a % i === 0 && i <= 99) divisors.push(i);
        }

        if (divisors.length === 0) {
            // fallback to addition if no divisor found
            op = "+";
        } else {
            b = divisors[getRandomInt(0, divisors.length - 1)];
        }
    } else if (op === "-") {
        // Ensure no negative answers (b <= a)
        if (b > a) [a, b] = [b, a];
    }

    return `${a} ${op} ${b}`;
}


function evaluateMath(expression) {
    const sanitized = expression.replace(/{/g, "(").replace(/}/g, ")")
                                .replace(/\[/g, "(").replace(/]/g, ")");
    return Function(`"use strict"; return (${sanitized});`)();
}

module.exports = [
    {
        name: "mg",
        desc: "Math game with BODMAS and brackets",
        utility: "game",
        fromMe: false,

        async execute(sock, msg, args) {
            const groupJID = msg.key.remoteJid;

            const cooldown = gameLock.isOnCooldown("mathGame", groupJID);
            if (cooldown) {
                const mins = Math.floor(cooldown.remaining / 60000);
                const secs = Math.floor((cooldown.remaining % 60000) / 1000);
                return await sock.sendMessage(groupJID, {
                    text: `🛠️ *MATH GAME is on maintenance break!*\n> Remaining time: ${mins}m ${secs}s`
                });
            }

            if (gameLock.isGameActive(groupJID)) {
                return await sock.sendMessage(groupJID, { text: "_Another game is already running in this chat!_" });
            }

            gameLock.setGameActive(groupJID, "mathGame");

            let expression = "", answer = 0;
            while (true) {
                try {
                    expression = generateMathExpression();
                    answer = evaluateMath(expression);
                    if (typeof answer === "number" && isFinite(answer)) break;
                } catch (_) {}
            }

            const formattedAnswer = Number.isInteger(answer) ? answer : Math.round(answer * 100) / 100;

            activeMG[groupJID] = {
                answer: formattedAnswer.toString(),
                listener: null,
                timeout: null,
            };

            const questionMsg = await sock.sendMessage(groupJID, {
                text: `🧮 *MATH GAME!* 🧮\nSolve:\n> ${expression}`
            });

            const endGame = async (message = null, quoted = null) => {
                sock.ev.off("messages.upsert", activeMG[groupJID].listener);
                clearTimeout(activeMG[groupJID].timeout);
                delete activeMG[groupJID];
                gameLock.clearGame(groupJID);
                gameLock.increaseMatchCount("mathGame", groupJID, 30, 10);
                if (message) await sock.sendMessage(groupJID, { text: message }, { quoted });
            };

            const resetTimeout = () => {
                if (activeMG[groupJID].timeout) clearTimeout(activeMG[groupJID].timeout);
                activeMG[groupJID].timeout = setTimeout(() => {
                    endGame(`⌛ *TIME's UP!*\n> Answer: \`${formattedAnswer}\``, questionMsg);
                }, 60000);
            };

            resetTimeout();

            const listener = async ({ messages }) => {
                for (const newMsg of messages) {
                    if (newMsg.key.remoteJid !== groupJID || !newMsg.message) continue;
                    const senderJID = newMsg.key.participant || newMsg.key.remoteJid;
                    const text = (newMsg.message.conversation || newMsg.message.extendedTextMessage?.text || "").trim();

                    if (!/^-?\d+(\.\d+)?$/.test(text)) return;

                    const numericGuess = parseFloat(text);
                    if (numericGuess === formattedAnswer) {
                        await addPoints(senderJID, 5);
                        await sock.sendMessage(
                            groupJID,
                            {
                                text: `✅ *CORRECT!*\n> @${senderJID.split("@")[0]} answered: \`${formattedAnswer}\`\n+5 Points!`,
                                mentions: [senderJID],
                            },
                            { quoted: newMsg }
                        );
                        await endGame();
                    } else {
                        await addPoints(senderJID, -2); 
                        await sock.sendMessage(
                            groupJID,
                            {
                                text: `❌ *WRONG!*\n> Guess by: @${senderJID.split("@")[0]}\n-2 Points.`,
                                mentions: [senderJID],
                            },
                            { quoted: newMsg }
                        );
                        resetTimeout();
                    }
                }
            };

            activeMG[groupJID].listener = listener;
            sock.ev.on("messages.upsert", listener);
        }
    }
];
