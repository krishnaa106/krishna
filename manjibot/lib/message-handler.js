const { Message } = require('./message');

/**
 * Message handler for ManjiBot
 * Processes incoming messages and routes them to appropriate plugins
 */
class MessageHandler {
    constructor(config, pluginManager) {
        this.config = config;
        this.pluginManager = pluginManager;
        this.rateLimiter = new Map();
    }

    /**
     * Handle incoming message
     */
    async handle(client, rawMessage) {
        try {
            // Create message wrapper
            const message = new Message(client, rawMessage, this.config);
            
            // Skip if no text content
            if (!message.text) return;
            
            // Parse command
            if (!message.parseCommand()) return;
            
            // Check rate limiting
            if (this.isRateLimited(message)) return;
            
            // Find and execute command
            const command = this.pluginManager.getCommand(message.command);
            if (!command) return;
            
            // Check permissions
            if (!this.checkPermissions(message, command)) {
                await message.react('🚫');
                await message.reply('_You don\'t have permission to use this command._');
                return;
            }
            
            // Pass plugin manager reference to message
            message.client.pluginManager = this.pluginManager;
            
            // Execute command
            await this.executeCommand(command, message);
            
        } catch (error) {
            console.error('❌ Message handling error:', error);
        }
    }

    /**
     * Check if user is rate limited
     */
    isRateLimited(message) {
        const key = message.sender;
        const now = Date.now();
        const limit = message.isSudo ? 1000 : 3000; // 1s for sudo, 3s for others
        
        if (this.rateLimiter.has(key)) {
            const lastUsed = this.rateLimiter.get(key);
            if (now - lastUsed < limit) {
                return true;
            }
        }
        
        this.rateLimiter.set(key, now);
        return false;
    }

    /**
     * Check command permissions
     */
    checkPermissions(message, command) {
        // Public mode - everyone can use commands
        if (this.config.isPublic()) return true;
        
        // Private mode - only sudo users
        if (command.sudo && !message.isSudo) return false;
        
        // Owner only commands
        if (command.owner && !message.isOwner) return false;
        
        // Group only commands
        if (command.group && !message.isGroup) return false;
        
        // Private only commands
        if (command.private && !message.isPrivate) return false;
        
        return true;
    }

    /**
     * Execute command with error handling
     */
    async executeCommand(command, message) {
        try {
            // Add reaction to show processing
            if (command.react !== false) {
                await message.react('⏳');
            }
            
            // Execute the command
            await command.execute(message);
            
            // Remove processing reaction
            if (command.react !== false) {
                setTimeout(() => message.react(''), 2000);
            }
            
        } catch (error) {
            console.error(`❌ Command execution error [${command.name}]:`, error);
            
            // Show error reaction
            await message.react('❌');
            
            // Send error message to user
            if (message.isSudo) {
                await message.reply(`_Error: ${error.message}_`);
            } else {
                await message.reply('_An error occurred while executing the command._');
            }
        }
    }
}

module.exports = { MessageHandler };