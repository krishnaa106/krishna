const fs = require("fs");
const { 
    getStickerSize,
    setStickerSize,
    fetchPinterestImages,
    csImg,
    downloadUrl,
    cleanup,
    toWebp,
    addExif,
    pinterest,
} = require("../lib");
require("dotenv").config();

let isPintStopped = false;
let pinApi = process.env.PIN_API;

module.exports = [
    {
        name: "pint",
        desc: "Fetch images from Pinterest and convert them into stickers.",
        utility: "sticker",
        fromMe: false,

        execute: async (client, msg, args) => {

            
            try {
                if (!pinApi) {
                    await client.sendMessage(msg.key.remoteJid, { text: "Set *PIN_API* in your `config.env` file.\n> Use `.evar` or `.setvar`\n_*NOTE:* You can only use this if you have the api_" });
                    return { isFallback: true };
                }

                if (args.length < 2) {
                    await client.sendMessage(msg.key.remoteJid, { text: "_Usage: .pint <count> <query>_" });
                    return { isFallback: true };
                }

                const count = parseInt(args[0]);
                const query = args.slice(1).join(" ");

                if (isNaN(count) || count <= 0) {
                    await client.sendMessage(msg.key.remoteJid, { text: "_Invalid count!_" });
                    return { isFallback: true };
                }

                const imageUrls = await fetchPinterestImages(query, count, pinApi);
                if (!imageUrls.length) {
                    await client.sendMessage(msg.key.remoteJid, { text: "_No images found!_" });
                    return { isFallback: true };
                }

                const stickerSize = getStickerSize();

                for (const url of imageUrls) {
                    if (isPintStopped) {
                        await client.sendMessage(msg.key.remoteJid, { text: "_Stopped!_" });
                        isPintStopped = false;
                        break;
                    }                
                    try {
                        let filePath = await downloadUrl(url);
                        filePath = await csImg(filePath, stickerSize.ratio, stickerSize.placement);
                        const webpPath = await toWebp(filePath);
                        const stickerMsg = await addExif(webpPath);
                        if (!stickerMsg) throw new Error("Sticker creation failed.");

                        await client.sendMessage(msg.key.remoteJid, {
                            sticker: fs.readFileSync(stickerMsg),
                            mimetype: "image/webp"
                        });
                        

                        fs.unlinkSync(filePath);
                        fs.unlinkSync(webpPath);
                    } catch (err) {
                        console.error("❌ Error processing image:", err);
                    }
                }

                cleanup();
            } catch (err) {
                console.error("❌ Error in .pint command:", err);
                await client.sendMessage(msg.key.remoteJid, { text: "❌ Something went wrong! see logs" });
                return { isFallback: true };
            }
        }
    },
    {
        name: "stoppint",
        desc: "Stop ongoing Pinterest sticker process",
        utility: "sticker",
        fromMe: true,
    
        execute: async (client, msg) => {
            isPintStopped = true;
            await client.sendMessage(msg.key.remoteJid, {
                text: "stopping..."
            });
        }
    },    
    {
        name: "ssize",
        desc: "Set sticker crop size and placement",
        utility: "sticker",
        fromMe: false,

        execute: async (client, msg, args) => {
            try {
                if (args.length === 0) {
                    const current = getStickerSize();
                    const label = current.ratio === "0"
                        ? "Free size (no crop)"
                        : `Size: ${current.ratio}, Placement: ${current.placement}`;
                    await client.sendMessage(msg.key.remoteJid, { text: `Current: ${label}` });
                    return;
                }

                const ratio = args[0];

                if (ratio === "0") {
                    setStickerSize("0", "_");
                    await client.sendMessage(msg.key.remoteJid, {
                        text: `✅ Free size mode enabled (no cropping)`
                    });
                    return;
                }

                if (args.length < 2) {
                    await client.sendMessage(msg.key.remoteJid, { text: "*Usage:* `.ssize <ratio> <placement>`\n> Example- `.ssize 3:4 top`\n> For no crop- `.ssize 0`" });
                    return { isFallback: true };
                }

                const ratioPattern = /^\d+:\d+$/;
                const validPlacements = ["top", "center", "bottom"];
                const placement = args[1].toLowerCase();

                if (!ratioPattern.test(ratio) || !validPlacements.includes(placement)) {
                    await client.sendMessage(msg.key.remoteJid, { text: "❌ Invalid ratio or placement!" });
                    return { isFallback: true };
                }

                setStickerSize(ratio, placement);
                await client.sendMessage(msg.key.remoteJid, {
                    text: `✅ Sticker size updated: ${ratio}, Placement: ${placement}`
                });
            } catch (err) {
                console.error("❌ Error in .ssize command:", err);
                await client.sendMessage(msg.key.remoteJid, { text: "❌ Something went wrong! Try again." });
                return { isFallback: true };
            }
        }
    },

    {
        name: "pinstk",
        desc: "Search Pinterest and convert all image results to stickers",
        utility: "sticker",
        fromMe: false,
    
        async execute(sock, msg, args) {
            const chat = msg.key.remoteJid;
            const query = args.join(" ").trim();
    
            if (!query) {
                return sock.sendMessage(chat, {
                    text: "*Usage:* `.pinstk [search term]`\n> Example: `.pinstk gojo satoru`"
                });
            }
    
            try {
                const imageUrls = await pinterest(query);
                if (!imageUrls?.length) {
                    return sock.sendMessage(chat, {
                        text: "*ADD VALID COOKIE IN VAR*\n> Example:\n`.evar PINTEREST_COOKIE=<cookie>`\nOr use `.setvar`"
                    });
                }
    
                const { ratio, placement } = getStickerSize();
                let successCount = 0;
    
                for (const url of imageUrls) {
                    let tmpFiles = [];
                    try {
                        let file = await downloadUrl(url);
                        tmpFiles.push(file);
    
                        file = await csImg(file, ratio, placement);
                        tmpFiles.push(file);
    
                        const webpPath = await toWebp(file);
                        tmpFiles.push(webpPath);
    
                        const finalPath = await addExif(webpPath);
    
                        if (fs.existsSync(finalPath)) {
                            const buffer = fs.readFileSync(finalPath);
                            await sock.sendMessage(chat, { sticker: buffer });
                            successCount++;
                        }
                    } catch (err) {
                        console.warn("⚠️ Skipped image due to error:", err.message);
                    } finally {
                        for (const file of tmpFiles) {
                            if (fs.existsSync(file)) fs.unlinkSync(file);
                        }
                        await new Promise((r) => setTimeout(r, 300));
                    }
                }
    
                if (!successCount) {
                    await sock.sendMessage(chat, {
                        text: "_❌ Failed to convert any images!_"
                    });
                }
    
                cleanup();
    
            } catch (err) {
                console.error("❌ .pinstk error:", err);
                await sock.sendMessage(chat, {
                    text: "⚠️ Something went wrong while processing Pinterest results."
                });
            }
        }
    },

    {
        name: "pinlinks",
        desc: "Fetch as many Pinterest image links as possible. Usage: .pin [search term]",
        utility: "media",
        fromMe: false,

        async execute(sock, msg, args) {
            const chat = msg.key.remoteJid;
            const query = args.join(" ").trim();

            if (!query) {
                return await sock.sendMessage(chat, {
                    text: "*Usage:*\n> `.pinlinks [search term]`\n> Example: `.pinlinks gojo satoru`"
                });
            }

            try {
                const images = await pinterest(query);

                if (!images || images.length === 0) {
                    return await sock.sendMessage(chat, {
                        text: "*ADD VALID COOKIE IN VAR*\n> example-\n`.evar PINTEREST_COOKIE=<pinterest cookie>`\n>Or use `.setvar`"
                    });
                }

                const links = images.map((url, i) => `${i + 1}. ${url}`).join("\n");

                await sock.sendMessage(chat, {
                    text: `🔗 *Pinterest results for:* ${query}\n\n${links}`
                });

            } catch (err) {
                console.error("❌ .pin command error:", err);
                await sock.sendMessage(chat, {
                    text: "⚠️ Failed to fetch Pinterest image links."
                });
            }
        }
    },
];
