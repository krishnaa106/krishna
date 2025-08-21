# 🤖 ManjiBot

A simple and scalable WhatsApp bot with ultra-clean plugin structure. All the complexity is handled in the bot's lib, making plugin development extremely easy.

## ✨ Features

- **Ultra-Simple Plugin Structure** - Create plugins with minimal code
- **Comprehensive Media Support** - Handle all WhatsApp media types
- **Smart Message Detection** - Automatic text extraction and media detection
- **Scalable Architecture** - Clean separation of concerns
- **Hot Plugin Reloading** - Reload plugins without restarting
- **Advanced Permissions** - Sudo, owner, group/private restrictions
- **Rate Limiting** - Built-in spam protection
- **Auto Cleanup** - Automatic temporary file management

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/manjisama/manjibot.git
cd manjibot

# Install dependencies
npm install

# Configure the bot
cp config.env.example config.env
# Edit config.env with your settings

# Start the bot
npm start
```

### Configuration

Edit `config.env`:

```env
# Bot Settings
BOT_NAME=ManjiBot
PREFIX=.
BOT_MODE=private
SUDO=your_number_without_plus

# WhatsApp Connection
QR=true

# Sticker Settings
STICKER_PACK=ManjiBot,manjisama
```

## 📝 Plugin Development

### Ultra-Simple Plugin Structure

```javascript
// plugins/example.js

const myCommand = {
    name: 'hello',
    description: 'Say hello',
    category: 'general',
    execute: async (message) => {
        await message.reply('Hello World! 👋');
    }
};

module.exports = [myCommand];
```

### Available Properties

```javascript
// Message properties
message.text          // Extracted text
message.args          // Command arguments
message.sender        // Sender JID
message.chat          // Chat JID
message.isGroup       // Boolean
message.isSudo        // Boolean
message.quoted        // Quoted message
message.hasMedia      // Boolean

// Easy methods
await message.reply('Hello!')
await message.react('👍')
await message.sendSticker(buffer)
await message.sendImage(buffer, 'caption')

// Utility methods
message.arg(0, 'default')     // Get argument with default
message.argsText()            // All args as string
message.hasMediaType('image') // Check media type
```

### Command Configuration

```javascript
const command = {
    name: 'command',           // Command name (required)
    aliases: ['cmd', 'c'],     // Alternative names
    description: 'Description', // Command description
    category: 'general',       // Command category
    usage: 'command <arg>',    // Usage example
    sudo: true,               // Sudo only
    owner: true,              // Owner only
    group: true,              // Group only
    private: true,            // Private only
    react: false,             // Disable auto reactions
    execute: async (message) => {
        // Command logic here
    }
};
```

## 📂 Project Structure

```
manjibot/
├── lib/                    # Core bot library
│   ├── bot.js             # Main bot class
│   ├── client.js          # WhatsApp client wrapper
│   ├── config.js          # Configuration manager
│   ├── message.js         # Message wrapper class
│   ├── message-handler.js # Message processing
│   ├── plugin-manager.js  # Plugin management
│   └── utils.js           # Utility functions
├── plugins/               # Plugin directory
│   ├── general.js         # General commands
│   ├── sticker.js         # Sticker commands
│   ├── media.js           # Media commands
│   └── admin.js           # Admin commands
├── temp/                  # Temporary files
├── session/               # WhatsApp session
├── config.env             # Configuration file
├── package.json
└── index.js               # Entry point
```

## 🎯 Built-in Commands

### General Commands
- `.ping` - Check bot response time
- `.hello` - Say hello
- `.info` - Bot information
- `.help` - Show help menu

### Sticker Commands
- `.sticker` - Convert media to sticker
- `.take` - Change sticker pack/author
- `.toimg` - Convert sticker to image

### Media Commands
- `.mediainfo` - Get media information
- `.download` - Download media
- `.convert` - Convert image format
- `.resize` - Resize image
- `.toaudio` - Extract audio from video

### Admin Commands (Sudo Only)
- `.restart` - Restart bot
- `.mode` - Change bot mode
- `.setprefix` - Change prefix
- `.reload` - Reload plugins
- `.status` - Bot status
- `.addsudo` - Add sudo user
- `.delsudo` - Remove sudo user

## 🔧 Advanced Features

### Media Detection

```javascript
// Automatic media detection
if (message.quoted.image) {
    // Handle image
}

if (message.quoted.video) {
    // Handle video
}

if (message.quoted.sticker) {
    // Handle sticker
}

// Get detailed media info
const mediaInfo = message.quoted.media;
console.log(mediaInfo.type, mediaInfo.size, mediaInfo.mimetype);
```

### Permission System

```javascript
const command = {
    name: 'admin',
    sudo: true,        // Only sudo users
    owner: true,       // Only bot owner
    group: true,       // Only in groups
    private: true,     // Only in private chats
    execute: async (message) => {
        // Command logic
    }
};
```

### Error Handling

All errors are automatically handled by the bot. Commands that fail will show an error reaction and log the error.

### Rate Limiting

Built-in rate limiting prevents spam:
- Sudo users: 1 second cooldown
- Regular users: 3 seconds cooldown

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 👨‍💻 Developer

**manjisama**
- GitHub: [@manjisama](https://github.com/manjisama)

## 🙏 Acknowledgments

- [Baileys](https://github.com/WhiskeySockets/Baileys) - WhatsApp Web API
- [Sharp](https://github.com/lovell/sharp) - Image processing
- [FFmpeg](https://ffmpeg.org/) - Media processing

---

Made with ❤️ by manjisama