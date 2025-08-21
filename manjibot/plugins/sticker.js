const { bot, sticker, exif, lang } = require('../lib/');


bot({
    pattern: 'sticker',
    aliases: ['s', 'skt', 'skr', 'sti'],
    desc: lang.plugins.sticker.desc,
    type: 'sticker',
}, async (message) => {
    const stickerBuffer = await sticker(message.raw);

    if (!stickerBuffer) {
        return await message.send(lang.plugins.sticker.reply_required);
    }

    await message.send(stickerBuffer, {}, 'sticker');
});

bot({
    pattern: 'take ?(.*)',
    aliases: ['t'],
    desc: lang.plugins.take.desc,
    type: 'sticker',
}, async (message, match) => {
    let pack, author;

    if (!match || match.trim() === '') {
        pack = undefined;
        author = undefined;
    } else {
        const parts = match.split(',').map(x => x?.trim() || undefined);
        pack = parts[0];
        author = parts[1];
    }
    const stickerBuffer = await sticker(message.raw, pack, author);
    if (!stickerBuffer) {
        return await message.send(lang.plugins.take.reply_required);
    }
    await message.send(stickerBuffer, {}, 'sticker');
});

bot({
    pattern: 'exif',
    aliases: ['getexif', 'stickerinfo'],
    desc: lang.plugins.exif.desc,
    type: 'sticker',
}, async (message) => {
    const exifData = await exif(message.raw);

    if (!exifData) {
        return await message.send(lang.plugins.exif.no_data);
    }
    const info = lang.plugins.exif.info.format(
        exifData.packname,
        exifData.author,
        exifData.packId,
        exifData.emojis
    );

    await message.send(info);
});