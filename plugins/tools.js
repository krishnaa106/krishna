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
        scut: ">",
        desc: "Extract and send view-once media to self",
        utility: "tools",
        fromMe: true,
        async execute(client, msg) {
            return extractViewOnceMedia(client, msg, true);
        }
    },
    {
        name: "forward",
        scut: "f,frwd",
        desc: "Silently forward the replied message to a JID",
        utility: "tools",
        fromMe: true,
      
        execute: async (client, msg, args) => {
          try {
            const jid = args.join(" ")?.trim();
            const ctx = msg.message?.extendedTextMessage?.contextInfo;
            const quoted = ctx?.quotedMessage;
            const id = ctx?.stanzaId;
      
            if (!jid || !quoted || !id) return;
      
            await client.sendMessage(jid, {
              forward: {
                key: {
                  fromMe: false,
                  remoteJid: msg.key.remoteJid,
                  id
                },
                message: quoted
              }
            });
      
          } catch (err) {
            console.error("❌ .f error:", err);
          }
        }
    },
    {
        name: "save",
        scut: "sv,/",
        desc: "Silently forward the replied message to bot itself",
        utility: "tools",
        fromMe: true,
      
        execute: async (client, msg) => {
          try {
            const ctx = msg.message?.extendedTextMessage?.contextInfo;
            const quoted = ctx?.quotedMessage;
            const id = ctx?.stanzaId;
      
            if (!quoted || !id) return;
    
            const botJid = client.user?.id || client.user?.jid;
          if (!botJid) return;
      
            await client.sendMessage(botJid, {
              forward: {
                key: {
                  fromMe: false,
                  remoteJid: msg.key.remoteJid,
                  id
                },
                message: quoted
              }
            });
      
          } catch (err) {
            console.error("❌ .save error:", err);
          }
        }
    },
];
