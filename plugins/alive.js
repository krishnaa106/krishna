module.exports = [
    {
        name: "ping",
        scut: "p",
        desc: "Check how fast the bot replies",
        utility: "ui",
        fromMe: false,

        execute: async (sock, msg) => {
            const start = performance.now();
            await sock.sendMessage(msg.key.remoteJid, { text: "Pong!" });
            const end = performance.now();
            const responseTime = (end - start).toFixed(2);
            await sock.sendMessage(msg.key.remoteJid, { text: `${responseTime}ms` });
            return true
        }
    },
    {
        name: "alive",
        desc: "Check if bot is alive",
        utility: "ui",
        fromMe: false,

        execute: async (sock, msg) => {
            const uptime = process.uptime(); 
            const formatted = `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`;
            await sock.sendMessage(msg.key.remoteJid, { text: `*Lixon is alive!*\n> uptime: ${formatted}` });
            return true
        }
    }
];
