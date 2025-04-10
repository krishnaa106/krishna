const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { exec } = require("child_process");
const { 
    downloadMedia,
    cleanup,
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

            const cropResizeRegex = /(\d+)x(\d+)(?:\+(\d+)\+(\d+))?(?:>(\d+)x(\d+))?/;
            const match = cropResizeRegex.exec(args.join(" "));
            const options = {};

            if (match) {
                options.cropWidth = parseInt(match[1]);
                options.cropHeight = parseInt(match[2]);
                if (match[3]) options.x = parseInt(match[3]);
                if (match[4]) options.y = parseInt(match[4]);
                if (match[5] && match[6]) {
                    options.resizeTo = {
                        width: parseInt(match[5]),
                        height: parseInt(match[6])
                    };
                }
            }

            try {
                if (!options.cropWidth || !options.cropHeight) {
                    const { width, height } = await getVideoDimensions(tempInput);
                    await sock.sendMessage(msg.key.remoteJid, {
                        text: `🎞️ Original Dimensions: ${width}x${height}`
                    });
                } else {
                    const result = await cropVid(tempInput, tempOutput, options);
                    const videoData = fs.readFileSync(result.output);
                    await sock.sendMessage(msg.key.remoteJid, {
                        video: videoData,
                        caption: `✅ Cropped to ${options.cropWidth}x${options.cropHeight}` +
                            (options.resizeTo ? ` and resized to ${options.resizeTo.width}x${options.resizeTo.height}` : "")
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
//BUFFER BASED CROP
    // {
    //     name: "crop",
    //     desc: "Crop a replied video with full control",
    //     utility: "media",
    //     fromMe: false,

    //     execute: async (sock, msg, args) => {
    //         const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    //         if (!quoted || !quoted.videoMessage) {
    //             return await sock.sendMessage(msg.key.remoteJid, {
    //                 text: "_Please reply to a video to crop._"
    //             });
    //         }

    //         // 🔁 Now use buffer
    //         const buffer = await downloadMedia({ message: { videoMessage: quoted.videoMessage } }, "buffer");
    //         if (!buffer) {
    //             return await sock.sendMessage(msg.key.remoteJid, {
    //                 text: "_Failed to download video._"
    //             });
    //         }

    //         // Write buffer temporarily to crop it
    //         const tempInput = path.join(TMP_DIR, `${randomUUID()}.mp4`);
    //         const tempOutput = path.join(TMP_DIR, `${randomUUID()}_cropped.mp4`);
    //         fs.writeFileSync(tempInput, buffer);

    //         // Parse args
    //         const cropResizeRegex = /(\d+)x(\d+)(?:\+(\d+)\+(\d+))?(?:>(\d+)x(\d+))?/;
    //         const match = cropResizeRegex.exec(args.join(" "));
    //         const options = {};

    //         if (match) {
    //             options.cropWidth = parseInt(match[1]);
    //             options.cropHeight = parseInt(match[2]);
    //             if (match[3]) options.x = parseInt(match[3]);
    //             if (match[4]) options.y = parseInt(match[4]);
    //             if (match[5] && match[6]) {
    //                 options.resizeTo = {
    //                     width: parseInt(match[5]),
    //                     height: parseInt(match[6])
    //                 };
    //             }
    //         }

    //         try {
    //             if (!options.cropWidth || !options.cropHeight) {
    //                 const { width, height } = await getVideoDimensions(tempInput);
    //                 await sock.sendMessage(msg.key.remoteJid, {
    //                     text: `🎞️ Original Dimensions: ${width}x${height}`
    //                 });
    //             } else {
    //                 const result = await cropVid(tempInput, tempOutput, options);
    //                 const videoData = fs.readFileSync(result.output);
    //                 await sock.sendMessage(msg.key.remoteJid, {
    //                     video: videoData,
    //                     caption: `✅ Cropped to ${options.cropWidth}x${options.cropHeight}` +
    //                         (options.resizeTo ? ` and resized to ${options.resizeTo.width}x${options.resizeTo.height}` : "")
    //                 });
    //                 fs.unlinkSync(result.output);
    //             }

    //             fs.unlinkSync(tempInput);
    //         } catch (err) {
    //             console.error("❌ Crop Error:", err);
    //             await sock.sendMessage(msg.key.remoteJid, { text: "_Failed to crop the video._" });
    //         }

    //         return true;
    //     }
    // },
    
];