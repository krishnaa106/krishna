// lib/autoSticker.js
const fs = require("fs");
const { dlMedia, toWebp, addExif } = require("../lib/utils");

let AtkTargetChat = null;
const AtkQueue = [];
let AtkIsProcessing = false;

/**
 * Set target chat
 */
function setAtkTarget(jid) {
    AtkTargetChat = jid;
}

/**
 * Get current status
 */
function getAtkStatus() {
    return AtkTargetChat ? `> *Enabled for:* ${AtkTargetChat}` : "> *Status:* ❌ Disabled";
}

/**
 * Add a task to the queue
 */
function pushAtkTask(task) {
    AtkQueue.push(task);
    if (!AtkIsProcessing) runAtkQueue();
}

/**
 * Process tasks one by one
 */
async function runAtkQueue() {
    if (!AtkQueue.length) {
        AtkIsProcessing = false;
        return;
    }

    AtkIsProcessing = true;

    const task = AtkQueue.shift();
    try {
        await task();
    } catch (e) {
        console.error("❌ Atk task error:", e.message);
    }

    setTimeout(runAtkQueue, 200);
}

/**
 * Sticker processing logic
 */
async function handleAtkSticker(client, msg) {
    try {
        const file = await dlMedia(msg, "path");
        if (!file) return;

        const webp = file.endsWith(".webp") ? file : await toWebp(file);
        const exif = await addExif(webp);
        const buffer = fs.readFileSync(exif);

        await client.sendMessage(AtkTargetChat, { sticker: buffer });

        [file, webp, exif].forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
    } catch (err) {
        console.error("❌ handleAtkSticker error:", err.message);
    }
}

module.exports = {
    setAtkTarget,
    getAtkStatus,
    pushAtkTask,
    handleAtkSticker,
    AtkQueue,
};
