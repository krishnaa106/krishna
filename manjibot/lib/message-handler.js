const { Message } = require('./message');
const { Manji } = require('./manji');

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

    async handle(client, rawMessage) {
        try {
            const message = new Message(client, rawMessage, this.config);

            // Process message through trackers first (tracks ALL messages)
            const utils = require('./utils');
            await utils.processTrackers(client, message);

            // If no text, skip command processing
            if (!message.text) return;

            // Check if it's a command
            if (!message.parseCommand()) return;

            // Check rate limiting
            if (this.isRateLimited(message)) return;

            // Try to find command by pattern matching
            const command = this.findCommandByPattern(message.text);
            if (!command) return;

            // Check permissions with separated ignore/validation logic
            const permissionCheck = this.checkPermissions(message, command);
            if (!permissionCheck.allowed) {
                // Silent ignore (no reaction or message)
                if (permissionCheck.silent) {
                    return;
                }

                // Show validation error with reaction and message
                await message.react('🚫');

                // Send specific error message based on reason
                const errorMessages = {
                    'GROUP_ONLY': '_This command can only be used in groups_',
                    'PM_ONLY': '_This command can only be used in private messages_',
                    'SUDO_ONLY': '_This command requires sudo access_'
                };

                const errorMsg = errorMessages[permissionCheck.reason] || '_You don\'t have permission to use this command._';
                await message.reply(errorMsg);
                return;
            }

            // Initialize Manji god-level class for this message
            const manji = new Manji(client, this.config);
            message.manji = manji; // Keep for backward compatibility
            message.client.pluginManager = this.pluginManager;

            await this.executeCommand(command, message, manji);

        } catch (error) {
            console.error('❌ Message handling error:', error);
        }
    }

    findCommandByPattern(text) {
        const prefix = this.config.PREFIX;
        if (!text.startsWith(prefix)) return null;

        const commandText = text.slice(prefix.length).trim();

        // Try exact match first
        const exactMatch = this.pluginManager.getCommand(commandText.split(' ')[0]);
        if (exactMatch) return exactMatch;

        // Try pattern matching
        for (const [name, command] of this.pluginManager.commands.entries()) {
            if (command.pattern) {
                // Handle different pattern formats
                let regexPattern = command.pattern;
                regexPattern = regexPattern.replace(/\?\(\.\*\)/g, '(.*)');
                regexPattern = regexPattern.replace(/\?\.\*/g, '(.*)');
                const regex = new RegExp(`^${regexPattern}$`, 'i');
                if (regex.test(commandText)) {
                    return command;
                }
            }
        }

        return null;
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
     * Check command permissions - separated into ignore checks and validation checks
     */
    checkPermissions(message, command) {
        // IGNORE CHECKS (silently ignore, no error messages)

        // Private mode - only sudo users and bot itself can use commands
        if (!this.config.isPublic()) {
            if (!message.isSudo && !message.isOwner) {
                return { allowed: false, reason: 'BOT_PRIVATE_MODE', silent: true };
            }
        }

        // Owner only commands (ignore silently)
        if (command.fromMe && !message.isOwner) {
            return { allowed: false, reason: 'OWNER_ONLY', silent: true };
        }

        // Bot only commands (ignore silently)
        if (command.botOnly && !message.fromMe) {
            return { allowed: false, reason: 'BOT_ONLY', silent: true };
        }

        // VALIDATION CHECKS (show error messages)

        // Group only check
        if (command.group && !message.isGroup) {
            return { allowed: false, reason: 'GROUP_ONLY', silent: false };
        }

        // Private message only check
        if (command.pm && !message.isPrivate) {
            return { allowed: false, reason: 'PM_ONLY', silent: false };
        }

        // Sudo only check
        if (command.sudo && !message.isSudo && !message.isOwner) {
            return { allowed: false, reason: 'SUDO_ONLY', silent: false };
        }

        // Legacy support for old permission system
        if (command.owner && !message.isOwner) {
            return { allowed: false, reason: 'OWNER_REQUIRED', silent: true };
        }

        if (command.private && !message.isPrivate) {
            return { allowed: false, reason: 'PRIVATE_REQUIRED', silent: false };
        }

        return { allowed: true };
    }

    async executeCommand(command, message, manji) {
        try {
            if (command.react !== false) {
                await message.react('⏳');
            }

            // Extract match groups for pattern commands
            let match = null;
            if (command.pattern) {
                const prefix = this.config.PREFIX;
                const commandText = message.text.slice(prefix.length).trim();
                // Handle different pattern formats
                let regexPattern = command.pattern;
                regexPattern = regexPattern.replace(/\?\(\.\*\)/g, '(.*)');
                regexPattern = regexPattern.replace(/\?\.\*/g, '(.*)');
                const regex = new RegExp(`^${regexPattern}$`, 'i');
                const matches = commandText.match(regex);
                if (matches && matches[1]) {
                    match = matches[1].trim();
                }
            }

            // Execute with match parameter and manji instance
            if (command.handler && match !== null) {
                await command.handler(message, match, manji);
            } else if (command.handler) {
                await command.handler(message, match, manji);
            } else {
                await command.execute(message, null, manji);
            }

            if (command.react !== false) {
                setTimeout(() => message.react(''), 2000);
            }

        } catch (error) {
            console.error(`❌ Command execution error [${command.name}]:`, error);

            await message.react('❌');

            if (message.isSudo) {
                await message.reply(`_Error: ${error.message}_`);
            } else {
                await message.reply('_An error occurred while executing the command._');
            }
        }
    }
}

module.exports = { MessageHandler };