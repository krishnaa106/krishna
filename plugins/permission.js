const fs = require("fs");
const path = require("path");

const PLUGIN_DIRS = [
    path.join(__dirname, "../plugins"),
    path.join(__dirname, "../eplugins")
];
const permissionsPath = path.join(__dirname, "../db/permissions.json");

// ---------------- Permission Helpers ----------------
function loadPermissions() {
    if (!fs.existsSync(permissionsPath)) return { publicJids: [], commandAccess: {} };
    return JSON.parse(fs.readFileSync(permissionsPath, "utf8"));
}

function savePermissions(data) {
    fs.writeFileSync(permissionsPath, JSON.stringify(data, null, 2));
}

// ---------------- Plugin Finder ----------------
function findPlugin(commandName) {
    commandName = commandName.toLowerCase();
    for (const dir of PLUGIN_DIRS) {
        if (!fs.existsSync(dir)) continue;
        const pluginFiles = fs.readdirSync(dir).filter(f => f.endsWith(".js"));

        for (const file of pluginFiles) {
            try {
                const pluginPath = path.join(dir, file);
                delete require.cache[require.resolve(pluginPath)];
                const plugin = require(pluginPath);

                const match = (p) => {
                    const scuts = p.scut?.split(",").map(s => s.trim().toLowerCase()) || [];
                    return p.name?.toLowerCase() === commandName || scuts.includes(commandName);
                };

                if (Array.isArray(plugin)) {
                    const found = plugin.find(match);
                    if (found) return found;
                } else if (plugin.name && typeof plugin.execute === "function") {
                    if (match(plugin)) return plugin;
                }
            } catch (err) {
                console.error(`❌ Error loading plugin ${file}:`, err);
            }
        }
    }
    return null;
}

