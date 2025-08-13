/**
 * Utility commands for ManjiBot
 * Ultra-simple plugin structure
 */

const axios = require('axios');

// QR Code generator
const qr = {
    name: 'qr',
    aliases: ['qrcode'],
    description: 'Generate QR code from text',
    category: 'utility',
    usage: 'qr <text>',
    execute: async (message) => {
        const text = message.argsText();
        
        if (!text) {
            return await message.reply('_Provide text to generate QR code!_\n_Example: .qr Hello World_');
        }
        
        if (text.length > 500) {
            return await message.reply('_Text is too long! Maximum 500 characters._');
        }
        
        try {
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(text)}`;
            const response = await axios.get(qrUrl, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(response.data);
            
            await message.sendImage(buffer, `QR Code for: ${text}`);
            
        } catch (error) {
            console.error('QR generation error:', error);
            await message.reply('_Failed to generate QR code._');
        }
    }
};

// URL shortener
const short = {
    name: 'short',
    aliases: ['shorten'],
    description: 'Shorten a URL',
    category: 'utility',
    usage: 'short <url>',
    execute: async (message) => {
        const url = message.arg(0);
        
        if (!url) {
            return await message.reply('_Provide a URL to shorten!_\n_Example: .short https://google.com_');
        }
        
        // Simple URL validation
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            return await message.reply('_Please provide a valid URL starting with http:// or https://_');
        }
        
        try {
            // Using a free URL shortener API (you can replace with your preferred service)
            const response = await axios.post('https://cleanuri.com/api/v1/shorten', {
                url: url
            });
            
            if (response.data.result_url) {
                await message.reply(`🔗 *URL Shortened:*\n\n*Original:* ${url}\n*Shortened:* ${response.data.result_url}`);
            } else {
                await message.reply('_Failed to shorten URL. Please check if the URL is valid._');
            }
            
        } catch (error) {
            console.error('URL shortening error:', error);
            await message.reply('_Failed to shorten URL. Service might be unavailable._');
        }
    }
};

// Text to speech (placeholder - would need actual TTS service)
const tts = {
    name: 'tts',
    aliases: ['speak'],
    description: 'Convert text to speech',
    category: 'utility',
    usage: 'tts <text>',
    execute: async (message) => {
        const text = message.argsText();
        
        if (!text) {
            return await message.reply('_Provide text to convert to speech!_\n_Example: .tts Hello World_');
        }
        
        if (text.length > 200) {
            return await message.reply('_Text is too long! Maximum 200 characters._');
        }
        
        // This is a placeholder - you would integrate with a real TTS service
        await message.reply('🔊 *Text-to-Speech*\n\n_TTS feature coming soon! Will convert:_\n\n' + text);
    }
};

// Base64 encode/decode
const base64 = {
    name: 'base64',
    aliases: ['b64'],
    description: 'Encode or decode base64',
    category: 'utility',
    usage: 'base64 <encode|decode> <text>',
    execute: async (message) => {
        const action = message.arg(0);
        const text = message.args.slice(1).join(' ');
        
        if (!action || !text) {
            return await message.reply('_Usage: .base64 <encode|decode> <text>_\n_Example: .base64 encode Hello World_');
        }
        
        try {
            let result;
            
            if (action.toLowerCase() === 'encode') {
                result = Buffer.from(text, 'utf8').toString('base64');
                await message.reply(`🔐 *Base64 Encoded:*\n\n\`\`\`${result}\`\`\``);
            } else if (action.toLowerCase() === 'decode') {
                result = Buffer.from(text, 'base64').toString('utf8');
                await message.reply(`🔓 *Base64 Decoded:*\n\n${result}`);
            } else {
                await message.reply('_Invalid action! Use "encode" or "decode"_');
            }
            
        } catch (error) {
            await message.reply('_Invalid base64 string or encoding error._');
        }
    }
};

// Hash generator
const hash = {
    name: 'hash',
    description: 'Generate hash of text',
    category: 'utility',
    usage: 'hash <algorithm> <text>',
    execute: async (message) => {
        const algorithm = message.arg(0);
        const text = message.args.slice(1).join(' ');
        
        if (!algorithm || !text) {
            return await message.reply('_Usage: .hash <md5|sha1|sha256> <text>_\n_Example: .hash md5 Hello World_');
        }
        
        const validAlgorithms = ['md5', 'sha1', 'sha256'];
        if (!validAlgorithms.includes(algorithm.toLowerCase())) {
            return await message.reply(`_Invalid algorithm! Use: ${validAlgorithms.join(', ')}_`);
        }
        
        try {
            const crypto = require('crypto');
            const hash = crypto.createHash(algorithm.toLowerCase()).update(text).digest('hex');
            
            await message.reply(`🔐 *${algorithm.toUpperCase()} Hash:*\n\n\`\`\`${hash}\`\`\``);
            
        } catch (error) {
            console.error('Hash generation error:', error);
            await message.reply('_Failed to generate hash._');
        }
    }
};

// Calculate command
const calc = {
    name: 'calc',
    aliases: ['calculate', 'math'],
    description: 'Calculate mathematical expressions',
    category: 'utility',
    usage: 'calc <expression>',
    execute: async (message) => {
        const expression = message.argsText();
        
        if (!expression) {
            return await message.reply('_Provide a mathematical expression!_\n_Example: .calc 2 + 2 * 3_');
        }
        
        // Simple validation - only allow numbers, operators, and parentheses
        if (!/^[0-9+\-*/.() ]+$/.test(expression)) {
            return await message.reply('_Invalid expression! Only use numbers and operators (+, -, *, /, (), .)_');
        }
        
        try {
            // Use Function constructor for safe evaluation (better than eval)
            const result = Function(`"use strict"; return (${expression})`)();
            
            if (typeof result !== 'number' || !isFinite(result)) {
                return await message.reply('_Invalid mathematical expression._');
            }
            
            await message.reply(`🧮 *Calculator:*\n\n${expression} = **${result}**`);
            
        } catch (error) {
            await message.reply('_Invalid mathematical expression._');
        }
    }
};

module.exports = [qr, short, tts, base64, hash, calc];