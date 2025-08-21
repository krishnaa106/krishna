class Message {
    constructor(client, rawMessage, config) {
        this.client = client;
        this.raw = rawMessage;
        this.config = config;

        // Basic info
        this.key = rawMessage.key;
        this.chat = rawMessage.key.remoteJid;
        this.sender = rawMessage.key.participant || rawMessage.key.remoteJid;
        this.fromMe = rawMessage.key.fromMe;
        this.id = rawMessage.key.id;

        // Chat types
        this.isGroup = this.chat.endsWith('@g.us');
        this.isPrivate = !this.isGroup;
        this.isBroadcast = this.chat === 'status@broadcast';

        // Permissions
        this.isSudo = config.isSudo(this.sender) || this.isBot(this.sender, client);
        this.isOwner = this.fromMe;
        this._isAdmin = null;

        // Content
        this.text = this._extractText();
        this.command = null;
        this.args = [];
        this.body = this.text || '';

        // Media
        this.media = this._detectMedia();
        this.hasMedia = !!this.media;

        // Quoted
        this.quoted = this._getQuotedMessage();
        if (this.quoted) this._enhanceQuotedMessage();

        // Timestamp
        this.timestamp = rawMessage.messageTimestamp;
        this.date = new Date(this.timestamp * 1000);
    }

    // ========== Message Parsing ==========
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

    _detectMedia() {
        const msg = this.raw.message;
        if (!msg) return null;

        if (msg.imageMessage) return { type: 'image', ...msg.imageMessage };
        if (msg.videoMessage) return { type: 'video', ...msg.videoMessage };
        if (msg.audioMessage) return { type: 'audio', ...msg.audioMessage };
        if (msg.stickerMessage) return { type: 'sticker', ...msg.stickerMessage };
        if (msg.documentMessage) return { type: 'document', ...msg.documentMessage };
        if (msg.contactMessage) return { type: 'contact', ...msg.contactMessage };
        if (msg.locationMessage) return { type: 'location', ...msg.locationMessage };

        return null;
    }

    _getQuotedMessage() {
        const ctx = this.raw.message?.extendedTextMessage?.contextInfo;
        if (!ctx?.quotedMessage) return null;
        return {
            key: { remoteJid: this.chat, fromMe: ctx.participant === this.client.getUserInfo()?.id, id: ctx.stanzaId, participant: ctx.participant },
            message: ctx.quotedMessage,
            sender: ctx.participant || this.chat,
            text: this._extractTextFromMessage(ctx.quotedMessage)
        };
    }

    _extractTextFromMessage(msg) {
        if (!msg) return null;
        return msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || msg.videoMessage?.caption || msg.documentMessage?.caption || msg.audioMessage?.caption || null;
    }

    _enhanceQuotedMessage() {
        const msg = this.quoted.message;
        this.quoted.image = !!msg.imageMessage;
        this.quoted.video = !!msg.videoMessage;
        this.quoted.audio = !!msg.audioMessage;
        this.quoted.sticker = !!msg.stickerMessage;
        this.quoted.document = !!msg.documentMessage;
        this.quoted.contact = !!msg.contactMessage;
        this.quoted.location = !!msg.locationMessage;
        this.quoted.gif = !!msg.videoMessage?.gifPlayback;
        this.quoted.animated = !!msg.stickerMessage?.isAnimated;
        this.quoted.voice = !!msg.audioMessage?.ptt;
        this.quoted.download = async () => {
            const utils = require('./utils');
            return await utils.downloadMedia({ key: this.quoted.key, message: this.quoted.message }, 'buffer');
        };
    }

    parseCommand() {
        if (!this.text) return false;
        const prefix = this.config.PREFIX;
        if (!this.text.startsWith(prefix)) return false;
        const args = this.text.slice(prefix.length).trim().split(/\s+/);
        this.command = args.shift()?.toLowerCase();
        this.args = args;
        return !!this.command;
    }

    // ========== Send Methods ==========
    async send(content, options = {}, type = null, jid = null) {
        let target = jid || this.chat;
        let msgOpts = (typeof options === 'string' && !type) ? {} : { ...options };
        if (typeof options === 'string' && !type) target = options;

        if (type) msgOpts[type] = content;
        else if (typeof content === 'string') msgOpts.text = content;
        else if (Buffer.isBuffer(content)) msgOpts.image = content;
        else if (typeof content === 'object') Object.assign(msgOpts, content);

        if (target === this.chat && msgOpts.quoted === undefined && options.quote !== false) {
            msgOpts.quoted = this.raw;
        }
        return await this.client.sendMessage(target, msgOpts);
    }

    async reply(content, options = {}, type = null) {
        return await this.send(content, { ...options, quoted: this.raw }, type);
    }

    async react(emoji) {
        return await this.client.sendMessage(this.chat, { react: { text: emoji, key: this.raw.key } });
    }
    async delete(target) {
        if (!target?.key) return { success: false };

        try {
            const sock = this.client.sock || this.client;
            await sock.sendMessage(target.key.remoteJid, { delete: target.key });
            return { success: true };
        } catch (err) {
            return { success: false };
        }
    }

    async sendImage(buf, caption = '', options = {}) { return this.send({ image: buf, caption }, options); }
    async sendVideo(buf, caption = '', options = {}) { return this.send({ video: buf, caption }, options); }
    async sendAudio(buf, options = {}) { return this.send({ audio: buf }, options); }
    async sendSticker(buf, options = {}) { return this.send({ sticker: buf }, options); }
    async sendDocument(buf, fileName, mimetype, options = {}) { return this.send({ document: buf, fileName, mimetype }, options); }

    // ========== Utilities ==========
    async download() { const utils = require('./utils'); return this.hasMedia ? utils.downloadMedia(this.raw, 'buffer') : null; }
    async downloadAndSaveMediaMessage() { const utils = require('./utils'); return utils.downloadMedia(this.raw, 'path'); }
    async downloadMediaMessage() { const utils = require('./utils'); return utils.downloadMedia(this.raw, 'buffer'); }
    async sendFromUrl(url, options = {}) { const utils = require('./utils'); const buf = await utils.downloadFromUrl(url); return buf ? this.send({ image: buf, ...options }) : null; }

    hasMediaType(type) { return this.media?.type === type; }
    arg(i, def = '') { return this.args[i] || def; }
    argsText(sep = ' ') { return this.args.join(sep); }
    hasPermission(level = 'user') {
        if (level === 'owner') return this.isOwner;
        if (level === 'sudo') return this.isSudo || this.isOwner;
        return true;
    }
    getUserMention() { return `@${this.sender.split('@')[0]}`; }
    getFormattedTime() { return this.date.toLocaleString(); }

    // ========== Group Methods ==========
    async kick(users) { return this.client.sock.groupParticipantsUpdate(this.chat, [].concat(users), 'remove'); }
    async add(users) { return this.client.sock.groupParticipantsUpdate(this.chat, [].concat(users), 'add'); }
    async promote(users) { return this.client.sock.groupParticipantsUpdate(this.chat, [].concat(users), 'promote'); }
    async demote(users) { return this.client.sock.groupParticipantsUpdate(this.chat, [].concat(users), 'demote'); }
 

    get mention() { return this.raw.message?.extendedTextMessage?.contextInfo?.mentionedJid || []; }

    isBot(sender, client) {
        try {
            const botInfo = client.getUserInfo();
            if (!botInfo?.id) return false;
            const norm = j => j.split('@')[0].split(':')[0];
            return norm(botInfo.id) === norm(sender);
        } catch { return false; }
    }

    get gid() { return this.chat; }
    
    get botJid() {
        const rawJid = this.client.sock.user.id;
        return rawJid.includes(':')
            ? rawJid.split(':')[0] + '@s.whatsapp.net'
            : rawJid;
    }

    async isAdmin(jid) {
        if (!this.isGroup) return false;

        try {
            const metadata = await this.client.sock.groupMetadata(this.chat);

            const participant = metadata.participants.find(p => p.id === jid);

            return !!(participant && (participant.admin === 'admin' || participant.admin === 'superadmin'));
        } catch (e) {
            console.error('isAdmin check failed:', e);
            return false;
        }
    }

}

module.exports = { Message };