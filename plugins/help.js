const fs = require("fs");
const path = require("path");

module.exports = {
    name: "help",
    desc: "Show command descriptions",
    utility: "ui",
    fromMe: false,

    execute: async (sock, msg) => {
        try {
            const pluginPath = path.join(__dirname, "../plugins");
            const files = fs.readdirSync(pluginPath).filter(file => file.endsWith(".js"));

            if (files.length === 0) {
                return await sock.sendMessage(msg.key.remoteJid, { text: "_No commands available!_" });
            }

            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            const args = text ? text.trim().split(/\s+/) : [];

            const commands = {};

            for (const file of files) {
                try {
                    const filePath = path.join(pluginPath, file);
                    delete require.cache[require.resolve(filePath)];
                    const plugin = require(filePath);

                    if (Array.isArray(plugin)) {
                        for (const cmd of plugin) {
                            if (cmd.name) {
                                commands[cmd.name.toLowerCase()] = cmd;
                            }
                        }
                    } else if (plugin.name) {
                        commands[plugin.name.toLowerCase()] = plugin;
                    }
                } catch (err) {
                    continue;
                }
            }

            if (args.length === 1) {
                let output = "\u256D\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256E\n";
                let index = 1;
                
                for (const plugin of Object.values(commands)) {
                    output += `│ ${index}. ${plugin.name.toUpperCase()}\n`;
                    index++;
                }
                
                output += "\u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500◆";

                await sock.sendMessage(msg.key.remoteJid, { text: output.trim() });
            } else {
                const commandName = args[1].toLowerCase().replace(".", "");
                const command = commands[commandName];

                if (command) {
                    await sock.sendMessage(msg.key.remoteJid, { text: `*${command.name.toUpperCase()}:* ${command.desc || "_No description available_"}` });
                } else {
                    await sock.sendMessage(msg.key.remoteJid, { text: "_Command not found!_" });
                }
            }
        } catch (error) {
            await sock.sendMessage(msg.key.remoteJid, { text: "_An error occurred while fetching the help menu._" });
        }
    }
};
