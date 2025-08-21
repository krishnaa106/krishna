const fs = require('fs');
const path = require('path');

class PluginManager {
    constructor() {
        this.commands = new Map();
        this.plugins = new Map();
        this.pluginDirs = [
            path.join(__dirname, '..', 'plugins'),
            path.join(__dirname, '..', 'custom-plugins')
        ];
        
        // Make bot function globally available for plugins
        global.bot = this.registerCommand.bind(this);
    }

    async loadPlugins() {
        for (const dir of this.pluginDirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                continue;
            }
            
            await this.loadPluginsFromDirectory(dir);
        }
    }

    async loadPluginsFromDirectory(dir) {
        const files = fs.readdirSync(dir).filter(file => file.endsWith('.js'));
        
        for (const file of files) {
            try {
                await this.loadPlugin(path.join(dir, file));
            } catch (error) {
                console.error(`❌ Failed to load plugin ${file}:`, error.message);
            }
        }
    }

    async loadPlugin(filePath) {
        delete require.cache[require.resolve(filePath)];
        
        const pluginName = path.basename(filePath, '.js');
        
        // Just require the plugin file - it will call bot() function internally
        require(filePath);
        
        this.plugins.set(pluginName, { loaded: true });
    }

    registerCommand(commandConfig, handler) {
        // Handle both old and new formats
        let config, execute;
        
        if (typeof commandConfig === 'object' && commandConfig.pattern) {
            // New format: bot({pattern: 'cmd', desc: '...', type: '...'}, async (message, match) => {})
            config = commandConfig;
            execute = handler;
        } else {
            // Old format: direct command object
            config = commandConfig;
            execute = commandConfig.execute;
        }
        
        // Extract command name from pattern
        const pattern = config.pattern || config.name || config.command;
        if (!pattern) return;
        
        // Parse pattern to get command name
        const commandName = pattern.replace(/\s*\?\.\*|\s*\?\(\.\*\)|\s*\(\.\*\)/g, '').trim().toLowerCase();
        
        const command = {
            name: commandName,
            pattern: pattern,
            aliases: config.aliases || [],
            description: config.description || config.desc || 'No description',
            category: config.category || config.type || 'general',
            usage: config.usage || '',
            
            // Validation checks (show error messages)
            group: config.group || config.groupOnly || config.onlyGroup || false,
            pm: config.pm || config.pmOnly || config.onlyPrivate || config.private || false,
            sudo: config.sudo || config.sudoOnly || false,
            
            // Ignore checks (silently ignore)
            fromMe: config.fromMe || config.ownerOnly || config.owner || false,
            botOnly: config.botOnly || false,
            
            // Legacy support
            sudo: config.sudo || config.fromMe || false,
            owner: config.owner || false,
            group: config.group || false,
            private: config.private || false,
            
            react: config.react !== false,
            execute: execute || config.execute,
            handler: handler || execute
        };
        
        this.commands.set(commandName, command);
        
        if (Array.isArray(command.aliases)) {
            command.aliases.forEach(alias => {
                this.commands.set(alias.toLowerCase(), command);
            });
        }
    }

    /**
     * Get command by name
     */
    getCommand(name) {
        return this.commands.get(name.toLowerCase());
    }

    /**
     * Get all commands
     */
    getAllCommands() {
        return Array.from(this.commands.values())
            .filter((cmd, index, arr) => arr.findIndex(c => c.name === cmd.name) === index); // Remove duplicates
    }

    /**
     * Get commands by category
     */
    getCommandsByCategory(category) {
        return this.getAllCommands().filter(cmd => cmd.category === category);
    }

    /**
     * Get all categories
     */
    getCategories() {
        const categories = new Set();
        this.getAllCommands().forEach(cmd => categories.add(cmd.category));
        return Array.from(categories);
    }

    /**
     * Get command count
     */
    getCommandCount() {
        return this.getAllCommands().length;
    }

    /**
     * Reload all plugins
     */
    async reloadPlugins() {
        this.commands.clear();
        this.plugins.clear();
        await this.loadPlugins();
    }

    /**
     * Reload specific plugin
     */
    async reloadPlugin(pluginName) {
        // Remove existing commands from this plugin
        const commandsToRemove = [];
        for (const [name, command] of this.commands.entries()) {
            if (command.plugin === pluginName) {
                commandsToRemove.push(name);
            }
        }
        
        commandsToRemove.forEach(name => this.commands.delete(name));
        this.plugins.delete(pluginName);
        
        // Reload the plugin
        const pluginPath = path.join(__dirname, '..', 'plugins', `${pluginName}.js`);
        if (fs.existsSync(pluginPath)) {
            await this.loadPlugin(pluginPath);
        }
    }

    /**
     * Get plugin info
     */
    getPluginInfo(pluginName) {
        const plugin = this.plugins.get(pluginName);
        if (!plugin) return null;
        
        const commands = this.getAllCommands().filter(cmd => cmd.plugin === pluginName);
        
        return {
            name: pluginName,
            commands: commands.map(cmd => cmd.name),
            commandCount: commands.length
        };
    }
}

module.exports = { PluginManager };