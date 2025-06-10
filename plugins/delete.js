const { botNum, isSudo, isBotAdmin, getSender, delAdmin, delMe } = require("../lib");

module.exports = [
    {
        name: "dlt",
        desc: "Delete message for everyone",
        utility: "owner",
        fromMe: true,
        async execute(client, msg) {
            const jid = msg.key.remoteJid;
            const quoted = msg.message?.extendedTextMessage?.contextInfo;
            if (!quoted?.stanzaId) {
                await client.sendMessage(jid, { text: "_Reply to a message to delete it!_" });
                return { isFallback: true };
            }

            const sender = getSender(msg);
            const botJid = botNum(client);

            if (quoted.participant === botJid) {
                await delMe(client, jid, quoted);
                return { isFallback: false };
            }

            if (jid.endsWith("@g.us")) {
                if (!isSudo(sender) && sender !== botJid) {
                    await client.sendMessage(jid, { text: "_You don't have permission to delete messages!_" });
                    return { isFallback: true };
                }

                const metadata = await client.groupMetadata(jid);
                
                if (!isBotAdmin(client, metadata.participants)) {
                    await client.sendMessage(jid, { text: "_I need admin rights to delete messages!_" });
                    return { isFallback: true };
                }

                await delAdmin(client, jid, quoted);
                return { isFallback: false };
            }

            return { isFallback: true }; 
        }
    }
];
