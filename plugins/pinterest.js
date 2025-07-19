const activeChats = new Set();
const MAX_REQUESTABLE = 15;

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
    addFrame,
    reloadEnv,
} = require("../lib");
require("dotenv").config();

let isPintStopped = false;



module.exports = [
    {
        name: "pint",
        desc: "Fetch images from Pinterest and convert them into stickers.",
        utility: "sticker",
        fromMe: true,

        execute: async (client, msg, args) => {

            
            try {
                reloadEnv();
                const pinApi = process.env.PIN_API;
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
                        const framePath = await addFrame(webpPath);
                        const stickerMsg = await addExif(framePath);
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
        desc: "Set sticker crop size, placement, and optional frame",
        utility: "sticker",
        fromMe: true,
    
        execute: async (client, msg, args) => {
            try {
                const current = getStickerSize();
    
                if (args.length === 0) {
                    const label = current.ratio === "0"
                        ? "Free size (no crop)"
                        : `Size: ${current.ratio}, Placement: ${current.placement}`;
                    const frameLabel = current.frame ? `, Frame: ${current.frame}` : "";
                    await client.sendMessage(msg.key.remoteJid, {
                        text: `🖼️ Current settings:\n> ${label}${frameLabel}`
                    });
                    return;
                }
    
                // Support `.ssize frame off`
                if (args[0].toLowerCase() === "frame" && args[1]?.toLowerCase() === "off") {
                    setStickerSize(current.ratio, current.placement, null);
                    await client.sendMessage(msg.key.remoteJid, {
                        text: "🧼 Frame disabled."
                    });
                    return;
                }
    
                const ratio = args[0];
    
                if (ratio === "0") {
                    setStickerSize("0", "_", null);
                    await client.sendMessage(msg.key.remoteJid, {
                        text: "✅ Free size mode enabled (no cropping or frame)"
                    });
                    return;
                }
    
                if (args.length < 2) {
                    await client.sendMessage(msg.key.remoteJid, {
                        text: "*Usage:* .ssize <ratio> <placement> [frame]\n> Example: .ssize 3:4 top frame2\n> Disable: .ssize frame off\n> No crop: .ssize 0"
                    });
                    return { isFallback: true };
                }
    
                const ratioPattern = /^\d+:\d+$/;
                const validPlacements = ["top", "center", "bottom"];
                const placement = args[1].toLowerCase();
                const frameArg = args[2]?.toLowerCase();
                const frame = frameArg === "off" ? null : frameArg;                
                const validFrames = ["frame1", "frame2", "frame3", "frame4"];
    
                if (!ratioPattern.test(ratio) || !validPlacements.includes(placement)) {
                    await client.sendMessage(msg.key.remoteJid, { text: "❌ Invalid ratio or placement!" });
                    return { isFallback: true };
                }
    
                if (frame && !validFrames.includes(frame)) {
                    await client.sendMessage(msg.key.remoteJid, {
                        text: "❌ Invalid frame name! Use one of: frame1, frame2, frame3, frame4"
                    });
                    return { isFallback: true };
                }
    
                setStickerSize(ratio, placement, frame);
                await client.sendMessage(msg.key.remoteJid, {
                    text: `✅ Sticker size updated:\n> Size: ${ratio}\n> Placement: ${placement}${frame ? `\n> Frame: ${frame}` : ""}`
                });
    
            } catch (err) {
                console.error("❌ Error in .ssize command:", err);
                await client.sendMessage(msg.key.remoteJid, {
                    text: "❌ Something went wrong! Try again."
                });
                return { isFallback: true };
            }
        }
    },
    {
        name: "pt",
        desc: "Search Pinterest and convert all image results to stickers",
        utility: "sticker",
        fromMe: true,

        async execute(sock, msg, args) {
        const chat = msg.key.remoteJid;

        if (activeChats.has(chat)) {
            return sock.sendMessage(chat, {
            text: "_A command is already running wait._"
            });
        }

        // Parse optional count
        let count = 0;
        if (/^\d+$/.test(args[0])) {
            count = parseInt(args.shift());
        }

        const query = args.join(" ").trim();
        if (!query) {
            return sock.sendMessage(chat, {
            text: "*Usage:*\n> `.pt [count] <search>`\n> Example: `.pt 6 gojo satoru`"
            });
        }

        if (count > MAX_REQUESTABLE) {
            await sock.sendMessage(chat, {
            text: `_You can only request up to ${MAX_REQUESTABLE} stickers._\nGetting as many as I can\n(usually 17–21)...`
            });
            count = 0;
        }

        activeChats.add(chat);

        try {
            const imageUrls = await pinterest(query);
            if (!imageUrls?.length) {
            return sock.sendMessage(chat, {
                text: "*ADD VALID COOKIE IN VAR*\n> Example:\n`.evar PINTEREST_COOKIE=<cookie>`\nOr use `.setvar`"
            });
            }

            const targetCount = count || imageUrls.length;
            const { ratio, placement } = getStickerSize();
            let successCount = 0;

            for (const url of imageUrls) {
            if (count > 0 && successCount >= targetCount) break;

            let tmpFiles = [];
            try {
                let file = await downloadUrl(url);
                tmpFiles.push(file);

                file = await csImg(file, ratio, placement);
                tmpFiles.push(file);

                const webpPath = await toWebp(file);
                tmpFiles.push(webpPath);

                const framedBuffer = await addFrame(webpPath);
                const finalPath = await addExif(framedBuffer);
                tmpFiles.push(finalPath);

                if (fs.existsSync(finalPath)) {
                const buffer = fs.readFileSync(finalPath);
                await sock.sendMessage(chat, { sticker: buffer });
                await new Promise(r => setTimeout(r, 200));
                successCount++;
                }
            } catch (err) {
                console.warn("⚠️ Skipped image due to error:", err.message);
            } finally {
                for (const file of tmpFiles) {
                    try {
                        if (fs.existsSync(file)) {
                            fs.unlinkSync(file);
                        }
                    } catch (err) {
                        console.warn("⚠️ Couldn't delete file:", file, err.message);
                    }
                }

                await new Promise(r => setTimeout(r, 300));
            }
            }

            if (!successCount) {
            await sock.sendMessage(chat, {
                text: "_❌ Failed to convert any images!_"
            });
            }

            cleanup();

        } catch (err) {
            console.error("❌ .pt error:", err);
            await sock.sendMessage(chat, {
            text: "⚠️ Something went wrong while processing Pinterest results."
            });
        } finally {
            activeChats.delete(chat);
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
