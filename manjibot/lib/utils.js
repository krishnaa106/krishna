const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

/**
 * Utility functions for ManjiBot
 */
class M {
    constructor() {
        this.tempDir = path.join(__dirname, '..', 'temp');
        this.ensureTempDir();
    }

    ensureTempDir() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    async downloadMedia(msg, returnType = "path") {
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

    streamToBuffer(stream) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            stream.on("data", chunk => chunks.push(chunk));
            stream.on("end", () => resolve(Buffer.concat(chunks)));
            stream.on("error", reject);
        });
    }

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

    async toWebp(inputPath) {
        try {
            const ext = path.extname(inputPath).toLowerCase();
            const outputPath = path.join(this.tempDir, `sticker_${Date.now()}.webp`);

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

    async addExif(webpPath, pack = '', publisher = '') {
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
            return webpPath;
        }
    }

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

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async sticker(msg, pack, author) {
        let mediaFile = null;

        try {
            mediaFile = await this.downloadMedia(msg, 'path');
            if (!mediaFile) return null;

            const { Config } = require('./config');
            const config = new Config();

            const stickerPack = pack || config.STICKER_PACK_NAME || '';
            const stickerAuthor = author || config.STICKER_AUTHOR || '';

            const ext = path.extname(mediaFile).toLowerCase();
            let stickerFile;

            if (ext === '.webp') {
                stickerFile = await this.addExif(mediaFile, stickerPack, stickerAuthor);
            } else {
                const webpFile = await this.toWebp(mediaFile);
                stickerFile = await this.addExif(webpFile, stickerPack, stickerAuthor);
            }

            const buffer = fs.readFileSync(stickerFile);

            this.cleanup([mediaFile, stickerFile]);

            return buffer;
        } catch (err) {
            console.error("❌ Error creating sticker:", err);
            if (mediaFile) this.cleanup([mediaFile]);
            return null;
        }
    }

    async exif(msg) {
        let stickerFile = null;

        try {
            stickerFile = await this.downloadMedia(msg, 'path');
            if (!stickerFile) return null;

            const exifData = await this.getExif(stickerFile);

            this.cleanup([stickerFile]);

            return exifData;
        } catch (err) {
            console.error("❌ Error extracting EXIF:", err);
            if (stickerFile) this.cleanup([stickerFile]);
            return null;
        }
    }

    menu(pluginManager, config, message) {
        const categories = pluginManager?.getCategories() || [];
        const totalCommands = pluginManager?.getCommandCount() || 0;
        const uptime = this.formatUptime(Date.now() - (global.startTime || Date.now()));

        let menuText = `╭───────────────
│     *𝐕𝐈𝐍𝐒𝐌𝐎𝐊𝐄*   
╰───────────────

┌─⊷ *BOT INFO*
│ • *Prefix:* ${config.PREFIX}
│ • *Mode:* ${config.BOT_MODE}
│ • *Uptime:* ${uptime}
│ • *Commands:* ${totalCommands}
└───────────────\n\n`;

        categories.forEach(cat => {
            const commands = pluginManager?.getCommandsByCategory(cat) || [];

            if (cat === 'admin' && !message.isSudo) return;

            menuText += `┌─⊷ *${cat.toUpperCase()} COMMANDS*\n`;

            commands.forEach(cmd => {
                menuText += `│ • ${config.PREFIX}${cmd.name}\n`;
            });

            menuText += '└───────────────\n\n';
        });

        menuText += `> Developed by manjisama`;

        return menuText;
    }

    initTracker() {
        this.trackers = new Map();
        this.trackerIdCounter = 1;
    }

    addTracker(filter = {}, action = {}) {
        if (!this.trackers) this.initTracker();

        const trackerId = this.trackerIdCounter++;

        const tracker = {
            id: trackerId,
            filter: {
                sender: filter.sender || null,
                chat: filter.chat || null,
                messageType: filter.messageType || null,
                content: filter.content || null,
                isGroup: filter.isGroup || null,
                isPrivate: filter.isPrivate || null,
                isSudo: filter.isSudo || null,
                ...filter
            },
            action: {
                react: action.react || null,
                reply: action.reply || null,
                forward: action.forward || null,
                log: action.log || false,
                callback: action.callback || null,
                ...action
            },
            enabled: true,
            created: Date.now()
        };

        this.trackers.set(trackerId, tracker);
        return trackerId;
    }

    removeTracker(trackerId) {
        if (!this.trackers) return false;
        return this.trackers.delete(trackerId);
    }

    toggleTracker(trackerId, enabled) {
        if (!this.trackers) return false;
        const tracker = this.trackers.get(trackerId);
        if (!tracker) return false;

        tracker.enabled = enabled;
        return true;
    }

    getTrackers() {
        if (!this.trackers) return [];
        return Array.from(this.trackers.values());
    }

    async processTrackers(client, message) {
        if (!this.trackers) return;

        for (const tracker of this.trackers.values()) {
            if (!tracker.enabled) continue;

            if (this.matchesFilter(message, tracker.filter)) {
                await this.executeAction(client, message, tracker.action);
            }
        }
    }

    matchesFilter(message, filter) {
        if (filter.sender && message.sender !== filter.sender) return false;
        if (filter.chat && message.chat !== filter.chat) return false;
        if (filter.messageType && message.messageType !== filter.messageType) return false;
        if (filter.content) {
            if (!message.text || !message.text.toLowerCase().includes(filter.content.toLowerCase())) {
                return false;
            }
        }
        if (filter.isGroup !== null && message.isGroup !== filter.isGroup) return false;
        if (filter.isPrivate !== null && message.isPrivate !== filter.isPrivate) return false;
        if (filter.isSudo !== null && message.isSudo !== filter.isSudo) return false;

        return true;
    }

    async executeAction(client, message, action) {
        try {
            if (action.react) {
                await message.react(action.react);
            }

            if (action.reply) {
                await message.reply(action.reply);
            }

            if (action.forward) {
                await client.sendMessage(action.forward, {
                    forward: message.raw
                });
            }

            if (action.log) {
                console.log(`📋 Tracker Log:`, {
                    sender: message.sender,
                    chat: message.chat,
                    text: message.text,
                    timestamp: new Date().toISOString()
                });
            }

            if (action.callback && typeof action.callback === 'function') {
                await action.callback(client, message);
            }

        } catch (error) {
            console.error('❌ Tracker action error:', error);
        }
    }

    getUserJid(message, match) {
        let users = [];

        const mentions = message.raw.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (mentions.length) {
            users.push(...mentions);
        }

        if (message.quoted) {
            users.push(message.quoted.sender);
        }

        if (match) {
            const phoneNumbers = match.split(' ').filter(arg => /^\d+$/.test(arg.replace(/[^\d]/g, '')));
            phoneNumbers.forEach(num => {
                const cleanNum = num.replace(/[^\d]/g, '');
                if (cleanNum.length >= 10) {
                    users.push(cleanNum + '@s.whatsapp.net');
                }
            });
        }

        return [...new Set(users)];
    }

    isAdmin(participants, userJid) {
        const participant = participants.find(p => p.id === userJid);
        return participant ? (participant.admin === 'admin' || participant.admin === 'superadmin' || participant.admin === true) : false;
    }

    jidToNum(jid) {
        return jid.split('@')[0];
    }

    formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }



    async deleteMessage(client, messageKey) {
        try {
            const socket = client.sock || client;
            await socket.sendMessage(messageKey.remoteJid, {
                delete: messageKey
            });
            return true;
        } catch (error) {
            console.error('❌ Error deleting message:', error);
            return false;
        }
    }

    async clearChat(client, chatJid) {
        try {
            const socket = client.sock || client;
            await socket.chatModify(
                {
                    delete: true,
                    lastMessages: [{
                        key: {
                            remoteJid: chatJid,
                            fromMe: true,
                            id: 'CLEAR_CHAT_' + Date.now()
                        },
                        messageTimestamp: Math.floor(Date.now() / 1000)
                    }]
                },
                chatJid
            );
            return true;
        } catch (error) {
            console.error('❌ Error clearing chat:', error);
            return false;
        }
    }

    parseTime(input) {
        if (!input) return null;
        const regex = /(\d+)([smhd])/gi; 
        let totalMs = 0;

        let match;
        while ((match = regex.exec(input)) !== null) {
            const value = parseInt(match[1]);
            const unit = match[2].toLowerCase();

            switch (unit) {
                case 's': totalMs += value * 1000; break;
                case 'm': totalMs += value * 60 * 1000; break;
                case 'h': totalMs += value * 60 * 60 * 1000; break;
                case 'd': totalMs += value * 24 * 60 * 60 * 1000; break;
            }
        }
        return totalMs || null;
    }
    formatTime(ms) {
        if (!ms) return "";
        const sec = Math.floor((ms / 1000) % 60);
        const min = Math.floor((ms / (1000 * 60)) % 60);
        const hr  = Math.floor((ms / (1000 * 60 * 60)) % 24);
        const day = Math.floor(ms / (1000 * 60 * 60 * 24));

        let str = "";
        if (day) str += `${day}d `;
        if (hr) str += `${hr}h `;
        if (min) str += `${min}m `;
        if (sec) str += `${sec}s`;
        return str.trim();
    }
    async getGroupMetadata(client, jid) {
        try {
            const meta = await (client.sock || client).groupMetadata(jid);
            return meta;
        } catch (e) {
            console.error("Failed to fetch group metadata:", e);
            return null;
        }
    }
}

module.exports = new M();