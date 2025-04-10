const { extractViewOnceMedia } = require("../lib");


module.exports = [
    {
        name: "db",
        desc: "Debug and send buffer of replied media",
        utility: "tools",
        fromMe: true,
        async execute(client, msg) {
            const jid = msg.key.remoteJid;
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            
            if (!quoted) {
                return client.sendMessage(jid, { text: "❌ Reply to a message to debug!" });
            }
            
            await client.sendMessage(jid, { text: "DEBUG BUFFER:\n" + JSON.stringify(quoted, null, 2) });
        }
    },

    {
        name: "vv",
        desc: "Extract and resend view-once media",
        utility: "tools",
        fromMe: false,
        async execute(client, msg) {
            return extractViewOnceMedia(client, msg);
        }
    },
    {
        name: "vs",
        desc: "Extract and send view-once media to self",
        utility: "tools",
        fromMe: true,
        async execute(client, msg) {
            return extractViewOnceMedia(client, msg, true);
        }
    },
];
