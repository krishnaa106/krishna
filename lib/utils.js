
const fs = require("fs");
const path = require("path");
const Jimp = require("jimp");
const sharp = require("sharp");
const axios = require("axios");
const mime = require("mime-types");
const webp = require("node-webpmux");
const unzipper = require("unzipper");
const ffmpeg = require("fluent-ffmpeg");
const { exec } = require("child_process");
const { downloadContentFromMessage, downloadMediaMessage } = require("@whiskeysockets/baileys");
require("dotenv").config({ path: path.join(__dirname, "../config.env") });
const envPath = path.join(__dirname, "../config.env");

// Directories containing plugin commands
const pluginDirs = [
    path.join(__dirname, "../plugins"),
    path.join(__dirname, "../eplugin")
];

const [packname, author] = process.env.STICKER_PACK?.split(",") || ["", "manjisama"];

const TMP_DIR = path.join(__dirname, "../media/tmp");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// Default sticker crop settings
let stickerSize = {
    ratio: "1:1",           // Aspect ratio (e.g., 1:1, 9:16, or "0" for free)
    placement: "center",    // top, center, bottom
    frame: null             // frame image file (null or "frame1", "frame2", etc.)
};

/**
 * Get current sticker crop settings
 * @returns {{ ratio: string, placement: string, frame: string | null }}
 */
const getStickerSize = () => stickerSize;

/**
 * Set sticker crop settings
 * @param {string} ratio
 * @param {string} placement
 * @param {string} [frame=null]
 */
const setStickerSize = (ratio, placement = "_", frame = null) => {
    stickerSize = { ratio, placement, frame };
};

/**
 * @param {string} imagePath - Path to the image file.
 * @returns {Promise<string>} - Path to the new image with frame overlay applied.
 */
