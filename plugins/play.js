const ytSearch = require("yt-search");
const ytdl = require("youtube-dl-exec");
const fs = require("fs");
const path = require("path");
const { TMP_DIR } = require("../lib/");

module.exports = [
  {
    name: "play",
    desc: "Play a song from YouTube",
    type: "downloader",
    fromMe: false,

    execute: async (sock, msg, args) => {
      const query = args.join(" ").trim();
      const jid = msg.key.remoteJid;

      if (!query) {
        return await sock.sendMessage(jid, { text: "_Please provide a song name or keywords._" });
      }

      try {
        const results = await ytSearch(query);
        const video = results.videos[0];

        if (!video) {
          return await sock.sendMessage(jid, { text: "_No song found._" });
        }

        const filePath = path.join(TMP_DIR, `${Date.now()}.mp3`);
        await sock.sendMessage(jid, { text: `🎶 _Downloading:_ *${video.title}*` });

        await ytdl(video.url, {
          output: filePath,
          format: "bestaudio[ext=m4a]/bestaudio",
          audioFormat: "m4a"
        });

        await sock.sendMessage(jid, {
          audio: fs.readFileSync(filePath),
          mimetype: "audio/mp4",
          ptt: false,
          fileName: `${video.title}.mp3`
        });

        fs.unlinkSync(filePath);
      } catch (err) {
        console.error("❌ Play command error:", err);
        await sock.sendMessage(jid, { text: "❌ Couldn't download the song." });
      }
    },
  },
];
