const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'config.env') });

/**
 * Configuration manager for ManjiBot
 */
class Config {
    constructor() {
        this.configPath = path.join(__dirname, '..', 'config.env');
        this.load();
    }

    /**
     * Load configuration from environment
     */
    load() {
        this.BOT_NAME = '𝐕𝐈𝐍𝐒𝐌𝐎𝐊𝐄'; // Permanent bot name
        this.PREFIX = process.env.PREFIX || '.';
        this.BOT_MODE = process.env.BOT_MODE || 'private'; // private, public
        this.SUDO = process.env.SUDO ? process.env.SUDO.split(',').map(s => s.trim()) : [];
        
        // WhatsApp settings
        this.QR = process.env.QR === 'true';
        this.AUTO_READ = process.env.AUTO_READ === 'true';
        this.AUTO_STATUS_READ = process.env.AUTO_STATUS_READ === 'true';
        this.ALWAYS_ONLINE = process.env.ALWAYS_ONLINE === 'true';
        
        // Sticker settings
        const stickerPack = process.env.STICKER_PACK || 'ManjiBot,manjisama';
        [this.STICKER_PACK_NAME, this.STICKER_AUTHOR] = stickerPack.split(',').map(s => s.trim());
        
        // API keys
        this.OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
        this.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
        this.DATABASE_URL = process.env.DATABASE_URL || '';
    }

    /**
     * Update configuration value
     */
    set(key, value) {
        this[key] = value;
        this.updateEnvFile(key, value);
    }

    /**
     * Get configuration value
     */
    get(key) {
        return this[key];
    }

    /**
     * Check if user is sudo
     */
    isSudo(jid) {
        const userJid = jid.split('@')[0];
        return this.SUDO.includes(userJid);
    }

    /**
     * Check if bot is in public mode
     */
    isPublic() {
        return this.BOT_MODE === 'public';
    }

    /**
     * Update environment file
     */
    updateEnvFile(key, value) {
        try {
            let envContent = '';
            if (fs.existsSync(this.configPath)) {
                envContent = fs.readFileSync(this.configPath, 'utf8');
            }

            const lines = envContent.split('\n');
            let found = false;

            const updatedLines = lines.map(line => {
                if (line.trim().startsWith(`${key}=`)) {
                    found = true;
                    return `${key}=${value}`;
                }
                return line;
            });

            if (!found) {
                updatedLines.push(`${key}=${value}`);
            }

            fs.writeFileSync(this.configPath, updatedLines.join('\n'));
        } catch (error) {
            console.error('❌ Failed to update config file:', error);
        }
    }

    /**
     * Get all configuration as object
     */
    toObject() {
        return {
            BOT_NAME: this.BOT_NAME,
            PREFIX: this.PREFIX,
            BOT_MODE: this.BOT_MODE,
            SUDO: this.SUDO,
            QR: this.QR,
            AUTO_READ: this.AUTO_READ,
            AUTO_STATUS_READ: this.AUTO_STATUS_READ,
            ALWAYS_ONLINE: this.ALWAYS_ONLINE,
            STICKER_PACK_NAME: this.STICKER_PACK_NAME,
            STICKER_AUTHOR: this.STICKER_AUTHOR
        };
    }
}

module.exports = { Config };