# Lixon - A Versatile WhatsApp Bot



Lixon is a powerful and feature-rich WhatsApp bot built with Node.js and [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys). It uses a plugin-based architecture, making it easy to extend and customize.

## Features

Lixon comes packed with a wide range of features, including:

- **AI Integration:** Chat with an AI directly in WhatsApp.
- **Media Tools:** Create stickers, download videos from Pinterest, and play music.
- **Group Management:** Automatically remove links, ban users, and manage group settings.
- **Fun & Games:** Play games like Tic-Tac-Toe, Word Games, and Math Puzzles.
- **Utility Tools:** Get quotes, manage plugins, and much more.
- **Plugin System:** Easily add or create new commands and features.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Git](https://git-scm.com/)
- [FFmpeg](https://ffmpeg.org/download.html)

## Installation

Follow these steps to get your Lixon bot up and running:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/krishnaa106/krishna.git
    ```

2.  **Navigate to the project directory:**
    ```bash
    cd LIXON
    ```

3.  **Install the dependencies:**
    ```bash
    npm install
    ```
    > **Note:** If you encounter errors during installation, try running the following command:
    > ```bash
    > npm install --legacy-peer-deps
    > ```

## Configuration

Before starting the bot, you need to configure it by creating a `config.env` file in the root directory.

1.  Create a file named `config.env`.
2.  Copy the following content into the file and modify the values as needed.

```env
PREFIX=.
STICKER_PACK=🔫,manji<3
SUDO=null
WARN=3
REACT=🫧
BOT_MODE=private
TIMEZONE=Asia/Kolkata
RMBG_API_KEY=g7MwWtpVCCnU7e1JEHuuz3Tv
PIN_API=http://localhost:3000/scrape
GIT_REPO=https://github.com/krishnaa106/krishna
GIT_BRANCH=https://github.com/krishnaa106/krishna/tree/main
PINTEREST_COOKIE=null
```

### Environment Variables

| Variable           | Description                                        | Default Value                                      |
| ------------------ | -------------------------------------------------- | -------------------------------------------------- |
| `PREFIX`           | The prefix for bot commands (e.g., `.`, `!`).      | `.`                                                |
| `STICKER_PACK`     | Default author and pack name for created stickers. | `🔫,manji<3`                                       |
| `SUDO`             | Comma-separated list of sudo user phone numbers.   | `null`                                             |
| `WARN`             | The warning limit for users in groups.             | `3`                                                |
| `REACT`            | The emoji the bot uses to react to commands.       | `🫧`                                               |
| `BOT_MODE`         | Set to `public` or `private`.                      | `private`                                          |
| `TIMEZONE`         | The timezone for the bot.                          | `Asia/Kolkata`                                     |
| `RMBG_API_KEY`     | Your API key for [remove.bg](https://www.remove.bg/). | `g7MwWtpVCCnU7e1JEHuuz3Tv`                         |
| `PIN_API`          | The API endpoint for the Pinterest scraper.        | `http://localhost:3000/scrape`                     |
| `GIT_REPO`         | The git repository URL for the update command.     | `https://github.com/krishnaa106/krishna`              |
| `GIT_BRANCH`       | The git repository branch for the update command.  | `https://github.com/krishnaa106/krishna/tree/main`    |
| `PINTEREST_COOKIE` | Your cookie for Pinterest access if needed.        | `null`                                             |

## Running the Bot

Lixon uses `pm2` to manage the bot process.

1.  **Install PM2 globally (if you haven't already):**
    ```bash
    npm install -g pm2
    ```

2.  **Make the session:**
    ```bash
    node ./lib/client.js
    ```

3.  **Exit:**
    ```bash
    ctrl+c
    ```

4.  **Start the bot:**
    ```bash
    npm start
    ```
    Alternatively, you can start it directly with `pm2`:
    ```bash
    pm2 start ./lib/client.js --name lixon
    ```

## Process Management

You can manage the bot process using these commands:

-   **Check logs:**
    ```bash
    pm2 logs lixon
    ```
-   **Stop the bot:**
    ```bash
    npm stop
    ```
-   **Restart the bot:**
    ```bash
    pm2 restart lixon
    ```

## Contributing

Contributions are welcome! If you have ideas for new features or improvements, feel free to open an issue or submit a pull request.