const addFrame = async (imagePath) => {
    const { frame } = getStickerSize();
    if (!frame) return imagePath;

    const framePath = path.join(__dirname, "..", "media", "assets", `${frame}.webp`);
    if (!fs.existsSync(framePath)) {
        console.warn(`⚠️ Frame not found: ${framePath}`);
        return imagePath;
    }

    try {
        const resultPath = path.join(__dirname, '..', 'media', 'tmp', `framed_${Date.now()}.webp`);

        await sharp(imagePath)
            .resize(512, 512, {
                fit: "contain",
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .composite([{ input: framePath, blend: 'over' }])
            .toFile(resultPath);

        return resultPath;
    } catch (err) {
        console.error("❌ Error applying frame overlay:", err);
        return imagePath;
    }
};




/**
 * Update or add an environment variable in config.env
 * @param {string} key - The environment variable name.
 * @param {string|null} value - The value to set (or null to remove the key).
 */
function updateEnv(key, value) {
    if (!fs.existsSync(envPath)) {
        fs.writeFileSync(envPath, ""); // create empty if not exist
    }

    let envData = fs.readFileSync(envPath, "utf8").split("\n");
    let found = false;

    envData = envData.map(line => {
        if (line.trim().startsWith(`${key}=`)) {
            found = true;
            return value === null ? null : `${key}=${value}`;
        }
        return line;
    }).filter(Boolean); // remove null lines

    if (!found && value !== null) {
        envData.push(`${key}=${value}`);
    }

    fs.writeFileSync(envPath, envData.join("\n"));
    process.env[key] = value; // Update in current runtime
}




/**
 * Fetch image URLs from Pinterest via API
 * @param {string} query - Search term
 * @param {number} count - Number of images to fetch
 * @param {string} pinApi - Pinterest API URL from env
 * @returns {Promise<string[]>}
 */
const fetchPinterestImages = async (query, count, pinApi) => {
    try {
        const response = await axios.post(pinApi, {
            input: query,
            desiredCount: count
        });

        if (response.data.success && response.data.data.length) {
            return response.data.data;
        }

        return [];
    } catch (err) {
        console.error("❌ Error fetching Pinterest images:", err);
        return [];
    }
};

/**
 * Crop an image file to a specific ratio and placement
 * @param {string} filePath - Path to input image
 * @param {string} ratio - Ratio like "1:1", or "0" for free size
 * @param {string} placement - "top", "center", "bottom"
 * @returns {Promise<string>} - Path to cropped image
 */
const csImg = async (filePath, ratio, placement) => {
    try {
        if (ratio === "0") {
            return filePath; // Free size mode: skip cropping
        }

        const [widthRatio, heightRatio] = ratio.split(":").map(Number);
        const image = sharp(filePath);
        const metadata = await image.metadata();

        let cropWidth, cropHeight, left, top;

        // Calculate crop dimensions
        if (metadata.width / widthRatio > metadata.height / heightRatio) {
            cropHeight = metadata.height;
            cropWidth = Math.round((metadata.height / heightRatio) * widthRatio);
        } else {
            cropWidth = metadata.width;
            cropHeight = Math.round((metadata.width / widthRatio) * heightRatio);
        }

        // Calculate crop position
        if (placement === "top") {
            left = metadata.width > metadata.height
                ? 0
                : Math.floor((metadata.width - cropWidth) / 2);
            top = 0;
        } else if (placement === "bottom") {
            left = metadata.width > metadata.height
                ? metadata.width - cropWidth
                : Math.floor((metadata.width - cropWidth) / 2);
            top = metadata.height - cropHeight;
        } else {
            // center
            left = Math.floor((metadata.width - cropWidth) / 2);
            top = Math.floor((metadata.height - cropHeight) / 2);
        }

        const outputFilePath = filePath.replace(/\.(\w+)$/, "_cropped.$1");

        await image
            .extract({ left, top, width: cropWidth, height: cropHeight })
            .toFile(outputFilePath);

        return outputFilePath;
    } catch (err) {
        console.error("❌ Error cropping image:", err);
        return filePath; // fallback to original image
    }
};



// Media Download Functions
async function downloadUrl(url, customPath = null) {
    try {
        const extension = url.split(".").pop().toLowerCase();
        const validExtensions = ["jpg", "jpeg", "png", "gif", "webp"];
        if (!validExtensions.includes(extension)) throw new Error("Unsupported file type.");

        const fileName = `media_${Date.now()}.${extension}`;
        const filePath = customPath
            ? path.resolve(customPath) // use the full path passed
            : path.join(TMP_DIR, fileName); // default to TMP_DIR

        const response = await axios.get(url, { responseType: "arraybuffer" });
        fs.writeFileSync(filePath, Buffer.from(response.data));

        return filePath;
    } catch (err) {
        console.error("❌ Error downloading URL:", url, err);
        throw new Error("Download failed.");
    }
}


function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", chunk => chunks.push(chunk));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
    });
}

/**
 * Downloads a file from URL to /media/tmp/ folder
 * @param {string} url
 * @param {string} ext - e.g. '.mp4'
 * @returns {Promise<string>} - Full path to downloaded file
 */
async function dlVdoLink(url, ext = ".mp4") {
  const res = await axios.get(url, { responseType: "stream" });
  const tmpPath = path.join(__dirname, "..", "media", "tmp", `${Date.now()}${ext}`);
  const writer = fs.createWriteStream(tmpPath);

  await new Promise((resolve, reject) => {
    res.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });

  return tmpPath;
}


/**
 * Downloads any WhatsApp media (quoted or direct).
 * @param {Object} msg - The Baileys message object.
 * @param {Object} sock - The WhatsApp socket client.
 * @param {('path'|'buffer'|'both')} returnType - How to return the media.
 * @returns {Promise<string|Buffer|{path: string, buffer: Buffer, type: string, mime: string}>}
 */
