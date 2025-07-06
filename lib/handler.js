const fs = require("fs");
const path = require("path");
const { getConfig } = require("../lib/configs");

// --- Constants ---
const PLUGIN_DIRS = [
    path.join(__dirname, "../plugins"),
    path.join(__dirname, "../eplugins")
];
const PERMISSIONS_FILE = path.join(__dirname, "../db/permissions.json");

const REACTIONS = {
    WAIT: process.env.REACT || "⌛",
    DENIED: "🚫",
    TIMEOUT: "🕒",
    ERROR: "⚠️",
    CLEAR: ""
};

// --- Utilities ---
const delay = ms => new Promise(res => setTimeout(res, ms));

// --- Caching ---
let permissions = { publicJids: [], commandAccess: {} };
try {
    const data = fs.readFileSync(PERMISSIONS_FILE, "utf-8");
    if (data) permissions = JSON.parse(data);
} catch (error) {
    if (error.code !== 'ENOENT') {
        console.warn(`⚠️ ${PERMISSIONS_FILE} is invalid, using fallback. Error: ${error.message}`);
    }
}

fs.watchFile(PERMISSIONS_FILE, { persistent: false }, () => {
    try {
        const data = fs.readFileSync(PERMISSIONS_FILE, "utf-8");
        permissions = JSON.parse(data);
        console.info("🔄 Permissions reloaded successfully.");
    } catch (error) {
        console.error(`❌ Error reloading permissions file:`, error);
    }
});

// --- Plugin Management ---
function getPlugin(commandName) {
    for (const dir of PLUGIN_DIRS) {
        if (!fs.existsSync(dir)) continue;

        const pluginFiles = fs.readdirSync(dir).filter(file => file.endsWith(".js"));

        for (const file of pluginFiles) {
            try {
                const pluginPath = path.join(dir, file);
                delete require.cache[require.resolve(pluginPath)];
                const plugin = require(pluginPath);

                const matchCommand = (p) => {
                    const nameMatch = p.name?.toLowerCase() === commandName;
                    const shortcuts = p.scut?.split(",").map(s => s.trim().toLowerCase()) || [];
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

// --- Message Parsing ---
function extractTextFromMessage(message) {
    if (!message) return null;
    return message.conversation ||
           message.extendedTextMessage?.text ||
           message.imageMessage?.caption ||
           message.videoMessage?.caption ||
           message.documentMessage?.caption ||
           message.buttonsResponseMessage?.selectedButtonId ||
           message.listResponseMessage?.singleSelectReply?.selectedRowId ||
           message.templateButtonReplyMessage?.selectedId ||
           null;
}

function parseCommand(text, prefix) {
    if (!text || !text.toLowerCase().startsWith(prefix.toLowerCase())) {
        return null;
    }
    const trimmedText = text.trim().replace(/\s+/g, " ");
    const args = trimmedText.slice(prefix.length).trim().split(/\s+/);
    const commandName = args.shift()?.toLowerCase();
    return { commandName, args };
}

// --- User & Permissions ---
function getUserInfo(msg, config) {
    const isBotMessage = msg.key.fromMe;
    const jid = msg.key.remoteJid;
    const senderJid = msg.key.participant || jid;
    const sudoUsers = config.SUDO ? config.SUDO.split(",") : [];
    const isSudo = sudoUsers.includes(senderJid.split("@")[0]);
    return { jid, senderJid, isSudo, isBotMessage };
}

function hasPermission(userInfo, commandName, config) {
    const { jid, senderJid, isSudo, isBotMessage } = userInfo;

    if (isSudo || isBotMessage) return true;

    const isPublicGlobally = config.BOT_MODE === "public";
    const isAllowedChat = permissions.publicJids.includes(jid);
    const isAllowedUser = permissions.publicJids.includes(senderJid);
    const isAllowedCommand = permissions.commandAccess[jid]?.includes(commandName);

    return isPublicGlobally || isAllowedChat || isAllowedUser || isAllowedCommand;
}

// --- Rate Limiting (Anti-spam) ---
let publicLock = false;
let sudoLock = false;
let botLock = false;

function isRateLimited(userInfo, config) {
    const { isSudo, isBotMessage } = userInfo;
    const isPublicGlobally = config.BOT_MODE === "public";

    if (!isSudo && !isBotMessage && isPublicGlobally) {
        if (publicLock) return true;
        publicLock = true;
        setTimeout(() => { publicLock = false; }, 5000);
    } else if (isSudo) {
        if (sudoLock) return true;
        sudoLock = true;
        setTimeout(() => { sudoLock = false; }, 3000);
    } else if (isBotMessage) {
        if (botLock) return true;
        botLock = true;
        setTimeout(() => { botLock = false; }, 3000);
    }
    return false;
}

// --- Main Handler ---
async function handleMessage(sock, msg) {
    try {
        const config = getConfig();
        const text = extractTextFromMessage(msg.message);
        const parsed = parseCommand(text, config.PREFIX);

        if (!parsed || !parsed.commandName) return;

        const { commandName, args } = parsed;
        const userInfo = getUserInfo(msg, config);

        if (!hasPermission(userInfo, commandName, config)) return;
        if (isRateLimited(userInfo, config)) return;

        const command = getPlugin(commandName);
        if (!command) return;

        if (command.fromMe && !userInfo.isSudo && !userInfo.isBotMessage) {
            await sock.sendMessage(userInfo.jid, { react: { text: REACTIONS.DENIED, key: msg.key } });
            await delay(3000);
            await sock.sendMessage(userInfo.jid, { react: { text: REACTIONS.CLEAR, key: msg.key } });
            return sock.sendMessage(userInfo.jid, { text: "_You don't have permission to use this command._" });
        }

        await sock.sendMessage(userInfo.jid, { react: { text: REACTIONS.WAIT, key: msg.key } });

        const timeout = setTimeout(() => {
            sock.sendMessage(userInfo.jid, { react: { text: REACTIONS.TIMEOUT, key: msg.key } });
        }, 20000);

        try {
            await command.execute(sock, msg, args, { isSudo: userInfo.isSudo, isBotMessage: userInfo.isBotMessage });
        } catch (err) {
            console.error(`⚠️ Error executing command /${commandName}:`, err);
            await sock.sendMessage(userInfo.jid, { react: { text: REACTIONS.ERROR, key: msg.key } });
        } finally {
            clearTimeout(timeout);
            await delay(3000);
            await sock.sendMessage(userInfo.jid, { react: { text: REACTIONS.CLEAR, key: msg.key } });
        }
    } catch (error) {
        console.error("⚠️ Error in handleMessage:", error);
    }
}

module.exports = { handleMessage };
