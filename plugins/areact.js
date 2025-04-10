const { doReact } = require("../lib/");
const activeChats = new Map();

const emojis = ["😂", "😆", "😎", "🔥", "👍", "🥳", "❤️", "🤖", "👀", "🎉"];

async function autoReact(sock, chatJid) {
    try {
        let lastMessage = null;

        const listener = async ({ messages }) => {
            for (const msg of messages) {
                if (!msg.key.remoteJid || msg.key.remoteJid !== chatJid) continue;
                if (!msg.message) continue;

                // Choose a random emoji and react to the new message
                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
                await doReact(sock, msg, randomEmoji);
                lastMessage = msg;
            }
        };

        sock.ev.on("messages.upsert", listener);
        activeChats.set(chatJid, { listener });
    } catch (err) {
        console.error("❌ Error in autoReact:", err);
    }
}

function stopAutoReact(sock, chatJid) {
    if (activeChats.has(chatJid)) {
        const { listener } = activeChats.get(chatJid);
        sock.ev.off("messages.upsert", listener);
        activeChats.delete(chatJid);
    }
}

module.exports = [
    {
        name: "areact",
        desc: "Auto-react continuously to the last message in a chat",
        utility: "fun",
        fromMe: false,

        execute: async (sock, msg, args) => {
            try {
                if (!args.length) return sock.sendMessage(msg.key.remoteJid, { text: "❌ Provide a JID (group or private)." });
                const chatJid = args[0];
                
                if (activeChats.has(chatJid)) {
                    stopAutoReact(sock, chatJid);
                    return sock.sendMessage(msg.key.remoteJid, { text: `❌ Stopped auto-reaction for ${chatJid}.` });
                }
                
                sock.sendMessage(msg.key.remoteJid, { text: `✅ Auto-reaction started for ${chatJid}.` });
                autoReact(sock, chatJid);
            } catch (err) {
                console.error("❌ Error in areact command:", err);
            }
        }
    }
];
