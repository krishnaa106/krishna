const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");


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

const reloadEnv = () => {
    const envPath = require("path").join(__dirname, "../config.env");
    if (fs.existsSync(envPath)) {
        const parsed = dotenv.parse(fs.readFileSync(envPath));
        for (const k in parsed) {
            process.env[k] = parsed[k];
        }
    }
};

module.exports = {
    loadJson,
    saveJson,
    reloadEnv
};
