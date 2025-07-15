const fs = require("fs");
const path = require("path");

if (!globalThis.activeGameChats) globalThis.activeGameChats = {};
const gameDataPath = path.join(__dirname);
const cooldownFile = path.join(gameDataPath, "cooldown.json");

function loadCooldownData() {
    try {
        return fs.existsSync(cooldownFile)
            ? JSON.parse(fs.readFileSync(cooldownFile, "utf-8"))
            : {};
    } catch {
        return {};
    }
}

function saveCooldownData(data) {
    try {
        fs.writeFileSync(cooldownFile, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
        console.error("Cooldown save error:", e);
    }
}

module.exports = {
    isGameActive(chat) {
        return !!globalThis.activeGameChats[chat];
    },

    setGameActive(chat, gameName) {
        globalThis.activeGameChats[chat] = gameName;
    },

    clearGame(chat) {
        delete globalThis.activeGameChats[chat];
    },

    getActiveGame(chat) {
        return globalThis.activeGameChats[chat] || null;
    },

    // 🧠 Add this ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
    isOnCooldown(gameName, chatJid) {
        const data = loadCooldownData();
        const now = Date.now();
        const key = `${gameName}_${chatJid}`;
        if (!data[key]) return false;
        if (now > data[key].cooldownUntil) return false;

        const remaining = data[key].cooldownUntil - now;
        return { remaining };
    },

    increaseMatchCount(gameName, chatJid, max = 30, cooldownMinutes = 20) {
        const data = loadCooldownData();
        const key = `${gameName}_${chatJid}`;

        if (!data[key]) data[key] = { matches: 0, cooldownUntil: 0 };
        data[key].matches++;

        if (data[key].matches >= max) {
            data[key].matches = 0;
            data[key].cooldownUntil = Date.now() + cooldownMinutes * 60 * 1000;
        }

        saveCooldownData(data);
    }
};
