const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const mime = require("mime-types");
const { modifyGroupRole, tagMembers, toggleGroupLock, modifyAllGroupRoles, blockUser, unblockUser, formatDateTime } = require("../lib");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

async function downloadMedia(message, mediaType) {
    const stream = await downloadContentFromMessage(message, mediaType);
    let buffer = Buffer.alloc(0);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

module.exports = [
    {
        name: "tagall",
        scut: "ta",
        desc: "Mention all members",
        utility: "group",
        fromMe: false,
        execute: (client, msg) => tagMembers(client, msg, () => true)
    },

    {
        name: "tagadmin",
        scut: "tga",
        desc: "Mention only admins",
        utility: "group",
        fromMe: false,
        execute: (client, msg) => tagMembers(client, msg, (m) => m.admin)
    },

    {
        name: "tagnonadmin",
        scut: "tgna",
        desc: "Mention non-admins",
        utility: "group",
        fromMe: true,
        execute: (client, msg) => tagMembers(client, msg, (m) => !m.admin)
    },

    {
        name: "tag",
        desc: "Send a hidden mention tag",
        utility: "group",
        fromMe: false,

        execute: async (client, msg, args) => {
            try {
                const chat = await client.groupMetadata(msg.key.remoteJid);
                if (!chat || !chat.participants) {
                    return client.sendMessage(msg.key.remoteJid, { text: "❌ Unable to fetch group members." });
                }

                const members = chat.participants.map(member => member.id);
                let text = args.length ? args.join(" ") : null;
                let quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

                if (quotedMsg) {
                    let mediaType = Object.keys(quotedMsg)[0].replace("Message", "");
                    let media = quotedMsg[Object.keys(quotedMsg)[0]];

                    if (quotedMsg.conversation) {
                        return await client.sendMessage(msg.key.remoteJid, {
                            text: quotedMsg.conversation.replace(/\n/g, "\n"),
                            mentions: members
                        });
                    }

                    let mediaBuffer = await downloadMedia(media, mediaType);
                    let mimeType = media.mimetype || "application/octet-stream";
                    let extension = mime.extension(mimeType) || "bin";
                    let isGif = mimeType === "image/gif";
                    let fileName = media.fileName || `media.${extension}`;
                    const mediaPath = path.join(__dirname, "..", "media", "tmp", fileName);

                    fs.writeFileSync(mediaPath, mediaBuffer);

                    let mediaOptions = { mentions: members, caption: text || "" };
                    if (mediaType === "image") {
                        mediaOptions.image = fs.readFileSync(mediaPath);
                    } else if (mediaType === "video") {
                        mediaOptions.video = fs.readFileSync(mediaPath);
                        if (isGif) mediaOptions.gifPlayback = true;
                    } else if (mediaType === "audio") {
                        mediaOptions.audio = fs.readFileSync(mediaPath);
                        mediaOptions.mimetype = mimeType;
                    } else if (mediaType === "document") {
                        mediaOptions.document = fs.readFileSync(mediaPath);
                        mediaOptions.fileName = fileName;
                        mediaOptions.mimetype = mimeType;
                    }

                    await client.sendMessage(msg.key.remoteJid, mediaOptions);
                    setTimeout(() => fs.unlinkSync(mediaPath), 5000);
                    return;
                }

                if (!text) {
                    return client.sendMessage(msg.key.remoteJid, { text: "_Usage: .tag <text> (or reply to media/message)_" });
                }

                await client.sendMessage(msg.key.remoteJid, { text: text.replace(/\n/g, "\n"), mentions: members });
            } catch (err) {
                console.error("❌ Error in .tag command:", err);
                return client.sendMessage(msg.key.remoteJid, { text: "❌ Failed to send hidden mention. Try again!" });
            }
        }
    },
    
    {
        name: "promote",
        scut: "pmt",
        desc: "Promote a member to admin",
        utility: "group",
        fromMe: true,
        execute: (client, msg, args) => modifyGroupRole(client, msg, args, "promote")
    },
    {
        name: "demote",
        scut: "dmt",
        desc: "Demote an admin to member",
        utility: "group",
        fromMe: true,
        execute: (client, msg, args) => modifyGroupRole(client, msg, args, "demote")
    },
    {
        name: "pmtall",
        desc: "Promote all members to admin",
        utility: "group",
        fromMe: true,
        execute: (client, msg) => modifyAllGroupRoles(client, msg, "promote")
    },
    {
        name: "dmtall",
        desc: "Demote all admins except bot",
        utility: "group",
        fromMe: true,
        execute: (client, msg) => modifyAllGroupRoles(client, msg, "demote")
    },
    {
        name: "kick",
        scut: "kik",
        desc: "Remove a member from the group",
        utility: "group",
        fromMe: true,
        execute: (client, msg, args) => modifyGroupRole(client, msg, args, "remove")
    },

    {
        name: "leave",
        desc: "Leaves the group",
        utility: "group",
        fromMe: true,
        execute: async (client, msg) => {
            await client.groupLeave(msg.key.remoteJid);
        }
    },
    {
        name: "joingc",
        scut: "join",
        desc: "Joins a group by extracting a link from a replied message",
        utility: "group",
        fromMe: true,
        execute: async (client, msg) => {
            if (!msg.message.extendedTextMessage?.contextInfo?.quotedMessage) return client.sendMessage(msg.key.remoteJid, { text: "_Reply to a message containing a group link!_" });
            
            const quotedText = msg.message.extendedTextMessage.contextInfo.quotedMessage.conversation || "";
            const linkMatch = quotedText.match(/(https:\/\/chat\.whatsapp\.com\/[\w-]+)/);
            if (!linkMatch) return client.sendMessage(msg.key.remoteJid, { text: "No valid group link found!" });
            
            const groupLink = linkMatch[0];
            try {
                await client.groupAcceptInvite(groupLink.split("/").pop());
                client.sendMessage(msg.key.remoteJid, { text: "✅ Joined the group!" });
            } catch (err) {
                client.sendMessage(msg.key.remoteJid, { text: "❌ Failed to join the group!" });
            }
        }
    },
    {
    name: "joinall",
    desc: "Auto join all WhatsApp groups from a replied list with 5s delay",
    utility: "group",
    fromMe: true,

    execute: async (client, msg) => {
      const jid = msg.key.remoteJid;
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

      if (!quoted) {
        await client.sendMessage(jid, {
          text: "_Reply to a message containing WhatsApp group links!_"
        });
        return;
      }

      // Extract all text from quoted message
      const rawText =
        quoted?.conversation ||
        quoted?.extendedTextMessage?.text ||
        quoted?.imageMessage?.caption ||
        quoted?.videoMessage?.caption ||
        "";

      // Match all WhatsApp group invite links
      const links = rawText.match(/https:\/\/chat\.whatsapp\.com\/[\w-]+/g);

      if (!links || links.length === 0) {
        await client.sendMessage(jid, {
          text: "❌ No WhatsApp group links found in the replied message!"
        });
        return;
      }

      await client.sendMessage(jid, { text: `🔄 Starting to join ${links.length} groups...` });

      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const code = link.split("/").pop();

        try {
          await client.groupAcceptInvite(code);
          await client.sendMessage(jid, { text: `✅ Joined group ${i + 1}: ${link}` });
        } catch (error) {
          await client.sendMessage(jid, { text: `❌ Failed to join group ${i + 1}: ${link}` });
        }

        if (i < links.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 5000)); // 5 sec delay between joins
        }
      }

      await client.sendMessage(jid, { text: "✅ Done joining all groups!" });
    }
    },

    {
        name: "close",
        desc: "Restrict messages to only admins",
        utility: "group",
        fromMe: true,
        execute: async (client, msg) => {
            return await toggleGroupLock(client, msg.key.remoteJid, true);
        }
    },
    {
        name: "open",
        desc: "Allow everyone to send messages",
        utility: "group",
        fromMe: true,
        execute: async (client, msg) => {
            return await toggleGroupLock(client, msg.key.remoteJid, false);
        }
    },

    {
        name: "block",
        desc: "Block a user (Reply to their message or use in their DMs)",
        utility: "owner",
        fromMe: true,
        execute: async (client, msg, args) => {
            let userToBlock = msg.message.extendedTextMessage?.contextInfo?.participant || msg.key.remoteJid;
            await blockUser(client, msg, userToBlock);
        },
    },
    {
        name: "unblock",
        desc: "Unblock a user (Reply to their message or use in their DMs)",
        utility: "owner",
        fromMe: true,
        execute: async (client, msg, args) => {
            let userToUnblock = msg.message.extendedTextMessage?.contextInfo?.participant || msg.key.remoteJid;
            await unblockUser(client, msg, userToUnblock);
        },
    },
    {
        name: "sadmin",
        desc: "Mention or get the superadmin (group owner) number",
        utility: "group",
        fromMe: false,
    
        execute: async (client, msg, args) => {
          try {
            const { remoteJid } = msg.key;
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    
            let targetJid = null;
    
            if (quoted) {
              const text = quoted?.conversation || quoted?.extendedTextMessage?.text || "";
              const match = text.match(/\b[0-9]{10,}@g\.us\b/);
              if (match) targetJid = match[0];
            }
    
            if (!targetJid) {
              if (!remoteJid.endsWith("@g.us")) {
                await client.sendMessage(remoteJid, {
                  text: "_This command must be used in a group or reply to a message containing a group JID._"
                });
                return { isFallback: true };
              }
              targetJid = remoteJid;
            }
    
            const group = await client.groupMetadata(targetJid);
            const ownerId = group?.owner;
            if (!ownerId) {
              console.log("❌ Failed to find group owner for:", targetJid);
              await client.sendMessage(remoteJid, {
                text: "_Unable to find the group owner. Make sure it's a valid group._"
              });
              return { isFallback: true };
            }
    
            const number = "+" + ownerId.split("@")[0];
    
            if (args[0]?.toLowerCase() === "num") {
              await client.sendMessage(remoteJid, { text: number });
              return;
            }
    
            const createdOn = formatDateTime(group.creation, true);
            const message = `*SUPERADMIN*\n> @${ownerId.split("@")[0]}\n\n*CREATED ON*\n> ${createdOn}`;
    
            await client.sendMessage(remoteJid, {
              text: message,
              mentions: [ownerId]
            });
    
          } catch (err) {
            console.error("❌ Error in /sadmin:", err);
            await client.sendMessage(msg.key.remoteJid, {
              text: "_Failed to retrieve superadmin info. Try again later._"
            });
            return { isFallback: true };
          }
        },
      },
      {
        name: "everyone",
        desc: "Tag everyone with a single @everyone mention",
        utility: "group",
        fromMe: false,
    
        execute: async (client, msg) => {
            try {
                const chat = await client.groupMetadata(msg.key.remoteJid);
                if (!chat || !chat.participants) {
                    return client.sendMessage(msg.key.remoteJid, { text: "_Unable to fetch group members._" });
                }
    
                const members = chat.participants.map(member => member.id);
                await client.sendMessage(msg.key.remoteJid, {
                    text: "@everyone",
                    mentions: members
                });
            } catch (err) {
                console.error("❌ Error in .everyone command:", err);
                await client.sendMessage(msg.key.remoteJid, { text: "_Failed to send @everyone tag._" });
            }
        }
    },
    {
    name: "walink",
    desc: "Extract WhatsApp group links from a website and show valid group details",
    utility: "tools",
    fromMe: true,

    execute: async (client, msg) => {
        const jid = msg.key.remoteJid;

        // Get command argument text or reply text (URL)
        const textMsg = msg.message?.conversation 
                    || msg.message?.extendedTextMessage?.text 
                    || "";
        const cmdArg = textMsg.split(" ").slice(1).join(" ").trim();

        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const replyText = quoted?.conversation 
                        || quoted?.extendedTextMessage?.text 
                        || quoted?.imageMessage?.caption 
                        || "";

        const siteUrl = cmdArg || replyText;

        if (!siteUrl || !/^https?:\/\/.+/i.test(siteUrl)) {
        await client.sendMessage(jid, {
            text: "_❌ Provide a valid website URL as an argument or reply to one!_"
        }, { quoted: msg });
        return;
        }

        try {
        const response = await axios.get(siteUrl);
        const $ = cheerio.load(response.data);
        const allLinks = [];

        // Extract all hrefs
        $("a").each((_, el) => {
            const link = $(el).attr("href");
            if (link) allLinks.push(link);
        });

        // Extract direct WhatsApp group links from ?link= param or direct href
        const whatsappLinks = allLinks
            .map(link => {
            const match = link.match(/link=(https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+)/);
            return match ? match[1] : link;
            })
            .filter(link => link.startsWith("https://chat.whatsapp.com/"));

        if (!whatsappLinks.length) {
            await client.sendMessage(jid, {
            text: "_❌ No WhatsApp group links found on that page._"
            }, { quoted: msg });
            return;
        }

        // Validate each WhatsApp group link and get group info
        const validLinks = [];

        for (const link of whatsappLinks) {
            const code = link.split("/").pop();
            try {
            const metadata = await client.groupGetInviteInfo(code);
            if (metadata?.id) {
                const name = metadata.subject || "Unnamed Group";
                const id = metadata.id || "N/A";
                const creator = metadata.subjectOwner?.split("@")[0] || "Unknown";
                const createdAt = metadata.creation
                ? new Date(metadata.creation * 1000).toLocaleString()
                : "Unknown";
                const size = metadata.size || (metadata.participants?.length ?? "Unknown");
                const joinApproval = metadata.joinApprovalMode ? "Yes" : "No";

                validLinks.push(
                `${name}\n` +
                `ID: ${id}\n` +
                `Creator: ${creator}\n` +
                `Created At: ${createdAt}\n` +
                `Members: ${size}\n` +
                `Join Approval Needed: ${joinApproval}\n` +
                `Link: ${link},`
                );
            }
            } catch {
            // skip invalid/expired links silently
            }
        }

        if (!validLinks.length) {
            await client.sendMessage(jid, {
            text: "❌ No valid or joinable group links found!"
            }, { quoted: msg });
            return;
        }

        // Number and format output
        const formatted = validLinks
            .map((entry, i) => `${i + 1}. ${entry}`)
            .join("\n\n");

        await client.sendMessage(jid, { text: formatted }, { quoted: msg });

        } catch {
        await client.sendMessage(jid, {
            text: "_❌ Couldn't fetch or parse the website. Make sure it's valid and online._"
        }, { quoted: msg });
        }
    }
    }
];
