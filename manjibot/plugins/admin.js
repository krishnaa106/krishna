const { bot, lang } = require('../lib/');

bot({
    pattern: 'var ?(.*)',
    desc: lang.plugins.var.desc,
    type: 'admin',
    sudo: false,
}, async (message, match, manji) => {
    if (!match || !match.trim()) {
        return await message.send(lang.plugins.var.usage);
    }

    const args = match.trim().split(' ');
    const action = args[0]?.toLowerCase();

    const updateRuntime = (key) => {
        const value = manji.envGet(key);
        if (value && value !== 'null') {
            message.config.set(key, value);
        } else {
            delete message.config[key];
        }
    };

    switch (action) {
        case 'set': {
            const setInput = args.slice(1).join(' ');
            if (!setInput || !setInput.includes('=')) {
                return await message.send(lang.plugins.var.set.usage);
            }

            if (!setInput.includes('=')) {
                return await message.send(lang.plugins.var.set.failed.format('Invalid format. Use KEY=VALUE'));
            }

            const [key, ...valueParts] = setInput.split('=');
            const value = valueParts.join('=').trim();

            if (!key.trim()) {
                return await message.send(lang.plugins.var.set.failed.format('Key cannot be empty'));
            }

            const success = manji.envSet(key.trim(), value);

            if (success) {
                updateRuntime(key.trim());
                await message.send(lang.plugins.var.set.success.format(key.trim().toUpperCase(), value));
            } else {
                await message.send(lang.plugins.var.set.failed.format('Failed to set variable'));
            }
            break;
        }

        case 'all': {
            const isSenderSudo = message.isSudo;
            const allVars = manji.envAll();
            const display = manji.envDisplay(allVars, {
                maskSensitive: !isSenderSudo
            });

            await message.send(display || lang.plugins.var.all.empty);
            break;
        }

        case 'del': {
            const key = args[1]?.toUpperCase();
            if (!key) {
                return await message.send(lang.plugins.var.del.usage);
            }

            const success = manji.envDelete(key);
            if (success) {
                delete message.config[key];
                await message.send(lang.plugins.var.del.success.format(key));
            } else {
                await message.send(lang.plugins.var.del.failed.format('Variable not found'));
            }
            break;
        }

        case 'add': {
            const addInput = args.slice(1).join(' ');
            if (!addInput || !addInput.includes('=')) {
                return await message.send(lang.plugins.var.add.usage);
            }

            if (!addInput.includes('=')) {
                return await message.send(lang.plugins.var.add.failed.format('Invalid format. Use KEY=VALUE'));
            }

            const [key, ...valueParts] = addInput.split('=');
            const value = valueParts.join('=').trim();

            if (!key.trim()) {
                return await message.send(lang.plugins.var.add.failed.format('Key cannot be empty'));
            }

            const success = manji.envAdd(key.trim(), value);
            if (success) {
                updateRuntime(key.trim());
                await message.send(lang.plugins.var.add.success.format(key.trim().toUpperCase()));
            } else {
                await message.send(lang.plugins.var.add.failed);
            }
            break;
        }

        case 'help': {
            await message.send(lang.plugins.var.help);
            break;
        }

        default: {
            await message.send(lang.plugins.var.unknown.format(action));
        }
    }
});


bot({
    pattern: 'setsudo ?(.*)',
    desc: lang.plugins.setsudo.desc,
    type: 'admin',
    sudo: true,
}, async (message, match, manji) => {
    const users = manji.getUserJid(message, match);
    if (!users.length) return message.send(lang.plugins.setsudo.noUser);

    const currentSudo = manji.envList('SUDO');
    const addedUsers = [];
    const alreadyExists = [];

    for (const jid of users) {
        const phone = manji.jidToNum(jid);
        if (currentSudo.includes(phone)) {
            alreadyExists.push(phone);
        } else {
            const success = manji.envAdd('SUDO', phone);
            if (success) {
                addedUsers.push(phone);
            }
        }
    }

    if (addedUsers.length) await message.send(lang.plugins.setsudo.added.format(addedUsers.join(', ')));
    if (alreadyExists.length) await message.send(lang.plugins.setsudo.exists.format(alreadyExists.join(', ')));
});

bot({
    pattern: 'delsudo ?(.*)',
    desc: 'Remove sudo users',
    type: 'admin',
    sudo: true,
}, async (message, match, manji) => {
    const users = manji.getUserJid(message, match);
    if (!users.length) return message.send(lang.plugins.delsudo.noUser);

    const removed = [];
    const notFound = [];

    for (const jid of users) {
        const phone = manji.jidToNum(jid);
        const success = manji.envRemove('SUDO', phone);
        if (success) {
            removed.push(phone);
        } else {
            notFound.push(phone);
        }
    }

    if (removed.length) await message.send(lang.plugins.delsudo.removed.format(removed.join(', ')));
    if (notFound.length) await message.send(lang.plugins.delsudo.notFound.format(notFound.join(', ')));
});
