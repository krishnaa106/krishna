const { bot, lang } = require('../lib/');

bot({
    pattern: 'ping',
    aliases: ['p'],
    desc: lang.plugins.ping.desc,
    type: 'general',
}, async (message) => {
    const start = Date.now();
    await message.send(lang.plugins.ping.pingMessage);
    const end = Date.now();
    const response = lang.plugins.ping.pongMessage.format(end - start);
    await message.send(response);
});


bot({
    pattern: 'menu',
    aliases: [''],
    desc: lang.plugins.menu.desc,
    type: 'general',
}, async (message, match, manji) => {
    const menuText = manji.menu(
        message.client.pluginManager,
        message.config,
        message
    );

    await message.send(menuText);
});
