const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

/**
 * Utility functions for ManjiBot
 */
class Utils {
    constructor() {
        this.tempDir = path.join(__dirname, '..', 'temp');
        this.ensureTempDir();
    }

    /**
     * Ensure temp directory exists
     */
    ensureTempDir() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Download media from WhatsApp message (compatible with Lixon bot logic)
     */
    async downloadMedia(msg, returnType = "path") {
        try {
            let mediaMessage = null, mediaType = null;
            const mediaTypes = ["sticker", "image", "video", "audio", "document"];

            // Check direct message
            for (const type of mediaTypes) {
                if (msg.message?.[`${type}Message`]) {
                    mediaMessage = msg.message[`${type}Message`];
                    mediaType = type;
                    break;
                }
            }

            // Check quoted message
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!mediaMessage && quoted) {
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
            const buffer = await this.streamToBuffer(stream);
            
            if (returnType === "buffer") return buffer;
            
            const ext = { image: "jpg", video: "mp4", sticker: "webp", audio: "mp3", document: "bin" }[mediaType];
            const tempFile = path.join(this.tempDir, `input_${Date.now()}.${ext}`);
            fs.writeFileSync(tempFile, buffer);

            if (returnType === "both") return { path: tempFile, buffer, type: mediaType };
            return tempFile;

        } catch (err) {
            console.error("❌ Error downloading media:", err);
            return null;
        }
    }

