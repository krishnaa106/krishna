const fs = require('fs');
const path = require('path');


class Var {
    constructor(configPath = '../config.env') {
        this.configPath = path.join(__dirname, configPath);
    }

    /**
     * Read and parse config file
     */
    readConfig() {
        try {
            const content = fs.readFileSync(this.configPath, 'utf8');
            const config = {};

            content.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                    const [key, ...valueParts] = trimmed.split('=');
                    config[key.trim()] = valueParts.join('=').trim();
                }
            });

            return config;
        } catch (error) {
            console.error('Error reading config:', error);
            return {};
        }
    }

    /**
     * Write config back to file
     */
    writeConfig(config) {
        try {
            const lines = Object.entries(config).map(([key, value]) => `${key}=${value}`);
            fs.writeFileSync(this.configPath, lines.join('\n') + '\n');
            return true;
        } catch (error) {
            console.error('Error writing config:', error);
            return false;
        }
    }

    /**
     * Set a variable with god-level features and duplicate prevention
     */
    set(key, value, options = {}) {
        const config = this.readConfig();
        const upperKey = key.toUpperCase();

        const {
            append = false,        // Append to existing comma-separated values
            replaceNull = true,    // Replace 'null' with new value
            separator = ',',       // Separator for multiple values
            unique = true,         // Remove duplicates when appending
            allowDuplicate = false // Allow setting same value again
        } = options;

        let currentValue = config[upperKey] || '';

        // Check for duplicate key setting (same key, same value)
        if (!allowDuplicate && currentValue === value && currentValue !== '' && currentValue !== 'null') {
            return { success: false, message: `Key ${upperKey} already has the same value: ${value}` };
        }

        // Handle null replacement
        if (replaceNull && (currentValue === 'null' || currentValue === '')) {
            config[upperKey] = value;
        }
        // Handle append mode
        else if (append && currentValue && currentValue !== 'null') {
            const existingValues = currentValue.split(separator).map(v => v.trim());
            const newValues = value.split(separator).map(v => v.trim());

            let combinedValues = [...existingValues, ...newValues];

            // Remove duplicates if unique is true
            if (unique) {
                combinedValues = [...new Set(combinedValues)];
            }

            config[upperKey] = combinedValues.join(separator);
        }
        // Normal set
        else {
            config[upperKey] = value;
        }

        return { success: this.writeConfig(config), message: `Set ${upperKey} = ${value}` };
    }

    /**
     * Remove a specific value from comma-separated variable (supports KEY=VALUE format)
     */
    remove(keyOrInput, valueToRemove = null, separator = ',') {
        let key, value;

        if (keyOrInput.includes('=') && valueToRemove === null) {
            // Handle KEY=VALUE format
            const [k, ...valueParts] = keyOrInput.split('=');
            key = k.trim().toUpperCase();
            value = valueParts.join('=').trim();
        } else {
            // Handle separate key and value
            key = keyOrInput.toUpperCase();
            value = valueToRemove;
        }
        const config = this.readConfig();

        if (!config[key]) {
            return { success: false, message: 'Key not found' };
        }

        const values = config[key].split(separator).map(v => v.trim());
        const filteredValues = values.filter(v => v !== value.trim());

        if (filteredValues.length === values.length) {
            return { success: false, message: 'Value not found' };
        }

        config[key] = filteredValues.length > 0 ? filteredValues.join(separator) : 'null';

        return {
            success: this.writeConfig(config),
            message: `Removed '${value}' from ${key}`
        };
    }

    /**
     * Delete a variable completely
     */
    delete(key) {
        const config = this.readConfig();
        const upperKey = key.toUpperCase();

        if (!config[upperKey]) {
            return { success: false, message: 'Variable not found' };
        }

        delete config[upperKey];
        return {
            success: this.writeConfig(config),
            message: `Deleted ${upperKey}`
        };
    }

    /**
     * Get variable with advanced parsing
     */
    get(key, options = {}) {
        const config = this.readConfig();
        const upperKey = key.toUpperCase();

        const {
            parseArray = false,    // Parse comma-separated as array
            separator = ',',       // Separator for parsing
            defaultValue = null    // Default if not found
        } = options;

        const value = config[upperKey];

        if (!value || value === 'null') {
            return defaultValue;
        }

        if (parseArray && value.includes(separator)) {
            return value.split(separator).map(v => v.trim()).filter(v => v);
        }

        return value;
    }


    // Read all config values, include empty/null values
    getAll() {
        const config = this.readConfig(); // your env parser
        const result = {};

        Object.entries(config).forEach(([key, value]) => {
            // Include everything, even undefined, null, or empty strings
            result[key] = value;
        });

        return result;
    }

    /**
     * Format display for all config variables
     * maskSensitive: true = hide/mask sensitive keys
     */
    formatDisplay(config, options = {}) {
        const {
            maskSensitive = true,
            sensitiveKeys = ['PASSWORD', 'TOKEN', 'SECRET', 'KEY', 'API', 'PIN', 'DATABASE', 'SESSION']
        } = options;

        return Object.entries(config)
            .map(([key, value]) => {
                let displayValue = value;

                // Mask any key that contains a sensitive string
                if (maskSensitive && sensitiveKeys.some(sensitive => key.toUpperCase().includes(sensitive))) {
                    displayValue = value ? '*'.repeat(Math.min(String(value).length, 8)) : value;
                }

                // Handle null/empty
                if (displayValue === null) displayValue = 'null';
                if (displayValue === undefined) displayValue = 'undefined';
                if (displayValue === '') displayValue = '""';

                return `\`\`\`${key} = ${displayValue}\`\`\``;
            })
            .join('\n');
    }


    /**
     * Check if a value exists in comma-separated variable (supports KEY=VALUE format)
     */
    has(keyOrInput, searchValue = null, separator = ',') {
        let key, value;

        if (keyOrInput.includes('=') && searchValue === null) {
            // Handle KEY=VALUE format
            const [k, ...valueParts] = keyOrInput.split('=');
            key = k.trim().toUpperCase();
            value = valueParts.join('=').trim();
        } else {
            // Handle separate key and value
            key = keyOrInput.toUpperCase();
            value = searchValue;
        }
        const val = this.get(key);
        if (!val || val === 'null') return false;

        const values = val.split(separator).map(v => v.trim());
        return values.includes(value.trim());
    }

    /**
     * Toggle a value in comma-separated variable (supports KEY=VALUE format)
     */
    toggle(keyOrInput, value = null, separator = ',') {
        let key, val;

        if (keyOrInput.includes('=') && value === null) {
            // Handle KEY=VALUE format
            const [k, ...valueParts] = keyOrInput.split('=');
            key = k.trim().toUpperCase();
            val = valueParts.join('=').trim();
        } else {
            // Handle separate key and value
            key = keyOrInput.toUpperCase();
            val = value;
        }

        if (this.has(key, val, separator)) {
            return this.remove(key, val, separator);
        } else {
            const success = this.set(key, val, { append: true, separator, unique: true });
            return {
                success,
                message: success ? `Added '${val}' to ${key}` : 'Failed to add value'
            };
        }
    }

    /**
     * Add value to comma-separated variable (supports KEY=VALUE format)
     */
    add(keyOrInput, value = null, options = {}) {
        let key, val;

        if (keyOrInput.includes('=') && value === null) {
            // Handle KEY=VALUE format
            const [k, ...valueParts] = keyOrInput.split('=');
            key = k.trim().toUpperCase();
            val = valueParts.join('=').trim();
        } else {
            // Handle separate key and value
            key = keyOrInput.toUpperCase();
            val = value;
        }

        return this.set(key, val, {
            append: true,
            unique: true,
            replaceNull: true,
            ...options
        });
    }

    /**
     * List all values in a comma-separated variable
     */
    list(key, separator = ',') {
        const value = this.get(key);
        if (!value || value === 'null') return [];
        return value.split(separator).map(v => v.trim()).filter(v => v);
    }

    /**
     * Count values in a comma-separated variable
     */
    count(key, separator = ',') {
        return this.list(key, separator).length;
    }

    /**
     * Clear all values from a variable (set to null)
     */
    clear(key) {
        const config = this.readConfig();
        config[key.toUpperCase()] = 'null';
        return this.writeConfig(config);
    }

    /**
     * Rename a variable (supports OLD=NEW format)
     */
    rename(oldKeyOrInput, newKey = null) {
        let oldKey, newK;

        if (oldKeyOrInput.includes('=') && newKey === null) {
            // Handle OLD=NEW format
            const [old, newPart] = oldKeyOrInput.split('=');
            oldKey = old.trim().toUpperCase();
            newK = newPart.trim().toUpperCase();
        } else {
            // Handle separate keys
            oldKey = oldKeyOrInput.toUpperCase();
            newK = newKey.toUpperCase();
        }
        const config = this.readConfig();

        if (!config[oldKey]) {
            return { success: false, message: 'Old key not found' };
        }

        if (config[newK]) {
            return { success: false, message: 'New key already exists' };
        }

        config[newK] = config[oldKey];
        delete config[oldKey];

        return {
            success: this.writeConfig(config),
            message: `Renamed ${oldKey} to ${newK}`
        };
    }

    /**
     * Copy a variable to another key (supports SOURCE=TARGET format)
     */
    copy(sourceKeyOrInput, targetKey = null) {
        let sourceKey, targetK;

        if (sourceKeyOrInput.includes('=') && targetKey === null) {
            // Handle SOURCE=TARGET format
            const [source, target] = sourceKeyOrInput.split('=');
            sourceKey = source.trim().toUpperCase();
            targetK = target.trim().toUpperCase();
        } else {
            // Handle separate keys
            sourceKey = sourceKeyOrInput.toUpperCase();
            targetK = targetKey.toUpperCase();
        }
        const config = this.readConfig();

        if (!config[sourceKey]) {
            return { success: false, message: 'Source key not found' };
        }

        config[targetK] = config[sourceKey];

        return {
            success: this.writeConfig(config),
            message: `Copied ${sourceKey} to ${targetK}`
        };
    }

    /**
     * Search for variables by key pattern
     */
    search(pattern, options = {}) {
        const config = this.readConfig();
        const { caseSensitive = false, exact = false } = options;

        const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();
        const results = {};

        Object.entries(config).forEach(([key, value]) => {
            const searchKey = caseSensitive ? key : key.toLowerCase();

            if (exact ? searchKey === searchPattern : searchKey.includes(searchPattern)) {
                results[key] = value;
            }
        });

        return results;
    }

    /**
     * Backup all variables to a JSON string
     */
    backup() {
        const config = this.readConfig();
        return JSON.stringify(config, null, 2);
    }

    /**
     * Restore variables from backup JSON
     */
    restore(backupJson) {
        try {
            const config = JSON.parse(backupJson);
            return {
                success: this.writeConfig(config),
                message: 'Variables restored from backup'
            };
        } catch (error) {
            return { success: false, message: 'Invalid backup format' };
        }
    }

    /**
     * Get variable statistics
     */
    stats() {
        const config = this.readConfig();
        const stats = {
            total: 0,
            empty: 0,
            null: 0,
            arrays: 0,
            longest: { key: '', length: 0 },
            shortest: { key: '', length: Infinity }
        };

        Object.entries(config).forEach(([key, value]) => {
            stats.total++;

            if (!value || value === '') {
                stats.empty++;
            } else if (value === 'null') {
                stats.null++;
            }

            if (value && value.includes(',')) {
                stats.arrays++;
            }

            if (value && value.length > stats.longest.length) {
                stats.longest = { key, length: value.length };
            }

            if (value && value.length < stats.shortest.length) {
                stats.shortest = { key, length: value.length };
            }
        });

        return stats;
    }

    /**
     * Validate input format for key=value
     */
    validateKeyValue(input) {
        if (!input || !input.includes('=')) {
            return { valid: false, error: 'Invalid format. Use KEY=VALUE' };
        }

        const [key, ...valueParts] = input.split('=');
        const value = valueParts.join('=');

        if (!key.trim()) {
            return { valid: false, error: 'Key cannot be empty' };
        }

        return {
            valid: true,
            key: key.trim().toUpperCase(),
            value: value.trim()
        };
    }
}


