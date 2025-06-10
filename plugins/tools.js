const fs = require("fs");
const path = require("path");
const { extractViewOnceMedia, toNum } = require("../lib");
const storePath = path.join(__dirname, "..", "media", "tmp", "storedMessages.json");

function loadStoredMessages() {
  try {
    return JSON.parse(fs.readFileSync(storePath));
  } catch {
    return [];
  }
}

function saveStoredMessages(messages) {
  fs.writeFileSync(storePath, JSON.stringify(messages, null, 2));
}


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
    {
    name: "grab",
    desc: "Grab group member numbers from replied JID list (filter by country code if needed)",
    scut: "g",
    utility: "tools",
    fromMe: true,

    execute: async (sock, msg, args) => {
      try {
        const code = args[0]?.trim();

        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const repliedText =
          quoted?.conversation ||
          quoted?.extendedTextMessage?.text ||
          quoted?.imageMessage?.caption ||
          quoted?.videoMessage?.caption ||
          quoted?.documentMessage?.caption ||
          "";

        if (!repliedText) {
          return await sock.sendMessage(
            msg.key.remoteJid,
            {
              text: "❌ Please reply to a message containing group JIDs (like 1203xxxxx@g.us).",
            },
            { quoted: msg }
          );
        }

        const rawJids = (repliedText.match(/\d+@g\.us/g) || []).map((j) => j.trim());
        if (rawJids.length === 0) {
          return await sock.sendMessage(
            msg.key.remoteJid,
            { text: "❌ No valid group JIDs found in the message." },
            { quoted: msg }
          );
        }

        const allNumbers = new Set();

        for (const jid of rawJids) {
          try {
            const metadata = await sock.groupMetadata(jid);
            for (const participant of metadata.participants) {
              const num = toNum(participant.id);
              if (!num.startsWith("0")) allNumbers.add(num);
            }
            await new Promise((res) => setTimeout(res, 1000));
          } catch {}
        }

        let numbersArray = Array.from(allNumbers);
        const usingCode = code && !isNaN(code) ? code : null;
        if (usingCode) {
          numbersArray = numbersArray.filter((num) => num.startsWith(usingCode));
        }

        if (numbersArray.length === 0) {
          return await sock.sendMessage(
            msg.key.remoteJid,
            {
              text: `❌ No numbers found${usingCode ? ` with code +${usingCode}` : ""}.`,
            },
            { quoted: msg }
          );
        }

        const result = numbersArray.map((n) => `+${n}`).join("\n");

        const now = new Date();
        const formattedTime = now.toISOString().replace(/T/, "_").replace(/:/g, "-").split(".")[0];
        const prefix = usingCode ? `All_${usingCode}` : "All";
        const fileName = `${prefix}_${formattedTime}_byMANJI.txt`;

        const filePath = path.join(__dirname, "..", "media", "tmp", fileName);
        fs.writeFileSync(filePath, result);

        await sock.sendMessage(
          msg.key.remoteJid,
          {
            document: fs.readFileSync(filePath),
            fileName,
            mimetype: "text/plain",
          },
          { quoted: msg }
        );

        setTimeout(() => {
          try {
            fs.unlinkSync(filePath);
          } catch {}
        }, 15_000);
      } catch {
        await sock.sendMessage(
          msg.key.remoteJid,
          { text: "❌ An error occurred while grabbing numbers." },
          { quoted: msg }
        );
      }
    },
  },
  {
    name: "smsset",
    desc: "Save a message (any type) to be forwarded later",
    fromMe: true,
    type: "tools",
    async execute(sock, msg) {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const quoted = ctx?.quotedMessage;
      const id = ctx?.stanzaId;
      const remoteJid = ctx?.participant || msg.key.remoteJid;

      if (!quoted || !id) {
        return sock.sendMessage(msg.key.remoteJid, { text: "❌ Reply to any message to save it." }, { quoted: msg });
      }

      const stored = loadStoredMessages();
      stored.push({ quoted, id, remoteJid });
      saveStoredMessages(stored);

      await sock.sendMessage(msg.key.remoteJid, {
        text: `✅ Message saved. Total saved: ${stored.length}`
      }, { quoted: msg });
    }
  },

  {
    name: "smsdlt",
    desc: "Clear all saved messages",
    fromMe: true,
    type: "tools",
    async execute(sock, msg) {
      saveStoredMessages([]);
      await sock.sendMessage(msg.key.remoteJid, { text: "🗑️ All saved messages deleted." }, { quoted: msg });
    }
  },

  {
    name: "fa",
    desc: "Forward saved messages to numbers or a .txt file",
    fromMe: true,
    type: "tools",
    async execute(sock, msg) {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const quoted = ctx?.quotedMessage;
      const stored = loadStoredMessages();

      if (stored.length === 0) {
        return sock.sendMessage(msg.key.remoteJid, {
          text: "❌ No messages saved. Use `.smsset` to save a message first."
        }, { quoted: msg });
      }

      let numbers = [];

      if (ctx?.quotedMessage?.documentMessage) {
        const { dlMedia } = require("../lib");
        const buffer = await dlMedia(msg, "buffer", true);
        const lines = buffer.toString().split(/\r?\n/);
        numbers = lines.map((line) => line.trim()).filter((n) => n.startsWith("+"));
      } else {
        const text = ctx?.quotedMessage?.conversation || ctx?.quotedMessage?.extendedTextMessage?.text;
        numbers = (text?.match(/\+\d{10,}/g) || []).map((n) => n.trim());
      }

      if (numbers.length === 0) {
        return sock.sendMessage(msg.key.remoteJid, { text: "❌ No valid numbers found." }, { quoted: msg });
      }

      await sock.sendMessage(msg.key.remoteJid, {
        text: `📨 Starting to forward ${stored.length} messages to ${numbers.length} numbers...`
      }, { quoted: msg });

      for (const number of numbers) {
        const jid = number.replace(/\+/g, "") + "@s.whatsapp.net";

        for (const item of stored) {
          try {
            await sock.sendMessage(jid, {
              forward: {
                key: {
                  fromMe: true,
                  remoteJid: item.remoteJid,
                  id: item.id
                },
                message: item.quoted
              }
            });

            await new Promise((r) => setTimeout(r, 5000)); // 5s between messages
          } catch (err) {
            console.log(`❌ Failed to send to ${number}:`, err.message);
          }
        }

        await new Promise((r) => setTimeout(r, 30000)); // 30s between users
      }

      await sock.sendMessage(msg.key.remoteJid, {
        text: "✅ All messages forwarded successfully."
      }, { quoted: msg });
    }
  },
];
