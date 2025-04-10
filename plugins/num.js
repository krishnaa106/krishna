const { getStatusData, cleanNum, generateNumbers, isOnWhatsApp, isPfp, getAbout, jidToNumber } = require("../lib");
const axios = require("axios");

module.exports = [

    {
        name: "onwa",
        desc: "Check multiple WhatsApp numbers",
        utility: "tools",
        fromMe: true,
        execute: async (client, msg, args) => {
            if (!args.length) {
                return client.sendMessage(msg.key.remoteJid, { text: "_*Usage:* `.onwa < Number with x >`_" });
            }

            let possibleNumbers = generateNumbers(args[0]);
            if (!possibleNumbers) {
                return client.sendMessage(msg.key.remoteJid, { text: "_Maximum 3x allowed (999 numbers max)._" });
            }

            let notInWhatsApp = [], onWhatsApp = [], pfpWithoutStatus = [], privacyOn = [];

            await Promise.all(
                possibleNumbers.map(async (num) => {
                    if (!(await isOnWhatsApp(client, num))) {
                        notInWhatsApp.push("+" + num);
                        return;
                    }

                    let hasPFP = await isPfp(client, num);
                    let { status, setAt } = await getAbout(client, num);
                    let hasStatus = status !== "NO ABOUT AVAILABLE";

                    if (hasPFP && hasStatus) {
                        onWhatsApp.push(`@${num}\n_Status:_ ${status}\n_Last Seen:_ ${setAt}`);
                    } else if (hasPFP && !hasStatus) {
                        pfpWithoutStatus.push("+" + num);
                    } else {
                        privacyOn.push("+" + num);
                    }
                })
            );

            let responseText = `\`Checked Numbers: ${possibleNumbers.length}\`\n\n`;

            if (onWhatsApp.length) responseText += `\`On WhatsApp:\`\n${onWhatsApp.join("\n\n")}\n\n`;
            if (pfpWithoutStatus.length) responseText += `\`PFP Without Status:\`\n${pfpWithoutStatus.join(", ")}\n\n`;
            if (privacyOn.length) responseText += `\`Privacy On (No PFP/Status):\`\n${privacyOn.join(", ")}\n\n`;
            if (notInWhatsApp.length) responseText += `\`Not in WhatsApp:\`\n${notInWhatsApp.join(", ")}\n\n`;

            await client.sendMessage(msg.key.remoteJid, {
                text: responseText,
                mentions: possibleNumbers.map(num => num + "@s.whatsapp.net"),
            });
        },
    },

    {
        name: "pfp",
        desc: "Find user details (PP, status, and last seen)",
        utility: "tools",
        fromMe: false,
        execute: async (client, msg, args) => {
            let number;

            if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                number = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
            } else if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
                number = msg.message.extendedTextMessage.contextInfo.participant;
            } else if (args.length) {
                number = cleanNum(args.join("")) + "@s.whatsapp.net";
            } else {
                await client.sendMessage(msg.key.remoteJid, { text: "*Usage:* `.pfp <number/reply/mention>`" });
                return { isFallback: true };
            }

            let displayNumber = `+${number.replace("@s.whatsapp.net", "")}`;

            try {
                let [result] = await client.onWhatsApp(number);
                if (!result?.exists) {
                    return client.sendMessage(msg.key.remoteJid, { text: "_Number is not registered on WhatsApp_" });
                }

                let ppUrl;
                try {
                    ppUrl = await client.profilePictureUrl(number, "image");
                } catch {
                    ppUrl = "https://i.ibb.co/T8K0XxK/default.jpg";
                }

                let { status, setAt } = await getStatusData(client, number);
                let text = `*NUMBER:* ${displayNumber}\n*ABOUT:* ${status}\n*DATE:* ${setAt}\n`;

                let response = await axios.get(ppUrl, { responseType: "arraybuffer" });
                let ppBuffer = Buffer.from(response.data, "binary");

                await client.sendMessage(msg.key.remoteJid, {
                    image: ppBuffer,
                    caption: text
                });
            } catch {
                return client.sendMessage(msg.key.remoteJid, { text: "_Failed to fetch user details_" });
            }
        }
    },

    {
        name: "num",
        desc: "Get the phone number of a replied or mentioned user",
        utility: "tools",
        fromMe: false,
        async execute(client, msg, args) {
            let jid;

            const quoted = msg.message?.extendedTextMessage?.contextInfo;
            if (quoted?.participant) {
                jid = quoted.participant;
            }
            
            if (!jid && msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
                jid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
            }

            if (!jid) {
                await client.sendMessage(msg.key.remoteJid, { text: "_Reply to a user or mention._" });
                return {isFallback: true};
            }

            const number = `+${jidToNumber(jid)}`;

            return client.sendMessage(msg.key.remoteJid, { text: number });
        }
    },
];
