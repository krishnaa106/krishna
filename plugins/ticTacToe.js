const pointsManager = require("../games/pointsManager");

// Global persistent lock
if (!globalThis.tttActiveGames) globalThis.tttActiveGames = {};
const activeGames = globalThis.tttActiveGames;

module.exports = [
    {
        name: "tictactoe",
        scut: "ttt",
        desc: "Tic Tac Toe Game",
        utility: "game",
        fromMe: false,

        async execute(sock, msg, args) {
          const chat = msg.key.remoteJid;
          const sender = msg.key.participant || msg.key.remoteJid;

          // 🛑 Stop the game
          if (args[0]?.toLowerCase() === "stop") {
            if (activeGames[chat]) {
              this.stopGame(sock, chat);
              return sock.sendMessage(chat, { text: "_Game has been stopped._" });
            } else {
              return sock.sendMessage(chat, { text: "_No active game in this chat._" });
            }
          }

          // ✅ Strict Lock Check
          if (activeGames[chat]?.active) {
            return sock.sendMessage(chat, { text: "_A game is already running in this chat!_" });
          }

          // 🔐 Lock immediately
          activeGames[chat] = { active: true };

          try {
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
            const isDM = chat.endsWith("@s.whatsapp.net") && !chat.includes("-");
            const botJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";

            let player1 = sender;
            let player2 = null;

            if (mentioned.length === 2) {
              [player1, player2] = mentioned;
            } else if (mentioned.length === 1) {
              player2 = mentioned[0];
            } else if (quoted && quoted !== sender) {
              player2 = quoted;
            } else if (isDM) {
              player2 = botJid;
            }

            if (!player2 || player1 === player2) {
              delete activeGames[chat];
              return sock.sendMessage(chat, {
                text: "_Mention or reply to someone else to start the game!_",
              });
            }

            // Init players
            pointsManager.initPlayerData(player1, pointsManager.loadPointsData());
            pointsManager.initPlayerData(player2, pointsManager.loadPointsData());

            // Save full game state
            activeGames[chat] = {
              active: true,
              board: Array(9).fill(" "),
              players: [player1, player2],
              symbols: { [player1]: "❌", [player2]: "⭕" },
              turn: 0,
              timeout: null,
              listener: null,
            };

            this.listenMoves(sock, chat);
            await this.showBoard(sock, chat);
          } catch (err) {
            delete activeGames[chat];
            console.error("TicTacToe error:", err);
            return sock.sendMessage(chat, { text: "_Failed to start game._" });
          }
        },

        listenMoves(sock, chat) {
          const game = activeGames[chat];
          if (!game) return;

          const resetTimeout = () => {
            if (game.timeout) clearTimeout(game.timeout);
            game.timeout = setTimeout(async () => {
              await sock.sendMessage(chat, { text: "_Game ended due to inactivity._" });
              this.stopGame(sock, chat);
            }, 60_000);
          };

          resetTimeout();

          const listener = async ({ messages }) => {
            for (const msg of messages) {
              const fromChat = msg.key.remoteJid;
              if (fromChat !== chat || !activeGames[chat]?.active) continue;

              const sender = msg.key.participant || msg.key.remoteJid;
              const text = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim();
              const move = parseInt(text);

              if (isNaN(move) || move < 1 || move > 9) continue;

              if (sender !== game.players[game.turn % 2]) continue;
              if (game.board[move - 1] !== " ") {
                await sock.sendMessage(chat, { text: "_That spot is already taken!_" });
                continue;
              }

              game.board[move - 1] = game.symbols[sender];
              game.turn++;

              await this.showBoard(sock, chat);
              resetTimeout();

              const winner = this.getWinner(game.board);
              const draw = this.isDraw(game.board);

              if (winner) {
                const sym = game.board[winner[0]];
                const winnerJid = Object.keys(game.symbols).find(j => game.symbols[j] === sym);
                const loserJid = game.players.find(p => p !== winnerJid);

                pointsManager.addPoints(winnerJid, 20);
                pointsManager.addPoints(loserJid, -20);

                await sock.sendMessage(chat, {
                  text: `🏆 @${winnerJid.split("@")[0]} *wins!*\n+20 pts\n@${loserJid.split("@")[0]} -20 pts`,
                  mentions: [winnerJid, loserJid],
                });
                return this.stopGame(sock, chat);
              }

              if (draw) {
                await sock.sendMessage(chat, {
                  text: "🤝 *It's a draw!*",
                  mentions: game.players,
                });
                return this.stopGame(sock, chat);
              }
            }
          };

          sock.ev.on("messages.upsert", listener);
          game.listener = listener;
        },

        async showBoard(sock, chat) {
          const game = activeGames[chat];
          const [p1, p2] = game.players;
          const current = game.players[game.turn % 2];
          const symbol = game.symbols[current];
          const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
          const board = game.board.map((v, i) => v === " " ? emojis[i] : v);
          const visual =
            `${board.slice(0, 3).join(" ")}\n${board.slice(3, 6).join(" ")}\n${board.slice(6).join(" ")}`;

          await sock.sendMessage(chat, {
            text:
              `🎮 *Tic Tac Toe*\n` +
              `❌ @${p1.split("@")[0]} (${pointsManager.getPoints(p1)} pts)\n` +
              `⭕ @${p2.split("@")[0]} (${pointsManager.getPoints(p2)} pts)\n\n` +
              `🎯 Turn: @${current.split("@")[0]} (${symbol})\n\n${visual}`,
            mentions: [p1, p2, current],
          });
        },

        getWinner(board) {
          const combos = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8],
            [0, 3, 6], [1, 4, 7], [2, 5, 8],
            [0, 4, 8], [2, 4, 6],
          ];
          return combos.find(([a, b, c]) => board[a] !== " " && board[a] === board[b] && board[a] === board[c]);
        },

        isDraw(board) {
          return board.every(cell => cell !== " ");
        },

        stopGame(sock, chat) {
          const game = activeGames[chat];
          if (!game) return;
          if (game.listener) sock.ev.off("messages.upsert", game.listener);
          if (game.timeout) clearTimeout(game.timeout);
          delete activeGames[chat];
        },
    }
];