    /**
     * Convert stream to buffer
     */
    streamToBuffer(stream) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            stream.on("data", chunk => chunks.push(chunk));
            stream.on("end", () => resolve(Buffer.concat(chunks)));
            stream.on("error", reject);
        });
    }

    /**
     * Download file from URL
     */
    async downloadFromUrl(url, fileName = null) {
        try {
            const response = await axios({
                method: 'GET',
                url: url,
                responseType: 'arraybuffer'
            });

            const buffer = Buffer.from(response.data);

            if (fileName) {
                const filePath = path.join(this.tempDir, fileName);
                fs.writeFileSync(filePath, buffer);
                return filePath;
            }

            return buffer;
        } catch (error) {
            console.error('❌ Failed to download from URL:', error);
            return null;
        }
    }

    /**
     * Convert image/video to WebP format (Lixon bot compatible)
     */
    async toWebp(inputPath) {
        try {
            const ext = path.extname(inputPath).toLowerCase();
            const outputPath = path.join(this.tempDir, `sticker_${Date.now()}.webp`);

            // Pre-process images with Jimp for better quality
            if ([".jpg", ".jpeg", ".png"].includes(ext)) {
                const Jimp = require('jimp');
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
        } catch (error) {
            console.error('❌ Failed to convert to WebP:', error);
            return null;
        }
    }

    /**
     * Convert video to WebP (animated sticker)
     */
    async videoToWebp(inputPath, outputPath = null) {
        return new Promise((resolve, reject) => {
            if (!outputPath) {
                outputPath = path.join(this.tempDir, `animated_${Date.now()}.webp`);
            }

            ffmpeg(inputPath)
                .outputOptions([
                    '-vcodec', 'libwebp',
                    '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=white@0.0',
                    '-loop', '0',
                    '-preset', 'default',
                    '-an',
                    '-vsync', '0',
                    '-s', '512:512'
                ])
                .toFormat('webp')
                .on('end', () => resolve(outputPath))
                .on('error', (error) => {
                    console.error('❌ Failed to convert video to WebP:', error);
                    reject(error);
                })
                .save(outputPath);
        });
    }

    /**
     * Add EXIF data to sticker (Lixon bot compatible)
     */
    async addExif(webpPath, pack = 'ManjiBot', publisher = 'manjisama') {
        try {
            const webp = require('node-webpmux');
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
        } catch (error) {
            console.error('❌ Failed to add EXIF data:', error);
            return webpPath; // Return original if EXIF fails
        }
    }

    /**
     * Create sticker from image/video
     */
    async createSticker(inputPath, packName, authorName) {
        try {
            let webpPath;

            // Check if input is video or image
            const ext = path.extname(inputPath).toLowerCase();
            if (['.mp4', '.mov', '.avi', '.webm'].includes(ext)) {
                webpPath = await this.videoToWebp(inputPath);
            } else {
                webpPath = await this.toWebp(inputPath);
            }

            if (!webpPath) return null;

            // Add EXIF data
            const stickerPath = await this.addExif(webpPath, packName, authorName);

            // Read as buffer
            const buffer = fs.readFileSync(stickerPath);

            // Cleanup temp files
            this.cleanup([inputPath, webpPath, stickerPath]);

            return buffer;
        } catch (error) {
            console.error('❌ Failed to create sticker:', error);
            return null;
        }
    }

    /**
     * Get image/video dimensions
     */
    async getDimensions(filePath) {
        try {
            const metadata = await sharp(filePath).metadata();
            return {
                width: metadata.width,
                height: metadata.height
            };
        } catch (error) {
            console.error('❌ Failed to get dimensions:', error);
            return null;
        }
    }

    /**
     * Resize image
     */
    async resizeImage(inputPath, width, height, outputPath = null) {
        try {
            if (!outputPath) {
                outputPath = path.join(this.tempDir, `resized_${Date.now()}.jpg`);
            }

            await sharp(inputPath)
                .resize(width, height, {
                    fit: 'contain',
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                })
                .jpeg({ quality: 90 })
                .toFile(outputPath);

            return outputPath;
        } catch (error) {
            console.error('❌ Failed to resize image:', error);
            return null;
        }
    }

    /**
     * Extract audio from video
     */
    async extractAudio(videoPath, outputPath = null) {
        return new Promise((resolve, reject) => {
            if (!outputPath) {
                outputPath = path.join(this.tempDir, `audio_${Date.now()}.mp3`);
            }

            ffmpeg(videoPath)
                .output(outputPath)
                .noVideo()
                .audioCodec('mp3')
                .on('end', () => resolve(outputPath))
                .on('error', (error) => {
                    console.error('❌ Failed to extract audio:', error);
                    reject(error);
                })
                .run();
        });
    }

    /**
     * Convert audio to voice note format
     */
    async toVoiceNote(audioPath, outputPath = null) {
        return new Promise((resolve, reject) => {
            if (!outputPath) {
                outputPath = path.join(this.tempDir, `voice_${Date.now()}.ogg`);
            }

            ffmpeg(audioPath)
                .output(outputPath)
                .audioCodec('libopus')
                .audioChannels(1)
                .audioFrequency(48000)
                .audioBitrate('64k')
                .format('ogg')
                .on('end', () => resolve(outputPath))
                .on('error', (error) => {
                    console.error('❌ Failed to convert to voice note:', error);
                    reject(error);
                })
                .run();
        });
    }

    /**
     * Generate random string
     */
    randomString(length = 10) {
        return Math.random().toString(36).substring(2, length + 2);
    }

    /**
     * Format file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Format duration
     */
    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }

    /**
     * Clean up temporary files
     */
    cleanup(files = []) {
        files.forEach(file => {
            if (file && fs.existsSync(file)) {
                try {
                    fs.unlinkSync(file);
                } catch (error) {
                    console.error(`❌ Failed to cleanup file ${file}:`, error);
                }
            }
        });
    }

    /**
     * Get EXIF data from sticker
     */
    async getExif(file) {
        try {
            const webp = require('node-webpmux');
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

    /**
     * Clean up old temp files
     */
    cleanupOldFiles(maxAge = 3600000) { // 1 hour default
        try {
            const files = fs.readdirSync(this.tempDir);
            const now = Date.now();

            files.forEach(file => {
                const filePath = path.join(this.tempDir, file);
                const stats = fs.statSync(filePath);
                
                if (now - stats.mtime.getTime() > maxAge) {
                    fs.unlinkSync(filePath);
                }
            });
        } catch (error) {
            console.error('❌ Failed to cleanup old files:', error);
        }
    }

    /**
     * Sleep/delay function
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Check if URL is valid
     */
    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    /**
     * Get file extension from URL
     */
    getFileExtension(url) {
        try {
            const pathname = new URL(url).pathname;
            return path.extname(pathname).toLowerCase();
        } catch (_) {
            return '';
        }
    }
}

// Export singleton instance
module.exports = new Utils();