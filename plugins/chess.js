const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { Chess } = require("chess.js");
const gameLock = require("../games/gameLock");

const ASSET_DIR = path.join(__dirname, "../media/assets");
const TMP_DIR = path.join(__dirname, "../media/tmp");

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// Board constants
const BOARD_WIDTH = 1152;
const BOARD_HEIGHT = 1664;
const CELL_SIZE = 128;
const OFFSET_X = 64;   // Board X offset
const OFFSET_Y = 320;  // Board Y offset

// Persistent storage
if (!globalThis.chessActiveGames) globalThis.chessActiveGames = {};
const activeGames = globalThis.chessActiveGames;

// Map piece type
function pieceToFile(piece) {
    const map = { p: "pawn", r: "rook", n: "knight", b: "bishop", q: "queen", k: "king" };
    return path.join(ASSET_DIR, `${map[piece.type]}-${piece.color}.svg`);
}

/** Render Chess Image with captured pieces */
async function renderChessImage(chess, captured) {
    const boardPath = path.join(ASSET_DIR, "board.svg");
    let img = sharp(boardPath).resize(BOARD_WIDTH, BOARD_HEIGHT);

    const layers = [];

    // Add pieces
    const board = chess.board();
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (!piece) continue;
            const x = OFFSET_X + col * CELL_SIZE;
            const y = OFFSET_Y + row * CELL_SIZE;
            const piecePath = pieceToFile(piece);
            if (fs.existsSync(piecePath)) {
                layers.push({ input: piecePath, top: y, left: x });
            }
        }
    }

    // Captured pieces - Black (top)
    let blackOffset = 70; // starting X position
    for (const p of captured.black) {
        const piecePath = pieceToFile(p);
        if (fs.existsSync(piecePath)) {
            layers.push({ input: piecePath, top: 64, left: blackOffset });
            blackOffset += 70; // spacing
        }
    }

    // Captured pieces - White (bottom)
    let whiteOffset = 70; 
    for (const p of captured.white) {
        const piecePath = pieceToFile(p);
        if (fs.existsSync(piecePath)) {
            layers.push({ input: piecePath, top: 1440, left: whiteOffset });
            whiteOffset += 70;
        }
    }

    img = await img.composite(layers);
    return img.png().toBuffer();
}

function getChatId(msg) {
    return msg.key.remoteJid;
}

/** Start game */
async function startGame(sock, chatId, player1, player2) {
    const chess = new Chess();
    const whitePlayer = Math.random() < 0.5 ? player1 : player2;
    const blackPlayer = whitePlayer === player1 ? player2 : player1;

    activeGames[chatId] = {
        chess,
        players: [whitePlayer, blackPlayer],
        colors: { w: whitePlayer, b: blackPlayer },
        turn: "w",
        captured: { white: [], black: [] }
    };

    gameLock.setGameActive(chatId, "chess");
    await sendBoard(sock, chatId, activeGames[chatId], `@${whitePlayer.split("@")[0]} (W) vs @${blackPlayer.split("@")[0]} (B)\nFirst move (W): @${whitePlayer.split("@")[0]}`);
    registerMoveTracker(sock, chatId);
}

/** Send chess board image */
async function sendBoard(sock, chatId, game, extraText = "") {
    const buffer = await renderChessImage(game.chess, game.captured);
    const tmpPath = path.join(TMP_DIR, `chess-${Date.now()}.png`);
    fs.writeFileSync(tmpPath, buffer);

    await sock.sendMessage(chatId, {
        image: fs.readFileSync(tmpPath),
        caption: extraText,
        mentions: game.players
    });

    fs.unlinkSync(tmpPath);
}

/** Track moves */
function registerMoveTracker(sock, chatId) {
    sock.registerTracker(
        `chess_${chatId}`,
        async (msg) => {
            if (!msg.message || !activeGames[chatId]) return false;
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim().toLowerCase();
            if (!/^[a-h][1-8][a-h][1-8]$/.test(text)) return false;
            const sender = msg.key.participant || msg.key.remoteJid;
            return sender === activeGames[chatId].colors[activeGames[chatId].turn];
        },
        async (sock, msg) => {
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim().toLowerCase();
            const sender = msg.key.participant || msg.key.remoteJid;
            const game = activeGames[chatId];
            const from = text.slice(0, 2);
            const to = text.slice(2, 4);

            const move = game.chess.move({ from, to, promotion: "q" });
            if (!move) {
                await sock.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
                return;
            }

            // Track captured piece
            if (move.captured) {
                game.captured[move.color === "w" ? "black" : "white"].push({
                    type: move.captured,
                    color: move.color === "w" ? "b" : "w"
                });
            }

            // Switch turn
            game.turn = game.turn === "w" ? "b" : "w";
            const nextPlayer = game.colors[game.turn];
            const nextColor = game.turn === "w" ? "W" : "B";

            let caption = `✅ Move: ${text} by @${sender.split("@")[0]}\nNext move (${nextColor}): @${nextPlayer.split("@")[0]}`;
            if (game.chess.isCheckmate()) {
                caption = `♟️ Checkmate! @${sender.split("@")[0]} wins!`;
                endGame(sock, chatId);
            } else if (game.chess.isDraw()) {
                caption = `🤝 Game Draw!`;
                endGame(sock, chatId);
            }

            await sendBoard(sock, chatId, game, caption);
        }
    );
}

/** End game */
function endGame(sock, chatId) {
    sock.unregisterTracker(`chess_${chatId}`);
    sock.unregisterTracker(`chess_join_${chatId}`);
    gameLock.clearGame(chatId);
    delete activeGames[chatId];
}

module.exports = [
    {
        name: "chess",
        desc: "Start a chess game",
        utility: "game",
        fromMe: true,
        async execute(sock, msg, args) {
            const chatId = getChatId(msg);
            const sender = msg.key.participant || chatId;

            if (args[0] === "stop") {
                if (activeGames[chatId]) {
                    endGame(sock, chatId);
                    return sock.sendMessage(chatId, { text: "_Chess game stopped._" });
                }
                return sock.sendMessage(chatId, { text: "_No active chess game in this chat._" });
            }

            if (gameLock.isGameActive(chatId)) {
                return sock.sendMessage(chatId, { text: "_A game is already active in this chat._" });
            }

            let player1 = sender;
            let player2 = null;

            if (msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                player2 = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
            } else if (msg.message.extendedTextMessage?.contextInfo?.participant) {
                player2 = msg.message.extendedTextMessage.contextInfo.participant;
            }

            if (!player2) {
                await sock.sendMessage(chatId, { text: `@${player1.split("@")[0]} joined.`, mentions: [player1] });
                await sock.sendMessage(chatId, { text: "_Type join to join the game within 1min_" });

                sock.registerTracker(
                    `chess_join_${chatId}`,
                    async (msg2) => {
                        const txt = (msg2.message.conversation || "").trim().toLowerCase();
                        return txt === "join";
                    },
                    async (sock2, msg2) => {
                        sock.unregisterTracker(`chess_join_${chatId}`);
                        player2 = msg2.key.participant || msg2.key.remoteJid;
                        await sock2.sendMessage(chatId, { text: `@${player2.split("@")[0]} joined.`, mentions: [player2] });
                        await startGame(sock2, chatId, player1, player2);
                    }
                );

                setTimeout(() => {
                    if (!activeGames[chatId]) {
                        sock.unregisterTracker(`chess_join_${chatId}`);
                        sock.sendMessage(chatId, { text: "⏳ No one joined. Game cancelled." });
                    }
                }, 60000);
                return;
            }

            await startGame(sock, chatId, player1, player2);
        }
    }
];
