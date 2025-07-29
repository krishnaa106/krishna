const fs = require("fs");
const axios = require("axios");
const crypto = require("crypto");
const path = require("path");
const { extractViewOnceMedia, toNum, predictFonts, fetchFontDetails, dlMedia } = require("../lib");
const storePath = path.join(__dirname, "..", "media", "tmp", "storedMessages.json");
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

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
        scut: "sv,/,💗",
        desc: "Silently forward the replied message or status to bot itself",
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

                // If it's an image or video from a status, download & send
                if (quoted.imageMessage || quoted.videoMessage) {
                    const type = quoted.imageMessage ? "imageMessage" : "videoMessage";
                    const stream = await downloadContentFromMessage(quoted[type], type.replace("Message", ""));
                    
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                    const fileType = quoted.imageMessage ? "image" : "video";
                    const options = quoted.imageMessage
                        ? { image: buffer }
                        : { video: buffer, mimetype: quoted.videoMessage.mimetype };

                    await client.sendMessage(botJid, options);
                    return;
                }

                // Otherwise, forward the text/message
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
    {
        name: "calc",
        desc: "Evaluate math expressions including +, -, *, /, ^, √, superscript powers",
        utility: "tools",
        fromMe: false,

        execute: async (sock, msg, args) => {
            const input = args.join(" ").trim();

            if (!input)
                return await sock.sendMessage(msg.key.remoteJid, { text: "_Provide an expression to calculate._" });

            try {
                // Superscript power mappings
                const superscriptMap = {
                    "¹": "^1", "²": "^2", "³": "^3",
                    "⁴": "^4", "⁵": "^5", "⁶": "^6",
                    "⁷": "^7", "⁸": "^8", "⁹": "^9", "⁰": "^0"
                };

                let normalized = input.replace(/[\u00B9\u00B2\u00B3\u2070-\u2079]/g, s => superscriptMap[s] || s);

                // Convert symbols to JS-evaluable ones
                let expression = normalized
                    .replace(/\^/g, "**")
                    .replace(/√\s*([0-9.]+)/g, "Math.sqrt($1)")
                    .replace(/[^-+*/().0-9\s^√a-zA-Z]/g, "");

                const result = Function(`"use strict"; return (${expression})`)();

                if (result === undefined || isNaN(result)) {
                    throw new Error("Invalid expression");
                }

                await sock.sendMessage(msg.key.remoteJid, {
                    text: `*Expression:* ${input}\n> *Result:* ${result}`
                });

            } catch (err) {
                console.error("Calc error:", err);
                await sock.sendMessage(msg.key.remoteJid, {
                    text: "❌ Failed to evaluate expression. Check syntax."
                });
            }
        }
    },
    {
        name: "track",
        desc: "Track and log raw incoming messages",
        scut: "trk",
        utility: "tools",
        fromMe: true,


        execute: async (sock, msg, args) => {
        const jid = msg.key.remoteJid;
        const trackId = `track-${jid}`;

        if (!args || args.length === 0) {
            return await sock.sendMessage(jid, {
            text: "_Usage: .track <number> or .track stop_",
            });
        }

        const input = args[0].toLowerCase();

        if (input === "stop") {
            sock.unregisterTracker?.(trackId);
            return await sock.sendMessage(jid, { text: "_Tracking stopped._" });
        }

        const limit = parseInt(input);
        if (isNaN(limit) || limit <= 0) {
            return await sock.sendMessage(jid, {
            text: "_Usage: .track <number> or .track stop_",
            });
        }

        let count = 0;
        const ownJid = sock.user?.id;

        await sock.sendMessage(jid, {
            text: `_Tracking ${limit} incoming messages..._`,
        });

        sock.registerTracker?.(
            trackId,

            async (incoming) =>
            incoming.key.remoteJid === jid && !incoming.key.fromMe,

            async (_sock, incoming) => {
            count++;

            if (ownJid) {
                await sock.sendMessage(ownJid, {
                text:
                    `📥 [${jid}] Message #${count}:\n\n` +
                    '```json\n' +
                    JSON.stringify(incoming, null, 2) +
                    '\n```',
                });
            }

            if (count >= limit) {
                sock.unregisterTracker(trackId);
                await sock.sendMessage(jid, {
                text: `_Tracking complete. (${limit} messages logged)_`,
                });
            }
            }
        );
        },
    },
    {
      name: "ginfo",
      desc: "Fetch group info from JID or invite link (name, description, invite link, profile picture)",
      utility: "group",
      fromMe: true,
  
      execute: async (sock, msg, args) => {
        try {
          const input = args[0]?.trim() || msg.key.remoteJid;
  
          if (!input) {
            return sock.sendMessage(msg.key.remoteJid, { text: "_Usage: .ginfo <group-jid or invite-link>_" });
          }
  
          let jid = input;
  
          // Check if input is an invite link and extract the code
          if (input.includes("chat.whatsapp.com/")) {
            const inviteCode = input.split("chat.whatsapp.com/")[1]?.split("?")[0];
            if (!inviteCode) {
              return sock.sendMessage(msg.key.remoteJid, { text: "_Invalid invite link format._" });
            }
  
            try {
              // Get group info from invite code
              const groupInfo = await sock.groupGetInviteInfo(inviteCode);
              jid = groupInfo.id;
            } catch (error) {
              return sock.sendMessage(msg.key.remoteJid, { text: "_Invalid or expired invite link._" });
            }
          }
  
          // Validate if it's a group JID
          if (!jid.endsWith("@g.us")) {
            return sock.sendMessage(msg.key.remoteJid, { text: "_Provided input is not a valid group._" });
          }
  
          // Fetch group metadata
          const metadata = await sock.groupMetadata(jid);
          const groupName = metadata.subject || "No Name";
          const groupDesc = metadata.desc || "No Description";
          const groupId = metadata.id || jid;
          const participantsCount = metadata.participants?.length || 0;
          
          // Check if bot is admin - fix the admin detection
          let isGroupAdmin = false;
          try {
            // Get bot's user ID
            const botId = sock.user.id;
            // Check if bot is in participants and is admin
            isGroupAdmin = metadata.participants?.some(p => p.id === botId && (p.admin === 'admin' || p.admin === 'superadmin')) || false;
          } catch (error) {
            console.log("Could not determine admin status:", error);
          }
  
          // Fetch profile picture URL
          let ppUrl = null;
          try {
            ppUrl = await sock.profilePictureUrl(jid, "image");
          } catch {
            ppUrl = null;
          }
  
          // Fetch invite link
          let inviteLink = "N/A";
          try {
            // Try to get invite code regardless of admin status first
            const inviteCode = await sock.groupInviteCode(jid);
            inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
          } catch (error) {
            // If it fails, then check if it's due to not being admin
            if (error.message?.includes('not-authorized') || error.message?.includes('forbidden')) {
              inviteLink = "_Not admin_";
            } else {
              inviteLink = "_Error fetching invite link_";
            }
          }
  
          // Compose caption
          const caption = `*GROUP INFO*\n\n` +
            `*ID:* ${groupId}\n` +
            `*Name:* ${groupName}\n` +
            `*Description:* ${groupDesc}\n` +
            `*Participants:* ${participantsCount}\n` +
            `*Invite Link:* ${inviteLink}`;
  
          if (ppUrl) {
            await sock.sendMessage(msg.key.remoteJid, {
              image: { url: ppUrl },
              caption
            });
          } else {
            await sock.sendMessage(msg.key.remoteJid, {
              text: caption + "\n*Profile Picture:* None"
            });
          }
        } catch (error) {
          console.error("❌ Group Info Plugin Error:", error);
          await sock.sendMessage(msg.key.remoteJid, { text: "❌ Failed to fetch group info." });
        }
      }
    },
        {
        name: "findfont",
        desc: "Detect fonts from an image (Dafont + Source links)",
        utility: "tools",
        fromMe: false,

        execute: async (sock, msg) => {
            try {
                const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

                if (!msg.message?.imageMessage && !quoted) {
                    await sock.sendMessage(msg.key.remoteJid, { text: "_Reply to an image or send an image with caption_" });
                    return;
                }

                // Download the media (reply or direct)
                const mediaPath = await dlMedia(msg, sock, "path");
                if (!mediaPath) {
                    await sock.sendMessage(msg.key.remoteJid, { text: "❌ Failed to download media." });
                    return;
                }

                await sock.sendMessage(msg.key.remoteJid, { text: "⏳ *Uploading the image...*" });

                // Step 1: Predict fonts
                const styleIds = await predictFonts(mediaPath);
                if (!styleIds.length) {
                    await sock.sendMessage(msg.key.remoteJid, { text: "❌ No fonts detected." });
                    fs.unlinkSync(mediaPath);
                    return;
                }

                // Step 2: Fetch font details
                const fonts = await fetchFontDetails(styleIds);
                if (!fonts.length) {
                    await sock.sendMessage(msg.key.remoteJid, { text: "❌ Could not fetch font details." });
                    fs.unlinkSync(mediaPath);
                    return;
                }

                // Step 3: Build response with Dafont links and Source links
                let response = `*\`Detected Fonts:\`*\n\n`;
                fonts.forEach((font, idx) => {
                    const dafontUrl = `https://www.dafont.com/search.php?q=${encodeURIComponent(font.name)}`;
                    response += `*${idx + 1}. ${font.name}*\n_Family:_ ${font.family}\n_Foundry:_ ${font.foundry}\n_Free:_ ${dafontUrl}\n_Source:_ ${font.sourceUrl}\n\n`;
                });

                await sock.sendMessage(msg.key.remoteJid, { text: response }, { quoted: msg });
                fs.unlinkSync(mediaPath);

            } catch (error) {
                console.error("❌ Error in fontdetect command:", error);
                await sock.sendMessage(msg.key.remoteJid, { text: "❌ Failed to detect fonts." });
            }
        }
    }
];
