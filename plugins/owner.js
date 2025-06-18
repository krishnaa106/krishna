const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
require("dotenv").config({ path: "./config.env" });
const {cleanup, commandExists} = require("../lib");

const CONFIG_PATH = "./config.env";
const permissionsPath = path.join(__dirname, "../db/permissions.json");

function loadPermissions() {
    if (!fs.existsSync(permissionsPath)) return { publicJids: [], commandAccess: {} };
    return JSON.parse(fs.readFileSync(permissionsPath, "utf8"));
}

function savePermissions(data) {
    fs.writeFileSync(permissionsPath, JSON.stringify(data, null, 2));
}

module.exports = [
    
    {
        name: "mode",
        desc: "Switch between public and private mode",
        utility: "owner",
        fromMe: true,
    
        execute: async (client, msg, args) => {
            try {
                const sudoUsers = process.env.SUDO ? process.env.SUDO.split(",") : [];
                const senderNumber = msg.key.participant?.split("@")[0] || msg.key.remoteJid.split("@")[0];
                const isSudo = sudoUsers.includes(senderNumber);
    
                if (!msg.key.fromMe && !isSudo) {
                    await client.sendMessage(msg.key.remoteJid, { text: "_Only the bot owner or sudo users can use this!_" });
                    return { isFallback: true };
                }
    
                if (!args[0]) {
                    await client.sendMessage(msg.key.remoteJid, { 
                        text: `_Currently : ${process.env.BOT_MODE.toUpperCase()}_\n_Usage : .mode public/private_`
                    });
                    return { isFallback: true };
                }
    
                if (args[0] !== "public" && args[0] !== "private") {
                    return client.sendMessage(msg.key.remoteJid, { text: "_Usage: .mode public/private_" });
                }
    
                process.env.BOT_MODE = args[0];
                client.sendMessage(msg.key.remoteJid, { text: `✅ Bot mode set to *${args[0].toUpperCase()}*` });
            } catch (err) {
                console.error("❌ Error switching bot mode:", err);
                return client.sendMessage(msg.key.remoteJid, { text: "_Failed to switch bot mode!_" });
            }
        }
    },
    {
        name: "setvar",
        desc: "Set an environment variable",
        utility: "owner",
        fromMe: true,
    
        execute: async (client, msg, args) => {
            let input = args.join(" ");
            let key, value;
    
            if (input.includes("=")) {
                [key, value] = input.split("=");
                key = key?.trim().toUpperCase();
                value = value?.trim();
            } else if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation) {
                key = input.trim().toUpperCase();
                value = msg.message.extendedTextMessage.contextInfo.quotedMessage.conversation.trim();
            }
    
            if (!key || value === undefined) {
                await client.sendMessage(msg.key.remoteJid, { text: "*Usage:*\n> `.setvar KEY=VALUE`\nor\nReply to a text with `.setvar KEY_NAME`" });
                return { isFallback: true };
            }
    
            let envData = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH, "utf8").trim() : "";
            let lines = envData.split("\n").filter(Boolean).map(line => line.startsWith(`${key}=`) ? `${key}=${value}` : line);
    
            if (!lines.some(line => line.startsWith(`${key}=`))) lines.push(`${key}=${value}`);
            fs.writeFileSync(CONFIG_PATH, lines.join("\n") + "\n");
    
            return client.sendMessage(msg.key.remoteJid, { text: `✅ *${key}* set to:\n\`\`\`${value}\`\`\`` });
        }
    },    

    {
        name: "allvar",
        desc: "Show all environment variables",
        utility: "owner",
        fromMe: true,
        
        execute: async (client, msg) => {
            let envData = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH, "utf8").trim() : "No variables set.";
            await client.sendMessage(msg.key.remoteJid, { text: `\`\`\`\n${envData}\n\`\`\`` });
        }
    },

    {
        name: "delvar",
        desc: "Delete an environment variable",
        utility: "owner",
        fromMe: true,

        execute: async (client, msg, args) => {
            const key = args[0]?.trim().toUpperCase();
            if (!key) {
                await client.sendMessage(msg.key.remoteJid, { text: "*Usage:*\n`.delvar KEY_NAME`" });
                return { isFallback: true };
            }

            let envData = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH, "utf8").trim() : "";
            let lines = envData.split("\n").filter(Boolean).filter(line => !line.startsWith(`${key}=`));

            fs.writeFileSync(CONFIG_PATH, lines.join("\n") + "\n");

            return client.sendMessage(msg.key.remoteJid, { text: `✅ *${key}* deleted` });
        }
    },
    {
        name: "evar",
        desc: "Edit an environment variable value",
        utility: "owner",
        fromMe: true,
    
        execute: async (client, msg, args) => {
            let input = args.join(" ");
            let key, value;
    
            if (input.includes("=")) {
                [key, value] = input.split("=");
                key = key?.trim().toUpperCase();
                value = value?.trim();
            } else if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation) {
                key = input.trim().toUpperCase();
                value = msg.message.extendedTextMessage.contextInfo.quotedMessage.conversation.trim();
            }
    
            if (!key || value === undefined) {
                await client.sendMessage(msg.key.remoteJid, { text: "_Usage: .evar KEY=VALUE or reply to a text with .evar KEY_" });
                return { isFallback: true };
            }
    
            let envData = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH, "utf8").trim() : "";
            let lines = envData.split("\n").filter(Boolean);
    
            if (!lines.some(line => line.startsWith(`${key}=`))) {
                await client.sendMessage(msg.key.remoteJid, { text: `❌ *${key}* not found.` });
                return { isFallback: true };
            }
    
            lines = lines.map(line => (line.startsWith(`${key}=`) ? `${key}=${value}` : line));
            fs.writeFileSync(CONFIG_PATH, lines.join("\n") + "\n");
    
            await client.sendMessage(msg.key.remoteJid, { text: `✅ *${key}* updated to:\n\`\`\`${value}\`\`\`` });
            return { isFallback: false };
        }
    },
    
    {
        name: "setsudo",
        desc: "Add a number to SUDO list",
        utility: "owner",
        fromMe: true,

        execute: async (client, msg) => {
            if (!msg.message.extendedTextMessage) {
                await client.sendMessage(msg.key.remoteJid, { text: "_Reply to a message to use this command._" });
                return { isFallback: true };
            }
            
            const senderJid = msg.message.extendedTextMessage.contextInfo.participant;
            const senderNumber = senderJid.split("@")[0];
            
            let envData = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH, "utf8").trim() : "";
            let sudoList = envData.match(/^SUDO=(.*)$/m)?.[1]?.split(",") || [];
            
            if (!sudoList.includes(senderNumber)) sudoList.push(senderNumber);
            fs.writeFileSync(CONFIG_PATH, envData.replace(/^SUDO=.*$/m, `SUDO=${sudoList.join(",")}`) || `SUDO=${senderNumber}\n`);
            
            await client.sendMessage(msg.key.remoteJid, { text: `✅ *${senderNumber}* added to SUDO` });
            return { isFallback: false };
        }
    },
    {
        name: "delsudo",
        desc: "Remove a number from SUDO list",
        utility: "owner",
        fromMe: true,

        execute: async (client, msg) => {
            const senderJid = msg.message.extendedTextMessage?.contextInfo.participant;
            if (!senderJid) {
                await client.sendMessage(msg.key.remoteJid, { text: "_Reply to a message to use this command._" });
                return { isFallback: true };
            }
            const senderNumber = senderJid.split("@")[0];
            
            let envData = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH, "utf8").trim() : "";
            let sudoList = envData.match(/^SUDO=(.*)$/m)?.[1]?.split(",") || [];
            
            if (!sudoList.includes(senderNumber)) return client.sendMessage(msg.key.remoteJid, { text: `❌ *${senderNumber}* is not in SUDO` });
            
            sudoList = sudoList.filter(num => num !== senderNumber);
            fs.writeFileSync(CONFIG_PATH, envData.replace(/^SUDO=.*$/m, `SUDO=${sudoList.join(",")}`));
            
            await client.sendMessage(msg.key.remoteJid, { text: `✅ *${senderNumber}* removed from SUDO` });
            return { isFallback: false };
        }
    },
    {
        name: "jid",
        desc: "Get the JID of replied user, group, or self",
        utility: "tools",
        fromMe: false,

        execute: async (client, msg) => {
            let jid = msg.message.extendedTextMessage?.contextInfo.participant || msg.key.remoteJid;
            return client.sendMessage(msg.key.remoteJid, { text: `${jid}` });
        }
    },
    {
        name: "gjid",
        desc: "Get the list of all groups with their JIDs",
        utility: "tools",
        fromMe: true,

        execute: async (client, msg) => {
            let groups = await client.groupFetchAllParticipating();
            let groupList = Object.values(groups)
                .map((g, i) => `${i + 1}. ${g.subject} -\n${g.id}`)
                .join("\n\n");
            await client.sendMessage(msg.key.remoteJid, { text: groupList || "No groups found." });
            return { isFallback: true };
        }
    },
    {
        name: "clear",
        scut: "clc, clearchat",
        desc: "Clears the chat where its being executed",
        utility: "owner",
        fromMe: true,

        async execute(sock, msg) {
        await sock.chatModify(
            {
            delete: true,
            lastMessages: [
                {
                key: msg.key,
                messageTimestamp: msg.messageTimestamp
                }
            ]
            },
            msg.key.remoteJid
        );
        await sock.sendMessage(msg.key.remoteJid, { text: "_cleared_" });
        }
    },
    {
        name: "reboot",
        desc: "Reboot the bot",
        utility: "system",
        fromMe: true,

        execute: async (client, msg) => {
            await client.sendMessage(msg.key.remoteJid, { text: "♻️ Rebooting..." });
            
            cleanup()

            exec("pm2 restart lixon", (err) => {
                if (err) {
                    console.error("❌ Error restarting the bot:", err);
                    return client.sendMessage(msg.key.remoteJid, { text: "❌ Failed to restart the bot!" });
                }
            });
        },
    },
    {
        name: "usage",
        desc: "Get usage info of any command",
        utility: "tools",
        fromMe: false,

        execute: async (client, msg, args) => {
            const jid = msg.key.remoteJid;

            if (!args.length) {
            await client.sendMessage(jid, {
                text: "*Usage:* `.usage <command>`\n*Example:* `.usage ssize`"
            });
            return;
            }

            const command = args[0].toLowerCase();
        const usagePath = path.join(__dirname, "..", "lixon", "usage.json");

            let usageData;

            try {
            const raw = fs.readFileSync(usagePath, "utf-8");
            usageData = JSON.parse(raw);
            } catch (e) {
            await client.sendMessage(jid, { text: "❌ Failed to load usage data." });
            return;
            }

            if (!usageData[command]) {
            await client.sendMessage(jid, {
                text: `❌ No usage info found for command: ${command}`
            });
            return;
            }

            const usage = usageData[command];
            const text =
            `📚 *Usage for* \`.${command}\`\n\n` +
            `*Description:* ${usage.description}\n\n` +
            usage.usage.map(line => `• ${line}`).join("\n");

            await client.sendMessage(jid, { text });
        }
    },
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
            const targetJid =
                mentionedJid ||
                replyJid ||
                (!isCommand && input) ||
                (!input && jid);

            // ✅ Check command existence with utility
            if (targetCommand && !commandExists(targetCommand)) {
                return await sock.sendMessage(jid, { text: `_Command "*${targetCommand}*" not found_.` });
            }

            // ✅ Case: .allow <cmd> @mention OR reply
            if (targetCommand && (replyJid || mentionedJid)) {
                if (!perms.commandAccess[targetJid]) perms.commandAccess[targetJid] = [];
                if (!perms.commandAccess[targetJid].includes(targetCommand)) {
                    perms.commandAccess[targetJid].push(targetCommand);
                    savePermissions(perms);
                    return await sock.sendMessage(jid, {
                        text: `✅ Command "*${targetCommand}*" is now public for @${targetJid.split("@")[0]}`,
                        mentions: [targetJid]
                    });
                } else {
                    return await sock.sendMessage(jid, {
                        text: `⚠️ Command "*${targetCommand}*" already allowed for @${targetJid.split("@")[0]}`,
                        mentions: [targetJid]
                    });
                }
            }

            // ✅ Case: .allow <cmd> in group or DM
            if (targetCommand && !replyJid && !mentionedJid) {
                if (!perms.commandAccess[jid]) perms.commandAccess[jid] = [];
                if (!perms.commandAccess[jid].includes(targetCommand)) {
                    perms.commandAccess[jid].push(targetCommand);
                    savePermissions(perms);
                    return await sock.sendMessage(jid, {
                        text: `✅ Command "*${targetCommand}*" is now public in this chat.`
                    });
                } else {
                    return await sock.sendMessage(jid, {
                        text: `⚠️ Command "*${targetCommand}*" is already allowed in this chat.`
                    });
                }
            }

            // ✅ Case: Allow user/group JID for all commands
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
            const targetJid =
                mentionedJid ||
                replyJid ||
                (!isCommand && input) ||
                (!input && jid);

            // ✅ Check command existence
            if (targetCommand && !commandExists(targetCommand)) {
                return await sock.sendMessage(jid, { text: `_Command "*${targetCommand}*" not found._` });
            }

            // 🛑 Case: .deny <cmd> @mention or reply
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

            // 🛑 Case: .deny <cmd> in chat
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

            // 🛑 Case: deny full access for a JID (replied/mentioned/input)
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
    },
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
                return await sock.sendMessage(jid, {
                    text: `_Allowlist cleared._`
                });
            }

            // 📝 Default: Show allowlist
            let text = `📝 *Allowlist Summary:*\n\n`;

            // 👥 Public JIDs
            if (perms.publicJids.length > 0) {
                text += `👥 *Public JIDs*:\n`;
                for (const j of perms.publicJids) {
                    const isGroup = j.endsWith("@g.us");
                    const tag = j.split("@")[0];
                    text += `• ${isGroup ? "Group" : "User"}: @${tag}\n`;
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
                    const tag = jidKey.split("@")[0];
                    text += `• ${isGroup ? "Group" : "User"} @${tag}: ${cmds.join(", ")}\n`;
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
];