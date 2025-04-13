const os = require("os");

let customAliveMessage = null;

module.exports = [
    {
        name: "ping",
        scut: "p",
        desc: "Check bot response time",
        utility: "ui",
        fromMe: false,

        execute: async (sock, msg) => {
            try {
                const start = Date.now();
                await sock.sendMessage(msg.key.remoteJid, { text: "pong!" });
                const ping = Date.now() - start;
                await sock.sendMessage(msg.key.remoteJid, {
                    text: `*Response time:* ${ping}ms`
                });
            } catch (error) {
                console.error("❌ Error in ping command:", error);
                await sock.sendMessage(msg.key.remoteJid, {
                    text: "❌ Couldn't ping. Something went wrong."
                });
            }
        }
    },
    {
        name: "alive",
        desc: "Check if bot is alive or set a custom alive message",
        utility: "ui",
        fromMe: true,

        execute: async (sock, msg, args) => {
            const input = args.join(" ").trim();

            if (input) {
                if (input.toLowerCase() === "null") {
                    customAliveMessage = null;
                    await sock.sendMessage(msg.key.remoteJid, { text: "_Alive message reset to default._" });
                    return;
                }

                customAliveMessage = input;
                await sock.sendMessage(msg.key.remoteJid, { text: `_Custom alive message set to:_\n> ${input}` });
                return;
            }

            if (customAliveMessage) {
                await sock.sendMessage(msg.key.remoteJid, { text: customAliveMessage }, { quoted: msg });
                return;
            }

            const uptime = process.uptime();
            const minutes = Math.floor(uptime / 60);
            const seconds = Math.floor(uptime % 60);
            const memoryUsage = process.memoryUsage().rss / 1024 / 1024;
            const time = new Date().toLocaleTimeString();

            const text = `*LIXON is alive!*\n> 🕒 Uptime: *${minutes}m ${seconds}s*\n> 💾 RAM Usage: *${memoryUsage.toFixed(2)} MB*\n> 🧠 Platform: *${os.platform()}*\n> 🗓 Time: *${time}*`;

            await sock.sendMessage(msg.key.remoteJid, { text }, { quoted: msg });
        }
    }
];
