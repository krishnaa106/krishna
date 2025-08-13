const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const {
    dlMedia,
    toWebp,
    addExif,
    getExif,
    csImg,
    cropVid,
    downloadUrl,
    extractStkZip,
    processZipStk,
    getStickerSize,
    getVideoDimensions,
    TMP_DIR,
    cleanup
} = require("./utils");

/**
 * Convert media to sticker with EXIF data
 * @param {Object} client - WhatsApp client
 * @param {Object} msg - Message object
 * @param {string} [pack] - Sticker pack name
 * @param {string} [author] - Sticker author
 * @returns {Promise<Buffer|null>} Sticker buffer or null if failed
 */
async function createSticker(client, msg, pack, author) {
    let mediaFile = null;
    
    try {
        mediaFile = await dlMedia(msg, client, "path");
        if (!mediaFile) return null;

        const stickerFile = await toWebp(mediaFile);
        await addExif(stickerFile, pack, author);
        
        const buffer = fs.readFileSync(stickerFile);
        
        // Cleanup
        if (fs.existsSync(mediaFile)) fs.unlinkSync(mediaFile);
        if (fs.existsSync(stickerFile)) fs.unlinkSync(stickerFile);
        
        return buffer;
    } catch (err) {
        console.error("❌ Error creating sticker:", err);
        if (mediaFile && fs.existsSync(mediaFile)) fs.unlinkSync(mediaFile);
        return null;
    }
}

/**
 * Modify existing sticker with new EXIF data
 * @param {Object} client - WhatsApp client
 * @param {Object} msg - Message object
 * @param {string} [pack] - New pack name
 * @param {string} [author] - New author name
 * @returns {Promise<Buffer|null>} Modified sticker buffer or null if failed
 */
async function modifySticker(client, msg, pack, author) {
    let tempFile = null;
    
    try {
        tempFile = await dlMedia(msg, client, "path");
        if (!tempFile) return null;

        const newStickerPath = await addExif(tempFile, pack, author);
        const buffer = fs.readFileSync(newStickerPath);
        
        // Cleanup
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        
        return buffer;
    } catch (err) {
        console.error("❌ Error modifying sticker:", err);
        if (tempFile && fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        return null;
    }
}

/**
 * Create cropped sticker from media
 * @param {Object} client - WhatsApp client
 * @param {Object} msg - Message object
 * @returns {Promise<Buffer|null>} Cropped sticker buffer or null if failed
 */
async function createCroppedSticker(client, msg) {
    let file, cropped, webpPath;
    
    try {
        file = await dlMedia(msg, client, "path");
        if (!file) return null;

        const { ratio, placement } = getStickerSize();
        const isVideo = /\.(mp4|mov|webm)$/i.test(file);

        if (ratio === "0") {
            cropped = file;
        } else if (isVideo) {
            const [rw, rh] = ratio.split(":").map(Number);
            if (!rw || !rh) throw new Error("Invalid ratio");

            const outputPath = path.join(TMP_DIR, `${randomUUID()}_cropped.mp4`);
            const { width, height } = await getVideoDimensions(file);

            let cropW = width, cropH = Math.round((width * rh) / rw);
            if (cropH > height) {
                cropH = height;
                cropW = Math.round((height * rw) / rh);
            }

            const x = Math.floor((width - cropW) / 2);
            const y = placement === "bottom" ? height - cropH : 
                     placement === "center" ? Math.floor((height - cropH) / 2) : 0;

            await cropVid(file, outputPath, { cropWidth: cropW, cropHeight: cropH, x, y });
            cropped = outputPath;
        } else {
            cropped = await csImg(file, ratio, placement);
        }

        webpPath = await toWebp(cropped);
        const stickerPath = await addExif(webpPath);
        const buffer = fs.readFileSync(stickerPath);
        
        return buffer;
    } catch (err) {
        console.error("❌ Error creating cropped sticker:", err);
        return null;
    } finally {
        // Cleanup all temporary files
        for (const f of [file, cropped, webpPath]) {
            if (f && fs.existsSync(f)) fs.unlinkSync(f);
        }
    }
}

/**
 * Extract EXIF data from sticker
 * @param {Object} client - WhatsApp client
 * @param {Object} msg - Message object
 * @returns {Promise<Object|null>} EXIF data or null if failed
 */
async function extractStickerExif(client, msg) {
    let stickerFile = null;
    
    try {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted || !quoted.stickerMessage) return null;

        stickerFile = await dlMedia(msg, client, "path");
        if (!stickerFile) return null;

        const exif = await getExif(stickerFile);
        
        // Cleanup
        if (fs.existsSync(stickerFile)) fs.unlinkSync(stickerFile);
        
        return exif;
    } catch (err) {
        console.error("❌ Error extracting EXIF:", err);
        if (stickerFile && fs.existsSync(stickerFile)) fs.unlinkSync(stickerFile);
        return null;
    }
}

/**
 * Create stickers from URLs
 * @param {string[]} urls - Array of image URLs
 * @returns {Promise<Buffer[]>} Array of sticker buffers
 */
async function createStickersFromUrls(urls) {
    const stickers = [];
    
    for (const url of urls) {
        let file = null;
        try {
            file = await downloadUrl(url);
            const webp = await toWebp(file);
            const sticker = await addExif(webp);
            
            if (sticker) {
                const buffer = fs.readFileSync(sticker);
                stickers.push(buffer);
            }
        } catch (err) {
            console.error("❌ Error processing URL:", url, err);
        } finally {
            if (file && fs.existsSync(file)) fs.unlinkSync(file);
        }
    }
    
    return stickers;
}

/**
 * Process all WebP files in a directory and convert to stickers
 * @param {string} folderPath - Path to folder containing WebP files
 * @returns {Promise<Buffer[]>} Array of sticker buffers
 */
async function processWebpFolder(folderPath) {
    const stickers = [];
    
    try {
        if (!fs.existsSync(folderPath)) return stickers;
        
        const files = fs.readdirSync(folderPath).filter(f => f.endsWith(".webp"));
        
        for (const file of files) {
            const filePath = path.join(folderPath, file);
            
            try {
                await addExif(filePath); // Modifies file in-place
                const buffer = fs.readFileSync(filePath);
                stickers.push(buffer);
                
                // Delete processed file
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            } catch (err) {
                console.error(`❌ Failed processing: ${file}`, err);
            }
        }
    } catch (err) {
        console.error("❌ Error processing WebP folder:", err);
    }
    
    return stickers;
}

module.exports = {
    createSticker,
    modifySticker,
    createCroppedSticker,
    extractStickerExif,
    createStickersFromUrls,
    processWebpFolder
};