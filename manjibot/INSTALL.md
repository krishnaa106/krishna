# 🚀 ManjiBot Installation Guide

## Prerequisites

- **Node.js** (v16 or higher)
- **npm** (comes with Node.js)
- **FFmpeg** (for media processing)

## Quick Installation

### 1. Install Node.js
Download and install from [nodejs.org](https://nodejs.org/)

### 2. Install FFmpeg

**Windows:**
```bash
# Using chocolatey
choco install ffmpeg

# Or download from https://ffmpeg.org/download.html
```

**macOS:**
```bash
# Using homebrew
brew install ffmpeg
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install ffmpeg

# CentOS/RHEL
sudo yum install ffmpeg
```

### 3. Clone and Setup ManjiBot

```bash
# Clone the repository
git clone https://github.com/manjisama/manjibot.git
cd manjibot

# Install dependencies
npm install

# Test the installation
npm test

# Start the bot (will create config.env)
npm start
```

### 4. Configure the Bot

Edit `config.env`:

```env
# Bot Settings
BOT_NAME=ManjiBot
PREFIX=.
BOT_MODE=private
SUDO=your_phone_number_without_plus_sign

# WhatsApp Connection
QR=true

# Sticker Settings
STICKER_PACK=ManjiBot,manjisama
```

### 5. Start the Bot

```bash
npm start
```

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `BOT_NAME` | Name of your bot | ManjiBot |
| `PREFIX` | Command prefix | . |
| `BOT_MODE` | public or private | private |
| `SUDO` | Sudo users (comma separated) | empty |
| `QR` | Use QR code (true) or pairing code (false) | true |
| `STICKER_PACK` | Sticker pack name,author | ManjiBot,manjisama |

## Troubleshooting

### Common Issues

**1. FFmpeg not found**
```
Error: ffmpeg not found
```
**Solution:** Install FFmpeg (see step 2 above)

**2. Sharp installation issues**
```
Error: Cannot find module 'sharp'
```
**Solution:**
```bash
npm rebuild sharp
# or
npm install sharp --platform=win32 --arch=x64
```

**3. Node-webpmux issues**
```
Error: Cannot find module 'node-webpmux'
```
**Solution:**
```bash
npm install node-webpmux --build-from-source
```

**4. Permission errors**
```
Error: EACCES: permission denied
```
**Solution:**
```bash
# Linux/macOS
sudo npm install -g npm
# or use nvm to manage Node.js versions
```

### Getting Help

1. Check the [README.md](README.md) for detailed documentation
2. Run `npm test` to verify installation
3. Check the console for error messages
4. Make sure all dependencies are installed

## Development Mode

For development with auto-restart:

```bash
npm run dev
```

## Production Deployment

For production deployment:

```bash
# Install PM2 for process management
npm install -g pm2

# Start with PM2
pm2 start index.js --name "manjibot"

# Save PM2 configuration
pm2 save
pm2 startup
```

## Docker Deployment (Optional)

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .

CMD ["npm", "start"]
```

Build and run:

```bash
docker build -t manjibot .
docker run -d --name manjibot -v $(pwd)/session:/app/session manjibot
```

---

🎉 **Congratulations!** ManjiBot is now ready to use!