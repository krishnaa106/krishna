/**
 * ManjiBot God-Level Class
 * Consolidates all bot functions into a single, easy-to-use class
 * Usage: manji.numToJid(message.sender)
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

class Manji {
    constructor(client = null, config = null) {
        this.client = client;
        this.config = config;
        this.tempDir = path.join(__dirname, '..', 'temp');
        this.ensureTempDir();

        // Initialize trackers
        this.trackers = new Map();
        this.trackerIdCounter = 1;

        // Ephemeral durations
        this.EPHEMERAL_DURATIONS = {
            '1d': 86400,
            '7d': 604800,
            '90d': 7776000
        };
        this.WA_DEFAULT_EPHEMERAL = 604800;
    }

    // ============================================================================
    // CORE UTILITY FUNCTIONS
    // ============================================================================

    ensureTempDir() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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

    // ============================================================================
    // JID AND NUMBER UTILITIES
    // ============================================================================

    /**
     * Get bot's JID
     */
    getBotJid() {
        try {
            const client = this.client?.sock || this.client;
            const rawJid = client?.user?.id;

            if (!rawJid) return null;

            return rawJid.includes(':')
                ? rawJid.split(':')[0] + '@s.whatsapp.net'
                : rawJid;
        } catch (error) {
            console.error('❌ Error getting bot JID:', error);
            return null;
        }
    }

    /**
     * Convert number to JID format
     */
    numToJid(number) {
        if (!number) return null;
        const cleanNum = number.toString().replace(/[^\d]/g, '');
        return cleanNum + '@s.whatsapp.net';
    }

    /**
     * Convert JID to number
     */
    jidToNum(jid) {
        if (!jid) return null;
        return jid.split('@')[0];
    }

    /**
     * Get user JIDs from message (mentions, quoted, or numbers in text)
     */
    getUserJid(message, match) {
        let users = [];

        // Get mentions
        const mentions = message.raw.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (mentions.length) {
            users.push(...mentions);
        }

        // Get quoted user
        if (message.quoted) {
            users.push(message.quoted.sender);
        }

        // Extract phone numbers from text
        if (match) {
            const phoneNumbers = match.split(' ').filter(arg => /^\d+$/.test(arg.replace(/[^\d]/g, '')));
            phoneNumbers.forEach(num => {
                const cleanNum = num.replace(/[^\d]/g, '');
                if (cleanNum.length >= 10) {
                    users.push(this.numToJid(cleanNum));
                }
            });
        }

        return [...new Set(users)];
    }

    // ============================================================================
    // GROUP MANAGEMENT FUNCTIONS
    // ============================================================================

    /**
     * Kick user from group
     */
    async kick(gid, jid) {
        const client = this.client?.sock || this.client;
        return await client.groupParticipantsUpdate(gid, [jid], 'remove');
    }

    /**
     * Add user to group
     */
    async add(gid, jid) {
        const client = this.client?.sock || this.client;
        return await client.groupParticipantsUpdate(gid, [jid], 'add');
    }

    /**
     * Promote user to admin
     */
    async promote(gid, jid) {
        const client = this.client?.sock || this.client;
        return await client.groupParticipantsUpdate(gid, [jid], 'promote');
    }

    /**
     * Demote user from admin
     */
    async demote(gid, jid) {
        const client = this.client?.sock || this.client;
        return await client.groupParticipantsUpdate(gid, [jid], 'demote');
    }

    /**
     * Mute group (only admins can send messages)
     */
    async mute(gid) {
        const client = this.client?.sock || this.client;
        return await client.groupSettingUpdate(gid, 'announcement');
    }

    /**
     * Unmute group (all members can send messages)
     */
    async unmute(gid) {
        const client = this.client?.sock || this.client;
        return await client.groupSettingUpdate(gid, 'not_announcement');
    }

    /**
     * Lock group (only admins can edit group info)
     */
    async lock(gid) {
        const client = this.client?.sock || this.client;
        return await client.groupSettingUpdate(gid, 'locked');
    }

    /**
     * Unlock group (all members can edit group info)
     */
    async unlock(gid) {
        const client = this.client?.sock || this.client;
        return await client.groupSettingUpdate(gid, 'unlocked');
    }

    /**
     * Get group metadata
     */
    async groupMetadata(gid) {
        const client = this.client?.sock || this.client;
        return await client.groupMetadata(gid);
    }

    /**
     * Get group invite code
     */
    async inviteCode(gid) {
        const client = this.client?.sock || this.client;
        return await client.groupInviteCode(gid);
    }

    /**
     * Revoke group invite
     */
    async revokeInvite(gid) {
        const client = this.client?.sock || this.client;
        return await client.groupRevokeInvite(gid);
    }

    /**
     * Check if user is admin
     * @param {string} gid - Group ID
     * @param {string} jid - User JID to check
     * @returns {Promise<boolean>}
     */
    async isAdmin(gid, jid) {
        try {
            const metadata = await this.groupMetadata(gid);
            const participant = metadata.participants.find(p => p.id === jid);
            return participant ? (participant.admin === 'admin' || participant.admin === 'superadmin' || participant.admin === true) : false;
        } catch (error) {
            console.error('❌ Error checking admin status:', error);
            return false;
        }
    }

    /**
     * Check if bot is admin
     * @param {string} gid - Group ID
     * @returns {Promise<boolean>}
     */
    async isBotAdmin(gid) {
        try {
            const botJid = this.getBotJid();
            if (!botJid) return false;

            return await this.isAdmin(gid, botJid);
        } catch (error) {
            console.error('❌ Error checking bot admin status:', error);
            return false;
        }
    }

    /**
     * Check if user is group member
     * @param {string} gid - Group ID
     * @param {string} jid - User JID
     * @returns {Promise<boolean>}
     */
    async isMember(gid, jid) {
        try {
            const metadata = await this.groupMetadata(gid);
            return metadata.participants.some(p => p.id === jid);
        } catch (error) {
            console.error('❌ Error checking membership:', error);
            return false;
        }
    }

    /**
     * Get user role in group
     * @param {string} gid - Group ID
     * @param {string} jid - User JID
     * @returns {Promise<string>} - 'admin', 'superadmin', 'member', or 'not_member'
     */
    async getUserRole(gid, jid) {
        try {
            const metadata = await this.groupMetadata(gid);
            const participant = metadata.participants.find(p => p.id === jid);

            if (!participant) return 'not_member';
            if (participant.admin === 'superadmin') return 'superadmin';
            if (participant.admin === 'admin' || participant.admin === true) return 'admin';
            return 'member';
        } catch (error) {
            console.error('❌ Error getting user role:', error);
            return 'not_member';
        }
    }

    /**
     * Get all admins in group
     * @param {string} gid - Group ID
     * @returns {Promise<Array>} - Array of admin JIDs
     */
    async getAdmins(gid) {
        try {
            const metadata = await this.groupMetadata(gid);
            return metadata.participants
                .filter(p => p.admin === 'admin' || p.admin === 'superadmin' || p.admin === true)
                .map(p => p.id);
        } catch (error) {
            console.error('❌ Error getting admins:', error);
            return [];
        }
    }

    /**
     * Get all members in group
     * @param {string} gid - Group ID
     * @returns {Promise<Array>} - Array of member JIDs
     */
    async getMembers(gid) {
        try {
            const metadata = await this.groupMetadata(gid);
            return metadata.participants.map(p => p.id);
        } catch (error) {
            console.error('❌ Error getting members:', error);
            return [];
        }
    }

    /**
     * Check if user is superadmin
     * @param {string} gid - Group ID
     * @param {string} jid - User JID to check
     * @returns {Promise<boolean>}
     */
    async isSuperAdmin(gid, jid) {
        try {
            const metadata = await this.groupMetadata(gid);
            const participant = metadata.participants.find(p => p.id === jid);
            return participant ? participant.admin === 'superadmin' : false;
        } catch (error) {
            console.error('❌ Error checking superadmin status:', error);
            return false;
        }
    }

    /**
     * Check if bot is superadmin
     * @param {string} gid - Group ID
     * @returns {Promise<boolean>}
     */
    async isBotSuperAdmin(gid) {
        try {
            const botJid = this.getBotJid();
            if (!botJid) return false;

            return await this.isSuperAdmin(gid, botJid);
        } catch (error) {
            console.error('❌ Error checking bot superadmin status:', error);
            return false;
        }
    }



    /**
     * Get group participant info
     * @param {string} gid - Group ID
     * @param {string} jid - User JID
     * @returns {Promise<Object|null>} - Participant object or null
     */
    async getParticipant(gid, jid) {
        try {
            const metadata = await this.groupMetadata(gid);
            return metadata.participants.find(p => p.id === jid) || null;
        } catch (error) {
            console.error('❌ Error getting participant info:', error);
            return null;
        }
    }

    // ============================================================================
    // MESSAGE MANAGEMENT FUNCTIONS
    // ============================================================================

    /**
     * Delete message
     */
    async delete(messageKey) {
        const client = this.client?.sock || this.client;
        return await client.sendMessage(messageKey.remoteJid, { delete: messageKey });
    }

    /**
     * React to message
     */
    async react(messageKey, emoji) {
        const client = this.client?.sock || this.client;
        return await client.sendMessage(messageKey.remoteJid, {
            react: { text: emoji, key: messageKey }
        });
    }

    /**
     * Edit message
     */
    async edit(messageKey, newText) {
        const client = this.client?.sock || this.client;
        return await client.sendMessage(messageKey.remoteJid, {
            text: newText,
            edit: messageKey
        });
    }

    /**
     * Pin message
     */
    async pin(messageKey) {
        const client = this.client?.sock || this.client;
        return await client.sendMessage(messageKey.remoteJid, { pin: messageKey });
    }

    /**
     * Unpin message
     */
    async unpin(messageKey) {
        const client = this.client?.sock || this.client;
        return await client.sendMessage(messageKey.remoteJid, { unpin: messageKey });
    }

    /**
     * Send message
     */
    async send(jid, content, options = {}) {
        const client = this.client?.sock || this.client;
        return await client.sendMessage(jid, content, options);
    }

    /**
     * Clear chat
     */
    async clearChat(chatJid) {
        const client = this.client?.sock || this.client;
        return await client.chatModify({
            delete: true,
            lastMessages: [{
                key: {
                    remoteJid: chatJid,
                    fromMe: true,
                    id: 'CLEAR_CHAT_' + Date.now()
                },
                messageTimestamp: Math.floor(Date.now() / 1000)
            }]
        }, chatJid);
    }

    /**
     * Send ephemeral message
     */
    async sendEphemeral(jid, content, duration = this.WA_DEFAULT_EPHEMERAL) {
        const client = this.client?.sock || this.client;
        let expirationSeconds = duration;
        if (typeof duration === 'string') {
            expirationSeconds = this.EPHEMERAL_DURATIONS[duration] || this.WA_DEFAULT_EPHEMERAL;
        }
        return await client.sendMessage(jid, content, { ephemeralExpiration: expirationSeconds });
    }

    // ============================================================================
    // MEDIA FUNCTIONS
    // ============================================================================

    async streamToBuffer(stream) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            stream.on("data", chunk => chunks.push(chunk));
            stream.on("end", () => resolve(Buffer.concat(chunks)));
            stream.on("error", reject);
        });
    }

    /**
     * Download media from message
     */
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

    /**
     * Download from URL
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
     * Convert media to WebP format
     */
    async toWebp(inputPath) {
        try {
            const ffmpeg = require('fluent-ffmpeg');
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

    /**
     * Add EXIF data to WebP sticker
     */
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

    /**
     * Create sticker from media
     */
    async sticker(msg, pack, author) {
        let mediaFile = null;

        try {
            mediaFile = await this.downloadMedia(msg, 'path');
            if (!mediaFile) return null;

            const stickerPack = pack || this.config?.STICKER_PACK_NAME || '';
            const stickerAuthor = author || this.config?.STICKER_AUTHOR || '';

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

    /**
     * Extract EXIF data from sticker
     */
    async exif(msg) {
        let stickerFile = null;

        try {
            stickerFile = await this.downloadMedia(msg, 'path');
            if (!stickerFile) return null;

            const webp = require('node-webpmux');
            const img = new webp.Image();
            await img.load(stickerFile);

            if (!img.exif) return null;

            const rawExif = img.exif.toString();
            const exifJson = JSON.parse(rawExif.match(/{.*}/s)[0]);

            const result = {
                packId: exifJson['sticker-pack-id'] || 'Unknown',
                packname: exifJson['sticker-pack-name'] || 'Unknown',
                author: exifJson['sticker-pack-publisher'] || 'Unknown',
                emojis: exifJson['emojis']?.length ? exifJson['emojis'].join(', ') : 'None',
            };

            this.cleanup([stickerFile]);
            return result;
        } catch (err) {
            console.error("❌ Error extracting EXIF:", err);
            if (stickerFile) this.cleanup([stickerFile]);
            return null;
        }
    }

    // ============================================================================
    // TIME AND FORMAT UTILITIES
    // ============================================================================

    /**
     * Parse time string to milliseconds
     */
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

    /**
     * Format milliseconds to readable time
     */
    formatTime(ms) {
        if (!ms) return "";
        const sec = Math.floor((ms / 1000) % 60);
        const min = Math.floor((ms / (1000 * 60)) % 60);
        const hr = Math.floor((ms / (1000 * 60 * 60)) % 24);
        const day = Math.floor(ms / (1000 * 60 * 60 * 24));

        let str = "";
        if (day) str += `${day}d `;
        if (hr) str += `${hr}h `;
        if (min) str += `${min}m `;
        if (sec) str += `${sec}s`;
        return str.trim();
    }

    /**
     * Format uptime
     */
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

    // ============================================================================
    // SYSTEM INFORMATION
    // ============================================================================

    /**
     * Get memory usage information
     */
    getMemoryUsage() {
        const usage = process.memoryUsage();
        return {
            rss: (usage.rss / 1024 / 1024).toFixed(2),
            heapUsed: (usage.heapUsed / 1024 / 1024).toFixed(2),
            heapTotal: (usage.heapTotal / 1024 / 1024).toFixed(2),
            external: (usage.external / 1024 / 1024).toFixed(2)
        };
    }

    /**
     * Get system information
     */
    getSystemInfo() {
        return {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            pid: process.pid,
            uptime: process.uptime() * 1000
        };
    }

    // ============================================================================
    // MENU AND HELP FUNCTIONS
    // ============================================================================

    /**
     * Generate menu text
     */
    menu(pluginManager, config, message) {
        const categories = pluginManager?.getCategories() || [];
        const totalCommands = pluginManager?.getCommandCount() || 0;
        const uptime = this.formatUptime(Date.now() - (global.startTime || Date.now()));

        let menuText = `╭───────────────
│     *𝐌𝐀𝐍𝐉𝐈𝐁𝐎𝐓*   
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

    // ============================================================================
    // SIMPLE SHORT-NAMED METHODS (GOD LEVEL)
    // ============================================================================

    // JID utilities
    toJid(number) { return this.numToJid(number); }
    toNum(jid) { return this.jidToNum(jid); }
    getUsers(message, match) { return this.getUserJid(message, match); }

    // Group management (main functions keep same names)
    // kick, add, promote, demote - keep as is
    
    // Other functions with descriptive names
    groupClose(gid) { return this.mute(gid); }
    groupOpen(gid) { return this.unmute(gid); }
    groupRestrict(gid) { return this.lock(gid); }
    groupUnrestrict(gid) { return this.unlock(gid); }
    groupInfo(gid) { return this.groupMetadata(gid); }
    groupLink(gid) { return this.inviteCode(gid); }
    groupRevoke(gid) { return this.revokeInvite(gid); }
    groupMember(gid, jid) { return this.isMember(gid, jid); }
    groupRole(gid, jid) { return this.getUserRole(gid, jid); }
    groupAdmins(gid) { return this.getAdmins(gid); }
    groupMembers(gid) { return this.getMembers(gid); }
    groupSuperAdmin(gid, jid) { return this.isSuperAdmin(gid, jid); }
    groupBotSuperAdmin(gid) { return this.isBotSuperAdmin(gid); }
    groupParticipant(gid, jid) { return this.getParticipant(gid, jid); }

    // Message management (simple names)
    del(messageKey) { return this.delete(messageKey); }
    emoji(messageKey, emoji) { return this.react(messageKey, emoji); }
    change(messageKey, newText) { return this.edit(messageKey, newText); }
    stick(messageKey) { return this.pin(messageKey); }
    unstick(messageKey) { return this.unpin(messageKey); }
    msg(jid, content, options) { return this.send(jid, content, options); }
    clear(chatJid) { return this.clearChat(chatJid); }

    // Media functions (simple names)
    dl(msg, type) { return this.downloadMedia(msg, type); }
    dlUrl(url, fileName) { return this.downloadFromUrl(url, fileName); }
    webp(inputPath) { return this.toWebp(inputPath); }
    sticker(msg, pack, author) { return this.sticker(msg, pack, author); }
    stickerInfo(msg) { return this.exif(msg); }

    // Time utilities (simple names)
    parse(input) { return this.parseTime(input); }
    format(ms) { return this.formatTime(ms); }
    uptime(ms) { return this.formatUptime(ms); }
    wait(ms) { return this.sleep(ms); }

    // System info (simple names)
    memory() { return this.getMemoryUsage(); }
    system() { return this.getSystemInfo(); }

    // Config utilities - main functions already have env prefix

    // ============================================================================
    // TRACKER SYSTEM
    // =======================================================================

    /**
     * Add message tracker
     */
    addTracker(filter = {}, action = {}) {
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

    /**
     * Remove tracker
     */
    removeTracker(trackerId) {
        return this.trackers.delete(trackerId);
    }

    /**
     * Toggle tracker
     */
    toggleTracker(trackerId, enabled) {
        const tracker = this.trackers.get(trackerId);
        if (!tracker) return false;

        tracker.enabled = enabled;
        return true;
    }

    /**
     * Get all trackers
     */
    getTrackers() {
        return Array.from(this.trackers.values());
    }

    /**
     * Process trackers for message
     */
    async processTrackers(message) {
        for (const tracker of this.trackers.values()) {
            if (!tracker.enabled) continue;

            if (this.matchesFilter(message, tracker.filter)) {
                await this.executeAction(message, tracker.action);
            }
        }
    }

    /**
     * Check if message matches filter
     */
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

    /**
     * Execute tracker action
     */
    async executeAction(message, action) {
        try {
            if (action.react) {
                await message.react(action.react);
            }

            if (action.reply) {
                await message.reply(action.reply);
            }

            if (action.forward) {
                const client = this.client?.sock || this.client;
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
                await action.callback(this.client, message);
            }

        } catch (error) {
            console.error('❌ Tracker action error:', error);
        }
    }
}

/**
 * Configuration Variable Manager
 */
class ConfigManager {
    constructor(configPath = '../config.env') {
        this.configPath = path.join(__dirname, configPath);
    }

    readConfig() {
        try {
            const content = fs.readFileSync(this.configPath, 'utf8');
            const config = {};

            content.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                    const [key, ...valueParts] = trimmed.split('=');
                    config[key.trim()] = valueParts.join('=').trim();
                }
            });

            return config;
        } catch (error) {
            console.error('Error reading config:', error);
            return {};
        }
    }

    writeConfig(config) {
        try {
            const lines = Object.entries(config).map(([key, value]) => `${key}=${value}`);
            fs.writeFileSync(this.configPath, lines.join('\n') + '\n');
            return true;
        } catch (error) {
            console.error('Error writing config:', error);
            return false;
        }
    }

    set(key, value, options = {}) {
        const config = this.readConfig();
        const upperKey = key.toUpperCase();

        const {
            append = false,
            replaceNull = true,
            separator = ',',
            unique = true,
            allowDuplicate = false
        } = options;

        let currentValue = config[upperKey] || '';

        if (!allowDuplicate && currentValue === value && currentValue !== '' && currentValue !== 'null') {
            return false;
        }

        if (replaceNull && (currentValue === 'null' || currentValue === '')) {
            config[upperKey] = value;
        } else if (append && currentValue && currentValue !== 'null') {
            const existingValues = currentValue.split(separator).map(v => v.trim()).filter(v => v);
            const newValues = value.split(separator).map(v => v.trim()).filter(v => v);

            let combinedValues = [...existingValues, ...newValues];

            if (unique) {
                combinedValues = [...new Set(combinedValues)];
            }

            config[upperKey] = combinedValues.join(separator);
        } else {
            config[upperKey] = value;
        }

        return this.writeConfig(config);
    }

    get(key, options = {}) {
        const config = this.readConfig();
        const upperKey = key.toUpperCase();

        const {
            parseArray = false,
            separator = ',',
            defaultValue = null
        } = options;

        const value = config[upperKey];

        if (!value || value === 'null') {
            return defaultValue;
        }

        if (parseArray && value.includes(separator)) {
            return value.split(separator).map(v => v.trim()).filter(v => v);
        }

        return value;
    }

    remove(keyOrInput, valueToRemove = null, separator = ',') {
        let key, value;

        if (keyOrInput.includes('=') && valueToRemove === null) {
            const [k, ...valueParts] = keyOrInput.split('=');
            key = k.trim().toUpperCase();
            value = valueParts.join('=').trim();
        } else {
            key = keyOrInput.toUpperCase();
            value = valueToRemove;
        }

        const config = this.readConfig();

        if (!config[key]) {
            return false;
        }

        const values = config[key].split(separator).map(v => v.trim()).filter(v => v);
        const filteredValues = values.filter(v => v !== value.trim());

        if (filteredValues.length === values.length) {
            return false;
        }

        config[key] = filteredValues.length > 0 ? filteredValues.join(separator) : 'null';
        return this.writeConfig(config);
    }

    delete(key) {
        const config = this.readConfig();
        const upperKey = key.toUpperCase();

        if (!config[upperKey]) {
            return false;
        }

        delete config[upperKey];
        return this.writeConfig(config);
    }

    has(keyOrInput, searchValue = null, separator = ',') {
        let key, value;

        if (keyOrInput.includes('=') && searchValue === null) {
            const [k, ...valueParts] = keyOrInput.split('=');
            key = k.trim().toUpperCase();
            value = valueParts.join('=').trim();
        } else {
            key = keyOrInput.toUpperCase();
            value = searchValue;
        }

        const val = this.get(key);
        if (!val || val === 'null') return false;

        const values = val.split(separator).map(v => v.trim());
        return values.includes(value.trim());
    }

    toggle(keyOrInput, value = null, separator = ',') {
        let key, val;

        if (keyOrInput.includes('=') && value === null) {
            const [k, ...valueParts] = keyOrInput.split('=');
            key = k.trim().toUpperCase();
            val = valueParts.join('=').trim();
        } else {
            key = keyOrInput.toUpperCase();
            val = value;
        }

        if (this.has(key, val, separator)) {
            return this.remove(key, val, separator);
        } else {
            return this.set(key, val, { append: true, separator, unique: true });
        }
    }

    add(keyOrInput, value = null, options = {}) {
        let key, val;

        if (keyOrInput.includes('=') && value === null) {
            const [k, ...valueParts] = keyOrInput.split('=');
            key = k.trim().toUpperCase();
            val = valueParts.join('=').trim();
        } else {
            key = keyOrInput.toUpperCase();
            val = value;
        }

        return this.set(key, val, {
            append: true,
            unique: true,
            replaceNull: true,
            ...options
        });
    }

    list(key, separator = ',') {
        const value = this.get(key);
        if (!value || value === 'null') return [];
        return value.split(separator).map(v => v.trim()).filter(v => v);
    }

    count(key, separator = ',') {
        return this.list(key, separator).length;
    }

    clear(key) {
        const config = this.readConfig();
        config[key.toUpperCase()] = 'null';
        return this.writeConfig(config);
    }

    getAll() {
        return this.readConfig();
    }

    formatDisplay(config, options = {}) {
        const {
            maskSensitive = true,
            sensitiveKeys = ['PASSWORD', 'TOKEN', 'SECRET', 'KEY', 'API', 'PIN', 'DATABASE', 'SESSION']
        } = options;

        return Object.entries(config)
            .map(([key, value]) => {
                let displayValue = value;

                if (maskSensitive && sensitiveKeys.some(sensitive => key.toUpperCase().includes(sensitive))) {
                    displayValue = value ? '*'.repeat(Math.min(String(value).length, 8)) : value;
                }

                if (displayValue === null) displayValue = 'null';
                if (displayValue === undefined) displayValue = 'undefined';
                if (displayValue === '') displayValue = '""';

                return `\`\`\`${key} = ${displayValue}\`\`\``;
            })
            .join('\n');
    }
}

// Add ConfigManager methods to Manji class with simple names
Manji.prototype.initConfig = function (configPath) {
    this.configManager = new ConfigManager(configPath);
    return this.configManager;
};

// Simple config methods
Manji.prototype.envSet = function (key, value, options) {
    if (!this.configManager) this.initConfig();
    return this.configManager.set(key, value, options);
};

Manji.prototype.envGet = function (key, options) {
    if (!this.configManager) this.initConfig();
    return this.configManager.get(key, options);
};

Manji.prototype.envRemove = function (key, value, separator) {
    if (!this.configManager) this.initConfig();
    return this.configManager.remove(key, value, separator);
};

Manji.prototype.envDelete = function (key) {
    if (!this.configManager) this.initConfig();
    return this.configManager.delete(key);
};

Manji.prototype.envHas = function (key, value, separator) {
    if (!this.configManager) this.initConfig();
    return this.configManager.has(key, value, separator);
};

Manji.prototype.envToggle = function (key, value, separator) {
    if (!this.configManager) this.initConfig();
    return this.configManager.toggle(key, value, separator);
};

Manji.prototype.envAdd = function (key, value, options) {
    if (!this.configManager) this.initConfig();
    return this.configManager.add(key, value, options);
};

Manji.prototype.envList = function (key, separator) {
    if (!this.configManager) this.initConfig();
    return this.configManager.list(key, separator);
};

Manji.prototype.envCount = function (key, separator) {
    if (!this.configManager) this.initConfig();
    return this.configManager.count(key, separator);
};

Manji.prototype.envClear = function (key) {
    if (!this.configManager) this.initConfig();
    return this.configManager.clear(key);
};

Manji.prototype.envAll = function () {
    if (!this.configManager) this.initConfig();
    return this.configManager.getAll();
};

Manji.prototype.envDisplay = function (config, options) {
    if (!this.configManager) this.initConfig();
    return this.configManager.formatDisplay(config || this.envAll(), options);
};

// Keep old names for backward compatibility
Manji.prototype.setConfig = function (key, value, options) { return this.envSet(key, value, options); };
Manji.prototype.getConfig = function (key, options) { return this.envGet(key, options); };
Manji.prototype.removeConfig = function (key, value, separator) { return this.envRemove(key, value, separator); };
Manji.prototype.deleteConfig = function (key) { return this.envDelete(key); };
Manji.prototype.hasConfig = function (key, value, separator) { return this.envHas(key, value, separator); };
Manji.prototype.toggleConfig = function (key, value, separator) { return this.envToggle(key, value, separator); };
Manji.prototype.addConfig = function (key, value, options) { return this.envAdd(key, value, options); };
Manji.prototype.listConfig = function (key, separator) { return this.envList(key, separator); };
Manji.prototype.countConfig = function (key, separator) { return this.envCount(key, separator); };
Manji.prototype.clearConfig = function (key) { return this.envClear(key); };
Manji.prototype.getAllConfig = function () { return this.envAll(); };
Manji.prototype.formatConfigDisplay = function (config, options) { return this.envDisplay(config, options); };

module.exports = { Manji, ConfigManager };