// ---------------- Command List ----------------
module.exports = [
    // ---------- ALLOW ----------
    {
        name: "allow",
        desc: "Allow a JID or command to be publicly accessible",
        utility: "owner",
        fromMe: true,

        async execute(sock, msg, args) {
            const jid = msg.key.remoteJid;
            const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
            const replyJid = msg.message?.extendedTextMessage?.contextInfo?.participant;

            const input = args[0]?.toLowerCase();
            const isCommand = input && !input.endsWith("@s.whatsapp.net") && !input.endsWith("@g.us");

            const perms = loadPermissions();
            const targetCommand = isCommand ? input : null;
            const targetJid = mentionedJid || replyJid || (!isCommand && input) || (!input && jid);

            // Find plugin
            const plugin = targetCommand ? findPlugin(targetCommand) : null;
            if (targetCommand && !plugin) {
                return await sock.sendMessage(jid, { text: `_Command "*${targetCommand}*" not found_.` });
            }

            // Get all keys (name + scut)
            const allKeys = plugin
                ? [plugin.name.toLowerCase(), ...(plugin.scut?.split(",").map(s => s.trim().toLowerCase()) || [])]
                : [];

            // Case: .allow <cmd> @mention OR reply
            if (targetCommand && (replyJid || mentionedJid)) {
                if (!perms.commandAccess[targetJid]) perms.commandAccess[targetJid] = [];
                for (const k of allKeys) {
                    if (!perms.commandAccess[targetJid].includes(k)) {
                        perms.commandAccess[targetJid].push(k);
                    }
                }
                savePermissions(perms);
                return await sock.sendMessage(jid, {
                    text: `✅ Command "*${plugin.name}*" (incl. shortcuts) is now public for @${targetJid.split("@")[0]}`,
                    mentions: [targetJid]
                });
            }

            // Case: .allow <cmd> in group or DM
            if (targetCommand && !replyJid && !mentionedJid) {
                if (!perms.commandAccess[jid]) perms.commandAccess[jid] = [];
                for (const k of allKeys) {
                    if (!perms.commandAccess[jid].includes(k)) {
                        perms.commandAccess[jid].push(k);
                    }
                }
                savePermissions(perms);
                return await sock.sendMessage(jid, {
                    text: `✅ Command "*${plugin.name}*" (incl. shortcuts) is now public in this chat.`
                });
            }

            // Case: Allow user/group JID for all commands
            if (!perms.publicJids.includes(targetJid)) {
                perms.publicJids.push(targetJid);
                savePermissions(perms);
                return await sock.sendMessage(jid, {
                    text: `✅ Allowed access for @${targetJid.split("@")[0]}`,
                    mentions: [targetJid]
                });
            } else {
                return await sock.sendMessage(jid, {
                    text: `⚠️ @${targetJid.split("@")[0]} is already allowed.`,
                    mentions: [targetJid]
                });
            }
        }
    },

    // ---------- ALLOWLIST ----------
    {
        name: "allowlist",
        desc: "List allowed users/groups/commands or clear them all",
        utility: "owner",
        fromMe: true,

        async execute(sock, msg, args) {
            const jid = msg.key.remoteJid;
            const arg = args[0]?.toLowerCase();
            const perms = loadPermissions();

            // 🧼 Handle `.allowlist clear`
            if (arg === "clear") {
                savePermissions({ publicJids: [], commandAccess: {} });
                return await sock.sendMessage(jid, { text: `_Allowlist cleared._` });
            }

            // 📝 Build allowlist summary
            let text = `📝 *Allowlist Summary:*\n\n`;

            // 👥 Public JIDs
            if (perms.publicJids.length > 0) {
                text += `👥 *Public JIDs*:\n`;
                for (const j of perms.publicJids) {
                    const isGroup = j.endsWith("@g.us");
                    text += `• ${isGroup ? "Group" : "User"}: @${j.split("@")[0]}\n`;
                }
                text += `\n`;
            } else {
                text += `👥 *Public JIDs*: None\n\n`;
            }

            // 📦 Command Access
            if (Object.keys(perms.commandAccess).length > 0) {
                text += `📦 *Command Access*:\n`;
                for (const [jidKey, cmds] of Object.entries(perms.commandAccess)) {
                    const isGroup = jidKey.endsWith("@g.us");
                    text += `• ${isGroup ? "Group" : "User"} @${jidKey.split("@")[0]}: ${cmds.join(", ")}\n`;
                }
            } else {
                text += `📦 *Command Access*: None\n`;
            }

            return await sock.sendMessage(jid, {
                text,
                mentions: [...perms.publicJids, ...Object.keys(perms.commandAccess)]
            });
        }
    },

    // ---------- DENY ----------
    {
        name: "deny",
        desc: "Deny a JID or command from public access",
        utility: "owner",
        fromMe: true,

        async execute(sock, msg, args) {
            const jid = msg.key.remoteJid;
            const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
            const replyJid = msg.message?.extendedTextMessage?.contextInfo?.participant;

            const input = args[0]?.toLowerCase();
            const isCommand = input && !input.endsWith("@s.whatsapp.net") && !input.endsWith("@g.us");

            const perms = loadPermissions();
            const targetCommand = isCommand ? input : null;
            const targetJid = mentionedJid || replyJid || (!isCommand && input) || (!input && jid);

            // Check if command exists
            const plugin = targetCommand ? findPlugin(targetCommand) : null;
            if (targetCommand && !plugin) {
                return await sock.sendMessage(jid, { text: `_Command "*${targetCommand}*" not found_.` });
            }

            // 🛑 Case: Remove command from a user/group
            if (targetCommand && (replyJid || mentionedJid)) {
                if (perms.commandAccess[targetJid]?.includes(targetCommand)) {
                    perms.commandAccess[targetJid] = perms.commandAccess[targetJid].filter(c => c !== targetCommand);
                    if (perms.commandAccess[targetJid].length === 0) delete perms.commandAccess[targetJid];
                    savePermissions(perms);
                    return await sock.sendMessage(jid, {
                        text: `❌ Command "*${targetCommand}*" is no longer public for @${targetJid.split("@")[0]}`,
                        mentions: [targetJid]
                    });
                } else {
                    return await sock.sendMessage(jid, {
                        text: `⚠️ Command "*${targetCommand}*" was not public for @${targetJid.split("@")[0]}`,
                        mentions: [targetJid]
                    });
                }
            }

            // 🛑 Case: Remove command from current chat
            if (targetCommand && !replyJid && !mentionedJid) {
                if (perms.commandAccess[jid]?.includes(targetCommand)) {
                    perms.commandAccess[jid] = perms.commandAccess[jid].filter(c => c !== targetCommand);
                    if (perms.commandAccess[jid].length === 0) delete perms.commandAccess[jid];
                    savePermissions(perms);
                    return await sock.sendMessage(jid, {
                        text: `❌ Command "*${targetCommand}*" is no longer public in this chat.`
                    });
                } else {
                    return await sock.sendMessage(jid, {
                        text: `⚠️ Command "*${targetCommand}*" was not public in this chat.`
                    });
                }
            }

            // 🛑 Case: Remove full access for user/group
            if (perms.publicJids.includes(targetJid)) {
                perms.publicJids = perms.publicJids.filter(j => j !== targetJid);
                savePermissions(perms);
                return await sock.sendMessage(jid, {
                    text: `Revoked public access for @${targetJid.split("@")[0]}`,
                    mentions: [targetJid]
                });
            } else {
                return await sock.sendMessage(jid, {
                    text: `⚠️ @${targetJid.split("@")[0]} doesn't have public access.`,
                    mentions: [targetJid]
                });
            }
        }
    }
];
