const fs = require("fs");
const path = require("path");
const { getConfig } = require("../lib/configs");

const delay = ms => new Promise(res => setTimeout(res, ms));
let publicLock = false;
let sudoLock = false;
let botLock = false;

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

function extractTextFromMessage(message) {
    if (!message) return null;
    if (message.conversation) return message.conversation;
    if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
    if (message.imageMessage?.caption) return message.imageMessage.caption;
    if (message.videoMessage?.caption) return message.videoMessage.caption;
    if (message.documentMessage?.caption) return message.documentMessage.caption;
    if (message.buttonsResponseMessage?.selectedButtonId) return message.buttonsResponseMessage.selectedButtonId;
    if (message.listResponseMessage?.singleSelectReply?.selectedRowId) return message.listResponseMessage.singleSelectReply.selectedRowId;
    if (message.templateButtonReplyMessage?.selectedId) return message.templateButtonReplyMessage.selectedId;
    return null;
}

async function handleMessage(sock, msg) {
    const config = getConfig();
    const REACT = process.env.REACT || "⌛";

    try {
        let text = extractTextFromMessage(msg.message);
        if (!text) return;

        text = text.trim().replace(/\s+/g, " ");
        if (!text.toLowerCase().startsWith(config.PREFIX.toLowerCase())) return;

        const args = text.slice(config.PREFIX.length).trim().split(/\s+/);
        const commandName = args.shift()?.toLowerCase();
        if (!commandName) return;

        const isBotMessage = msg.key.fromMe;
        const sudoUsers = config.SUDO ? config.SUDO.split(",") : [];
        const senderNumber = msg.key.participant?.split("@")[0] || msg.key.remoteJid.split("@")[0];
        const isSudo = sudoUsers.includes(senderNumber);
        const jid = msg.key.remoteJid;
        const senderJid = msg.key.participant || jid;

        let permissions = { publicJids: [], commandAccess: {} };
        try {
            permissions = JSON.parse(fs.readFileSync(path.join(__dirname, "../db/permissions.json"), "utf-8"));
        } catch {
            console.warn("⚠️ permissions.json is empty or invalid, using fallback");
        }

        const isPublicGlobally = config.BOT_MODE === "public";
        const isAllowedChat = permissions.publicJids.includes(jid);
        const isAllowedUser = permissions.publicJids.includes(senderJid);
        const isAllowedCommand = permissions.commandAccess[jid]?.includes(commandName);

        const isPublic = isPublicGlobally || isAllowedChat || isAllowedUser || isAllowedCommand;
        if (!isPublic && !isSudo && !isBotMessage) return;

        if (!isSudo && !isBotMessage && isPublicGlobally) {
            if (publicLock) return;
            publicLock = true;
            setTimeout(() => { publicLock = false; }, 5000);
        } else if (isSudo) {
            if (sudoLock) return;
            sudoLock = true;
            setTimeout(() => { sudoLock = false; }, 3000);
        } else if (isBotMessage) {
            if (botLock) return;
            botLock = true;
            setTimeout(() => { botLock = false; }, 3000);
        }

        const command = getPlugin(commandName);
        if (!command) return;

        if (command.fromMe && !isSudo && !isBotMessage) {
            await sock.sendMessage(jid, { react: { text: "🚫", key: msg.key } });
            await delay(3000);
            await sock.sendMessage(jid, { react: { text: "", key: msg.key } });
            return sock.sendMessage(jid, { text: "_You don't have permission to use this command._" });
        }

        await sock.sendMessage(jid, { react: { text: REACT, key: msg.key } });

        const timeout = setTimeout(async () => {
            await sock.sendMessage(jid, { react: { text: "🕒", key: msg.key } });
        }, 20000);

        try {
            await command.execute(sock, msg, args, { isSudo, isBotMessage });
        } catch (err) {
            console.error(`⚠️ Error executing command /${commandName}:`, err);
            await sock.sendMessage(jid, { react: { text: "⚠️", key: msg.key } });
        } finally {
            clearTimeout(timeout);
            await delay(3000);
            await sock.sendMessage(jid, { react: { text: "", key: msg.key } });
        }

    } catch (error) {
        console.error("⚠️ Error handling message:", error);
    }
}

module.exports = { handleMessage };