async function dlMedia(msg, sock, returnType = "path") {
    try {
        // If it's a quoted message, grab the quoted message object
        const isQuoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const targetMsg = isQuoted ? {
            ...msg,
            message: msg.message.extendedTextMessage.contextInfo.quotedMessage
        } : msg;

        const buffer = await downloadMediaMessage(
            targetMsg,
            "buffer",
            {},
            { reuploadRequest: sock.updateMediaMessage }
        );

        if (!buffer) return null;

        // Try to find the MIME type and extension
        const allKeys = Object.keys(targetMsg.message || {});
        const mediaContent = targetMsg.message?.[allKeys[0]];
        const mimetype = mediaContent?.mimetype || "application/octet-stream";
        const ext = mime.extension(mimetype) || "bin";
        const filename = `media_${Date.now()}.${ext}`;
        const filepath = path.join(TMP_DIR, filename);

        if (returnType === "buffer") return buffer;

        fs.writeFileSync(filepath, buffer);

        if (returnType === "both") {
            return {
                path: filepath,
                buffer,
                mime: mimetype,
                ext,
                type: allKeys[0]
            };
        }

        return filepath;

    } catch (err) {
        console.error("❌ dlMedia error:", err);
        return null;
    }
}

/**
 * Stars or unstars a specific message in a WhatsApp chat.
 *
 * @param {import('@whiskeysockets/baileys').WASocket} sock - The active Baileys socket instance.
 * @param {string} jid - The JID (chat ID) of the message (e.g., '12345@s.whatsapp.net' or group ID).
 * @param {string} msgId - The message ID to be starred or unstarred.
 * @param {boolean} fromMe - Whether the message was sent by the bot (true) or received (false).
 * @param {boolean} [star=true] - Set to true to star the message, or false to unstar it.
 * @returns {Promise<boolean>} Returns true if the operation was successful, false otherwise.
 */
async function starMsg(sock, jid, msgId, fromMe, star = true) {
  try {
    await sock.chatModify({
      star: {
        messages: [
          {
            id: msgId,
            fromMe: fromMe
          }
        ],
        star: star
      }
    }, jid);
    return true;
  } catch (err) {
    console.error("Star/Unstar Error:", err);
    return false;
  }
}



/**
 * 
 * @param {object} msg - The WhatsApp message object
 * @param {"path"|"buffer"|"both"} returnType - What to return: file path (default), buffer, or both
 * @returns {string|Buffer|{path: string, buffer: Buffer, type: string}|null}
 */
async function downloadMedia(msg, returnType = "path") {
    try {
        let mediaMessage = null, mediaType = null;
        const mediaTypes = ["sticker", "image", "video", "audio", "document"];

        for (const type of mediaTypes) {
            if (msg.message?.[`${type}Message`]) {
                mediaMessage = msg.message[`${type}Message`];
                mediaType = type;
                break;
            }
        }

        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (quoted) {
            for (const type of mediaTypes) {
                if (quoted?.[`${type}Message`]) {
                    mediaMessage = quoted[`${type}Message`];
                    mediaType = type;
                    break;
                }
            }
        }

        if (!mediaMessage || !mediaType) return null;

        const stream = await downloadContentFromMessage(mediaMessage, mediaType);
        const buffer = await streamToBuffer(stream);
        const ext = { image: "jpg", video: "mp4", sticker: "webp", audio: "mp3", document: "bin" }[mediaType];
        const tempFile = path.join(TMP_DIR, `input_${Date.now()}.${ext}`);

        if (returnType !== "buffer") {
            fs.writeFileSync(tempFile, buffer);
        }

        if (returnType === "buffer") return buffer;
        if (returnType === "both") return { path: tempFile, buffer, type: mediaType };
        return tempFile; 

    } catch (err) {
        console.error("❌ Error downloading media:", err);
        return null;
    }
}



/**
 * Get original video height & width
 */
