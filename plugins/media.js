const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { randomUUID } = require("crypto");
const { exec } = require("child_process");
const { 
    downloadMedia,
    cleanup,
    instaDl,
    extractText,
    processImage,
    cropVid,
    getVideoDimensions,
    TMP_DIR
} = require("../lib/");


module.exports = [
    {
        name: "pass",
        desc: "Generate passport-size photos arranged on a selected paper size",
        utility: "photoshop",
        fromMe: false,
        execute: async (client, msg, args) => {
            const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        
            if (!quotedMessage?.imageMessage) {
                await client.sendMessage(msg.key.remoteJid, { text: "_Reply to an image with `.pass <page> <count>`_" });
                return {isFallback: true};
            }
        
            if (args.length < 2 || isNaN(parseInt(args[1]))) {
                await client.sendMessage(msg.key.remoteJid, { text: "_*Usage:* `.pass <a4|4x6> <copies>`_" });
                return {isFallback: true};
            }

            const pageSize = args[0].toLowerCase();
            if (!["a4", "4x6"].includes(pageSize)) {
                await client.sendMessage(msg.key.remoteJid, { text: "_Invalid page size! Use `a4` or `4x6`._" });
                return {isFallback: true};
            }

            const numCopies = parseInt(args[1]);
    
            const tempFile = await downloadMedia(msg);
        
            if (!tempFile) {
                return client.sendMessage(msg.key.remoteJid, { text: "❌ Failed to download image. Make sure you're replying to an image." });
            }
        
            const outputImage = await processImage(tempFile, pageSize, numCopies);
        
            if (!outputImage) {
                return client.sendMessage(msg.key.remoteJid, { text: "❌ Failed to process image." });
            }
        
            await client.sendMessage(msg.key.remoteJid, { image: fs.readFileSync(outputImage), caption: "✅ _DONE!_" });
            
            cleanup();
        },
    },
    
    {
        name: "vn",
        desc: "Convert any replied audio file into a voice message",
        utility: "media",
        fromMe: false,

        execute: async (sock, msg) => {
            try {
                if (!msg.message.extendedTextMessage || !msg.message.extendedTextMessage.contextInfo.quotedMessage) {
                    await sock.sendMessage(msg.key.remoteJid, { text: "_Please reply to an audio file!_" });
                    return {isFallback: true};
                }

                const inputPath = await downloadMedia(msg);
                if (!inputPath) {
                    return sock.sendMessage(msg.key.remoteJid, { text: "❌ Failed to download audio file!" });
                }
                
                const fixedPath = path.join(TMP_DIR, `converted_${Date.now()}.ogg`);

                exec(`ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -b:a 32k -c:a libopus "${fixedPath}"`, async (error) => {
                    if (error) {
                        console.error("❌ Error converting audio:", error);
                        return sock.sendMessage(msg.key.remoteJid, { text: "❌ Failed to process audio file." });
                    }

                    const audioBuffer = fs.readFileSync(fixedPath);

                    await sock.sendMessage(msg.key.remoteJid, {
                        audio: audioBuffer,
                        mimetype: "audio/ogg; codecs=opus",
                        ptt: true,
                    });
                    
                    fs.unlinkSync(inputPath); 
                    fs.unlinkSync(fixedPath);
                });
            } catch (error) {
                console.error("❌ Error sending voice note:", error);
                await sock.sendMessage(msg.key.remoteJid, { text: "❌ Failed to send voice note." });
            }
        }
    },

    {
        name: "crop",
        desc: "Crop a replied video with full control",
        utility: "media",
        fromMe: false,

        execute: async (sock, msg, args) => {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted || !quoted.videoMessage) {
                return await sock.sendMessage(msg.key.remoteJid, {
                    text: "❌ Please reply to a video to crop."
                });
            }

            const tempInput = await downloadMedia({ message: { videoMessage: quoted.videoMessage } }, "path");

            if (!tempInput) {
                return await sock.sendMessage(msg.key.remoteJid, {
                    text: "❌ Failed to download video."
                });
            }

            const tempOutput = path.join(TMP_DIR, `${randomUUID()}_cropped.mp4`);

            const cropResizeRegex = /(\d+)x(\d+)\+(\d+),(\d+)(?:>(\d+)x(\d+))?/;
            const match = cropResizeRegex.exec(args.join(" "));
            const options = {};

            if (match) {
                options.cropHeight = parseInt(match[1]); // height first
                options.cropWidth = parseInt(match[2]);  // width second
                options.x = parseInt(match[3]);
                options.y = parseInt(match[4]);
                if (match[5] && match[6]) {
                    options.resizeTo = {
                        height: parseInt(match[5]),
                        width: parseInt(match[6])
                    };
                }
            }

            try {
                if (!options.cropWidth || !options.cropHeight) {
                    const { width, height } = await getVideoDimensions(tempInput);
                    await sock.sendMessage(msg.key.remoteJid, {
                        text: `*Usage:*\n> .crop HxW+x,y>RHxRW\n> RHxRW is optional (resize)\nOriginal Dimensions: ${height}x${width}`
                    });
                } else {
                    const result = await cropVid(tempInput, tempOutput, options);
                    const videoData = fs.readFileSync(result.output);
                    await sock.sendMessage(msg.key.remoteJid, {
                        video: videoData,
                        caption: `✅ Cropped to ${options.cropHeight}x${options.cropWidth}` +
                            (options.resizeTo ? ` and resized to ${options.resizeTo.height}x${options.resizeTo.width}` : "")
                    });
                    fs.unlinkSync(result.output);
                }

                fs.unlinkSync(tempInput);
            } catch (err) {
                console.error("❌ Crop Error:", err);
                await sock.sendMessage(msg.key.remoteJid, { text: "❌ Failed to crop the video." });
            }

            return true;
        }
    },

    {
        name: "insta",
        desc: "Download Instagram videos",
        utility: "downloader",
        fromMe: false,

        execute: async (sock, msg, args) => {
        const input = args.join(" ").trim();
        const text = input || extractText(msg);

        if (!text || !text.includes("instagram.com")) {
            return sock.sendMessage(msg.key.remoteJid, {
            text: "_Send or reply to a valid Instagram link._"
            }, { quoted: msg });
        }

        const videoLink = await instaDl(text);

        if (!videoLink) {
            return sock.sendMessage(msg.key.remoteJid, {
            text: "_Couldn't fetch video link._"
            }, { quoted: msg });
        }

        try {
            const res = await axios.get(videoLink, { responseType: "arraybuffer" });
            const buffer = Buffer.from(res.data);

            await sock.sendMessage(msg.key.remoteJid, {
            video: buffer,
            mimetype: "video/mp4"
            }, { quoted: msg });

        } catch (e) {
            console.error("❌ Buffer send error:", e.message);
            await sock.sendMessage(msg.key.remoteJid, {
            text: "_Failed to fetch or send the video._"
            }, { quoted: msg });
        }
        }
    },
];