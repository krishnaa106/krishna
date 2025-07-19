// AntiStatus Plugin - Clean & Efficient Build
const path = require("path");
const { proto } = require("@whiskeysockets/baileys");
const {
  loadJson,
  saveJson,
  getSender,
  isSudo,
  isBotAdmin,
  reloadEnv,
} = require("../lib");

const dbPath = path.join(__dirname, "../db/antistatus.json");
const trackerPrefix = "antistatus:";
let antistatusDB = loadJson(dbPath, {}) || {};

function saveDB() {
  saveJson(dbPath, antistatusDB);
}

function applyAntiStatusTracker(sock, chatId, group) {
  const trackerId = trackerPrefix + chatId;
  sock.unregisterTracker?.(trackerId);

  sock.registerTracker(
    trackerId,
    async (m) => {
      if (!m.key.remoteJid || m.key.remoteJid !== chatId) return false;
      const userJid = getSender(m);
      if (!m.message || !userJid) return false;
      if (m.key.fromMe) return false;

      // Detect actual status mention message
      return (
        m.message?.groupStatusMentionMessage?.message?.protocolMessage?.type ===
        proto.Message.ProtocolMessage.Type.STATUS_MENTION_MESSAGE
      );
    },
    async (client, m) => {
      const chat = m.key.remoteJid;
      const sender = getSender(m);
      const group = antistatusDB[chat];
      if (!group || !group.enabled) return;

      const { action } = group;

      // Always delete message first (if action is not just warn)
      await client.sendMessage(chat, { delete: m.key }).catch(() => {});

      // Only warn or kick if explicitly set
      if (action === "warn") {
        reloadEnv();
        const WARN = parseInt(process.env.WARN || "3");
        group.warns ??= {};
        const count = (group.warns[sender] || 0) + 1;
        group.warns[sender] = count;
        saveDB();

        if (count >= WARN) {
          await client.sendMessage(chat, {
            text: `🚨 *${count}/${WARN}* warnings reached.\nKicking @${sender.split("@")[0]}`,
            mentions: [sender],
          });
          await client.groupParticipantsUpdate(chat, [sender], "remove").catch(() => {});
          group.warns[sender] = 0;
          saveDB();
        } else {
          await client.sendMessage(chat, {
            text: `⚠️ @${sender.split("@")[0]} — *Warning ${count}/${WARN}*\nStop sending status in this group.`,
            mentions: [sender],
          });
        }
      }

      if (action === "kick") {
        await client.groupParticipantsUpdate(chat, [sender], "remove").catch(() => {});
      }
    }
  );
}

function runAntistatus(sock) {
  antistatusDB = loadJson(dbPath, {}) || {};
  for (const [chatId, group] of Object.entries(antistatusDB)) {
    group.enabled
      ? applyAntiStatusTracker(sock, chatId, group)
      : sock.unregisterTracker?.(trackerPrefix + chatId);
  }
}

function updateAntistatusTracker(sock, chatId) {
  const group = antistatusDB[chatId];
  group && group.enabled
    ? applyAntiStatusTracker(sock, chatId, group)
    : sock.unregisterTracker?.(trackerPrefix + chatId);
}

module.exports = [
  {
    name: "antistatus",
    scut: "ats",
    desc: "Block status mentions in group chats",
    fromMe: true,
    utility: "group",

    async execute(sock, msg, args) {
      const chat = msg.key.remoteJid;
      const sender = getSender(msg);
      const sub = args[0]?.toLowerCase();

      if (!chat.endsWith("@g.us")) {
        return sock.sendMessage(chat, { text: "_This command only works in *groups*_." });
      }

      const metadata = await sock.groupMetadata(chat);
      const botIsAdmin = isBotAdmin(sock, metadata.participants);

      if (!botIsAdmin) {
        return sock.sendMessage(chat, { text: "_I must be admin to enable AntiStatus._" });
      }

      // Permission only required for command usage (not status detection)
      const isSudoUser = isSudo(sender);
      const isGroupAdmin = metadata.participants.some(p => p.id === sender && p.admin);
      if (!isSudoUser && !isGroupAdmin) {
        return sock.sendMessage(chat, { text: "_Only *admins* or *sudo users* can use this command._" });
      }

      // Init group entry
      antistatusDB[chat] ??= { enabled: false, action: "delete", warns: {} };
      const group = antistatusDB[chat];

      if (!sub) {
        return sock.sendMessage(chat, {
          text: "*USAGE:*\n> .antistatus info\n> .antistatus on/off\n> .antistatus delete/warn/kick",
        });
      }

      if (sub === "on" || sub === "off") {
        group.enabled = sub === "on";
        if (!group.enabled) group.warns = {};
        saveDB();
        updateAntistatusTracker(sock, chat);
        return sock.sendMessage(chat, { text: `✅ AntiStatus turned *${sub}*.` });
      }

      if (["delete", "warn", "kick"].includes(sub)) {
        group.action = sub;
        saveDB();
        updateAntistatusTracker(sock, chat);
        return sock.sendMessage(chat, { text: `✅ Action set to: *${sub}*` });
      }

      if (sub === "info") {
        return sock.sendMessage(chat, {
          text: `*ANTISTATUS SETTINGS*\n> Status: ${group.enabled ? "✅ Enabled" : "❌ Disabled"}\n> Action: *${group.action}*`,
        });
      }

      return sock.sendMessage(chat, {
        text: "_Invalid command. Use on/off/delete/warn/kick/info_",
      });
    },
  },
];

module.exports.runAntistatus = runAntistatus;
