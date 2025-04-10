const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: "./config.env" });

const delay = ms => new Promise(res => setTimeout(res, ms));

function getPlugin(commandName) {
    const pluginDirs = [
        path.join(__dirname, "../plugins"),
        path.join(__dirname, "../eplugins")
    ];

    for (const dir of pluginDirs) {
        if (!fs.existsSync(dir)) continue;

        const pluginFiles = fs.readdirSync(dir).filter(file => file.endsWith(".js"));

        for (const file of pluginFiles) {
            try {
                const pluginPath = path.join(dir, file);
                const plugin = require(pluginPath);

                const matchCommand = (pluginObj) => {
                    const nameMatch = pluginObj.name?.toLowerCase() === commandName;
                    const shortcuts = pluginObj.scut?.split(",").map(s => s.trim().toLowerCase()) || [];
                    const shortcutMatch = shortcuts.includes(commandName);
                    return nameMatch || shortcutMatch;
                };

                if (Array.isArray(plugin)) {
                    const matched = plugin.find(matchCommand);
                    if (matched) return matched;
                } else if (plugin.name && plugin.utility && typeof plugin.execute === "function") {
                    if (matchCommand(plugin)) return plugin;
                }

            } catch (error) {
                console.error(`❌ Error loading plugin ${file}:`, error);
            }
        }
    }

    return null;
}

async function handleMessage(sock, msg) {
    try {
        let text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        if (!text) return;

        text = text.trim().replace(/\s+/g, " ");
        if (!text.toLowerCase().startsWith(process.env.PREFIX.toLowerCase())) return;

        const args = text.slice(process.env.PREFIX.length).trim().split(/\s+/);
        const commandName = args.shift()?.toLowerCase();
        if (!commandName) return;

        const botNumber = sock.user.id.split(":")[0];
        const isBotMessage = msg.key.fromMe;
        const sudoUsers = process.env.SUDO ? process.env.SUDO.split(",") : [];
        const senderNumber = msg.key.participant?.split("@")[0] || msg.key.remoteJid.split("@")[0];
        const isSudo = sudoUsers.includes(senderNumber);
        const isPublic = process.env.BOT_MODE === "public";

        if (!isPublic && !isSudo && !isBotMessage) return;

        const command = getPlugin(commandName);
        if (!command) return;

        if (command.fromMe && !isSudo && !isBotMessage) {
            await sock.sendMessage(msg.key.remoteJid, { react: { text: "🚫", key: msg.key } });
            await delay(3000);
            await sock.sendMessage(msg.key.remoteJid, { react: { text: "", key: msg.key } });
            return sock.sendMessage(msg.key.remoteJid, { text: "_You don't have permission to use this command._" });
        }

        await sock.sendMessage(msg.key.remoteJid, { react: { text: "⏳", key: msg.key } });

        let reactionUpdated = false;
        let fallbackTriggered = false;
        const timeout = setTimeout(async () => {
            if (!reactionUpdated) {
                await sock.sendMessage(msg.key.remoteJid, { react: { text: "🕒", key: msg.key } });
                reactionUpdated = true;
            }
        }, 20000);

        try {
            await sock.sendMessage(msg.key.remoteJid, { react: { text: "⌛", key: msg.key } });

            const originalSend = sock.sendMessage;
            let messagesSent = 0;

            sock.sendMessage = async (...args) => {
                const res = await originalSend.apply(sock, args);
                messagesSent++;
                return res;
            };

            const response = await command.execute(sock, msg, args, { isSudo, isBotMessage });

            fallbackTriggered = response?.isFallback ?? false;

            clearTimeout(timeout);
            await delay(500);

            await sock.sendMessage(msg.key.remoteJid, {
                react: { text: fallbackTriggered ? "❌" : "✅", key: msg.key }
            });

        } catch (err) {
            clearTimeout(timeout);
            console.error(`⚠️ Error executing command /${commandName}:`, err);
            await sock.sendMessage(msg.key.remoteJid, { react: { text: "⚠️", key: msg.key } });
        }

        await delay(3000);
        await sock.sendMessage(msg.key.remoteJid, { react: { text: "", key: msg.key } });

    } catch (error) {
        console.error("⚠️ Error handling message:", error);
    }
}

module.exports = { handleMessage };