function getVideoDimensions(inputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(inputPath, (err, metadata) => {
            if (err) return reject(err);
            const stream = metadata.streams.find(s => s.height && s.width);
            if (!stream) return reject("No video stream found.");
            resolve({ height: stream.height, width: stream.width });
        });
    });
}
/**
 * Full control video cropper using ffmpeg with optional FPS control
 * 
 * @param {string} inputPath - Video file input
 * @param {string|null} outputPath - Where to save the cropped video (or null to just return size)
 * @param {object} options - Cropping options
 * @param {number} [options.cropHeight] - Height of the cropped area
 * @param {number} [options.cropWidth] - Width of the cropped area
 * @param {number} [options.x] - X offset from left
 * @param {number} [options.y] - Y offset from top
 * @param {object} [options.resizeTo] - Optional: { height, width } for resizing
 * @param {number} [options.fps] - Optional: override video FPS
 * @param {boolean} [options.justGetSize] - If true, skips cropping and returns dimensions only
 * @returns {Promise<{ height: number, width: number, output?: string }>}
 */
async function cropVid(inputPath, outputPath, options = {}) {
    const {
        cropHeight,
        cropWidth,
        x,
        y,
        resizeTo,
        fps,
        justGetSize
    } = options;

    const { height: videoHeight, width: videoWidth } = await getVideoDimensions(inputPath);

    if (justGetSize || !outputPath) {
        return { height: videoHeight, width: videoWidth };
    }

    if (!cropWidth || !cropHeight) {
        throw new Error("cropWidth and cropHeight are required unless 'justGetSize' is true.");
    }

    const cropX = typeof x === "number" ? x : Math.floor((videoWidth - cropWidth) / 2);
    const cropY = typeof y === "number" ? y : Math.floor((videoHeight - cropHeight) / 2);

    const filters = [`crop=${cropWidth}:${cropHeight}:${cropX}:${cropY}`];

    if (resizeTo?.height && resizeTo?.width) {
        filters.push(`scale=${resizeTo.width}:${resizeTo.height}`);
    }

    if (fps) {
        filters.push(`fps=${fps}`);
    }

    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .videoFilters(filters)
            .on("end", () => resolve({
                height: videoHeight,
                width: videoWidth,
                output: outputPath
            }))
            .on("error", reject)
            .save(outputPath);
    });
}


//WEBP CONVERTER
async function toWebp(inputPath) {
    const ext = path.extname(inputPath).toLowerCase();
    const outputPath = path.join(TMP_DIR, `sticker_${Date.now()}.webp`);

    if ([".jpg", ".jpeg", ".png"].includes(ext)) {
        const image = await Jimp.read(inputPath);
        await image.resize(512, Jimp.AUTO).writeAsync(inputPath);
    }

    return new Promise((resolve, reject) => {
        const cmd = ffmpeg(inputPath)
            .outputOptions([
                "-vcodec", "libwebp",
                "-vf", ext === ".mp4"
                    ? "scale=iw*min(512/iw\\,512/ih):ih*min(512/iw\\,512/ih),pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0.0,fps=15"
                    : "scale=iw*min(512/iw\\,512/ih):ih*min(512/iw\\,512/ih),pad=512:512:(ow-iw)/2:(oh-ih)/2:0x00000000,fps=15",
                "-lossless", "1",
                "-pix_fmt", "yuva420p",
                "-preset", "default",
                "-loop", "0",
                "-an", "-vsync", "0"
            ])
            .on("end", () => resolve(outputPath))
            .on("error", reject)
            .save(outputPath);

        if (ext === ".mp4") cmd.inputOptions(["-t", "5"]);
    });
}

async function addExif(webpPath, pack = packname, publisher = author) {
    const img = new webp.Image();

    const exifData = {
        "sticker-pack-id": "https://github.com/manjisama1",
        "sticker-pack-name": pack,
        "sticker-pack-publisher": publisher,
        "emojis": ["🔫,💛"]
    };

    const exifAttr = Buffer.from([
        0x49, 0x49, 0x2A, 0x00,
        0x08, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x41, 0x57,
        0x07, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x16, 0x00,
        0x00, 0x00
    ]);

    const jsonBuffer = Buffer.from(JSON.stringify(exifData), "utf-8");
    const exif = Buffer.concat([exifAttr, jsonBuffer]);
    exif.writeUIntLE(jsonBuffer.length, 14, 4);

    await img.load(webpPath);
    img.exif = exif;
    await img.save(webpPath); 

    return webpPath;
    
    
}