/**
 * Message Update Manager Class (mUpdate)
 * Handles all message operations: delete, edit, pin, star, disappearing messages
 */
class Vin {
    constructor() {
        this.EPHEMERAL_DURATIONS = {
            '1d': 86400,
            '7d': 604800,
            '90d': 7776000
        };
        this.WA_DEFAULT_EPHEMERAL = 604800;
    }

    static formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    /**
     * Get memory usage information
     */
    static getMemoryUsage() {
        const usage = process.memoryUsage();
        return {
            rss: (usage.rss / 1024 / 1024).toFixed(2),
            heapUsed: (usage.heapUsed / 1024 / 1024).toFixed(2),
            heapTotal: (usage.heapTotal / 1024 / 1024).toFixed(2),
            external: (usage.external / 1024 / 1024).toFixed(2)
        };
    }

    /**
     * Get system information
     */
    static getSystemInfo() {
        return {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            pid: process.pid,
            uptime: process.uptime() * 1000
        };
    }

    // Delete message
    async delete(client, target) {
        if (!target?.key) return { success: false };
        try {
            const socket = client.sock || client;
            await socket.sendMessage(target.key.remoteJid, { delete: target.key });
            return { success: true };
        } catch (error) {
            return { success: false };
        }
    }

    // Clear chat
    async clear(client, chatJid) {
        try {
            const socket = client.sock || client;
            await socket.chatModify({
                delete: true,
                lastMessages: [{
                    key: {
                        remoteJid: chatJid,
                        fromMe: true,
                        id: 'CLEAR_' + Date.now()
                    },
                    messageTimestamp: Math.floor(Date.now() / 1000)
                }]
            }, chatJid);
            return { success: true };
        } catch (error) {
            return { success: false };
        }
    }

