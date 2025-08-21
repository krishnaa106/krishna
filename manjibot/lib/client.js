const { EventEmitter } = require('events');
const pino = require('pino');
const readline = require('readline');
const qrcode = require('qrcode-terminal');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers
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
        this.maxReconnectAttempts = Infinity; // Always try to reconnect
        this.reconnectDelay = 5000; // 5 seconds initial delay
        this.maxReconnectDelay = 60000; // Max 60 seconds delay

        // Tracker system
        this.trackers = new Map();
    }

    /**
     * Connect to WhatsApp
     */
    async connect() {
        try {
            // Clean up existing connection
            if (this.sock) {
                this.sock.ev.removeAllListeners();
                this.sock = null;
            }

            // Set up authentication with persistent session
            const { state, saveCreds } = await useMultiFileAuthState('./session');

            // Create WhatsApp socket
            this.sock = makeWASocket({
                auth: state,
                syncFullHistory: false,
                markOnlineOnConnect: this.config.ALWAYS_ONLINE || false,
                browser: Browsers.macOS("ManjiBot"),
                logger: pino({ level: 'silent' }),
                getMessage: async () => ({ conversation: null }),
                timeoutMs: 60000
            });

            console.log('🔄 Connecting to WhatsApp...');

            // Handle credentials update
            this.sock.ev.on('creds.update', saveCreds);

            // Handle connection updates
            this.sock.ev.on('connection.update', this.handleConnectionUpdate.bind(this));

            // Handle messages
            this.sock.ev.on('messages.upsert', this.handleMessages.bind(this));

            // Handle pairing code or QR (only for new sessions)
            if (!state.creds?.registered) {
                await this.handleAuth();
            }

            return this.sock;

        } catch (error) {
            console.error('❌ Failed to connect:', error);
            this.scheduleReconnect();
        }
    }

    /**
     * Handle authentication (QR or pairing code)
     */
    async handleAuth() {
        try {
            if (!this.config.QR) {
                // Pairing code mode
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });

                const phoneNumber = await new Promise((resolve) => {
                    rl.question('📱 Enter your phone number (with country code): ', resolve);
                });

                rl.close();

                try {
                    const code = await this.sock.requestPairingCode(phoneNumber.replace(/[^\d]/g, ''));
                    console.log(`🔑 Your pairing code: ${code}`);
                    console.log('📱 Enter this code on WhatsApp Web to link your device.');
                } catch (error) {
                    console.error('❌ Failed to get pairing code:', error);
                    console.log('📱 Falling back to QR code mode...');
                }
            }
        } catch (error) {
            console.error('❌ Authentication setup failed:', error);
        }
    }

    /**
     * Handle connection updates
     */
    async handleConnectionUpdate({ connection, lastDisconnect, qr }) {
        // Handle QR code
        if (qr && this.config.QR) {
            console.log('📱 Scan this QR code to log in:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            console.log('� Connected to WhatsApp!');
            this.connected = true;
            this.startTime = Date.now();
            this.reconnectAttempts = 0;
            this.reconnectDelay = 5000; // Reset delay
            this.emit('connected');
        }

        if (connection === 'close') {
            this.connected = false;
            this.emit('disconnected');

            const reason = lastDisconnect?.error?.output?.statusCode;
            console.log(`🔴 Disconnected. Reason: ${reason || 'Unknown'}`);

            if (reason === DisconnectReason.loggedOut) {
                console.log('� Session expired. Delete session folder and re-authenticate.');
                return;
            }

            console.log('🔄 Reconnecting...');
            this.scheduleReconnect();
        }
    }

    /**
     * Schedule reconnection with exponential backoff
     */
    scheduleReconnect() {
        this.reconnectAttempts++;

        // Calculate delay with exponential backoff
        const delay = Math.min(
            this.reconnectDelay * Math.pow(1.5, Math.min(this.reconnectAttempts - 1, 10)),
            this.maxReconnectDelay
        );

        console.log(`🔄 Scheduling reconnection attempt ${this.reconnectAttempts} in ${Math.round(delay / 1000)} seconds...`);

        setTimeout(async () => {
            try {
                console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}...`);
                await this.connect();
            } catch (error) {
                console.error('❌ Reconnection failed:', error.message);
                // Schedule another reconnection
                this.scheduleReconnect();
            }
        }, delay);
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

            // Process through god-level trackers first
            await this.processTrackers(message);

            // Emit message event for command handling
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
            try {
                this.sock.ev.removeAllListeners();
                if (this.sock.ws) {
                    this.sock.ws.close();
                }
                this.sock = null;
            } catch (error) {
                console.error('❌ Error during disconnect:', error);
            }
        }

        this.connected = false;
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        this.trackers.clear();
        await this.disconnect();
    }



    /**
     * Simple tracker processing
     */
    async processTrackers(message) {
        // Basic tracker processing - can be extended later
        this.emit('tracker', message);
    }
}

module.exports = { Client };