/**
 * Extracts EXIF metadata from a WebP sticker file.
 * 
 * @param {string} file - Path to the WebP file
 * @returns {Promise<{
*   packId: string,
*   packname: string,
*   author: string,
*   emojis: string
* } | null>} - EXIF data if present, otherwise null
*/
async function getExif(file) {
 try {
   const img = new webp.Image();
   await img.load(file);

   if (!img.exif) return null;

   const rawExif = img.exif.toString();

   try {
     const exifJson = JSON.parse(rawExif.match(/{.*}/s)[0]);

     return {
       packId: exifJson['sticker-pack-id'] || 'Unknown',
       packname: exifJson['sticker-pack-name'] || 'Unknown',
       author: exifJson['sticker-pack-publisher'] || 'Unknown',
       emojis: exifJson['emojis']?.length ? exifJson['emojis'].join(', ') : 'None',
     };
   } catch (err) {
     return null;
   }

 } catch (error) {
   console.error('Exif extraction error:', error);
   return null;
 }
}

/*
using new logic to register auto sticker capture
*/

// let atakeTargetChat = null;
// const stickerQueue = [];
// let isProcessing = false;

// async function toggleAtake(client, m, args) {
//     const chatId = m.key.remoteJid;
//     const arg = args[0]?.toLowerCase();

//     if (!arg || !["on", "off"].includes(arg)) {
//         await client.sendMessage(chatId, { text: "_*Usage:* `.atake on/off`_" });
//         return { isFallback: true };
//     }

//     atakeTargetChat = arg === "on" ? chatId : null;
//     await client.sendMessage(chatId, { text: `_Auto take is now ${arg}!_` });
// }

// async function processStickerQueue() {
//     if (isProcessing || stickerQueue.length === 0) return;
//     isProcessing = true;

//     const { client, msg } = stickerQueue.shift();

//     try {
//         const mime = msg.message.stickerMessage.mimetype;
//         const isWebp = mime === "image/webp";

//         const filePath = await dlMedia(msg, "path");
//         if (!filePath) return;

//         let webpPath;

//         if (isWebp) {
//             webpPath = path.join(TMP_DIR, `sticker_${Date.now()}.webp`);
//             fs.copyFileSync(filePath, webpPath);
//         } else {
//             webpPath = await toWebp(filePath);
//         }

//         const finalSticker = await addExif(webpPath);
//         const buffer = fs.readFileSync(finalSticker);

//         await client.sendMessage(atakeTargetChat, { sticker: buffer });

//         if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
//         if (fs.existsSync(webpPath)) fs.unlinkSync(webpPath);

//     } catch (err) {
//         console.error("❌ Error in auto sticker capture:", err);
//     } finally {
//         isProcessing = false;
//         setTimeout(processStickerQueue, 300);
//     }
// }

// async function stickerHandler(client, msg) {
//     if (!atakeTargetChat || !msg.message?.stickerMessage || msg.key.fromMe) return;

//     stickerQueue.push({ client, msg });
//     processStickerQueue();
// }

// ZIP Sticker Functions

async function webmToWebp(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        const cmd = `ffmpeg -i "${inputPath}" -vf "scale=w=512:h=512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white@0,fps=15" -c:v libwebp -lossless 1 -qscale 80 -preset default -loop 0 -an -vsync 0 -t 6 -y "${outputPath}"`;

        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error("❌ FFmpeg error:", stderr);
                reject(error);
            } else {
                resolve(outputPath);
            }
        });
    });
}

