
const ping = {
    name: 'ping',
    description: 'Check bot response time',
    category: 'general',
    execute: async (message) => {
        const start = Date.now();
        const sent = await message.reply('🏓 Pinging...');
        const end = Date.now();
        

        await message.client.sendMessage(message.chat, {
            text: `🏓 Pong! ${end - start}ms`,
            edit: sent.key
        });
    }
};


const hello = {
    name: 'hello',
    aliases: ['hi', 'hey'],
    description: 'Say hello',
    category: 'general',
    execute: async (message) => {
        const name = message.arg(0, 'there');
        await message.reply(`Hello ${name}! 👋`);
    }
};

// Bot info command
const info = {
    name: 'info',
    aliases: ['about', 'bot'],
    description: 'Get bot information',
    category: 'general',
    execute: async (message) => {
        const uptime = message.client.getUptime();
        const uptimeStr = formatUptime(uptime);
        
        const info = `🤖 *ManjiBot v1.0*

📊 *Status:*
• Uptime: ${uptimeStr}
• Commands: ${message.client.pluginManager?.getCommandCount() || 'N/A'}
• Mode: ${message.config.BOT_MODE}

👨‍💻 *Developer:* manjisama
🔗 *GitHub:* github.com/manjisama/manjibot

_A simple and scalable WhatsApp bot_`;

        await message.reply(info);
    }
};

const menu = {
    name: 'menu',
    aliases: ['help', 'commands'],
    description: 'Show bot menu',
    category: 'general',
    execute: async (message) => {
        const category = message.arg(0);
        
        if (category) {
            const commands = message.client.pluginManager?.getCommandsByCategory(category) || [];
            
            if (commands.length === 0) {
                return await message.reply(`No commands found in category: *${category}*`);
            }
            
            let text = `╭─────────────────────────╮
│  *${category.toUpperCase()} COMMANDS*
╰─────────────────────────╯\n\n`;
            
            commands.forEach(cmd => {
                text += `┌─⊷ *${message.config.PREFIX}${cmd.name}*`;
                if (cmd.aliases && cmd.aliases.length > 0) {
                    text += ` (${cmd.aliases.map(a => message.config.PREFIX + a).join(', ')})`;
                }
                text += '\n';
                if (cmd.description) text += `│ └ ${cmd.description}\n`;
                text += '└───────────────\n\n';
            });
            
            text += `Use ${message.config.PREFIX}menu to see all categories`;
            
            await message.reply(text);
        } else {
            const uptime = message.client.getUptime();
            const uptimeStr = formatUptime(uptime);
            const categories = message.client.pluginManager?.getCategories() || [];
            const totalCommands = message.client.pluginManager?.getCommandCount() || 0;
            
            let menuText = `╭──────────────────
│     *${message.config.BOT_NAME.toUpperCase()} MENU*   
╰───────────────────

┌─⊷ *BOT INFO*
│ • *Name:* ${message.config.BOT_NAME}
│ • *Version:* 1.0.0
│ • *Prefix:* ${message.config.PREFIX}
│ • *Mode:* ${message.config.BOT_MODE}
│ • *Uptime:* ${uptimeStr}
│ • *Commands:* ${totalCommands}
└───────────────\n\n`;

            categories.forEach(cat => {
                const commands = message.client.pluginManager?.getCommandsByCategory(cat) || [];
                
                if (cat === 'admin' && !message.isSudo) return;
                
                menuText += `┌─⊷ *${cat.toUpperCase()} COMMANDS*\n`;
                
                commands.slice(0, 6).forEach(cmd => {
                    menuText += `│ • ${message.config.PREFIX}${cmd.name}`;
                    if (cmd.description) menuText += ` - ${cmd.description}`;
                    menuText += '\n';
                });
                
                if (commands.length > 6) {
                    menuText += `│ • ... and ${commands.length - 6} more\n`;
                }
                
                menuText += '└───────────────\n\n';
            });

            menuText += `Get detailed help:
• ${message.config.PREFIX}menu <category>
• Example: ${message.config.PREFIX}menu sticker

> Developed by manjisama`;

            await message.reply(menuText);
        }
    }
};

const help = {
    name: 'help',
    description: 'Show help for commands',
    category: 'general',
    execute: async (message) => {
        return await menu.execute(message);
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

// Export all commands
const alive = {
    name: 'alive',
    description: 'Check if bot is alive',
    category: 'general',
    execute: async (message) => {
        const uptime = message.client.getUptime();
        const uptimeStr = formatUptime(uptime);
        
        const aliveMsg = `
🤖 *ManjiBot is Alive!*

⏰ *Uptime:* ${uptimeStr}
🔋 *Status:* Active
🌐 *Mode:* ${message.config.BOT_MODE}
📱 *Platform:* WhatsApp

_Bot is running smoothly!_`;

        await message.reply(aliveMsg);
    }
};

module.exports = [ping, hello, info, menu, help, alive];