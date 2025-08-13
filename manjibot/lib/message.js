/**
 * Message wrapper class for ManjiBot
 * Provides ultra-simple interface for plugin developers
 */
class Message {
    constructor(client, rawMessage, config) {
        this.client = client;
        this.raw = rawMessage;
        this.config = config;
        
        // Basic message info
        this.key = rawMessage.key;
        this.chat = rawMessage.key.remoteJid;
        this.sender = rawMessage.key.participant || rawMessage.key.remoteJid;
        this.fromMe = rawMessage.key.fromMe;
        this.id = rawMessage.key.id;
        
        // Chat type detection
        this.isGroup = this.chat.endsWith('@g.us');
        this.isPrivate = !this.isGroup;
        this.isBroadcast = this.chat === 'status@broadcast';
        
        // User permissions
        this.isSudo = config.isSudo(this.sender);
        this.isOwner = this.fromMe;
        
        // Extract message content
        this.text = this._extractText();
        this.command = null;
        this.args = [];
        this.body = this.text || '';
        
        // Media detection
        this.media = this._detectMedia();
        this.hasMedia = !!this.media;
        
        // Quoted message
        this.quoted = this._getQuotedMessage();
        this.reply_message = this.quoted; // Alias for compatibility
        
        // Enhance quoted message with media detection
        if (this.quoted) {
            this._enhanceQuotedMessage();
        }
        
        // Message timestamp
        this.timestamp = rawMessage.messageTimestamp;
        this.date = new Date(this.timestamp * 1000);
    }

    // ============================================================================
    // TEXT EXTRACTION
    // ============================================================================

    /**
     * Extract text from various message types
     */
    _extractText() {
        const msg = this.raw.message;
        if (!msg) return null;

        return msg.conversation ||
               msg.extendedTextMessage?.text ||
               msg.imageMessage?.caption ||
               msg.videoMessage?.caption ||
               msg.documentMessage?.caption ||
               msg.audioMessage?.caption ||
               msg.buttonsResponseMessage?.selectedButtonId ||
               msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
               msg.templateButtonReplyMessage?.selectedId ||
               null;
    }

    // ============================================================================
    // MEDIA DETECTION
    // ============================================================================

    /**
     * Detect and categorize media in message
     */
    _detectMedia() {
        const msg = this.raw.message;
        if (!msg) return null;

        // Image
        if (msg.imageMessage) {
            return {
                type: 'image',
                message: msg.imageMessage,
                mimetype: msg.imageMessage.mimetype,
                caption: msg.imageMessage.caption,
                size: msg.imageMessage.fileLength,
                width: msg.imageMessage.width,
                height: msg.imageMessage.height
            };
        }

        // Video
        if (msg.videoMessage) {
            return {
                type: 'video',
                message: msg.videoMessage,
                mimetype: msg.videoMessage.mimetype,
                caption: msg.videoMessage.caption,
                size: msg.videoMessage.fileLength,
                duration: msg.videoMessage.seconds,
                width: msg.videoMessage.width,
                height: msg.videoMessage.height,
                gif: !!msg.videoMessage.gifPlayback
            };
        }

        // Audio
        if (msg.audioMessage) {
            return {
                type: 'audio',
                message: msg.audioMessage,
                mimetype: msg.audioMessage.mimetype,
                size: msg.audioMessage.fileLength,
                duration: msg.audioMessage.seconds,
                voice: !!msg.audioMessage.ptt
            };
        }

        // Sticker
        if (msg.stickerMessage) {
            return {
                type: 'sticker',
                message: msg.stickerMessage,
                mimetype: msg.stickerMessage.mimetype,
                size: msg.stickerMessage.fileLength,
                width: msg.stickerMessage.width,
                height: msg.stickerMessage.height,
                animated: !!msg.stickerMessage.isAnimated
            };
        }

        // Document
        if (msg.documentMessage) {
            return {
                type: 'document',
                message: msg.documentMessage,
                mimetype: msg.documentMessage.mimetype,
                fileName: msg.documentMessage.fileName,
                size: msg.documentMessage.fileLength,
                caption: msg.documentMessage.caption
            };
        }

        // Contact
        if (msg.contactMessage) {
            return {
                type: 'contact',
                message: msg.contactMessage,
                displayName: msg.contactMessage.displayName,
                vcard: msg.contactMessage.vcard
            };
        }

        // Location
        if (msg.locationMessage) {
            return {
                type: 'location',
                message: msg.locationMessage,
                latitude: msg.locationMessage.degreesLatitude,
                longitude: msg.locationMessage.degreesLongitude,
                name: msg.locationMessage.name,
                address: msg.locationMessage.address
            };
        }

        return null;
    }

    /**
     * Get quoted/replied message
     */
    _getQuotedMessage() {
        const contextInfo = this.raw.message?.extendedTextMessage?.contextInfo;
        if (!contextInfo?.quotedMessage) return null;

        return {
            key: {
                remoteJid: this.chat,
                fromMe: contextInfo.participant === this.client.getUserInfo()?.id,
                id: contextInfo.stanzaId,
                participant: contextInfo.participant
            },
            message: contextInfo.quotedMessage,
            sender: contextInfo.participant || this.chat,
            text: this._extractTextFromMessage(contextInfo.quotedMessage)
        };
    }

