const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
require("dotenv").config({ path: "./config.env" });

module.exports = {
    name: "menu",
    desc: "Show available commands",
    utility: "ui",
    fromMe: false,

    execute: async (sock, msg) => {
        try {
            const pluginPath = path.join(__dirname, "../plugins");
            const files = fs.readdirSync(pluginPath).filter(file => file.endsWith(".js"));

            if (files.length === 0) {
                return await sock.sendMessage(msg.key.remoteJid, { text: "❌ No commands available." });
            }

            const groupedCommands = {};
            let totalCommands = 0;

            for (const file of files) {
                try {
                    const plugin = require(path.join(pluginPath, file));

                    if (Array.isArray(plugin)) {
                        plugin.forEach(cmd => processCommand(cmd));
                    } else {
                        processCommand(plugin);
                    }
                } catch (err) {
                    console.error("❌ Failed to load command:", file, err);
                }
            }

            function processCommand(cmd) {
                if (cmd.name && cmd.utility) {
                    if (!groupedCommands[cmd.utility]) {
                        groupedCommands[cmd.utility] = [];
                    }
                    groupedCommands[cmd.utility].push(cmd.name.toUpperCase());
                    totalCommands++;
                }
            }

            if (Object.keys(groupedCommands).length === 0) {
                return await sock.sendMessage(msg.key.remoteJid, { text: "❌ No valid commands found." });
            }

            const configPrefix = process.env.PREFIX || ".";
            const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf-8"));
            const version = packageJson.version || "1.0.0";

            const userName = msg.pushName || "User";
            const currentTime = new Date().toLocaleTimeString("en-US", { hour12: true });
            const currentDate = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

            const uptimeSeconds = os.uptime();
            const uptime = new Date(uptimeSeconds * 1000).toISOString().substr(11, 8).replace(/:/g, "h ") + "s";

            let output = `╭───────────────◆\n`;
            output += `│        𝗟𝗜𝗫𝗢𝗡   \n`;
            output += `├───────────────◆\n`;
            output += `│ Prefix: ${configPrefix}\n`;
            output += `│ User: ${userName}\n`;
            output += `│ Time: ${currentTime}\n`;
            output += `│ Date: ${currentDate}\n`;
            output += `│ Version: ${version}\n`;
            output += `│ Commands: ${totalCommands}\n`;
            output += `╰───────────────◆\n\n`;

            for (const [utility, commands] of Object.entries(groupedCommands)) {
                output += `╭─✦ ${utility.toUpperCase()} ✦─╮\n`;
                commands.forEach(cmd => {
                    output += `│ ${cmd}\n`;
                });
                output += `╰───────────────◆\n\n`;
            }

            await sock.sendMessage(msg.key.remoteJid, { text: output.trim() });
        } catch (error) {
            console.error("❌ Error in menu command:", error);
            await sock.sendMessage(msg.key.remoteJid, { text: "❌ An error occurred while fetching the menu." });
        }
    }
};