    // Edit message
    async edit(client, messageKey, newText) {
        try {
            const socket = client.sock || client;
            await socket.sendMessage(messageKey.remoteJid, {
                text: newText,
                edit: messageKey
            });
            return { success: true };
        } catch (error) {
            return { success: false };
        }
    }

    // Pin message
    async pin(client, messageKey) {
        try {
            const socket = client.sock || client;
            await socket.sendMessage(messageKey.remoteJid, {
                pin: messageKey
            });
            return { success: true };
        } catch (error) {
            return { success: false };
        }
    }

    // Unpin message
    async unpin(client, messageKey) {
        try {
            const socket = client.sock || client;
            await socket.sendMessage(messageKey.remoteJid, {
                unpin: messageKey
            });
            return { success: true };
        } catch (error) {
            return { success: false };
        }
    }

    // Star message
    async star(client, messageKey) {
        try {
            const socket = client.sock || client;
            await socket.chatModify({
                star: {
                    messages: [{ key: messageKey, starred: true }]
                }
            }, messageKey.remoteJid);
            return { success: true };
        } catch (error) {
            return { success: false };
        }
    }

    // Unstar message
    async unstar(client, messageKey) {
        try {
            const socket = client.sock || client;
            await socket.chatModify({
                star: {
                    messages: [{ key: messageKey, starred: false }]
                }
            }, messageKey.remoteJid);
            return { success: true };
        } catch (error) {
            return { success: false };
        }
    }

