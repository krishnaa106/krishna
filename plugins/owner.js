const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
require("dotenv").config({ path: "../config.env" });
const {cleanup, saveEnv, dlMedia, starMsg, updateEnv } = require("../lib");

const CONFIG_PATH = path.join(__dirname, "../config.env");


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
                    return;
                }

                if (!args[0]) {
                    return client.sendMessage(msg.key.remoteJid, { 
                        text: "*USAGE:*\n> .mode public/private"
                    });
                }

                const mode = args[0].toLowerCase();
                if (mode !== "public" && mode !== "private") {
                    return client.sendMessage(msg.key.remoteJid, { text: "*USAGE:*\n> .mode public/private" });
                }

                updateEnv("BOT_MODE", mode);
                return client.sendMessage(msg.key.remoteJid, { text: `✅ Bot mode set to *${mode.toUpperCase()}*` });

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

            }
    
            let envData = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH, "utf8").trim() : "";
            let lines = envData.split("\n").filter(Boolean).map(line => line.startsWith(`${key}=`) ? `${key}=${value}` : line);
    
            if (!lines.some(line => line.startsWith(`${key}=`))) lines.push(`${key}=${value}`);
            fs.writeFileSync(CONFIG_PATH, lines.join("\n") + "\n");
            saveEnv();
    
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

            }

            let envData = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH, "utf8").trim() : "";
            let lines = envData.split("\n").filter(Boolean).filter(line => !line.startsWith(`${key}=`));

            fs.writeFileSync(CONFIG_PATH, lines.join("\n") + "\n");
            saveEnv();
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

            }
    
            let envData = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH, "utf8").trim() : "";
            let lines = envData.split("\n").filter(Boolean);
    
            if (!lines.some(line => line.startsWith(`${key}=`))) {
                await client.sendMessage(msg.key.remoteJid, { text: `❌ *${key}* not found.` });

            }
    
            lines = lines.map(line => (line.startsWith(`${key}=`) ? `${key}=${value}` : line));
            fs.writeFileSync(CONFIG_PATH, lines.join("\n") + "\n");
            saveEnv();
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
        scut: "clc",
        desc: "Clear all messages in the current chat",
        utility: "owner",
        fromMe: true,

        execute: async (client, msg) => {
            try {
                // Ensure only owner or sudo users can use this
                const sudoUsers = process.env.SUDO ? process.env.SUDO.split(",") : [];
                const senderNumber = msg.key.participant?.split("@")[0] || msg.key.remoteJid.split("@")[0];
                const isSudo = sudoUsers.includes(senderNumber);

                if (!msg.key.fromMe && !isSudo) {
                    await client.sendMessage(msg.key.remoteJid, { text: "_Only the bot owner or sudo users can use this!_" });
                    return;
                }

                // Clear chat by sending chatModify
                await client.chatModify(
                    { delete: true, lastMessages: [{ key: msg.key, messageTimestamp: msg.messageTimestamp || msg.timestamp }] },
                    msg.key.remoteJid
                );

                await client.sendMessage(msg.key.remoteJid, { text: "_cleared_" });
            } catch (err) {
                console.error("❌ Error clearing chat:", err);
                await client.sendMessage(msg.key.remoteJid, { text: "❌ _Failed to clear the chat!_" });
            }
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
        const usagePath = path.join(__dirname, "..", "db", "usage.json");

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
        name: "profilepic",
        scut: "pp",
        desc: "Change your profile picture using a replied image or image caption",
        utility: "owner",
        fromMe: true,

        execute: async (sock, msg) => {
            // Get the image as a buffer
            const buffer = await dlMedia(msg, sock, "buffer");

            if (!buffer) {
                return sock.sendMessage(msg.key.remoteJid, {
                    text: "_Reply to an image_"
                });
            }

            try {
                await sock.updateProfilePicture(
                    msg.key.participant || msg.key.remoteJid,
                    { stream: buffer }
                );
            } catch (err) {
                console.error("❌ Error updating profile picture:", err);
                await sock.sendMessage(msg.key.remoteJid, { text: "❌ Failed to update profile picture." });
            }
        }
    },
    {
        name: "rmpp",
        scut: "rpp",
        desc: "Remove your profile picture",
        utility: "owner",
        fromMe: true,
        async execute(sock, msg) {
        await sock.removeProfilePicture(msg.key.participant).catch(() => {});
        }
    },

    {
        name: "username",
        scut: "name",
        desc: "Change your profile name",
        utility: "owner",
        fromMe: true,
        async execute(sock, msg, args) {
        const quotedText =
            msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
            msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text;

        const name = quotedText || args.join(" ").trim();
        if (!name) return;

        await sock.updateProfileName(name);
        }
    },

    {
        name: "about",
        scut: "bio",
        desc: "Change your WhatsApp bio (about)",
        utility: "owner",
        fromMe: true,
        async execute(sock, msg, args) {
        const quotedText =
            msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
            msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text;

        const bio = quotedText || args.join(" ").trim();
        if (!bio) return;

        await sock.updateProfileStatus(bio);
        }
    },
        {
        name: "star",
        desc: "Star a replied message",
        type: "owner",
        fromMe: false,

        execute: async (sock, msg) => {
        const context = msg.message?.extendedTextMessage?.contextInfo;
        const stanzaId = context?.stanzaId;
        const remoteJid = msg.key.remoteJid;
        const participant = context?.participant || msg.key.participant;
        const fromMe = msg.key.participant === participant;

        if (!stanzaId) {
            return sock.sendMessage(remoteJid, { text: "_Reply to a message to star it._" });
        }

        const success = await starMsg(sock, remoteJid, stanzaId, fromMe, true);
        if (!success) {
            return sock.sendMessage(remoteJid, { text: "_Failed to star message._" });
        }
        }
    },
    {
        name: "unstar",
        desc: "Unstar a replied message",
        type: "owner",
        fromMe: false,

        execute: async (sock, msg) => {
        const context = msg.message?.extendedTextMessage?.contextInfo;
        const stanzaId = context?.stanzaId;
        const remoteJid = msg.key.remoteJid;
        const participant = context?.participant || msg.key.participant;
        const fromMe = msg.key.participant === participant;

        if (!stanzaId) {
            return sock.sendMessage(remoteJid, { text: "_Reply to a message to unstar it._" });
        }

        const success = await starMsg(sock, remoteJid, stanzaId, fromMe, false);
        if (!success) {
            return sock.sendMessage(remoteJid, { text: "_Failed to unstar message._" });
        }
        }
    }
];