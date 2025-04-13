const fs = require("fs");
require("dotenv").config();
const path = require("path");
const sharp = require("sharp");
const axios = require("axios");
const FormData = require("form-data");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { dlMedia } = require("./utils");

const DPI = 300;
const TEMP_DIR = "./media/tmp";
const RMBG_API_KEY = process.env.RMBG_API_KEY;
const RMBG_API_URL = "https://api.remove.bg/v1.0/removebg";

const SIZE_MAP = {
    "a4": {
        width: 210,
        height: 297,
        layout: {
            columns: 5,
            spacingX: 50,
            spacingY: 50,
            marginLeft: 60,
            marginTop: 60
        }
    },
    "4x6": {
        width: 101.6,
        height: 152.4,
        layout: {
            columns: 2,
            spacingX: 160,
            spacingY: -80,
            marginLeft: 40,
            marginTop: 40
        },
        rotate: true
    },
};

const PASSPORT_SIZE_CM = { width: 3.3, height: 4.3 };
const PASSPORT_SIZE_PX = {
    width: Math.round((PASSPORT_SIZE_CM.width * DPI) / 2.54),
    height: Math.round((PASSPORT_SIZE_CM.height * DPI) / 2.54),
};

const BACKGROUND_COLOR = "#FFFFFF";
const STROKE_WIDTH = 3;

async function removeBackground(inputPath, outputPath) {
    const form = new FormData();
    form.append("image_file", fs.createReadStream(inputPath));
    form.append("size", "auto");

    try {
        const response = await axios.post(RMBG_API_URL, form, {
            headers: { ...form.getHeaders(), "X-Api-Key": RMBG_API_KEY },
            responseType: "arraybuffer",
        });
        fs.writeFileSync(outputPath, response.data);
    } catch (error) {
        return null;
    }
    return outputPath;
}

async function processImage(inputImage, pageSize, numCopies) {
    const TEMP_INPUT = path.join(TEMP_DIR, "temp_input.png");
    const TEMP_NO_BG = path.join(TEMP_DIR, "temp_no_bg.png");
    const TEMP_FINAL = path.join(TEMP_DIR, "temp_final.png");
    const OUTPUT_PATH = path.join(TEMP_DIR, `passport_photos_${pageSize}.png`);

    const PAGE_CONFIG = SIZE_MAP[pageSize];
    if (!PAGE_CONFIG) return null;

    const PAGE_SIZE_PX = {
        width: Math.round((PAGE_CONFIG.width * DPI) / 25.4),
        height: Math.round((PAGE_CONFIG.height * DPI) / 25.4),
    };

    try {
        await sharp(inputImage)
            .resize(PASSPORT_SIZE_PX.width, PASSPORT_SIZE_PX.height, { fit: "cover", position: "center" })
            .toFile(TEMP_INPUT);

        if (!(await removeBackground(TEMP_INPUT, TEMP_NO_BG))) return null;

        let processedImage = await sharp(TEMP_NO_BG)
            .flatten({ background: BACKGROUND_COLOR })
            .extend({ top: STROKE_WIDTH, bottom: STROKE_WIDTH, left: STROKE_WIDTH, right: STROKE_WIDTH, background: "#000000" })
            .toBuffer();

        if (PAGE_CONFIG.rotate) {
            processedImage = await sharp(processedImage).rotate(-90).toBuffer();
        }

        await sharp(processedImage).toFile(TEMP_FINAL);

        const canvas = sharp({
            create: { width: PAGE_SIZE_PX.width, height: PAGE_SIZE_PX.height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
        });

        const compositeImages = [];
        const { columns, spacingX, spacingY, marginLeft, marginTop } = PAGE_CONFIG.layout;
        const totalRows = Math.ceil(numCopies / columns);

        for (let i = 0; i < numCopies; i++) {
            const row = Math.floor(i / columns);
            const col = i % columns;
            compositeImages.push({
                input: TEMP_FINAL,
                top: marginTop + row * (PASSPORT_SIZE_PX.height + spacingY),
                left: marginLeft + col * (PASSPORT_SIZE_PX.width + spacingX),
            });
        }

        await canvas.composite(compositeImages).toFile(OUTPUT_PATH);
        return OUTPUT_PATH;
    } catch (error) {
        return null;
    }
}


async function extractViewOnceMedia(client, msg, sendToSelf = false) {
    const jid = sendToSelf ? client.user.id : msg.key.remoteJid;
    const contextMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!contextMsg) {
        return client.sendMessage(jid, { text: "❌ Reply to a view-once media!" });
    }

    // Handle both wrapped and unwrapped view-once messages
    const viewOnceWrapper = contextMsg.viewOnceMessage ||
                            contextMsg.viewOnceMessageV2 ||
                            contextMsg.viewOnceMessageV2Extension;

    // Either it's wrapped, or it's directly a media with viewOnce flag
    const quoted = viewOnceWrapper?.message || contextMsg;

    const mediaType = Object.keys(quoted)[0];
    const media = quoted[mediaType];

    if (!media?.viewOnce || !["imageMessage", "videoMessage", "audioMessage"].includes(mediaType)) {
        return client.sendMessage(jid, { text: "❌ No view-once media found!" });
    }

    try {
        const buffer = await dlMedia({ message: quoted }, client, "buffer");


        const sendOptions = {
            [mediaType.replace("Message", "")]: buffer
        };

        if (mediaType === "audioMessage") {
            Object.assign(sendOptions, {
                mimetype: "audio/ogg; codecs=opus",
                ptt: true
            });
        }

        return client.sendMessage(jid, sendOptions);
    } catch (err) {
        console.error("❌ Error downloading view-once media:", err);
        return client.sendMessage(jid, { text: "❌ Failed to download media." });
    }
}





module.exports = {
    processImage,
    removeBackground,
    extractViewOnceMedia,
};
