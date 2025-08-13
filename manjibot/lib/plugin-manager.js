const fs = require('fs');
const path = require('path');

/**
 * Plugin manager for ManjiBot
 * Handles loading, registering, and managing plugins
 */
class PluginManager {
    constructor() {
        this.commands = new Map();
        this.plugins = new Map();
        this.pluginDirs = [
            path.join(__dirname, '..', 'plugins'),
            path.join(__dirname, '..', 'custom-plugins')
        ];
    }

    /**
     * Load all plugins from plugin directories
     */
    async loadPlugins() {
        console.log('📦 Loading plugins...');
        
        for (const dir of this.pluginDirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                continue;
            }
            
            await this.loadPluginsFromDirectory(dir);
        }
        
        console.log(`✅ Loaded ${this.commands.size} commands from ${this.plugins.size} plugins`);
    }

    /**
     * Load plugins from a specific directory
     */
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

    /**
     * Load a single plugin file
     */
    async loadPlugin(filePath) {
        // Clear require cache for hot reloading
        delete require.cache[require.resolve(filePath)];
        
        const plugin = require(filePath);
        const pluginName = path.basename(filePath, '.js');
        
        // Handle different plugin export formats
        if (typeof plugin === 'function') {
            // Function that returns command config
            const commandConfig = plugin();
            this.registerCommand(commandConfig, pluginName);
        } else if (Array.isArray(plugin)) {
            // Array of commands
            plugin.forEach((cmd, index) => {
                this.registerCommand(cmd, `${pluginName}_${index}`);
            });
        } else if (plugin.command || plugin.name) {
            // Single command object
            this.registerCommand(plugin, pluginName);
        } else if (typeof plugin === 'object') {
            // Object with multiple commands
            Object.entries(plugin).forEach(([key, cmd]) => {
                if (cmd.name || cmd.command) {
                    this.registerCommand(cmd, `${pluginName}_${key}`);
                }
            });
        }
        
        this.plugins.set(pluginName, plugin);
    }

    /**
     * Register a command
     */
    registerCommand(commandConfig, pluginName) {
        // Validate command config
        if (!commandConfig.name && !commandConfig.command) {
            throw new Error(`Command in ${pluginName} must have a name or command property`);
        }
        
        if (!commandConfig.execute || typeof commandConfig.execute !== 'function') {
            throw new Error(`Command in ${pluginName} must have an execute function`);
        }
        
        // Normalize command config
        const command = {
            name: commandConfig.name || commandConfig.command,
            aliases: commandConfig.aliases || commandConfig.alias || [],
            description: commandConfig.description || commandConfig.desc || 'No description',
            category: commandConfig.category || commandConfig.type || 'general',
            usage: commandConfig.usage || '',
            example: commandConfig.example || '',
            sudo: commandConfig.sudo || commandConfig.fromMe || false,
            owner: commandConfig.owner || false,
            group: commandConfig.group || false,
            private: commandConfig.private || false,
            react: commandConfig.react !== false, // Default true
            execute: commandConfig.execute,
            plugin: pluginName
        };
        
        // Register main command
        this.commands.set(command.name.toLowerCase(), command);
        
        // Register aliases
        if (Array.isArray(command.aliases)) {
            command.aliases.forEach(alias => {
                this.commands.set(alias.toLowerCase(), command);
            });
        }
        
        console.log(`  ✓ ${command.name} (${command.category})`);
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