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
            await this.pluginManager.loadPlugins();
            await this.client.connect();
            
            this.client.on('message', (message) => {
                this.messageHandler.handle(this.client, message);
            });
            
            this.client.pluginManager = this.pluginManager;
            this.isRunning = true;
            
        } catch (error) {
            console.error('❌ Failed to start ManjiBot:', error);
            throw error;
        }
    }

    async stop() {
        if (!this.isRunning) return;
        await this.client.disconnect();
        this.isRunning = false;
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