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

function randomValueOrExpression(depth) {
    if (depth <= 0 || Math.random() < 0.4) {
        return getRandomInt(1, 20).toString();
    }
    return generateMathExpression(depth - 1);
}

function generateMathExpression(depth = 3, maxDepth = 3) {
    if (depth <= 0) return getRandomInt(1, 20).toString();

    const left = randomValueOrExpression(depth - 1);
    let right = randomValueOrExpression(depth - 1);
    const op = randomOp();

    if (op === "/") {
        // Try to ensure the denominator (right) isn't zero
        let rightValue = right;
        try {
            // Replace brackets just like in eval
            const safeRight = right.replace(/{/g, "(").replace(/}/g, ")").replace(/\[/g, "(").replace(/]/g, ")");
            rightValue = Function(`"use strict"; return (${safeRight});`)();
        } catch (_) {
            rightValue = 1;
        }

        if (rightValue === 0) {
            // Force right to a non-zero value
            right = getRandomInt(1, 10).toString();
        }
    }


    let expr = `${left} ${op} ${right}`;

    if (depth === 1) {
        return `(${expr})`; // innermost - parentheses
    } else if (depth === 2) {
        // wrap with {}, may include ()
        return `{${Math.random() < 0.5 ? expr : generateMathExpression(1) + ' ' + op + ' ' + generateMathExpression(1)}}`;
    } else if (depth === maxDepth) {
        // outermost - use [] and may include {}, ()
        const leftSide = generateMathExpression(depth - 1);
        const rightSide = generateMathExpression(depth - 1);
        return `[${leftSide} ${op} ${rightSide}]`;
    }

    return expr;
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
                    expression = generateMathExpression(3);
                    answer = evaluateMath(expression);
                    if (typeof answer === "number" && isFinite(answer)) break;
                } catch (_) {}
            }

            const formattedAnswer = Math.round(answer * 100) / 100;

            activeMG[groupJID] = {
                answer: formattedAnswer.toString(),
                listener: null,
                timeout: null,
            };

            const questionMsg = await sock.sendMessage(groupJID, {
                text: `🧮 *MATH GAME!*\nSolve:\n> ${expression}\n(Answer up to 2 decimals if needed)`
            });

            const endGame = async (message = null, quoted = null) => {
                sock.ev.off("messages.upsert", activeMG[groupJID].listener);
                clearTimeout(activeMG[groupJID].timeout);
                delete activeMG[groupJID];
                gameLock.clearGame(groupJID);
                gameLock.increaseMatchCount("mathGame", groupJID, 30, 20);
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
                        addPoints(senderJID, 10);
                        await sock.sendMessage(
                            groupJID,
                            {
                                text: `✅ *CORRECT!*\n> @${senderJID.split("@")[0]} answered: \`${formattedAnswer}\`\n+10 Points!`,
                                mentions: [senderJID],
                            },
                            { quoted: newMsg }
                        );
                        await endGame();
                    } else {
                        addPoints(senderJID, -5); // Deduct 5 for wrong
                        await sock.sendMessage(
                            groupJID,
                            {
                                text: `❌ *WRONG!*\n> Guess by: @${senderJID.split("@")[0]}\n-5 Points.`,
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
