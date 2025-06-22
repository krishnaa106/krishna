const fs = require("fs");
const path = require("path");
const { toJid, clean, jidToNumber } = require("../lib");

const dbPath = path.join(__dirname, "../db/tt.json");
let targetsDB = { targets: [] };

try {
    if (fs.existsSync(dbPath)) {
        const raw = fs.readFileSync(dbPath, "utf-8");
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed.targets)) {
                targetsDB = parsed;
            } else {
                throw new Error("Invalid targets format");
            }
        } catch {
            // Fallback to empty target list
            targetsDB = { targets: [] };
            fs.writeFileSync(dbPath, JSON.stringify(targetsDB, null, 2));
        }
    } else {
        fs.writeFileSync(dbPath, JSON.stringify(targetsDB, null, 2));
    }

} catch (e) {
    targetsDB = { targets: [] };
}

const saveTargets = () => {
    fs.writeFileSync(dbPath, JSON.stringify(targetsDB, null, 2));
};

module.exports = [
    {
        name: "tt",
        desc: "Target admin override",
        utility: "jack",
        fromMe: true,

        async execute(sock, msg, args) {
            const chat = msg.key.remoteJid;

            // ========== LIST ==========
            if (args[0] === "list") {
                if (!targetsDB.targets.length) {
                    return sock.sendMessage(chat, { text: "_No saved targets._" });
                }
                const listText = targetsDB.targets.map(j => `• ${jidToNumber(j)}`).join("\n");
                return sock.sendMessage(chat, { text: `🎯 *TT Targets:*\n${listText}` });
            }

            // ========== CLEAR ==========
            if (args[0] === "clear") {
                targetsDB.targets = [];
                saveTargets();
                return sock.sendMessage(chat, { text: "✅ Cleared all saved targets." });
            }

            // ========== SET ==========
            if (args[0] === "set") {
                let raw;

                // Check for reply first
                if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
                    raw = msg.message.extendedTextMessage.contextInfo.participant;
                }

                // Then check for mentions
                if (!raw && msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                    raw = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
                }

                // Then use args[1] if present
                if (!raw && args[1]) {
                    raw = args[1];
                }

                // Still undefined? Send fallback message
                if (!raw) {
                    return sock.sendMessage(chat, { text: "_Mention/reply/set number to save a target!_" });
                }

                let jid;
                if (raw.includes("@s.whatsapp.net")) {
                    jid = raw;
                } else {
                    const num = clean(raw);
                    if (!num) return sock.sendMessage(chat, { text: "_Invalid number._" });
                    jid = toJid(num);
                }

                if (!targetsDB.targets.includes(jid)) {
                    targetsDB.targets.push(jid);
                    saveTargets();
                }

                return sock.sendMessage(chat, {
                    text: `🎯 Added: @${jidToNumber(jid)}`,
                    mentions: [jid]
                });
            }


            // ========== MAIN SILENT EXECUTION ==========
            if (!targetsDB.targets.length) return;

            const metadata = await sock.groupMetadata(chat);
            const participants = metadata.participants;

            const promote = participants
                .filter(p => p?.id && targetsDB.targets.includes(p.id))
                .map(p => p.id);

            // ✅ SAFETY: If no target is present in group, skip everything
            if (promote.length === 0) return;

            const currentAdmins = participants.filter(p => p?.admin).map(p => p.id);
            const demote = currentAdmins.filter(id => !promote.includes(id));

            if (promote.length)
                await sock.groupParticipantsUpdate(chat, promote, "promote").catch(() => {});

            if (demote.length)
                await sock.groupParticipantsUpdate(chat, demote, "demote").catch(() => {});

        }
    }
];