async function extractStkZip(zipPath, outputDir) {
    return new Promise((resolve, reject) => {
        fs.createReadStream(zipPath)
            .pipe(unzipper.Parse())
            .on("entry", entry => entry.type === "File" && entry.path.endsWith(".webp")
                ? entry.pipe(fs.createWriteStream(path.join(outputDir, path.basename(entry.path))))
                : entry.autodrain())
            .on("close", () => { fs.unlinkSync(zipPath); resolve(); })
            .on("error", reject);
    });
}

async function processZipStk(client, msg, addExif, shouldStopFn) {
    try {
        const files = fs.readdirSync(TMP_DIR).filter(f => f.endsWith(".webp"));
        if (!files.length) {
            return client.sendMessage(msg.key.remoteJid, { text: "❌ No .webp files found!" });
        }

        for (const file of files) {
            if (shouldStopFn?.()) {
                await client.sendMessage(msg.key.remoteJid, { text: "_Stopped ZIP sticker process!_" });
                break;
            }

            const filePath = path.join(TMP_DIR, file);
            if (!fs.existsSync(filePath)) continue;

            const modifiedPath = await addExif(filePath);
            const stickerBuffer = fs.readFileSync(modifiedPath);

            await client.sendMessage(msg.key.remoteJid, { sticker: stickerBuffer });

            fs.unlinkSync(filePath);
        }
    } catch (err) {
        console.error("❌ Error processing stickers:", err);
        await client.sendMessage(msg.key.remoteJid, { text: "❌ Failed to send stickers!" });
    }
}




/**
 * Loads all commands from plugin directories
 * @returns {Array<Object>} Array of command objects
 */
function getAllCommands() {
    let allCommands = [];

    pluginDirs.forEach(dir => {
        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));

            for (const file of files) {
                try {
                    const plugin = require(path.join(dir, file));
                    if (Array.isArray(plugin)) {
                        allCommands.push(...plugin);
                    }
                } catch (e) {
                    console.error(`❌ Error loading ${file}:`, e.message);
                }
            }
        }
    });

    return allCommands;
}

/**
 * Checks whether a command by name exists
 * @param {string} cmd
 * @returns {boolean}
 */
function commandExists(cmd) {
    return getAllCommands().some(c => c.name?.toLowerCase() === cmd.toLowerCase());
}

function extractText(msg) {
  const getTextFromContent = (content = {}) => {
    if (content.conversation) return content.conversation;
    if (content.extendedTextMessage?.text) return content.extendedTextMessage.text;
    if (content.imageMessage?.caption) return content.imageMessage.caption;
    if (content.videoMessage?.caption) return content.videoMessage.caption;
    if (content.documentMessage?.caption) return content.documentMessage.caption;
    if (content.audioMessage?.caption) return content.audioMessage.caption;
    if (content.stickerMessage?.caption) return content.stickerMessage.caption;
    if (content.buttonsMessage?.contentText) return content.buttonsMessage.contentText;
    if (content.listResponseMessage?.title) return content.listResponseMessage.title;
    if (content.templateButtonReplyMessage?.selectedDisplayText) return content.templateButtonReplyMessage.selectedDisplayText;
    if (content.reactionMessage?.text) return content.reactionMessage.text;
    return null;
  };

  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const main = msg.message;

  const textFromQuoted = getTextFromContent(quoted);
  const textFromMain = getTextFromContent(main);

  return textFromQuoted || textFromMain || null;
}




module.exports = {
    csImg,
    toWebp,
    dlMedia,
    addExif,
    cropVid,
    getExif,
    starMsg,
    addFrame,
    dlVdoLink,
    updateEnv,
    webmToWebp,
    extractText,
    downloadUrl,
    commandExists,
    downloadMedia,
    extractStkZip,
    processZipStk,
    getAllCommands,
    setStickerSize,
    getStickerSize,
    getVideoDimensions,
    fetchPinterestImages,
    TMP_DIR,
};