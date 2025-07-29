const fs = require("fs");
const path = require("path");
const axios = require("axios");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
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
    TMP_DIR,
    dlMedia,
    addExif,
    webpToMp4,
    spotifyDl
} = require("../lib/");



/**
 * Check if a sticker message is animated
 * @param {object} stickerMessage
 * @returns {boolean}
 */
const isAnimatedSticker = (stickerMessage) =>
    stickerMessage.isAnimated === true ||
    stickerMessage.animated === true ||
    (stickerMessage.mimetype === 'image/webp' && stickerMessage.isAnimated);
  
  /**
   * Delete a file if it exists
   * @param {string} filePath
   */
  const cleanupFile = (filePath) => {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (error) {
      console.log("Could not delete file:", error.message);
    }
  };

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
        desc: "Convert replied audio to a voice note (PTT)",
        utility: "media",
        fromMe: false,

        execute: async (sock, msg) => {
            try {
                const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                if (!quoted || !quoted.audioMessage) {
                    await sock.sendMessage(msg.key.remoteJid, { text: "_❗Please reply to an audio file!_" });
                    return { isFallback: true };
                }

                const inputPath = await downloadMedia(msg);
                if (!inputPath) {
                    await sock.sendMessage(msg.key.remoteJid, { text: "❌ Failed to download audio file!" });
                    return;
                }

                // Use .opus extension as WhatsApp does
                const outputPath = path.join(TMP_DIR, `vn_${Date.now()}.opus`);

                // ffmpeg command to produce opus in ogg container (WhatsApp uses .opus extension)
                const ffmpegCmd = `ffmpeg -y -i "${inputPath}" -vn -acodec libopus -ar 16000 -ac 1 -b:a 32k "${outputPath}"`;

                exec(ffmpegCmd, async (err) => {
                    if (err) {
                        console.error("❌ FFmpeg Error:", err);
                        await sock.sendMessage(msg.key.remoteJid, { text: "❌ Audio conversion failed." });
                        return;
                    }

                    const audioBuffer = fs.readFileSync(outputPath);

                    await sock.sendMessage(msg.key.remoteJid, {
                        audio: audioBuffer,
                        mimetype: "audio/ogg; codecs=opus",
                        ptt: true,
                    });

                    fs.unlinkSync(inputPath);
                    fs.unlinkSync(outputPath);
                });

            } catch (err) {
                console.error("❌ Voice Note Error:", err);
                await sock.sendMessage(msg.key.remoteJid, { text: "❌ Something went wrong during conversion." });
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
    {
        name: "rotate",
        desc: "Rotate replied media left/right/180 degrees",
        utility: "media",
        fromMe: false,
        execute: async (sock, msg, args) => {
            try {
                const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                if (!quoted) return sock.sendMessage(msg.key.remoteJid, { text: "_Reply to a media message_" });

                const mediaTypes = ['imageMessage', 'videoMessage', 'documentMessage', 'stickerMessage'];
                const mediaType = mediaTypes.find(type => quoted[type]);
                if (!mediaType) return sock.sendMessage(msg.key.remoteJid, { text: "_Reply to an image, video, or document_" });

                const rotation = args[0]?.toLowerCase();
                if (!rotation || !['left', 'right', '180'].includes(rotation))
                    return sock.sendMessage(msg.key.remoteJid, { text: "_Usage: .rotate <left/right/180>_" });

                const mediaData = await dlMedia({ message: { [mediaType]: quoted[mediaType] } }, sock, "both");
                if (!mediaData) return sock.sendMessage(msg.key.remoteJid, { text: "_Failed to download media_" });

                const { path: tempInput, ext: fileExtension } = mediaData;
                const ext = fileExtension.startsWith('.') ? fileExtension : `.${fileExtension}`;
                const tempOutput = path.join(TMP_DIR, `${randomUUID()}_rotated${ext}`);

                try {
                    // HANDLE ANIMATED STICKERS
                    if (mediaType === 'stickerMessage' && quoted.stickerMessage?.isAnimated) {
                        const tempMp4 = path.join(TMP_DIR, `${randomUUID()}_anim.mp4`);
                        const rotatedMp4 = path.join(TMP_DIR, `${randomUUID()}_rotated.mp4`);
                        const finalWebp = path.join(TMP_DIR, `${randomUUID()}_final.webp`);

                        await webpToMp4(tempInput, tempMp4); // Convert webp to mp4

                        // Rotate the video
                        let ff = ffmpeg(tempMp4);
                        switch (rotation) {
                            case 'left': ff = ff.videoFilters('transpose=2'); break;
                            case 'right': ff = ff.videoFilters('transpose=1'); break;
                            case '180': ff = ff.videoFilters('transpose=2,transpose=2'); break;
                        }
                        await new Promise((resolve, reject) => {
                            ff.output(rotatedMp4).on('end', resolve).on('error', reject).run();
                        });

                        // Convert rotated mp4 back to webp (sticker)
                        await new Promise((resolve, reject) => {
                            ffmpeg(rotatedMp4)
                                .outputOptions(["-vcodec libwebp", "-loop 0", "-preset default"])
                                .output(finalWebp)
                                .on('end', resolve)
                                .on('error', reject)
                                .run();
                        });

                        const stickerWithExif = await addExif(finalWebp);
                        const stickerData = fs.readFileSync(stickerWithExif);
                        await sock.sendMessage(msg.key.remoteJid, { sticker: stickerData });

                        cleanupFile(tempMp4);
                        cleanupFile(rotatedMp4);
                        cleanupFile(finalWebp);
                        cleanupFile(stickerWithExif);
                        cleanupFile(tempInput);
                        return;
                    }

                    // VIDEO ROTATION
                    if (mediaType === 'videoMessage' || (mediaType === 'documentMessage' && fileExtension.match(/\.(mp4|avi|mov|mkv|webm)$/i))) {
                        let command = ffmpeg(tempInput);
                        switch (rotation) {
                            case 'left': command = command.videoFilters('transpose=2'); break;
                            case 'right': command = command.videoFilters('transpose=1'); break;
                            case '180': command = command.videoFilters('transpose=2,transpose=2'); break;
                        }
                        await new Promise((resolve, reject) => {
                            command.output(tempOutput).on('end', resolve).on('error', reject).run();
                        });
                        const videoData = Buffer.from(fs.readFileSync(tempOutput));
                        const messageOptions = { video: videoData };
                        if (mediaType === 'documentMessage') {
                            const originalDoc = quoted.documentMessage;
                            messageOptions.document = videoData;
                            messageOptions.mimetype = originalDoc.mimetype || 'video/mp4';
                            messageOptions.fileName = originalDoc.fileName || `rotated_video${fileExtension}`;
                            delete messageOptions.video;
                        }
                        await sock.sendMessage(msg.key.remoteJid, messageOptions);
                        cleanupFile(tempOutput);
                    } 
                    // IMAGE/STICKER ROTATION
                    else if (mediaType === 'imageMessage' || mediaType === 'stickerMessage' || (mediaType === 'documentMessage' && fileExtension.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i))) {
                        let sharpInstance = sharp(tempInput);
                        switch (rotation) {
                            case 'left': sharpInstance = sharpInstance.rotate(-90); break;
                            case 'right': sharpInstance = sharpInstance.rotate(90); break;
                            case '180': sharpInstance = sharpInstance.rotate(180); break;
                        }
                        await sharpInstance.toFile(tempOutput);
                        if (mediaType === 'stickerMessage') {
                            const stickerWithExif = await addExif(tempOutput);
                            const stickerData = fs.readFileSync(stickerWithExif);
                            await sock.sendMessage(msg.key.remoteJid, { sticker: stickerData });
                            cleanupFile(stickerWithExif);
                        } else {
                            const imageData = Buffer.from(fs.readFileSync(tempOutput));
                            const messageOptions = { image: imageData };
                            if (mediaType === 'documentMessage') {
                                const originalDoc = quoted.documentMessage;
                                messageOptions.document = imageData;
                                messageOptions.mimetype = originalDoc.mimetype || 'image/jpeg';
                                messageOptions.fileName = originalDoc.fileName || `rotated_image${fileExtension}`;
                                delete messageOptions.image;
                            }
                            await sock.sendMessage(msg.key.remoteJid, messageOptions);
                        }
                        cleanupFile(tempOutput);
                    } else {
                        return sock.sendMessage(msg.key.remoteJid, { text: "_Unsupported file type_" });
                    }
                    cleanupFile(tempInput);
                } catch (error) {
                    console.error("Rotate Error:", error);
                    await sock.sendMessage(msg.key.remoteJid, { text: "_Failed to rotate media_" });
                    cleanupFile(tempInput);
                    cleanupFile(tempOutput);
                }
            } catch (error) {
                console.error("Rotate Plugin Error:", error);
                await sock.sendMessage(msg.key.remoteJid, { text: "_Failed to process rotation_" });
            }
        }
    },
    {
        name: "image",
        desc: "Convert static sticker to PNG image",
        utility: "media",
        fromMe: false,
        execute: async (sock, msg) => {
          try {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted) return sock.sendMessage(msg.key.remoteJid, { text: "_Reply to a sticker_" });
            if (!quoted.stickerMessage) return sock.sendMessage(msg.key.remoteJid, { text: "_Reply to a sticker_" });
            if (isAnimatedSticker(quoted.stickerMessage))
              return sock.sendMessage(msg.key.remoteJid, { text: "_This is an animated sticker. Use .video instead_" });
            const mediaData = await dlMedia({ message: { stickerMessage: quoted.stickerMessage } }, sock, "both");
            if (!mediaData) return sock.sendMessage(msg.key.remoteJid, { text: "_Failed to download sticker_" });
            const { path: tempInput } = mediaData;
            const tempOutput = path.join(TMP_DIR, `${randomUUID()}_image.png`);
            try {
              await sharp(tempInput).png().toFile(tempOutput);
              const imageData = Buffer.from(fs.readFileSync(tempOutput));
              await sock.sendMessage(msg.key.remoteJid, { image: imageData });
              cleanupFile(tempInput);
              cleanupFile(tempOutput);
            } catch (error) {
              console.error("Image conversion Error:", error);
              await sock.sendMessage(msg.key.remoteJid, { text: "_Failed to convert sticker_" });
              cleanupFile(tempInput);
              cleanupFile(tempOutput);
            }
          } catch (error) {
            console.error("Image Plugin Error:", error);
            await sock.sendMessage(msg.key.remoteJid, { text: "_Failed to process conversion_" });
          }
        }
    },
    {
        name: "video",
        desc: "Convert animated sticker to video",
        utility: "media",
        fromMe: false,
        execute: async (sock, msg) => {
          try {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quoted) return sock.sendMessage(msg.key.remoteJid, { text: "_Reply to an animated sticker_" });
            if (!quoted.stickerMessage) return sock.sendMessage(msg.key.remoteJid, { text: "_Reply to a sticker_" });
            if (!isAnimatedSticker(quoted.stickerMessage))
              return sock.sendMessage(msg.key.remoteJid, { text: "_This is a static sticker. Use .image instead_" });
            const mediaData = await dlMedia({ message: { stickerMessage: quoted.stickerMessage } }, sock, "both");
            if (!mediaData) return sock.sendMessage(msg.key.remoteJid, { text: "_Failed to download sticker_" });
            const { path: tempInput } = mediaData;
            const tempOutput = path.join(TMP_DIR, `${randomUUID()}_video.mp4`);
            try {
              await webpToMp4(tempInput, tempOutput);
              const videoData = Buffer.from(fs.readFileSync(tempOutput));
              await sock.sendMessage(msg.key.remoteJid, { video: videoData });
              cleanupFile(tempInput);
              cleanupFile(tempOutput);
            } catch (error) {
              console.error("Video conversion Error:", error);
              await sock.sendMessage(msg.key.remoteJid, { text: "_Could not convert animated sticker to video_" });
              cleanupFile(tempOutput);
            }
          } catch (error) {
            console.error("Video Plugin Error:", error);
            await sock.sendMessage(msg.key.remoteJid, { text: "_Failed to process conversion_" });
          }
        }
    },

    {
        name: "spotify",
        scut: "sp",
        desc: "Download music from Spotify (via FabDL)",
        utility: "media",
        fromMe: false,

        execute: async (sock, msg, args) => {
            const trackUrl = args[0];
            if (!trackUrl || !trackUrl.includes("spotify.com/")) {
                await sock.sendMessage(
                    msg.key.remoteJid,
                    { text: "_Provide a valid Spotify track URL._" },
                    { quoted: msg }
                );
                return;
            }

            try {
                const data = await spotifyDl(trackUrl);
                await sock.sendMessage(msg.key.remoteJid, { text: `🎵 ${data.title}` }, { quoted: msg });

                const tmpPath = path.join(__dirname, `../media/tmp/${Date.now()}.mp3`);
                const res = await axios.get(data.url, { responseType: "arraybuffer" });
                fs.writeFileSync(tmpPath, res.data);

                await sock.sendMessage(
                    msg.key.remoteJid,
                    {
                        audio: fs.readFileSync(tmpPath),
                        mimetype: "audio/mpeg",
                        fileName: `${data.title}.mp3`
                    },
                    { quoted: msg }
                );

                fs.unlinkSync(tmpPath);
            } catch (err) {
                await sock.sendMessage(
                    msg.key.remoteJid,
                    { text: "_Failed to download the track._" },
                    { quoted: msg }
                );
            }
        }
    }
];