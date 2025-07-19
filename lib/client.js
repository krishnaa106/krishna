const path = require("path");
const pino = require("pino");
const readline = require("readline");
const qrcode = require("qrcode-terminal");
require("dotenv").config({ path: path.join(__dirname, "config.env") });

const { stickerHandler } = require("./utils");
const { handleMessage } = require("./handler");
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require("@whiskeysockets/baileys");

console.log("Starting bot...");

async function bot() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    try {
        // --- Auth & Socket Setup ---
        const { state, saveCreds } = await useMultiFileAuthState("session");
        const sock = makeWASocket({
            auth: state,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            browser: Browsers.macOS("Safari"),
            logger: pino({ level: "silent" }),
            getMessage: async () => ({ conversation: null }),
            timeoutMs: 60000
        });

        console.log("Connecting to WhatsApp...");

        // --- Trackers (Custom Listeners) ---
        const trackers = new Map();
        sock.registerTracker = (id, condition, action) => trackers.set(id, { condition, action });
        sock.unregisterTracker = (id) => trackers.delete(id);

        // --- Pairing Code Flow (if QR=false) ---
        if (!sock.authState.creds.registered && process.env.QR?.toLowerCase() !== "true") {
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

        // --- Save credentials ---
        sock.ev.on("creds.update", saveCreds);

        // --- Connection Events ---
        sock.ev.on("connection.update", async ({ connection, qr, lastDisconnect }) => {
            // QR Mode (if QR=true)
            if (qr && process.env.QR?.toLowerCase() === "true") {
                console.log("Scan this QR code to log in:");
                qrcode.generate(qr, { small: true });
            }

            if (connection === "open") {
                console.log("Connected to WhatsApp!");
                const { runAntilink } = require("../plugins/antilink");
                runAntilink(sock);
            }

            const { runBan } = require("../plugins/ban");
            runBan(sock);
            const { runAntistatus } = require("../plugins/antiStatus");
            runAntistatus(sock);

            if (connection === "close") {
                const reason = lastDisconnect?.error?.output?.statusCode;
                console.log(`Disconnected. Reason: ${reason || "Unknown"}`);

                if (reason === DisconnectReason.loggedOut) {
                    console.log("Session expired. Delete 'session' folder and re-authenticate.");
                    return;
                }

                console.log("Reconnecting...");
                setTimeout(bot, 5000);
            }
        });

        // --- Message Listener ---
        sock.ev.on("messages.upsert", async ({ messages }) => {
            const msg = messages[0];
            if (!msg.message) return;

            // 1. Handle default commands
            await handleMessage(sock, msg);

            // 2. Run custom trackers
            for (const [id, { condition, action }] of trackers.entries()) {
                try {
                    if (await condition(msg)) await action(sock, msg);
                } catch (e) {
                    console.error("Tracker error:", e);
                }
            }
        });

    } catch (error) {
        console.error("Error connecting to WhatsApp:", error);
    }
}

bot();
// WORKING FINE