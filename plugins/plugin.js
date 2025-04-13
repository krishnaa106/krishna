const plugin = require("../lib/");

module.exports = [
    {
        name: "install",
        desc: "Install a plugin",
        utility: "owner",
        fromMe: true,
        execute: async (client, msg, args) => {
            const jid = msg.key.remoteJid;
            try {
                const gistUrl = args[0] || (msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.conversation);
                if (!gistUrl) {
                    return client.sendMessage(jid, { text: "_Provide a Gist URL or reply to one!_" });
                }

                const { fileName, commands, error } = await plugin.installPlugin(gistUrl);

                if (error) {
                    return client.sendMessage(jid, { text: `*Plugin rejected:*\n> ${error}` });
                }

                const cmdList = commands.map(c => `- \`${c}\``).join("\n");
                return client.sendMessage(jid, {
                    text: `_Plugin *${fileName}* installed with the following commands:_\n${cmdList}`
                });
            } catch (err) {
                return client.sendMessage(jid, { text: `❌ Unknown error:\n${err.message}` });
            }
        }
    },
    {
        name: "uninstall",
        desc: "Uninstall a plugin",
        utility: "owner",
        fromMe: true,
        execute: async (client, msg, args) => {
            const jid = msg.key.remoteJid;
            const target = args[0];
            if (!target) {
                return client.sendMessage(jid, { text: "_Provide a file name or command name!_" });
            }

            const deleted = plugin.uninstallPlugin(target);
            if (!deleted) {
                return client.sendMessage(jid, { text: "_Plugin not found or failed to uninstall_" });
            }

            return client.sendMessage(jid, { text: `_Plugin \`${deleted}\` uninstalled._` });
        },
    },
];
