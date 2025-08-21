const { Client } = require('./client');
const { PluginManager } = require('./plugin-manager');
const { MessageHandler } = require('./message-handler');
const { Config } = require('./config');

class ManjiBot {
    constructor() {
        this.config = new Config();
        this.client = new Client(this.config);
        this.pluginManager = new PluginManager();
        this.messageHandler = new MessageHandler(this.config, this.pluginManager);
        this.isRunning = false;
    }

    async start() {
        try {

            // Set global start time for uptime calculation
            global.startTime = Date.now();



            // Load plugins
            await this.pluginManager.loadPlugins();

            // Connect to WhatsApp
            await this.client.connect();

            // Setup message handler
            this.client.on('message', (message) => {
                this.messageHandler.handle(this.client, message);
            });

            // Make plugin manager available to client
            this.client.pluginManager = this.pluginManager;
            this.isRunning = true;

            console.log('✅ Bot started');

        } catch (error) {
            console.error('❌ Failed to start bot:', error);
            throw error;
        }
    }

    async stop() {
        if (!this.isRunning) return;

        try {
            // Gracefully disconnect without logging out
            await this.client.shutdown();
            this.isRunning = false;
        } catch (error) {
            console.error('❌ Error stopping bot:', error);
            this.isRunning = false;
        }
    }

    async restart() {
        await this.stop();
        await this.start();
    }

    getStatus() {
        return {
            running: this.isRunning,
            connected: this.client.isConnected(),
            commands: this.pluginManager.getCommandCount(),
            uptime: this.client.getUptime()
        };
    }
}

module.exports = { ManjiBot };