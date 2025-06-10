const Jimp = require("jimp");
const fs = require("fs");
const path = require("path");
const { TMP_DIR } = require("../lib");
const { randomUUID } = require("crypto");

module.exports = [
  {
    name: "page",
    desc: "Create custom PNG page with size or ratio and background color",
    utility: "photoshop",
    fromMe: false,

    execute: async (client, msg, args) => {
      try {
        if (args.length < 2) {
          await client.sendMessage(msg.key.remoteJid, {
            text: "*Usage:* `.page <1080x1080 | 1:1> <#hex or ffffff>`\n*Example:* `.page 16:9 #ff0000`"
          });
          return;
        }

        let width, height;

        if (/^\d+:\d+$/i.test(args[0])) {
          const [wRatio, hRatio] = args[0].split(":").map(Number);
          const maxWidth = 3000;
          width = maxWidth;
          height = Math.round((hRatio / wRatio) * maxWidth);
        } else if (/^\d+x\d+$/i.test(args[0])) {
          const [w, h] = args[0].split("x").map(Number);
          if (w > 3000 || h > 3000) {
            await client.sendMessage(msg.key.remoteJid, {
              text: "❌ Max size: 3000x3000"
            });
            return;
          }
          width = w;
          height = h;
        } else {
          await client.sendMessage(msg.key.remoteJid, {
            text: "❌ Invalid size format. Use `1080x1080` or `16:9`"
          });
          return;
        }

        const hex = args[1].startsWith("#") ? args[1] : `#${args[1]}`;
        const colorInt = Jimp.cssColorToHex(hex);

        const img = await new Jimp(width, height, colorInt);
        const filename = path.join(TMP_DIR, `${randomUUID()}.png`);
        await img.writeAsync(filename);

        await client.sendMessage(msg.key.remoteJid, {
          image: fs.readFileSync(filename),
          mimetype: "image/png",
          caption: `🖼️ ${width}x${height}`
        }, { quoted: msg });

        fs.unlinkSync(filename);
      } catch (err) {
        await client.sendMessage(msg.key.remoteJid, {
          text: "❌ Error creating image"
        });
      }
    }
  }
];
