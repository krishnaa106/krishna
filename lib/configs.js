const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "..", "config.env");

function getConfig() {
  const content = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH, "utf8") : "";
  const lines = content.split("\n").filter(Boolean);
  const config = {};
  for (const line of lines) {
    const [key, value] = line.split("=");
    config[key.trim()] = value?.trim() || "";
  }
  return config;
}

module.exports = { getConfig };