    async ephemeral(client, jid, content, duration = this.WA_DEFAULT_EPHEMERAL) {
        try {
            const socket = client.sock || client;
            let expirationSeconds = duration;
            if (typeof duration === 'string') {
                expirationSeconds = this.EPHEMERAL_DURATIONS[duration] || this.WA_DEFAULT_EPHEMERAL;
            }
            await socket.sendMessage(jid, content, { ephemeralExpiration: expirationSeconds });
            return { success: true };
        } catch (error) {
            return { success: false };
        }
    }

    // React to message
    async react(client, messageKey, emoji) {
        try {
            const socket = client.sock || client;
            await socket.sendMessage(messageKey.remoteJid, {
                react: {
                    text: emoji,
                    key: messageKey
                }
            });
            return { success: true };
        } catch (error) {
            return { success: false };
        }
    }

    // Remove reaction
    async unreact(client, messageKey) {
        try {
            const socket = client.sock || client;
            await socket.sendMessage(messageKey.remoteJid, {
                react: {
                    text: '',
                    key: messageKey
                }
            });
            return { success: true };
        } catch (error) {
            return { success: false };
        }
    }

    // Format duration
    formatDuration(seconds) {
        if (seconds === 86400) return '24 hours';
        if (seconds === 604800) return '7 days';
        if (seconds === 7776000) return '90 days';
        
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (days > 0) return `${days} days`;
        if (hours > 0) return `${hours} hours`;
        if (minutes > 0) return `${minutes} minutes`;
        return `${seconds} seconds`;
    }

