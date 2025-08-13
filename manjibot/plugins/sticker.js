const utils = require('../lib/utils');
const path = require('path');
const fs = require('fs');
const sticker = {
    name: 'sticker',
    aliases: ['s', 'stiker'],
    description: 'Convert image/video to sticker',
    category: 'sticker',
    execute: async (message) => {
        // Check if replying to media
        if (!message.quoted || (!message.quoted.image && !message.quoted.video)) {
            return await message.reply('_Reply to an image or short video!_');
        }
        
        try {
            const mediaPath = await utils.downloadMedia(message.raw, 'path');
            if (!mediaPath) {
                return await message.reply('_Failed to download media!_');
            }
            
            const webpPath = await utils.toWebp(mediaPath);
            if (!webpPath) {
                utils.cleanup([mediaPath]);
                return await message.reply('_Failed to convert to WebP!_');
            }
            
            const stickerPath = await utils.addExif(
                webpPath,
                message.config.STICKER_PACK_NAME,
                message.config.STICKER_AUTHOR
            );
            
            const stickerBuffer = fs.readFileSync(stickerPath);
            await message.sendSticker(stickerBuffer);
            
            utils.cleanup([mediaPath, webpPath, stickerPath]);
            
        } catch (error) {
            console.error('Sticker creation error:', error);
            await message.reply('_An error occurred while creating sticker._');
        }
    }
};


const take = {
    name: 'take',
    aliases: ['steal'],
    description: 'Change sticker pack name and author',
    category: 'sticker',
    usage: 'take <pack>,<author>',
    execute: async (message) => {
        if (!message.quoted || !message.quoted.sticker) {
            return await message.reply('_Reply to a sticker!_');
        }
        
        const args = message.argsText();
        let packName = message.config.STICKER_PACK_NAME;
        let authorName = message.config.STICKER_AUTHOR;
        
        if (args) {
            const parts = args.split(',');
            if (parts[0]) packName = parts[0].trim();
            if (parts[1]) authorName = parts[1].trim();
        }
        
        try {
            const stickerPath = await utils.downloadMedia(message.raw, 'path');
            if (!stickerPath) {
                return await message.reply('_Failed to download sticker!_');
            }
            
            const newStickerPath = await utils.addExif(stickerPath, packName, authorName);
            const stickerBuffer = fs.readFileSync(newStickerPath);
            
            await message.sendSticker(stickerBuffer);
            
            utils.cleanup([stickerPath]);
            
        } catch (error) {
            console.error('Take sticker error:', error);
            await message.reply('_An error occurred while modifying sticker._');
        }
    }
};


const toimg = {
    name: 'toimg',
    aliases: ['toimage'],
    description: 'Convert sticker to image',
    category: 'sticker',
    execute: async (message) => {
        if (!message.quoted || !message.quoted.sticker) {
            return await message.reply('_Reply to a sticker!_');
        }
        
        try {
            const stickerBuffer = await message.quoted.download();
            if (!stickerBuffer) {
                return await message.reply('_Failed to download sticker!_');
            }
            
            const sharp = require('sharp');
            const imageBuffer = await sharp(stickerBuffer)
                .png()
                .toBuffer();
            
            await message.sendImage(imageBuffer, 'Converted from sticker');
            
        } catch (error) {
            console.error('Sticker to image error:', error);
            await message.reply('_An error occurred while converting sticker._');
        }
    }
};


const exif = {
    name: 'exif',
    aliases: ['sinfo'],
    description: 'Get sticker EXIF information',
    category: 'sticker',
    execute: async (message) => {
        if (!message.quoted || !message.quoted.sticker) {
            return await message.reply('_Reply to a sticker!_');
        }
        
        try {
            const stickerPath = await utils.downloadMedia(message.raw, 'path');
            if (!stickerPath) {
                return await message.reply('_Failed to download sticker!_');
            }
            
            const exifData = await utils.getExif(stickerPath);
            
            utils.cleanup([stickerPath]);
            
            if (!exifData) {
                return await message.reply('_No EXIF data found in this sticker!_');
            }
            
            const info = `📋 *Sticker Information*

📦 *Pack:* ${exifData.packname}
👤 *Author:* ${exifData.author}
🆔 *Pack ID:* ${exifData.packId}
😀 *Emojis:* ${exifData.emojis}`;

            await message.reply(info);
            
        } catch (error) {
            console.error('EXIF extraction error:', error);
            await message.reply('_An error occurred while extracting EXIF data._');
        }
    }
};

module.exports = [sticker, take, toimg, exif];