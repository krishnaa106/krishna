const { EventEmitter } = require('events');
const pino = require('pino');
const readline = require('readline');
const qrcode = require('qrcode-terminal');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

/**
 * WhatsApp Client wrapper for ManjiBot
 */
class Client extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.sock = null;
        this.connected = false;
        this.startTime = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    /**
     * Connect to WhatsApp
     */
    async connect() {
        try {
            console.log('🔗 Connecting to WhatsApp...');
            
            // Get latest Baileys version
            const { version, isLatest } = await fetchLatestBaileysVersion();
            console.log(`📱 Using WA v${version.join('.')}, isLatest: ${isLatest}`);

            // Set up authentication
            const { state, saveCreds } = await useMultiFileAuthState('./session');

            // Create WhatsApp socket
            this.sock = makeWASocket({
                version,
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: 'silent' }),
                browser: Browsers.macOS('ManjiBot'),
                syncFullHistory: false,
                markOnlineOnConnect: this.config.ALWAYS_ONLINE,
                getMessage: async () => ({ conversation: null })
            });

            // Handle credentials update
            this.sock.ev.on('creds.update', saveCreds);

            // Handle connection updates
            this.sock.ev.on('connection.update', this.handleConnectionUpdate.bind(this));

            // Handle messages
            this.sock.ev.on('messages.upsert', this.handleMessages.bind(this));

            // Handle pairing code or QR
            await this.handleAuth();

        } catch (error) {
            console.error('❌ Failed to connect:', error);
            throw error;
        }
    }

    /**
     * Handle authentication (QR or pairing code)
     */
    async handleAuth() {
        if (!this.sock.authState.creds.registered) {
            if (this.config.QR) {
                // QR Code mode
                this.sock.ev.on('connection.update', ({ qr }) => {
                    if (qr) {
                        console.log('📱 Scan this QR code:');
                        qrcode.generate(qr, { small: true });
                    }
                });
            } else {
                // Pairing code mode
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });

                const phoneNumber = await new Promise((resolve) => {
                    rl.question('📱 Enter your phone number: ', resolve);
                });

                rl.close();

                try {
                    const code = await this.sock.requestPairingCode(phoneNumber);
                    console.log(`🔑 Your pairing code: ${code}`);
                } catch (error) {
                    console.error('❌ Failed to get pairing code:', error);
                }
            }
        }
    }

    /**
     * Handle connection updates
     */
    async handleConnectionUpdate({ connection, lastDisconnect }) {
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            
            if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                console.log(`🔄 Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                setTimeout(() => this.connect(), 5000);
            } else if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
                console.log('🚪 Logged out. Please delete session folder and restart.');
            } else {
                console.log('❌ Max reconnection attempts reached.');
            }
            
            this.connected = false;
            this.emit('disconnected');
            
        } else if (connection === 'open') {
            console.log('🟢 Connected to WhatsApp!');
            this.connected = true;
            this.startTime = Date.now();
            this.reconnectAttempts = 0;
            this.emit('connected');
        }
    }

    /**
     * Handle incoming messages
     */
    async handleMessages({ messages, type }) {
        if (type !== 'notify') return;

        for (const message of messages) {
            if (!message.message) continue;
            
            // Auto-read messages if enabled
            if (this.config.AUTO_READ) {
                await this.markAsRead(message);
            }

            // Emit message event
            this.emit('message', message);
        }
    }

    /**
     * Send a message
     */
    async sendMessage(jid, content, options = {}) {
        if (!this.connected) {
            throw new Error('Not connected to WhatsApp');
        }

        try {
            return await this.sock.sendMessage(jid, content, options);
        } catch (error) {
            console.error('❌ Failed to send message:', error);
            throw error;
        }
    }

    /**
     * Mark message as read
     */
    async markAsRead(message) {
        try {
            await this.sock.readMessages([message.key]);
        } catch (error) {
            console.error('❌ Failed to mark as read:', error);
        }
    }

    /**
     * React to a message
     */
    async react(message, emoji) {
        try {
            await this.sendMessage(message.key.remoteJid, {
                react: { text: emoji, key: message.key }
            });
        } catch (error) {
            console.error('❌ Failed to react:', error);
        }
    }

    /**
     * Download media from message
     */
    async downloadMedia(message) {
        try {
            const utils = require('./utils');
            return await utils.downloadMedia(message, 'buffer');
        } catch (error) {
            console.error('❌ Failed to download media:', error);
            return null;
        }
    }

    /**
     * Get user info
     */
    getUserInfo() {
        return this.sock?.user || null;
    }

    /**
     * Check if connected
     */
    isConnected() {
        return this.connected;
    }

    /**
     * Get uptime in milliseconds
     */
    getUptime() {
        return this.startTime ? Date.now() - this.startTime : 0;
    }

    /**
     * Disconnect from WhatsApp
     */
    async disconnect() {
        if (this.sock) {
            await this.sock.logout();
            this.sock = null;
        }
        this.connected = false;
    }
}

module.exports = { Client };