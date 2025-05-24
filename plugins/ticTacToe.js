module.exports = {
  name: "tictactoe",
  scut: "ttt",
  desc: "Tic Tac Toe Game",
  utility: "game",
  fromMe: false,
  gameData: {},

async execute(sock, msg, args) {
  const chat = msg.key.remoteJid;
  const sender = msg.key.participant || msg.key.remoteJid;

  if (args[0]?.toLowerCase() === "stop") {
    if (this.gameData[chat]?.active) {
      this.endGame(sock, chat);
      return sock.sendMessage(chat, { text: "_Game stopped!_" });
    } else {
      return sock.sendMessage(chat, { text: "_No active game to stop!_" });
    }
  }

  let mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
  const isDM = chat.endsWith("@s.whatsapp.net") && !chat.includes("-");
  const botJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";

  let player1 = sender;
  let player2 = null;

  if (mentioned.length === 2) {
    [player1, player2] = mentioned;
  } else if (mentioned.length === 1) {
    player2 = mentioned[0];
  } else if (quotedParticipant && quotedParticipant !== sender) {
    player2 = quotedParticipant;
  } else if (isDM) {
    player2 = botJid;
  }

  if (!player2 || player1 === player2) {
    return sock.sendMessage(chat, { text: "_Mention one or two players, or reply to someone to start the game!_" });
  }

  if (this.gameData[chat]?.active) {
    return sock.sendMessage(chat, { text: "_A game is already running here!_" });
  }

  this.gameData[chat] = {
    active: true,
    board: Array(9).fill(" "),
    players: [player1, player2],
    symbols: { [player1]: "❌", [player2]: "⭕" },
    turn: 0,
  };

  this.listen(sock, chat);
  await this.showBoard(sock, chat);
},

  listen(sock, chat) {
    if (this.gameData[chat].listener) sock.ev.off("messages.upsert", this.gameData[chat].listener);

    const listener = async ({ messages }) => {
      for (const msg of messages) {
        const fromChat = msg.key.remoteJid;
        if (!this.gameData[chat] || !this.gameData[chat].active || fromChat !== chat) continue;

        const sender = msg.key.participant || msg.key.remoteJid;
        const text = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || "").trim();
        const move = parseInt(text);
        const game = this.gameData[chat];

        if (isNaN(move) || move < 1 || move > 9) continue;
        if (sender !== game.players[game.turn % 2]) continue;
        if (game.board[move - 1] !== " ") {
          await sock.sendMessage(chat, { text: "_That spot's already taken!_" });
          continue;
        }

        game.board[move - 1] = game.symbols[sender];
        game.turn++;

        const winner = this.checkWin(game.board);
        const nextPlayer = game.players[game.turn % 2];

        await this.showBoard(sock, chat);

        if (winner) {
          await sock.sendMessage(chat, {
            text: `🎉 @${sender.split("@")[0]} (${game.symbols[sender]}) *wins!*`,
            mentions: [sender],
          });
          this.endGame(sock, chat);
          return;
        }

        if (this.isDraw(game.board)) {
          await sock.sendMessage(chat, { text: "🤝 *It's a draw!*" });
          this.endGame(sock, chat);
        }
      }
    };

    this.gameData[chat].listener = listener;
    sock.ev.on("messages.upsert", listener);
  },

  async showBoard(sock, chat) {
    const game = this.gameData[chat];
    const [p1, p2] = game.players;
    const turnPlayer = game.players[game.turn % 2];
    const turnSymbol = game.symbols[turnPlayer];
    const emoji = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];
    const board = game.board.map((v, i) => v === " " ? emoji[i] : v);

    const text =
      `🎮 *TICTACTOE*\n` +
      `❌: @${p1.split("@")[0]}\n` +
      `⭕: @${p2.split("@")[0]}\n\n` +
      `🎯 *Turn:* @${turnPlayer.split("@")[0]} (${turnSymbol})\n\n` +
      `${board[0]} ${board[1]} ${board[2]}\n${board[3]} ${board[4]} ${board[5]}\n${board[6]} ${board[7]} ${board[8]}`;

    await sock.sendMessage(chat, { text, mentions: [p1, p2, turnPlayer] });
  },

  checkWin(b) {
    const wins = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6],
    ];
    return wins.find(([a, b1, c]) => b[a] !== " " && b[a] === b[b1] && b[a] === b[c]);
  },

  isDraw(board) {
    return board.every(cell => cell !== " ");
  },

  endGame(sock, chat) {
    if (this.gameData[chat]?.listener) sock.ev.off("messages.upsert", this.gameData[chat].listener);
    delete this.gameData[chat];
  },
};