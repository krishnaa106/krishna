require("dotenv").config();
const process = require("process");
const fs = require("fs");
const path = require("path");
const TMP_DIR = path.join(__dirname, "../media/tmp");
let isStopped = false;


/* ===== SUDO ===== */
const getSudo = () => {
    return (process.env.SUDO || "")
        .split(",")
        .map(n => n.trim().replace(/[^0-9]/g, "") + "@s.whatsapp.net")
        .filter(Boolean);
};

const isSudo = (jid) => getSudo().includes(jid);
const isBotNum = (jid, client) => {
    const bot = botJid(client);
    return bot === jid;
};

const isSudoOrBot = (jid, client) => {
    return isSudo(jid) || botJid(client) === jid;
};



/* ===== BOT ===== */
const botJid = (client) => client?.user?.id ? client.user.id.split(':')[0] + "@s.whatsapp.net" : null;

/* ===== ADMIN ===== */
const isAdmin = (jid, list) => list.some(p => p.id === jid && p.admin !== null);
const isBotAdmin = (client, list) => isAdmin(botJid(client), list);
const getAdmins = (list) => list.filter(p => p.admin !== null).map(p => p.id);

/* ===== GROUP ===== */
const getSender = (msg) => msg.key?.participant || msg.participant || msg.key?.remoteJid;

/* ===== JID / NUMBER ===== */
const toJid = (num) => `${num}@s.whatsapp.net`;
const toNum = (jid) => jid.replace(/@s\.whatsapp\.net$/, "");
const clean = (num) => num.replace(/[^0-9]/g, "").replace(/^0+/, "");
const numberToJid = toJid;
const jidToNumber = toNum;
const cleanNum = clean;

/* ===== STATUS ===== */
const getStatus = async (client, num) => {
    try {
        let res = await client.fetchStatus(num);
        if (!Array.isArray(res) || res.length === 0) return { status: "NO ABOUT", setAt: "UNKNOWN" };
        let s = res[0]?.status || {};
        return {
            status: s?.status?.toString() || "NO ABOUT",
            setAt: s?.setAt ? new Date(s.setAt).toLocaleString() : "UNKNOWN",
        };
    } catch {
        return { status: "NO ABOUT", setAt: "UNKNOWN" };
    }
};

/* ===== REACT ===== */
const doReact = async (client, msg, emoji) => {
    try {
        if (!msg?.key?.remoteJid || !emoji?.trim()) return;
        await client.sendMessage(msg.key.remoteJid, { react: { text: emoji.trim(), key: msg.key } });
    } catch (e) {
        console.error("❌ React Error:", e);
    }
};

/* ===== Message Deletion ===== */
const delAdmin = async (client, jid, quoted) => {
    try {
        if (!jid.endsWith("@g.us") || !quoted?.stanzaId || !quoted?.participant) return;
        await client.sendMessage(jid, {
            delete: {
                remoteJid: jid,
                fromMe: false,
                id: quoted.stanzaId,
                participant: quoted.participant
            }
        });
    } catch (err) {
        console.error("❌ delAdmin error:", err);
    }
};

const delMe = async (client, jid, quoted) => {
    try {
        if (!quoted?.stanzaId) return;
        await client.sendMessage(jid, {
            delete: {
                remoteJid: jid,
                fromMe: true,
                id: quoted.stanzaId
            }
        });
    } catch (err) {
        console.error("❌ delMe error:", err);
    }
};

/* ===== Cleanup ===== */
function cleanup() {
    try {
        fs.rmSync(TMP_DIR, { recursive: true, force: true });
        fs.mkdirSync(TMP_DIR, { recursive: true });
    } catch (error) {
        console.error("⚠️ Error cleaning tmp directory:", error);
    }
}

/* ===== Miscellaneous ===== */
const getUptime = () => {
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = Math.floor(uptime % 60);
    return `Uptime: ${h}h ${m}m ${s}s`;
};

const getPingTime = async (sock, msg) => {
    const start = Date.now();
    const response = await sock.sendMessage(msg.key.remoteJid, { text: "Pong." });
    const ping = Date.now() - start;
    return { response, ping };
};

const formatDateTime = (timestamp, use12h = true) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: use12h,
    }).replace(",", " |");
};



/* ===== EXPORT ===== */
module.exports = {
    // Sudo
    getSudo,
    isSudo,
    isBotNum,
    

    // Bot
    botJid,

    // Admin
    isAdmin,
    isBotAdmin,
    getAdmins,
    getSender,

    // JID / Number
    toJid,
    toNum,
    clean,
    numberToJid,
    isSudoOrBot,
    jidToNumber,
    cleanNum,

    // Status & React
    getStatus,
    doReact,

    // Deletion
    delAdmin,
    delMe,

    // Misc
    cleanup,
    getUptime,
    getPingTime,
    formatDateTime,
    TMP_DIR,
    

    // Stop flag
    setStopped: (value) => isStopped = value,
    isStopped: () => isStopped
};