    // Get duration presets
    getDurationPresets() {
        return this.EPHEMERAL_DURATIONS;
    }



    // Perform group action (promote, demote, kick, add)
    async act(client, gid, users, action, opt = {}) {
        try {
            if (!client || !gid || !users || !action) return { success: false, error: 'MISSING_PARAMS' };

            const arr = Array.isArray(users) ? users : [users];
            if (arr.length === 0) return { success: false, error: 'NO_USERS' };

            const meta = await this.meta(client, gid);
            if (!meta) return { success: false, error: 'NO_GROUP_INFO' };

            if (!this.isBotAdmin(client, meta.participants)) return { success: false, error: 'BOT_NOT_ADMIN' };

            if (opt.sender) {
                const isAdmin = this.isAdmin(meta.participants, opt.sender);
                if (!isAdmin && !opt.sudo) return { success: false, error: 'SENDER_NOT_AUTH' };
            }

            switch (action.toLowerCase()) {
                case 'promote': return this.promote(client, gid, arr, meta);
                case 'demote':  return this.demote(client, gid, arr, meta);
                case 'kick':
                case 'remove': return this.kick(client, gid, arr, meta);
                case 'add':    return this.add(client, gid, arr);
                default: return { success: false, error: 'UNKNOWN_ACTION', action };
            }
        } catch (e) {
            console.error('❌ act error:', e);
            return { success: false, error: 'EXCEPTION', details: e.message };
        }
    }



    // Promote users
    async promote(client, gid, users, meta) {
        const toPromote = users.filter(u => !this.isAdmin(meta.participants, u));
        const skipped = users.filter(u => this.isAdmin(meta.participants, u));

        if (!toPromote.length) return { success: false, error: 'ALL_ALREADY_ADMIN', skipped };

        const ok = await this.updUsers(client, gid, toPromote, 'promote');
        return { success: ok, promoted: toPromote, skipped };
    }

    // Demote users
    async demote(client, gid, users, meta) {
        const toDemote = users.filter(u => this.isAdmin(meta.participants, u));
        const skipped = users.filter(u => !this.isAdmin(meta.participants, u));

        if (!toDemote.length) return { success: false, error: 'NO_ADMIN_USERS', skipped };

        const ok = await this.updUsers(client, gid, toDemote, 'demote');
        return { success: ok, demoted: toDemote, skipped };
    }

    // Kick users (ignore admins)
    async kick(client, gid, users, meta) {
        const toKick = users.filter(u => !this.isAdmin(meta.participants, u));
        const skipped = users.filter(u => this.isAdmin(meta.participants, u));

        if (!toKick.length) return { success: false, error: 'NO_USERS_TO_KICK', skipped };

        const ok = await this.updUsers(client, gid, toKick, 'remove');
        return { success: ok, kicked: toKick, skipped };
    }

    // Add users
    async add(client, gid, users) {
        const arr = users.map(u => u.includes('@') ? u : this.num(u) + '@s.whatsapp.net');
        await this.sleep(2000);
        const ok = await this.updUsers(client, gid, arr, 'add');
        return { success: ok, added: arr };
    }

