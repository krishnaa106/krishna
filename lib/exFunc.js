const fs = require("fs");
const path = require("path");
const axios = require("axios");
const vm = require("vm");

const EPLUGIN_DIR = path.join(__dirname, "../eplugins");

if (!fs.existsSync(EPLUGIN_DIR)) fs.mkdirSync(EPLUGIN_DIR, { recursive: true });

// 🔧 Fetch, sandbox test, and save the Gist plugin
async function installPlugin(gistUrl) {
    try {
        const match = gistUrl.match(/https:\/\/gist\.github\.com\/[^\/]+\/([a-f0-9]+)/);
        if (!match) throw new Error("Invalid Gist URL");

        const gistId = match[1];
        const apiUrl = `https://api.github.com/gists/${gistId}`;
        const { data } = await axios.get(apiUrl);

        const files = Object.entries(data.files);
        if (files.length === 0) throw new Error("No files found in Gist");

        const [fileName, fileData] = files[0];

        // 🛡️ Sandbox test without triggering real plugin logic
        const context = vm.createContext({
            module: {},
            exports: {},
            require: () => {
                throw new Error("require is disabled in sandbox.");
            },
        });

        const script = new vm.Script(fileData.content, { filename: fileName });
        script.runInContext(context);

        if (!Array.isArray(context.module.exports)) {
            throw new Error("Plugin must export an array of commands.");
        }

        const filePath = path.join(EPLUGIN_DIR, fileName);
        fs.writeFileSync(filePath, fileData.content);

        const commands = context.module.exports.map(cmd => cmd.name);
        return { fileName, commands };
    } catch (err) {
        return { error: err.message };
    }
}

// 🔧 Delete plugin by file or command name
function uninstallPlugin(fileNameOrCommand) {
    try {
        const files = fs.readdirSync(EPLUGIN_DIR).filter(file => file.endsWith(".js"));
        for (const file of files) {
            const filePath = path.join(EPLUGIN_DIR, file);

            // 🧹 Clear require cache to avoid stale exports
            delete require.cache[require.resolve(filePath)];

            const plugin = require(filePath);

            if (
                file === fileNameOrCommand ||
                (Array.isArray(plugin) && plugin.some(cmd => cmd.name === fileNameOrCommand))
            ) {
                fs.unlinkSync(filePath);
                return file;
            }
        }
        return null;
    } catch {
        return null;
    }
}

module.exports = { installPlugin, uninstallPlugin };
