const path = require("path");
const {
  loadJson,
  saveJson,
  isBotNum,
  isSudo,
  getSender,
  reloadEnv,
  isAdmin,
  isBotAdmin
} = require("../lib");

const dbPath = path.join(__dirname, "../db/antilink.json");
const trackerPrefix = "antilink:";
let antilinkDB = loadJson(dbPath, {});

function saveDB() {
  saveJson(dbPath, antilinkDB);
}

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

  const urlRegex = /(?:https?:\/\/)?(?:www\.)?[\w-]+\.[a-z]{2,}(?:\/[\w\-._~:/?#[\]@!$&'()*+,;=]*)?/gi;
  return (text.match(urlRegex) || []).map(link => normalizeLink(link));
}


function normalizeLink(link) {
  return link.replace(/^https?:\/\//, "").replace(/^www\./, "").toLowerCase();
}


function hasDeniedLink(text, deniedLinks = [], allowedLinks = []) {
  const links = getLinks(text);
  if (!links.length) return false;

  const normAllowed = allowedLinks.map(normalizeLink);
  const normDenied = deniedLinks.map(normalizeLink);

  const filtered = links.filter(link => {
    const clean = normalizeLink(link);
    return !normAllowed.some(allow => clean.includes(allow));
  });

  if (normDenied.length === 0) return filtered.length > 0;

  return filtered.some(link => {
    const clean = normalizeLink(link);
    return normDenied.some(deny => clean.includes(deny));
  });
}


function applyAntilinkTracker(sock, chat, group) {
  const trackerId = trackerPrefix + chat;
  sock.unregisterTracker?.(trackerId);

  sock.registerTracker(
    trackerId,
    async (m) => {
      const userJid = getSender(m);
      if (!m.message || !userJid) return false;
      if (m.key.fromMe || isBotNum(userJid, sock) || isSudo(userJid)) return false;
      const metadata = await sock.groupMetadata(chat);
      if (isAdmin(userJid, metadata.participants)) return false;
      const text = extractText(m.message);
      return text && hasDeniedLink(text, group.deny, group.allow);
    },
    async (client, m) => {
      const text = extractText(m.message);
      const userJid = getSender(m);
      if (!text || !userJid) return;

      const action = group.action;
      if (["delete", "warn", "kick"].includes(action)) {
        await client.sendMessage(chat, { delete: m.key }).catch(() => {});
      }

      if (action === "warn") {
        reloadEnv();
        const WARN = parseInt(process.env.WARN || "3");
        if (!group.warns) group.warns = {};
        const warns = (group.warns[userJid] || 0) + 1;
        group.warns[userJid] = warns;
        saveDB();

        if (warns >= WARN) {
          await client.sendMessage(chat, {
            text: `🚫 ${warns}/${WARN} warnings reached. Kicking @${userJid.split("@")[0]}`,
            mentions: [userJid]
          });
          await client.groupParticipantsUpdate(chat, [userJid], "remove").catch(() => {});
          group.warns[userJid] = 0;
          saveDB();
        } else {
          await client.sendMessage(chat, {
            text: `⚠️ @${userJid.split("@")[0]}, don't send restricted links!\n> Warning ${warns}/${WARN}`,
            mentions: [userJid]
          });
        }
      } else if (action === "kick") {
        await client.groupParticipantsUpdate(chat, [userJid], "remove").catch(() => {});
      }
    }
  );
}

function runAntilink(sock) {
  for (const [chat, group] of Object.entries(antilinkDB)) {
    if (group.enabled) {
      applyAntilinkTracker(sock, chat, group);
    } else {
      sock.unregisterTracker?.(trackerPrefix + chat);
    }
  }
}

function updateAntilinkTracker(sock, chat) {
  const group = antilinkDB[chat];
  if (group && group.enabled) {
    applyAntilinkTracker(sock, chat, group);
  } else {
    sock.unregisterTracker?.(trackerPrefix + chat);
  }
}

module.exports = [
  {
    name: "antilink",
    scut: "atl",
    desc: "Antilink protection",
    utility: "group",
    fromMe: true,
    async execute(sock, msg, args) {
      const chat = msg.key.remoteJid;
      if (!antilinkDB[chat]) {
        antilinkDB[chat] = {
          enabled: false,
          action: "warn",
          allow: [],
          deny: [],
          warns: {}
        };
      }
      const group = antilinkDB[chat];
      const sub = args[0]?.toLowerCase();
      if (!chat.endsWith("@g.us")) {
        return sock.sendMessage(chat, { text: "_This command only works in *groups*._" });
      }
      const protectedSubs = ["on", "off", "warn", "delete", "kick", "allow", "deny", "clear"];
      if (protectedSubs.includes(sub)) {
        const metadata = await sock.groupMetadata(chat);
        const participants = metadata.participants;
        const senderJid = getSender(msg);
        const senderIsAdmin = isAdmin(senderJid, participants);
        const botIsAdmin = isBotAdmin(sock, participants);
        if (!botIsAdmin) return sock.sendMessage(chat, { text: "_I'm not admin_" });
        if (!senderIsAdmin && !isSudo(senderJid)) return sock.sendMessage(chat, { text: "_Only *group admins* or *sudo users* can use this command._" });
      }
      if (!sub) {
        return sock.sendMessage(chat, {
          text: "*USAGE:*\n> . antilink info\n> . antilink on/off\n> . antilink warn/delete/kick\n> . antilink allow/deny <link>\n> . antilink clear"
        });
      }
      if (sub === "on" || sub === "off") {
        group.enabled = sub === "on";
        if (!group.enabled) group.warns = {};
        saveDB();
        updateAntilinkTracker(sock, chat);
        return sock.sendMessage(chat, { text: `Antilink turned *${sub}*.` });
      }
      if (["warn", "delete", "kick"].includes(sub)) {
        group.action = sub;
        saveDB();
        updateAntilinkTracker(sock, chat);
        return sock.sendMessage(chat, { text: `*Action set to:*\n> *${sub}*` });
      }
        if (sub === "allow" || sub === "deny") {
        const raw = args.slice(1).join(" ").trim().toLowerCase();
        const field = sub === "allow" ? "allow" : "deny";
        const oppositeField = sub === "allow" ? "deny" : "allow";

        if (!raw || raw === "null") {
            group[field] = [];
        } else {
            const links = raw.split(/,\s*/).filter(Boolean);

            for (const link of links) {
            const clean = normalizeLink(link);
            
            const conflictIndex = group[oppositeField].findIndex(existing =>
                normalizeLink(existing).includes(clean) || clean.includes(normalizeLink(existing))
            );
            if (conflictIndex !== -1) {
                group[oppositeField].splice(conflictIndex, 1);
                await sock.sendMessage(chat, { text: `Same link was set as *${oppositeField}*.\n> Don't worry, I swapped it.` });
            }
            group[field].push(link);
            }

            group[field] = [...new Set(group[field])];
        }

        saveDB();
        updateAntilinkTracker(sock, chat);
        return sock.sendMessage(chat, {
            text: `${field === "allow" ? "✅ Allowed" : "🚫 Denied"}: ${group[field].join(", ") || "-"}`
        });
        }


      if (sub === "clear") {
        antilinkDB[chat] = {
          enabled: false,
          action: "warn",
          allow: [],
          deny: [],
          warns: {}
        };
        saveDB();
        updateAntilinkTracker(sock, chat);
        return sock.sendMessage(chat, { text: "_Antilink settings have been reset to default._" });
      }
      if (sub === "info") {
        return sock.sendMessage(chat, {
          text: ` *ANTILINK SETTINGS*\n> Status: ${group.enabled ? "✅ Enabled" : "❌ Disabled"}\n> Action: ${group.action}\n> Allowed: ${group.allow.join(", ") || "null"}\n> Denied: ${group.deny.join(", ") || "null"}`
        });
      }
      return sock.sendMessage(chat, { text: "_Invalid subcommand. Use on/off/warn/delete/kick/allow/deny/info/clear_" });
    }
  },
  {
    name: "warn",
    desc: "Warn or un-warn users manually",
    utility: "group",
    fromMe: true,
    
    async execute(sock, msg, args) {
      const chat = msg.key.remoteJid;
      if (!antilinkDB[chat]) antilinkDB[chat] = { warns: {} };
      const group = antilinkDB[chat];
      const mentioned = msg.mentions?.[0];
      const replyJid = msg.message?.extendedTextMessage?.contextInfo?.participant;
      const target = mentioned || replyJid;
      const sub = args[0]?.toLowerCase();
      reloadEnv();
      const WARN = parseInt(process.env.WARN || "5");

      if (sub === "clear") {
        group.warns = {};
        saveDB();
        return sock.sendMessage(chat, { text: "_Warnings reset for all users._" });
      }

      if (!target) {
        return sock.sendMessage(chat, { text: "*Usage:*\n> Reply to a message or mention\n> with `.warn +` or `.warn -`" });
      }

      if (!group.warns[target]) group.warns[target] = 0;

      if (sub === "+") {
        group.warns[target]++;
      } else if (sub === "-") {
        group.warns[target] = Math.max(group.warns[target] - 1, 0);
      } else {
        return sock.sendMessage(chat, {
          text: `*Warnings:*\n> ${group.warns[target]}/${WARN}`
        });
      }

      saveDB();
      return sock.sendMessage(chat, {
        text: `*Warnings updated:*\n> ${group.warns[target]}/${WARN}`,
        mentions: [target]
      });
    }
  }
];

module.exports.runAntilink = runAntilink;
