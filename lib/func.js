const fs = require("fs");
const path = require("path");

function loadJson(relativePath) {
    const fullPath = path.resolve(__dirname, "..", relativePath);
    if (!fs.existsSync(fullPath)) return null;

    try {
        const raw = fs.readFileSync(fullPath, "utf-8");
        return JSON.parse(raw);
    } catch (err) {
        console.error(`❌ Failed to load JSON from ${relativePath}:`, err);
        return null;
    }
}

function saveJson(relativePath, data) {
    const fullPath = path.resolve(__dirname, "..", relativePath);
    try {
        fs.writeFileSync(fullPath, JSON.stringify(data, null, 2));
        return true;
    } catch (err) {
        console.error(`❌ Failed to save JSON to ${relativePath}:`, err);
        return false;
    }
}

module.exports = { loadJson, saveJson };
