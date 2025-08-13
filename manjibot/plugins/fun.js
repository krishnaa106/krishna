/**
 * Fun commands for ManjiBot
 * Ultra-simple plugin structure
 */

// Random quote command
const quote = {
    name: 'quote',
    aliases: ['quotes'],
    description: 'Get a random inspirational quote',
    category: 'fun',
    execute: async (message) => {
        const quotes = [
            "The only way to do great work is to love what you do. - Steve Jobs",
            "Innovation distinguishes between a leader and a follower. - Steve Jobs",
            "Life is what happens to you while you're busy making other plans. - John Lennon",
            "The future belongs to those who believe in the beauty of their dreams. - Eleanor Roosevelt",
            "It is during our darkest moments that we must focus to see the light. - Aristotle",
            "The only impossible journey is the one you never begin. - Tony Robbins",
            "Success is not final, failure is not fatal: it is the courage to continue that counts. - Winston Churchill",
            "The way to get started is to quit talking and begin doing. - Walt Disney"
        ];
        
        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
        await message.reply(`💭 *Quote of the moment:*\n\n_"${randomQuote}"_`);
    }
};

// Random joke command
const joke = {
    name: 'joke',
    aliases: ['jokes'],
    description: 'Get a random joke',
    category: 'fun',
    execute: async (message) => {
        const jokes = [
            "Why don't scientists trust atoms? Because they make up everything!",
            "Why did the scarecrow win an award? He was outstanding in his field!",
            "Why don't eggs tell jokes? They'd crack each other up!",
            "What do you call a fake noodle? An impasta!",
            "Why did the math book look so sad? Because it had too many problems!",
            "What do you call a bear with no teeth? A gummy bear!",
            "Why can't a bicycle stand up by itself? It's two tired!",
            "What do you call a sleeping bull? A bulldozer!"
        ];
        
        const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
        await message.reply(`😂 *Here's a joke for you:*\n\n${randomJoke}`);
    }
};

// Random fact command
const fact = {
    name: 'fact',
    aliases: ['facts'],
    description: 'Get a random fun fact',
    category: 'fun',
    execute: async (message) => {
        const facts = [
            "Honey never spoils. Archaeologists have found pots of honey in ancient Egyptian tombs that are over 3,000 years old and still perfectly edible.",
            "A group of flamingos is called a 'flamboyance'.",
            "Bananas are berries, but strawberries aren't.",
            "The shortest war in history was between Britain and Zanzibar on August 27, 1896. Zanzibar surrendered after 38 minutes.",
            "A shrimp's heart is in its head.",
            "It's impossible to hum while holding your nose.",
            "The unicorn is Scotland's national animal.",
            "A group of pandas is called an 'embarrassment'."
        ];
        
        const randomFact = facts[Math.floor(Math.random() * facts.length)];
        await message.reply(`🧠 *Fun Fact:*\n\n${randomFact}`);
    }
};

// Dice roll command
const dice = {
    name: 'dice',
    aliases: ['roll'],
    description: 'Roll a dice',
    category: 'fun',
    usage: 'dice [sides]',
    execute: async (message) => {
        const sides = parseInt(message.arg(0)) || 6;
        
        if (sides < 2 || sides > 100) {
            return await message.reply('_Dice must have between 2 and 100 sides!_');
        }
        
        const result = Math.floor(Math.random() * sides) + 1;
        await message.reply(`🎲 *Dice Roll (${sides}-sided):*\n\nYou rolled: **${result}**`);
    }
};

// Coin flip command
const flip = {
    name: 'flip',
    aliases: ['coin'],
    description: 'Flip a coin',
    category: 'fun',
    execute: async (message) => {
        const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
        const emoji = result === 'Heads' ? '🪙' : '🔄';
        await message.reply(`${emoji} *Coin Flip:*\n\nResult: **${result}**`);
    }
};

// 8-ball command
const eightball = {
    name: '8ball',
    aliases: ['8b', 'ask'],
    description: 'Ask the magic 8-ball a question',
    category: 'fun',
    usage: '8ball <question>',
    execute: async (message) => {
        const question = message.argsText();
        
        if (!question) {
            return await message.reply('_Ask me a question!_\n_Example: .8ball Will it rain today?_');
        }
        
        const responses = [
            "It is certain",
            "Reply hazy, try again",
            "Don't count on it",
            "It is decidedly so",
            "My sources say no",
            "Without a doubt",
            "Outlook not so good",
            "Yes definitely",
            "Very doubtful",
            "You may rely on it",
            "As I see it, yes",
            "Most likely",
            "Outlook good",
            "Yes",
            "Signs point to yes",
            "Cannot predict now",
            "Concentrate and ask again",
            "My reply is no",
            "Better not tell you now"
        ];
        
        const response = responses[Math.floor(Math.random() * responses.length)];
        await message.reply(`🎱 *Magic 8-Ball*\n\n*Question:* ${question}\n*Answer:* ${response}`);
    }
};

module.exports = [quote, joke, fact, dice, flip, eightball];