    /**
     * Extract text from any message object
     */
    _extractTextFromMessage(msg) {
        if (!msg) return null;
        
        return msg.conversation ||
               msg.extendedTextMessage?.text ||
               msg.imageMessage?.caption ||
               msg.videoMessage?.caption ||
               msg.documentMessage?.caption ||
               msg.audioMessage?.caption ||
               null;
    }

    /**
     * Enhance quoted message with media detection and helper methods
     */
    _enhanceQuotedMessage() {
        if (!this.quoted) return;

        const msg = this.quoted.message;
        
        // Add boolean properties for easy checking
        this.quoted.image = !!msg.imageMessage;
        this.quoted.video = !!msg.videoMessage;
        this.quoted.audio = !!msg.audioMessage;
        this.quoted.sticker = !!msg.stickerMessage;
        this.quoted.document = !!msg.documentMessage;
        this.quoted.contact = !!msg.contactMessage;
        this.quoted.location = !!msg.locationMessage;
        
        // Special properties
        this.quoted.gif = !!msg.videoMessage?.gifPlayback;
        this.quoted.animated = !!msg.stickerMessage?.isAnimated;
        this.quoted.voice = !!msg.audioMessage?.ptt;
        
        // Add download methods
        this.quoted.download = async () => {
            const utils = require('./utils');
            // Create a temporary message object for the quoted message
            const quotedMsg = {
                key: this.quoted.key,
                message: this.quoted.message
            };
            return await utils.downloadMedia(quotedMsg, 'buffer');
        };
    }

    // ============================================================================
    // COMMAND PARSING
    // ============================================================================

    /**
     * Parse command from message text
     */
    parseCommand() {
        if (!this.text) return false;
        
        const prefix = this.config.PREFIX;
        if (!this.text.startsWith(prefix)) return false;
        
        const args = this.text.slice(prefix.length).trim().split(/\s+/);
        this.command = args.shift()?.toLowerCase();
        this.args = args;
        
        return !!this.command;
    }

    // ============================================================================
    // SENDING METHODS
    // ============================================================================

    /**
     * Universal send method
     */
    async send(content, options = {}) {
        const messageOptions = { ...options };
        
        // Auto-detect content type
        if (typeof content === 'string') {
            messageOptions.text = content;
        } else if (Buffer.isBuffer(content)) {
            // Default to image for buffers, can be overridden
            if (!options.type) {
                messageOptions.image = content;
            } else {
                messageOptions[options.type] = content;
            }
        } else if (typeof content === 'object') {
            Object.assign(messageOptions, content);
        }
        
        // Add quote if not disabled
        if (options.quote !== false && !messageOptions.quoted) {
            messageOptions.quoted = this.raw;
        }
        
        return await this.client.sendMessage(this.chat, messageOptions);
    }

    /**
     * Reply to current message
     */
    async reply(content, options = {}) {
        return await this.send(content, { ...options, quoted: this.raw });
    }

    /**
     * React to current message
     */
    async react(emoji) {
        return await this.client.react(this.raw, emoji);
    }

    /**
     * Send image
     */
    async sendImage(buffer, caption = '', options = {}) {
        return await this.send({ image: buffer, caption }, options);
    }

    /**
     * Send video
     */
    async sendVideo(buffer, caption = '', options = {}) {
        return await this.send({ video: buffer, caption }, options);
    }

    /**
     * Send audio
     */
    async sendAudio(buffer, options = {}) {
        return await this.send({ audio: buffer }, options);
    }

    /**
     * Send sticker
     */
    async sendSticker(buffer, options = {}) {
        return await this.send({ sticker: buffer }, options);
    }

    /**
     * Send document
     */
    async sendDocument(buffer, fileName, mimetype, options = {}) {
        return await this.send({ 
            document: buffer, 
            fileName, 
            mimetype 
        }, options);
    }

    // ============================================================================
    // UTILITY METHODS
    // ============================================================================

    /**
     * Download media from current message
     */
    async download() {
        if (!this.hasMedia) return null;
        const utils = require('./utils');
        return await utils.downloadMedia(this.raw, 'buffer');
    }

    /**
     * Check if message has specific media type
     */
    hasMediaType(type) {
        return this.media?.type === type;
    }

    /**
     * Get argument at index with default value
     */
    arg(index, defaultValue = '') {
        return this.args[index] || defaultValue;
    }

    /**
     * Get all arguments as string
     */
    argsText(separator = ' ') {
        return this.args.join(separator);
    }

    /**
     * Check if user has permission
     */
    hasPermission(level = 'user') {
        switch (level) {
            case 'owner':
                return this.isOwner;
            case 'sudo':
                return this.isSudo || this.isOwner;
            case 'user':
            default:
                return true;
        }
    }

    /**
     * Get user mention
     */
    getUserMention() {
        return `@${this.sender.split('@')[0]}`;
    }

    /**
     * Get formatted timestamp
     */
    getFormattedTime() {
        return this.date.toLocaleString();
    }
}

module.exports = { Message };