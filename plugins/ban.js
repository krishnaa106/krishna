const path = require("path");
const { loadJson, saveJson } = require("../lib");
const ms = require("ms");


const unbanTimers = {}; // key = `${jid}:${user}`, value = timeout ID

const dbPath = path.join(__dirname, "../db/ban.json");
let banDB;
try {
    banDB = loadJson(dbPath, {});
} catch {
    banDB = {};
    saveJson(dbPath, banDB);
}

function getUnbanTime(jid, user) {
    if (!banDB?.[jid] || !(user in banDB[jid])) return null; // <- difference here
    return banDB[jid][user];
}


function setBan(jid, user, durationMs) {
    if (!banDB[jid]) banDB[jid] = {};
    banDB[jid][user] = durationMs > 0 ? Date.now() + durationMs : 0;
    saveJson(dbPath, banDB);
}

function removeBan(jid, user) {
    if (banDB[jid]) {
        delete banDB[jid][user];
        if (Object.keys(banDB[jid]).length === 0) delete banDB[jid];
        saveJson(dbPath, banDB);
    }
}

function isBanned(jid, user, includeExpired = false) {
    const unbanTime = getUnbanTime(jid, user);
    if (unbanTime === null || unbanTime === undefined) return false;

    if (unbanTime === 0) return true; // permanently banned
    if (Date.now() < unbanTime) return true; // still within ban period

    return includeExpired; // expired but still in DB? only return true if requested
}



function scheduleUnban(sock, jid, user, time) {
    const key = `${jid}:${user}`;
    if (unbanTimers[key]) clearTimeout(unbanTimers[key]);

    unbanTimers[key] = setTimeout(() => {
        delete unbanTimers[key];
        sock.unregisterTracker(`ban:${jid}:${user}`);
        removeBan(jid, user);
        sock.sendMessage(jid, {
            text: `⏰ Auto-unbanned @${user.split("@")[0]}`,
            mentions: [user]
        });
    }, time);
}


function scheduleReban(sock, jid, user, time) {
    setTimeout(() => {
        setBan(jid, user, 0); // permanent ban
        sock.registerTracker(
            `ban:${jid}:${user}`,
            (m) => m.key.remoteJid === jid && m.key.participant === user,
            async (client, m) => {
                await client.sendMessage(jid, { delete: m.key }).catch(() => {});
            }
        );
        sock.sendMessage(jid, {
            text: `🔇 Auto-rebanned @${user.split("@")[0]}`,
            mentions: [user]
        });
    }, time);
}

module.exports = [
    {
        name: "ban",
        desc: "Ban a user in the current chat (optional duration)",
        utility: "group",
        fromMe: true,
        async execute(sock, msg, args) {
            const chat = msg.key.remoteJid;
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
            const replyUser = msg.message?.extendedTextMessage?.contextInfo?.participant;

            let target;
            if (mentioned?.length) {
                target = mentioned[0];
            } else if (replyUser) {
                target = replyUser;
            } else {
                return sock.sendMessage(chat, { text: "_Reply or mention a user to ban!_" });
            }

            if (isBanned(chat, target)) {
                return sock.sendMessage(chat, { text: "_User is already banned._" });
            }

            let duration = 0;
            let durationText = "";
            for (const arg of args) {
                if (!arg.startsWith("@")) {
                    const parsed = ms(arg);
                    if (!isNaN(parsed)) {
                        duration = parsed;
                        durationText = arg;
                        break;
                    }
                }
            }


            setBan(chat, target, duration);
            sock.registerTracker(
                `ban:${chat}:${target}`,
                (m) => m.key.remoteJid === chat && m.key.participant === target,
                async (client, m) => {
                    await client.sendMessage(chat, { delete: m.key }).catch(() => {});
                }
            );

            if (duration > 0) scheduleUnban(sock, chat, target, duration);

            return sock.sendMessage(chat, {
                text: `🔇 Banned @${target.split("@")[0]}${duration ? ` for ${durationText}` : ""}`,
                mentions: [target]
            });
        }
    },

    {
        name: "unban",
        desc: "Unban a user (optionally temporarily)",
        utility: "group",
        fromMe: true,
        async execute(sock, msg, args) {
            const chat = msg.key.remoteJid;
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
            const replyUser = msg.message?.extendedTextMessage?.contextInfo?.participant;

            let target;
            if (mentioned?.length) {
                target = mentioned[0];
            } else if (replyUser) {
                target = replyUser;
            } else {
                return sock.sendMessage(chat, { text: "_Reply or mention a user to unban!_" });
            }

            const wasBanned = isBanned(chat, target, true);
            if (!wasBanned) {
                return sock.sendMessage(chat, { text: "_User is not banned._" });
            }

            sock.unregisterTracker(`ban:${chat}:${target}`);
            removeBan(chat, target);

            const timerKey = `${chat}:${target}`;
            if (unbanTimers[timerKey]) {
                clearTimeout(unbanTimers[timerKey]);
                delete unbanTimers[timerKey];
            }


            let rebanDelay = 0;
            let delayText = "";
            for (const arg of args) {
                if (!arg.startsWith("@")) {
                    const parsed = ms(arg);
                    if (!isNaN(parsed)) {
                        rebanDelay = parsed;
                        delayText = arg;
                        break;
                    }
                }
            }

            if (rebanDelay > 0) {
                scheduleReban(sock, chat, target, rebanDelay);
                return sock.sendMessage(chat, {
                    text: `⏳ Temporarily unbanned @${target.split("@")[0]}, will reban in ${delayText}`,
                    mentions: [target]
                });
            }


            return sock.sendMessage(chat, {
                text: `✅ Unbanned @${target.split("@")[0]}`,
                mentions: [target]
            });
        }
    }
];