    // Change settings (mute/unmute, lock/unlock, disappear)
    async set(client, gid, type, opt = {}) {
        try {
            const meta = await this.meta(client, gid);
            if (!meta) return false;
            if (!this.isBotAdmin(client, meta.participants)) return false;

            const sock = client.sock || client;
            let ok = false;

            switch (type.toLowerCase()) {
                case 'mute':
                case 'close':
                    ok = await sock.groupSettingUpdate(gid, 'announcement');
                    if (ok && opt.ms) {
                        setTimeout(
                            () => sock.groupSettingUpdate(gid, 'not_announcement'),
                            opt.ms
                        );
                    }
                    return true;

                case 'unmute':
                case 'open':
                    ok = await sock.groupSettingUpdate(gid, 'not_announcement');
                    if (ok && opt.ms) {
                        setTimeout(
                            () => sock.groupSettingUpdate(gid, 'announcement'),
                            opt.ms
                        );
                    }
                    return true;

                case 'disappear_on':
                    ok = await sock.sendMessage(gid, { disappearingMessagesInChat: opt.dur || 86400 });
                    return true;

                case 'disappear_off':
                    ok = await sock.sendMessage(gid, { disappearingMessagesInChat: false });
                    return true;

                case 'lock':
                    ok = await sock.groupSettingUpdate(gid, 'locked');
                    return true;

                case 'unlock':
                    ok = await sock.groupSettingUpdate(gid, 'unlocked');
                    return true;

                default:
                    return false;
            }

            return ok;
        } catch (e) {
            console.error('❌ set error:', e);
            return false;
        }
    }


    async disappearOn(client, jid, duration = this.WA_DEFAULT_EPHEMERAL) {
        const socket = client.sock || client;
        let durationSeconds = duration;

        if (typeof duration === 'string') {
            durationSeconds = this.EPHEMERAL_DURATIONS[duration] || this.WA_DEFAULT_EPHEMERAL;
        }

        await socket.sendMessage(jid, { disappearingMessagesInChat: durationSeconds });
    }

    async disappearOff(client, jid) {
        const socket = client.sock || client;
        await socket.sendMessage(jid, { disappearingMessagesInChat: false });
    }

    async getJoinRequests(client, gid) {
        try {
            const sock = client.sock || client;
            const res = await sock.groupRequestParticipantsList(gid);
            return res || [];
        } catch (e) {
            console.error('❌ getJoinRequests error:', e);
            return [];
        }
    }

    async acceptJoinRequests(client, gid, users = []) {
        try {
            const sock = client.sock || client;
            if (!users || users.length === 0) {
                // If no users passed, accept all
                const requests = await this.getJoinRequests(client, gid);
                users = requests.map(u => u.jid);
            }
            if (users.length === 0) return false;

            await sock.groupRequestParticipantsUpdate(gid, users, 'approve');
            return true;
        } catch (e) {
            console.error('❌ acceptJoinRequests error:', e);
            return false;
        }
    }

    async rejectJoinRequests(client, gid, users = []) {
        try {
            const sock = client.sock || client;
            if (!users || users.length === 0) {
                // If no users passed, reject all
                const requests = await this.getJoinRequests(client, gid);
                users = requests.map(u => u.jid);
            }
            if (users.length === 0) return false;

            await sock.groupRequestParticipantsUpdate(gid, users, 'reject');
            return true;
        } catch (e) {
            console.error('❌ rejectJoinRequests error:', e);
            return false;
        }
    }


    // ==== Helpers ====
    async meta(client, gid) { try { return await (client.sock || client).groupMetadata(gid); } catch { return null; } }
    isAdmin(part, jid) { const u = part.find(p => p.id === jid); return u && (u.admin === 'admin' || u.admin === 'superadmin' || u.admin === true); }
    isBotAdmin(client, part) { 
        const id = client.getUserInfo?.().id || '';
        return [id, id.split(':')[0] + '@s.whatsapp.net', this.num(id) + '@s.whatsapp.net']
            .some(j => this.isAdmin(part, j));
    }
    async updUsers(client, gid, users, act) { try { await (client.sock || client).groupParticipantsUpdate(gid, users, act); return true; } catch { return false; } }
    num(jid) { return jid.split('@')[0]; }
    sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    format(sec) { if (sec === 86400) return '24h'; if (sec === 604800) return '7d'; if (sec === 7776000) return '90d'; return `${sec}s`; }

    // Invite helpers
    async link(client, gid) { try { const c = await (client.sock||client).groupInviteCode(gid); return `https://chat.whatsapp.com/${c}`; } catch { return null; } }
    async revoke(client, gid) { try { await (client.sock||client).groupRevokeInvite(gid); return true; } catch { return false; } }
    async join(client, code) { try { return await (client.sock||client).groupAcceptInvite(code); } catch { return false; } }
}


module.exports = {
    Var,
    Vin
};