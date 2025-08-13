/**
 * Media commands for ManjiBot
 * Ultra-simple plugin structure
 */

const utils = require('../lib/utils');
const path = require('path');

// Media info command
const mediainfo = {
    name: 'mediainfo',
    aliases: ['minfo'],
    description: 'Get media information',
    category: 'media',
    execute: async (message) => {
        if (!message.quoted || !message.quoted.media) {
            return await message.reply('_Reply to any media!_');
        }
        
        const media = message.quoted.media;
        let info = `📄 *Media Information*\n\n`;
        
        info += `• Type: ${media.type}\n`;
        if (media.mimetype) info += `• MIME: ${media.mimetype}\n`;
        if (media.size) info += `• Size: ${utils.formatFileSize(media.size)}\n`;
        if (media.width && media.height) info += `• Dimensions: ${media.width}x${media.height}\n`;
        if (media.duration) info += `• Duration: ${utils.formatDuration(media.duration)}\n`;
        if (media.fileName) info += `• File: ${media.fileName}\n`;
        
        // Special properties
        if (media.gif) info += `• GIF: Yes\n`;
        if (media.animated) info += `• Animated: Yes\n`;
        if (media.voice) info += `• Voice Note: Yes\n`;
        
        await message.reply(info);
    }
};

// Download media
const download = {
    name: 'download',
    aliases: ['dl'],
    description: 'Download media from message',
    category: 'media',
    execute: async (message) => {
        if (!message.quoted || !message.hasMedia) {
            return await message.reply('_Reply to any media!_');
        }
        
        try {
            await message.react('⏳');
            
            const buffer = await message.quoted.download();
            if (!buffer) {
                await message.react('❌');
                return await message.reply('_Failed to download media._');
            }
            
            await message.react('✅');
            await message.reply(`_Downloaded successfully! Size: ${utils.formatFileSize(buffer.length)}_`);
            
        } catch (error) {
            await message.react('❌');
            console.error('Download error:', error);
            await message.reply('_Error downloading media._');
        }
    }
};

// Convert image format
const convert = {
    name: 'convert',
    description: 'Convert image to different format',
    category: 'media',
    usage: 'convert <format>',
    execute: async (message) => {
        if (!message.quoted || !message.quoted.image) {
            return await message.reply('_Reply to an image!_');
        }
        
        const format = message.arg(0, 'jpg').toLowerCase();
        const validFormats = ['jpg', 'jpeg', 'png', 'webp'];
        
        if (!validFormats.includes(format)) {
            return await message.reply(`_Invalid format! Use: ${validFormats.join(', ')}_`);
        }
        
        try {
            const imageBuffer = await message.quoted.download();
            if (!imageBuffer) {
                return await message.reply('_Failed to download image!_');
            }
            
            const sharp = require('sharp');
            let convertedBuffer;
            
            switch (format) {
                case 'jpg':
                case 'jpeg':
                    convertedBuffer = await sharp(imageBuffer).jpeg({ quality: 90 }).toBuffer();
                    break;
                case 'png':
                    convertedBuffer = await sharp(imageBuffer).png().toBuffer();
                    break;
                case 'webp':
                    convertedBuffer = await sharp(imageBuffer).webp({ quality: 90 }).toBuffer();
                    break;
            }
            
            await message.sendImage(convertedBuffer, `Converted to ${format.toUpperCase()}`);
            
        } catch (error) {
            console.error('Convert error:', error);
            await message.reply('_Error converting image._');
        }
    }
};

// Resize image
const resize = {
    name: 'resize',
    description: 'Resize image',
    category: 'media',
    usage: 'resize <width> <height>',
    execute: async (message) => {
        if (!message.quoted || !message.quoted.image) {
            return await message.reply('_Reply to an image!_');
        }
        
        const width = parseInt(message.arg(0));
        const height = parseInt(message.arg(1));
        
        if (!width || !height || width < 1 || height < 1) {
            return await message.reply('_Provide valid width and height!_\n_Example: .resize 500 300_');
        }
        
        if (width > 2000 || height > 2000) {
            return await message.reply('_Maximum size is 2000x2000 pixels!_');
        }
        
        try {
            const imageBuffer = await message.quoted.download();
            if (!imageBuffer) {
                return await message.reply('_Failed to download image!_');
            }
            
            const sharp = require('sharp');
            const resizedBuffer = await sharp(imageBuffer)
                .resize(width, height, {
                    fit: 'contain',
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                })
                .jpeg({ quality: 90 })
                .toBuffer();
            
            await message.sendImage(resizedBuffer, `Resized to ${width}x${height}`);
            
        } catch (error) {
            console.error('Resize error:', error);
            await message.reply('_Error resizing image._');
        }
    }
};

// Extract audio from video
const toaudio = {
    name: 'toaudio',
    aliases: ['extractaudio'],
    description: 'Extract audio from video',
    category: 'media',
    execute: async (message) => {
        if (!message.quoted || !message.quoted.video) {
            return await message.reply('_Reply to a video!_');
        }
        
        try {
            await message.react('⏳');
            
            // Download video
            const videoBuffer = await message.quoted.download();
            if (!videoBuffer) {
                await message.react('❌');
                return await message.reply('_Failed to download video!_');
            }
            
            // Save to temp file
            const tempVideoPath = path.join(utils.tempDir, `video_${Date.now()}.mp4`);
            require('fs').writeFileSync(tempVideoPath, videoBuffer);
            
            // Extract audio
            const audioPath = await utils.extractAudio(tempVideoPath);
            const audioBuffer = require('fs').readFileSync(audioPath);
            
            await message.react('✅');
            await message.sendAudio(audioBuffer);
            
            // Cleanup
            utils.cleanup([tempVideoPath, audioPath]);
            
        } catch (error) {
            await message.react('❌');
            console.error('Audio extraction error:', error);
            await message.reply('_Error extracting audio from video._');
        }
    }
};

module.exports = [mediainfo, download, convert, resize, toaudio];