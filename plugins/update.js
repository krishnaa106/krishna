const fs = require("fs");
const path = require("path");
const { dlMedia } = require("../lib");
const { execSync } = require("child_process");

function getCurrentCommit() {
    return execSync("git rev-parse --short HEAD").toString().trim();
}

function getLatestCommit() {
    execSync("git fetch origin");
    return execSync("git rev-parse --short origin/master").toString().trim();
}

function updateBot() {
    try {
        execSync("git fetch --all");
        execSync("git reset --hard origin/master");
        execSync("npm install --legacy-peer-deps");
        return true;
    } catch (error) {
        console.error("Error updating bot:", error.stderr?.toString() || error.message);
        return false;
    }
}

module.exports = [
  {
      name: "update",
      desc: "Check for updates or update bot from GitHub (master branch)",
      fromMe: true,
      execute: async (client, msg, args) => {
          try {
              if (args[0] === "now") {
                  client.sendMessage(msg.key.remoteJid, { text: "🔄 Updating bot..." });
                  const success = updateBot();
                  if (!success) {
                      return client.sendMessage(msg.key.remoteJid, { text: "❌ Update failed! Check logs for details." });
                  }
                  client.sendMessage(msg.key.remoteJid, { text: "✅ Update successful!\n> 🔄 Restarting bot..." });
                  setTimeout(() => execSync("pm2 restart all"), 3000);
                  return;
              }

              const currentCommit = getCurrentCommit();
              const latestCommit = getLatestCommit();

              if (currentCommit === latestCommit) {
                  return client.sendMessage(msg.key.remoteJid, { text: `✅ Bot is already up to date!\n> (Commit: \`${currentCommit}\`)` });
              }

              return client.sendMessage(msg.key.remoteJid, { text: `🚀 Update available!\n\n> Current: \`${currentCommit}\`\n> Latest: \`${latestCommit}\`\n\nUse \`.update now\` to update.` });
          } catch (error) {
              console.error("Error checking/updating bot:", error);
              return client.sendMessage(msg.key.remoteJid, { text: "❌ Error checking/updating bot!" });
          }
      },
  },
  {
    name: "in",
    desc: "Install a plugin by replying to a .js file",
    utility: "owner",
    fromMe: true,

    execute: async (client, msg, args) => {
      const jid = msg.key.remoteJid;

      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.documentMessage;
      if (!quoted || !quoted.fileName || !quoted.mimetype.includes("javascript")) {
        return client.sendMessage(jid, { text: "_Reply to a .js plugin file to install!_" });
      }

      const fileName = quoted.fileName.endsWith(".js") ? quoted.fileName : quoted.fileName + ".js";
      const savePath = path.join(__dirname, "../eplugins", fileName);

      try {
        const buffer = await dlMedia(msg, client, "buffer");
        if (!buffer) {
          return client.sendMessage(jid, { text: "❌ Failed to download file." });
        }

        fs.writeFileSync(savePath, buffer);

        return client.sendMessage(jid, {
          text: `✅ _Plugin \`${fileName}\` installed in *eplugins/*_`,
        });
      } catch (err) {
        return client.sendMessage(jid, { text: `❌ Failed to install plugin:\n${err.message}` });
      }
    },
  },
];


