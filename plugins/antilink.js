const path = require("path");
const { loadJson, saveJson, isBotNum, isSudo, getSender, reloadEnv, isAdmin, isBotAdmin  } = require("../lib");

const dbPath = path.join(__dirname, "../db/antilink.json");
const trackerPrefix = "antilink:";
let antilinkDB = loadJson(dbPath, {});


function saveDB() {
    saveJson(dbPath, antilinkDB);
}


// Extract text from message
function extractText(message) {
    if (!message) return null;
    if (message.conversation) return message.conversation;
    if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
    if (message.imageMessage?.caption) return message.imageMessage.caption;
    if (message.videoMessage?.caption) return message.videoMessage.caption;
    if (message.documentMessage?.caption) return message.documentMessage.caption;
    return null;
}

function getLinks(text) {
    if (!text) return [];
    const regex = /((https?:\/\/)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/\S*)?)/gi;
    return text.match(regex) || [];
}

function hasDeniedLink(text, deniedLinks = [], allowedLinks = []) {
    const links = getLinks(text);
    if (!links.length) return false;

    const filtered = links.filter(link =>
        !allowedLinks.some(allow => link.toLowerCase().includes(allow.toLowerCase()))
    );

    if (deniedLinks.length === 0) return filtered.length > 0;

    return filtered.some(link =>
        deniedLinks.some(deny => link.toLowerCase().includes(deny.toLowerCase()))
    );
}

module.exports = [
    {
        name: "antilink",
        scut: "atl",
        desc: "Antilink protection",
        utility: "group",
        fromMe: true,

        async execute(sock, msg, args, extra) {
            
            const chat = msg.key.remoteJid;

            if (!antilinkDB[chat]) {
                antilinkDB[chat] = {
                    enabled: false,
                    action: "warn",
                    allow: [],
                    deny: [],
                    warns: {}
                };
                saveDB();
            }

            const group = antilinkDB[chat];
            const sub = args[0]?.toLowerCase();

            // Prevent usage outside group
            if (!chat.endsWith("@g.us")) {
                return sock.sendMessage(chat, {
                    text: "⚠️ This command only works in *groups*."
                });
            }

            // Validate admin for protected commands
            const protectedSubs = ["on", "off", "warn", "delete", "kick", "allow", "deny"];
            if (protectedSubs.includes(sub)) {
                const metadata = await sock.groupMetadata(chat);
                const participants = metadata.participants;

                const senderJid = getSender(msg);
                const senderIsAdmin = isAdmin(senderJid, participants);
                const botIsAdmin = isBotAdmin(sock, participants);

                if (!botIsAdmin) {
                    return sock.sendMessage(chat, {
                        text: "_I'm not admin_"
                    });
                }

                if (!senderIsAdmin && !isSudo(senderJid)) {
                    return sock.sendMessage(chat, {
                        text: "_Only *group admins* or *sudo users* can use this command._"
                    });
                }


            }


            if (!sub) {
                return sock.sendMessage(chat, {
                    text: "*USAGE:*\n> . antilink info\n> . antilink on/off\n> . antilink warn/delete/kick\n> . antilink allow/deny <link>"
                });
            }

            // Enable/disable
            if (sub === "on" || sub === "off") {
                group.enabled = sub === "on";

                if (!group.enabled) {
                    group.warns = {};
                    saveDB();
                }

                saveDB();

                const trackerId = trackerPrefix + chat;

                if (group.enabled) {
                    sock.registerTracker(
                        trackerId,
                        (m) => {
                            const userJid = getSender(m);

                            if (!m.message || !userJid) return false;
                            if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage) return false;
                            if (isBotNum(userJid, sock) || isSudo(userJid)) return false;

                            const text = extractText(m.message);
                            return text && hasDeniedLink(text, group.deny, group.allow);
                        },


                        async (client, m) => {
                            const text = extractText(m.message);
                            const userJid = getSender(m);
                            if (!text || !userJid) return;

                            if (isBotNum(userJid, client) || isSudo(userJid)) return;

                            const action = group.action;

                            if (["delete", "warn", "kick"].includes(action)) {
                                await client.sendMessage(chat, { delete: m.key }).catch(() => {});
                            }

                            if (action === "warn") {
                                reloadEnv();
                                const WARN = parseInt(process.env.WARN || "3");
                                // Initialize warn object if not present
                                if (!group.warns) group.warns = {};

                                const warns = (group.warns[userJid] || 0) + 1;
                                group.warns[userJid] = warns;
                                saveDB();

                                if (warns >= WARN) {
                                    await client.sendMessage(chat, {
                                        text: `🚫 ${warns}/${WARN} warnings reached. Kicking user...`,
                                        mentions: [userJid]
                                    });

                                    await client.groupParticipantsUpdate(chat, [userJid], "remove").catch(() => {});
                                    group.warns[userJid] = 0; // reset after kick
                                    saveDB();
                                } else {
                                    await client.sendMessage(chat, {
                                        text: `⚠️ Don't send restricted links\n> Warning ${warns}/${WARN}`,
                                        mentions: [userJid]
                                    });
                                }
                            } else if (action === "kick") {
                                await client.groupParticipantsUpdate(chat, [userJid], "remove").catch(() => {});
                            }
                        }
                    );
                } else {
                    sock.unregisterTracker(trackerId);
                }

                return sock.sendMessage(chat, { text: `✅ Antilink is now *${sub}*.` });
            }

            // Set action
            if (["warn", "delete", "kick"].includes(sub)) {
                group.action = sub;
                saveDB();
                return sock.sendMessage(chat, { text: `🔧 Action set to *${sub}*` });
            }

            // Allow links
            if (sub === "allow") {
                const links = args.slice(1).join(" ").split(/,\s*/).filter(Boolean);
                group.allow.push(...links);
                group.allow = [...new Set(group.allow)];
                saveDB();
                return sock.sendMessage(chat, {
                    text: `✅ Allowed: ${group.allow.join(", ") || "-"}`
                });
            }

            // Deny links
            if (sub === "deny") {
                const links = args.slice(1).join(" ").split(/,\s*/).filter(Boolean);
                group.deny.push(...links);
                group.deny = [...new Set(group.deny)];
                saveDB();
                return sock.sendMessage(chat, {
                    text: `🚫 Denied: ${group.deny.join(", ") || "-"}`
                });
            }

            // Info
            if (sub === "info") {
                return sock.sendMessage(chat, {
                    text:
                        ` *ANTILINK SETTINGS*\n` +
                        `> Status: ${group.enabled ? "✅ Enabled" : "❌ Disabled"}\n` +
                        `> Action: ${group.action}\n` +
                        `> Allowed: ${group.allow.join(", ") || "-"}\n` +
                        `> Denied: ${group.deny.join(", ") || "-"}`
                });
            }

            return sock.sendMessage(chat, {
                text: "_Invalid subcommand. Use on/off/warn/delete/kick/allow/deny/info_"
            });
        }
    }
];
