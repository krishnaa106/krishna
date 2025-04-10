const fs = require("fs");
const { exec } = require("child_process");
require("dotenv").config({ path: "./config.env" });
const {cleanup} = require("../lib");

const CONFIG_PATH = "./config.env";

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
    }
];