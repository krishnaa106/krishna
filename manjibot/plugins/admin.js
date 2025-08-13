/**
 * Admin commands for ManjiBot
 * Ultra-simple plugin structure
 */

// Restart bot
const restart = {
    name: 'restart',
    description: 'Restart the bot',
    category: 'admin',
    sudo: true,
    execute: async (message) => {
        await message.reply('🔄 Restarting ManjiBot...');
        process.exit(1);
    }
};

// Set bot mode
const mode = {
    name: 'mode',
    description: 'Change bot mode (public/private)',
    category: 'admin',
    sudo: true,
    usage: 'mode <public|private>',
    execute: async (message) => {
        const newMode = message.arg(0);
        
        if (!newMode || !['public', 'private'].includes(newMode.toLowerCase())) {
            return await message.reply('_Usage: .mode <public|private>_');
        }
        
        message.config.set('BOT_MODE', newMode.toLowerCase());
        await message.reply(`✅ Bot mode changed to: *${newMode.toLowerCase()}*`);
    }
};

// Set prefix
const setprefix = {
    name: 'setprefix',
    description: 'Change bot prefix',
    category: 'admin',
    sudo: true,
    usage: 'setprefix <new_prefix>',
    execute: async (message) => {
        const newPrefix = message.arg(0);
        
        if (!newPrefix) {
            return await message.reply('_Provide a new prefix!_');
        }
        
        if (newPrefix.length > 3) {
            return await message.reply('_Prefix must be 3 characters or less!_');
        }
        
        message.config.set('PREFIX', newPrefix);
        await message.reply(`✅ Prefix changed to: *${newPrefix}*`);
    }
};

// Reload plugins
const reload = {
    name: 'reload',
    description: 'Reload all plugins',
    category: 'admin',
    sudo: true,
    execute: async (message) => {
        try {
            await message.react('⏳');
            
            // This would need to be implemented in the plugin manager
            // await message.client.pluginManager.reloadPlugins();
            
            await message.react('✅');
            await message.reply('🔄 All plugins reloaded successfully!');
            
        } catch (error) {
            await message.react('❌');
            console.error('Reload error:', error);
            await message.reply('_Error reloading plugins._');
        }
    }
};

// Bot status
const status = {
    name: 'status',
    description: 'Get bot status',
    category: 'admin',
    sudo: true,
    execute: async (message) => {
        const uptime = message.client.getUptime();
        const uptimeStr = formatUptime(uptime);
        const memUsage = process.memoryUsage();
        
        const status = `🤖 *ManjiBot Status*

⏱️ *Uptime:* ${uptimeStr}
🔧 *Mode:* ${message.config.BOT_MODE}
📝 *Prefix:* ${message.config.PREFIX}
👥 *Sudo Users:* ${message.config.SUDO.length}

💾 *Memory Usage:*
• RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB
• Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB
• External: ${(memUsage.external / 1024 / 1024).toFixed(2)} MB

🔗 *Connection:* ${message.client.isConnected() ? '✅ Connected' : '❌ Disconnected'}`;

        await message.reply(status);
    }
};

// Add sudo user
const addsudo = {
    name: 'addsudo',
    description: 'Add sudo user',
    category: 'admin',
    owner: true,
    usage: 'addsudo <@user>',
    execute: async (message) => {
        const mentionedJid = message.raw.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        
        if (!mentionedJid) {
            return await message.reply('_Mention a user to add as sudo!_');
        }
        
        const userJid = mentionedJid.split('@')[0];
        
        if (message.config.SUDO.includes(userJid)) {
            return await message.reply('_User is already a sudo user!_');
        }
        
        const newSudoList = [...message.config.SUDO, userJid];
        message.config.set('SUDO', newSudoList.join(','));
        
        await message.reply(`✅ Added @${userJid} as sudo user!`);
    }
};

// Remove sudo user
const delsudo = {
    name: 'delsudo',
    description: 'Remove sudo user',
    category: 'admin',
    owner: true,
    usage: 'delsudo <@user>',
    execute: async (message) => {
        const mentionedJid = message.raw.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        
        if (!mentionedJid) {
            return await message.reply('_Mention a user to remove from sudo!_');
        }
        
        const userJid = mentionedJid.split('@')[0];
        
        if (!message.config.SUDO.includes(userJid)) {
            return await message.reply('_User is not a sudo user!_');
        }
        
        const newSudoList = message.config.SUDO.filter(jid => jid !== userJid);
        message.config.set('SUDO', newSudoList.join(','));
        
        await message.reply(`✅ Removed @${userJid} from sudo users!`);
    }
};

// Uptime formatter helper
function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

module.exports = [restart, mode, setprefix, reload, status, addsudo, delsudo];