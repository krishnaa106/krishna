const axios = require("axios");

module.exports = [
    {
        name: "ai",
        desc: "Ask DeepSeek AI",
        type: "ai",
        fromMe: false,

        async execute(sock, msg, text) {
        const ctx = msg.message?.extendedTextMessage?.contextInfo;
        const quoted = ctx?.quotedMessage?.conversation || ctx?.quotedMessage?.extendedTextMessage?.text;

        const input = quoted ? `${text}\n${quoted}` : text;

        if (!input) {
            return await sock.sendMessage(msg.key.remoteJid, {
            text: "❌ Provide a prompt or reply to a message."
            }, { quoted: msg });
        }

        try {
            const response = await axios.post(
            "https://api.together.xyz/v1/chat/completions",
            {
                model: "deepseek-ai/DeepSeek-V3",
                messages: [
                {
                    role: "user",
                    content: input
                }
                ]
            },
            {
                headers: {
                Authorization: "Bearer f276538114b57f214a9a958a609a45c12d19059236a1ecbcff9b57032d2942f5",
                "Content-Type": "application/json"
                }
            }
            );

            const result = response.data?.choices?.[0]?.message?.content?.trim();
            if (!result) throw new Error("Empty response from AI.");

            await sock.sendMessage(msg.key.remoteJid, {
            text: result
            }, { quoted: msg });

        } catch (err) {
            await sock.sendMessage(msg.key.remoteJid, {
            text: `❌ Error: ${err.message}`
            }, { quoted: msg });
        }
        }
    },
];
