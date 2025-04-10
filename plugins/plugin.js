const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { waChatKey } = require("@whiskeysockets/baileys/lib/Store/make-in-memory-store");

const EPLUGIN_DIR = path.join(__dirname, "../eplugins");

if (!fs.existsSync(EPLUGIN_DIR)) {
    fs.mkdirSync(EPLUGIN_DIR, { recursive: true });
}

async function fetchAndSaveGist(gistUrl) {
    try {
        const match = gistUrl.match(/https:\/\/gist\.github\.com\/[^\/]+\/([a-f0-9]+)/);
        if (!match) throw new Error("Invalid Gist URL");
        
        const gistId = match[1];
        const apiUrl = `https://api.github.com/gists/${gistId}`;
        const { data } = await axios.get(apiUrl);
        
        const files = Object.entries(data.files);
        if (files.length === 0) throw new Error("No files found in Gist");
        
        const [fileName, fileData] = files[0];
        const filePath = path.join(EPLUGIN_DIR, fileName);
        
        fs.writeFileSync(filePath, fileData.content);
        return fileName;
    } catch (error) {
        return null;
    }
}

function deletePlugin(fileNameOrCommand) {
    try {
        const files = fs.readdirSync(EPLUGIN_DIR).filter(file => file.endsWith(".js"));
        for (const file of files) {
            const filePath = path.join(EPLUGIN_DIR, file);
            const plugin = require(filePath);
            
            if (file === fileNameOrCommand || (Array.isArray(plugin) && plugin.some(cmd => cmd.name === fileNameOrCommand))) {
                fs.unlinkSync(filePath);
                return file;
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

module.exports = [
    {
        name: "install",
        desc: "Fetches a script from a Gist link and saves it as a plugin",
        utility: "owner",
        fromMe: true,
        execute: async (client, msg, args) => {
            try {
                const gistUrl = args[0] || (msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.conversation);
                if (!gistUrl) {
                    await client.sendMessage(msg.key.remoteJid, { text: "_Provide a Gist URL or reply to one!_" });
                    return {isFallback: true};
                }
                
                const fileName = await fetchAndSaveGist(gistUrl);
                if (!fileName) {
                    await client.sendMessage(msg.key.remoteJid, { text: "_Failed to install plugin!_" });
                    return {isFallback: true};
                }
                return client.sendMessage(msg.key.remoteJid, { text: `✅ Plugin '${fileName}' installed successfully!` });
            } catch {
                return client.sendMessage(msg.key.remoteJid, { text: "❌ An error occurred!" });
            }
        },
    },
    {
        name: "uninstall",
        desc: "Deletes a plugin file from eplugins folder",
        utility: "owner",
        fromMe: true,
        execute: async (client, msg, args) => {
            try {
                const fileNameOrCommand = args[0];
                if (!fileNameOrCommand) {
                    await client.sendMessage(msg.key.remoteJid, { text: "❌ Provide a file name or command name!" });
                    return {isFallback: true};
                }
                
                const deletedFile = deletePlugin(fileNameOrCommand);
                if (!deletedFile) {
                    await client.sendMessage(msg.key.remoteJid, { text: "❌ Plugin not found or failed to delete!" });
                    return {isFallback: true};
                }
                
                await client.sendMessage(msg.key.remoteJid, { text: `✅ Plugin '${deletedFile}' uninstalled successfully!` });
                return {isFallback: false};
            } catch {
                await client.sendMessage(msg.key.remoteJid, { text: "❌ An error occurred!" });
                return {isFallback: true};
            }
        },
    },
];
