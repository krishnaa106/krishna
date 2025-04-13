const path = require("path");
const pino = require("pino");
const readline = require("readline");
const { stickerHandler } = require("./utils");
const { handleMessage } = require("./handler");
require("dotenv").config({ path: path.join(__dirname, "config.env") });
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require("@whiskeysockets/baileys");

console.log("Starting bot...");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function bot() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState("auth_info");
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            syncFullHistory: false,
            logger: pino({ level: "silent" }),
            getMessage: async () => ({ conversation: null }),
            timeoutMs: 60000
        });

        console.log("Connecting to WhatsApp...");

        if (!sock.authState.creds.registered) {
            rl.question("Enter your phone number: ", async (number) => {
                try {
                    const pairingCode = await sock.requestPairingCode(number);
                    console.log(`Your pairing code: ${pairingCode}`);
                    console.log("Enter this code on WhatsApp Web to link your device.");
                } catch (error) {
                    console.error("Failed to get pairing code:", error);
                } finally {
                    rl.close();
                }
            });
        }

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
            if (connection === "open") {
                console.log("Connected to WhatsApp!");
            }
            if (connection === "close") {
                const reason = lastDisconnect?.error?.output?.statusCode;
                console.log(`Disconnected. Reason: ${reason || "Unknown"}`);

                if (reason === DisconnectReason.loggedOut) {
                    console.log("Session expired. Delete 'auth_info' folder and re-authenticate.");
                    return;
                }

                console.log("Reconnecting...");
                setTimeout(bot, 5000);
            }
        });

        sock.ev.on("messages.upsert", async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message) return;
            
            await stickerHandler(sock, msg);
            await handleMessage(sock, msg);
        });

        

    } catch (error) {
        console.error("Error connecting to WhatsApp:", error);
    }
}

bot();