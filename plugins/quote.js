const { extractText, toWebp, addExif, TMP_DIR } = require("../lib/utils");
const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

async function createImage(text, name, pfpUrl, time, outputPath) {
  try {
    const background = await Jimp.read('https://i.imgur.com/ObjKHe8.png');
    const fontName = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    const fontText = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
    const fontTime = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);

    let profilePic;
    try {
      profilePic = await Jimp.read(pfpUrl);
    } catch (err) {
      console.error('Error loading profile picture, falling back to default:', err);
      profilePic = await Jimp.read('https://i.imgur.com/dmxYQ8h.png');
    }
    profilePic.circle().resize(150, 150);

    const fixedWidth = 420;
    const wrappedText = wrapText(text, fontText, fixedWidth);
    const textHeight = wrappedText.length * Jimp.measureTextHeight(fontText, 'A', fixedWidth) + 30;
    const rectHeight = textHeight + 140;

    const canvasHeight = background.bitmap.height;
    const profileX = 30;
    const profileY = (canvasHeight - profilePic.bitmap.height) / 2;
    const rectX = profileX + profilePic.bitmap.width + 10;
    const paddingBetweenTexts = 30;
    const rectY = (canvasHeight - rectHeight) / 2 + paddingBetweenTexts;

    const roundedRect = new Jimp(fixedWidth + 400, rectHeight, 0x232525ff);
    roundedRect.scan(0, 0, roundedRect.bitmap.width, roundedRect.bitmap.height, (x, y, idx) => {
      const radius = 30;
      if ((x < radius && y < radius && Math.hypot(x - radius, y - radius) > radius) ||
          (x < radius && y >= roundedRect.bitmap.height - radius && Math.hypot(x - radius, y - (roundedRect.bitmap.height - radius)) > radius) ||
          (x >= roundedRect.bitmap.width - radius && y < radius && Math.hypot(x - (roundedRect.bitmap.width - radius), y - radius) > radius) ||
          (x >= roundedRect.bitmap.width - radius && y >= roundedRect.bitmap.height - radius && Math.hypot(x - (roundedRect.bitmap.width - radius), y - (roundedRect.bitmap.height - radius)) > radius)) {
        roundedRect.bitmap.data[idx + 3] = 0;
      }
    });

    background.composite(profilePic, profileX, profileY);
    background.composite(roundedRect, rectX, rectY);

    const textImage = new Jimp(420, 50, 0x00000000);
    textImage.print(fontName, 0, 0, name || 'Unknown User');
    textImage.scale(1.5);
    const orangeOverlay = new Jimp(textImage.bitmap.width, textImage.bitmap.height, 0xFFFF00FF);
    orangeOverlay.mask(textImage, 0, 0);
    background.composite(orangeOverlay, rectX + 30, rectY + 20);

    const verticalOffset = 80;
    wrappedText.forEach((line, i) => {
      background.print(fontText, rectX + 30, rectY + verticalOffset + i * Jimp.measureTextHeight(fontText, 'A', fixedWidth), {
        text: line.trim(),
        alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT
      });
    });

    const grayTextImage = new Jimp(fixedWidth, 50, 0x00000000);
    grayTextImage.print(fontTime, 0, 0, time);
    grayTextImage.scale(1.2);
    const grayOverlay = new Jimp(grayTextImage.bitmap.width, grayTextImage.bitmap.height, 0x808080FF);
    grayOverlay.mask(grayTextImage, 0, 0);

    const grayTextX = rectX + fixedWidth + 230;
    const grayTextY = rectY + 60 + wrappedText.length * Jimp.measureTextHeight(fontText, 'A', fixedWidth) + 50;
    background.composite(grayOverlay, grayTextX, grayTextY);

    await background.writeAsync(outputPath);
    console.log(`Image created successfully: ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('Error creating image:', error);
    return null;
  }
}

function wrapText(text, font, width) {
  const wrappedText = [];
  let currentLine = '';

  for (let i = 0; i < text.length; i += 25) {
    const segment = text.slice(i, i + 25);
    const testLine = currentLine ? `${currentLine} ${segment}` : segment;

    if (Jimp.measureText(font, testLine) <= width) {
      currentLine = testLine;
    } else {
      wrappedText.push(currentLine.trim());
      currentLine = segment;
    }
  }

  if (currentLine.trim()) {
    wrappedText.push(currentLine.trim());
  }

  return wrappedText;
}

function generateRandomTime() {
  const hours = Math.floor(Math.random() * 12) + 1;
  const minutes = Math.floor(Math.random() * 60).toString().padStart(2, '0');
  const period = Math.random() < 0.5 ? 'am' : 'pm';
  return `${hours}:${minutes} ${period}`;
}

module.exports = [
  {
    name: "quote",
    scut: "q",
    desc: "Create a quote image from a replied message.",
    utility: "image",
    fromMe: false,
    execute: async (client, msg) => {
      let imagePath = null;
      let stickerPath = null;
      try {
        const textInput = extractText(msg);
        if (!textInput) {
          return client.sendMessage(msg.key.remoteJid, { text: "_Reply to a message to create a quote!_" });
        }

        const quoted = msg.message?.extendedTextMessage?.contextInfo;
        if (!quoted || !quoted.participant) {
          return client.sendMessage(msg.key.remoteJid, { text: "_Reply to a message to create a quote!_" });
        }
      console.log(quoted);

        const sender = quoted.participant;
        let senderName;

        if (msg.key.remoteJid.endsWith('@g.us')) {
          try {
            const groupMeta = await client.groupMetadata(msg.key.remoteJid);
            const participant = groupMeta.participants.find(p => p.id === sender);
            senderName = participant?.name || participant?.notify || sender.split('@')[0];

          } catch (e) {
            console.error("Could not get group metadata:", e);
            senderName = sender.split('@')[0];
          }
        } else {
          senderName = sender.split('@')[0];
        }

        const pfpUrl = await client.profilePictureUrl(sender, 'image').catch(() => 'https://i.imgur.com/dmxYQ8h.png');
        const randomTime = generateRandomTime();

        imagePath = path.join(TMP_DIR, `${Date.now()}.png`);
        const createdImagePath = await createImage(textInput, senderName, pfpUrl, randomTime, imagePath);

        if (createdImagePath) {
          stickerPath = await toWebp(createdImagePath);
          await addExif(stickerPath);

          await client.sendMessage(msg.key.remoteJid, {
            sticker: fs.readFileSync(stickerPath)
          }, { quoted: msg });

        } else {
          await client.sendMessage(msg.key.remoteJid, { text: "_Failed to create the image._" });
        }
      } catch (error) {
        console.error("Error in quote plugin:", error);
        await client.sendMessage(msg.key.remoteJid, { text: "_An error occurred while creating the quote._" });
      } finally {
        if (imagePath && fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
        if (stickerPath && fs.existsSync(stickerPath)) {
          fs.unlinkSync(stickerPath);
        }
      }
    }
  }
];
