const { 
    csImg,
    toWebp,
    TMP_DIR,
    cleanup,
    addExif,
    getExif,
    cropVid,
    dlStkZip,
    downloadUrl,
    extractStkZip,
    processZipStk,
    downloadMedia,
    getStickerSize,
    getVideoDimensions,
} = require("../lib");
const fs = require("fs"); 
const path = require("path");
const { randomUUID } = require("crypto");




let isZipStopped = false;

module.exports = [
    {
        name: "sticker",
        scut: "s,skt,skr,sti",
        desc: "Convert media to sticker (shortcut)",
        utility: "sticker",
        fromMe: false,
        execute: async (client, msg) => {
            let mediaFile = null;

            try {
                mediaFile = await downloadMedia(msg);
                if (!mediaFile) {
                    return client.sendMessage(msg.key.remoteJid, {
                        text: "_Reply to an image or short video!_"
                    });
                }

                const stickerFile = await toWebp(mediaFile);
                await addExif(stickerFile);

                await client.sendMessage(msg.key.remoteJid, {
                    sticker: fs.readFileSync(stickerFile)
                }, { quoted: msg });

                fs.unlinkSync(mediaFile);
                fs.unlinkSync(stickerFile);

            } catch (err) {
                console.error("❌ Error in .e sticker:", err);

                if (mediaFile && fs.existsSync(mediaFile)) fs.unlinkSync(mediaFile);
            }
        }
    },

    {
        name: "take",
        scut: "t",
        desc: "Change the pack and author of a sticker",
        utility: "sticker",
        fromMe: false,
        execute: async (client, msg, args) => {
            let tempFile;

            try {
                tempFile = await downloadMedia(msg);
                if (!tempFile) {
                    await client.sendMessage(msg.key.remoteJid, {
                        text: "_Reply to a sticker!_"
                    });
                    return { isFallback: true };
                }

                const fullArg = args.join(" ").trim();
                const [pack, author] = fullArg.split(",").map(x => x?.trim() || undefined);

                const newStickerPath = await addExif(tempFile, pack, author);

                await client.sendMessage(msg.key.remoteJid, {
                    sticker: fs.readFileSync(newStickerPath)
                }, { quoted: msg });

                if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

            } catch (err) {
                console.error("❌ Error in .take command:", err);

                if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
            }
        }
    },

    {
        name: "cs",
        desc: "Crop media before converting it into a sticker",
        utility: "sticker",
        fromMe: false,

        execute: async (client, msg) => {
            let file, cropped, webpPath;

            try {
                const chat = msg.key.remoteJid;
                file = await downloadMedia(msg);
                if (!file) return client.sendMessage(chat, { text: "_Reply to a media!_" });

                const { ratio, placement } = getStickerSize();
                const isVideo = /\.(mp4|mov|webm)$/i.test(file);

                if (ratio === "0") {
                    cropped = file;
                } else if (isVideo) {
                    const [rw, rh] = ratio.split(":").map(Number);
                    if (!rw || !rh) throw "Invalid ratio";

                    const outputPath = path.join(TMP_DIR, `${randomUUID()}_cropped.mp4`);
                    const { width, height } = await getVideoDimensions(file);

                    let cropW = width, cropH = Math.round((width * rh) / rw);
                    if (cropH > height) {
                        cropH = height;
                        cropW = Math.round((height * rw) / rh);
                    }

                    const x = Math.floor((width - cropW) / 2);
                    const y = placement === "bottom" ? height - cropH : placement === "center" ? Math.floor((height - cropH) / 2) : 0;

                    await cropVid(file, outputPath, { cropWidth: cropW, cropHeight: cropH, x, y });
                    cropped = outputPath;

                } else {
                    cropped = await csImg(file, ratio, placement);
                }

                webpPath = await toWebp(cropped);
                const sticker = fs.readFileSync(await addExif(webpPath));

                await client.sendMessage(chat, { sticker }, { quoted: msg });

            } catch (err) {
                console.error("❌ .cs error:", err);
                await client.sendMessage(msg.key.remoteJid, { text: "_Failed_" });
            } finally {
                for (const f of [file, cropped, webpPath]) {
                    if (f && fs.existsSync(f)) fs.unlinkSync(f);
                }
            }
        }
    },

    {
        name: "exif",
        desc: "Extract sticker EXIF info (pack name, author, emojis)",
        utility: "sticker",
        fromMe: false,
    
        execute: async (sock, msg) => {
            try {
                const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                if (!quoted || !quoted.stickerMessage) {
                    return await sock.sendMessage(msg.key.remoteJid, {
                        text: "_Reply to a sticker_"
                    });
                }
    
                const stickerFile = await downloadMedia(msg, "sticker");
    
                const exif = await getExif(stickerFile);
                fs.unlinkSync(stickerFile);
    
                if (!exif) {
                    return await sock.sendMessage(msg.key.remoteJid, {
                        text: "_No EXIF data found!_"
                    });
                }
    
                const output = `> *Pack:*\n${exif.packname}\n\n> *Author:*\n${exif.author}\n\n> *Pack ID:*\n${exif.packId}\n\n> *Emojis:*\n${exif.emojis}`;
                await sock.sendMessage(msg.key.remoteJid, { text: output });
    
            } catch (err) {
                console.error("❌ Error in .getexif command:", err);

            }
        }
    },

    
    {
        name: "szip",
        desc: "Extracts and processes .webp stickers from a ZIP file",
        utility: "sticker",
        fromMe: false,
    
        execute: async (client, msg) => {
            isZipStopped = false;
    
            const zipPath = await dlStkZip(msg, "document");
            if (!zipPath) {
                await client.sendMessage(msg.key.remoteJid, { text: "_Reply to a ZIP file!_" });
                return { isFallback: true };
            }
    
            await extractStkZip(zipPath, "./media/tmp");
            await processZipStk(client, msg, addExif, () => isZipStopped);

        }
    },
    

    {
        name: "stopszip",
        desc: "Stop ongoing ZIP sticker processing",
        utility: "sticker",
        fromMe: true,
    
        execute: async (client, msg) => {
            isZipStopped = true;
            await client.sendMessage(msg.key.remoteJid, {
                text: "Stopping..."
            });
            setTimeout(() => {
                cleanup();
            }, 3000);
        }
    },


    {
        name: "tosticker",
        desc: "Download images from provided URLs and send them as stickers",
        utility: "sticker",
        fromMe: false,
    
        execute: async (client, msg, args) => {
            const chat = msg.key.remoteJid;
            if (!args.length) {
                await client.sendMessage(chat, { text: "_Provide at least one image URL!_" });
                return { isFallback: true };
            }
    
            const urls = args.join(" ").split(",").map(x => x.trim()).filter(Boolean);
            if (!urls.length) {
                await client.sendMessage(chat, { text: "_No valid URLs found._" });
                return { isFallback: true };
            }
    
            try {
                let sent = false;
    
                for (const url of urls) {
                    let file;
                    try {
                        file = await downloadUrl(url);
                        const webp = await toWebp(file);
                        const sticker = await addExif(webp);
    
                        if (sticker) {
                            const stickerBuffer = fs.readFileSync(sticker);
                            await client.sendMessage(chat, { sticker: stickerBuffer }, { quoted: msg });
                            
                            sent = true;
                        }
                    } catch (err) {
                        console.error("❌ Error processing URL:", url, err);
                    } finally {
                        if (file && fs.existsSync(file)) fs.unlinkSync(file);
                    }
                }
    
                if (!sent) {
                    await client.sendMessage(chat, { text: "_Couldn't send stickers_" });
                    return { isFallback: true };
                }
    
            } catch (err) {
                console.error("❌ Error in tosticker command:", err);
            }
        }
    },
];
