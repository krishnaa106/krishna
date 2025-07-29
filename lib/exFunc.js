const fs = require("fs");
const vm = require("vm");
const path = require("path");
const axios = require("axios");
const crypto = require("crypto");

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


async function predictFonts(imagePath) {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString("base64");
    const md5Hash = crypto.createHash("md5").update(imageBuffer).digest("hex");

    const payload = {
        annotationIndex: "4",
        experimentData: {},
        image: base64Image,
        limit: 10,
        md5: md5Hash,
        platform: "Store"
    };

    try {
        const response = await axios.post(
            "https://fi-api.monotype.com/v1/prediction",
            payload,
            {
                headers: {
                    "Content-Type": "application/json",
                    Origin: "https://www.myfonts.com",
                    Referer: "https://www.myfonts.com/",
                    "User-Agent": "Mozilla/5.0"
                }
            }
        );

        return response.data?.styleIds?.map((s) => s.id) || [];
    } catch (err) {
        console.error("Prediction Error:", err.response?.data || err.message);
        return [];
    }
}

async function fetchFontDetails(styleIds) {
    if (!styleIds.length) return [];

    const url = "https://search-myfonts-api.monotype.com/v1/myfonts-search?x-algolia-application-id=P11UZVL396";
    const filters = styleIds
        .map((id, i) => `font_data.myfonts_style_id:${id}<score=${100 - i}>`)
        .join(" OR ");

    const body = {
        requests: [
            {
                indexName: "universal_search_data",
                params: {
                    analyticsTags: ["whatthefontMyfonts"],
                    attributesToHighlight: [],
                    distinct: false,
                    facets: ["*"],
                    filters: `(${filters}) AND is_package:false`,
                    hitsPerPage: 10,
                    page: 0,
                    query: "",
                    ruleContexts: ["wtf_myfonts"],
                    clickAnalytics: true,
                    analytics: true,
                    userToken: "anonymous-script",
                    sumOrFiltersScores: true,
                    facetFilters: [],
                },
            },
        ],
    };

    try {
        const res = await axios.post(url, body, {
            headers: {
                "Content-Type": "application/json",
                Origin: "https://www.myfonts.com",
                Referer: "https://www.myfonts.com/",
                "User-Agent": "Mozilla/5.0",
            },
        });

        const hits = res.data?.results?.[0]?.hits || [];
        return hits.map((h) => ({
            name: h.font_data?.name || h.name || h.title || "Unknown",
            family: h.title || h.name || "Unknown",
            foundry: h.foundry_name || h.foundry_title || "Unknown",
            sourceUrl: h.handle
                ? `https://www.myfonts.com/collections/${h.handle}`
                : `https://www.myfonts.com/search/${encodeURIComponent(h.name || h.title)}`
        }));
    } catch (err) {
        console.error("Font details fetch error:", err.response?.data || err.message);
        return [];
    }
}


module.exports = {
    installPlugin,
    uninstallPlugin,
    predictFonts,
    fetchFontDetails
};
