const {
    setAtkTarget,
    getAtkStatus,
    pushAtkTask,
    handleAtkSticker,
    AtkQueue
} = require("../lib");

module.exports = [

    {
        name: "atake",
        desc: "Enable/disable auto sticker capture / View queue",
        utility: "sticker",
        fromMe: true,

        async execute(client, msg, args) {
            const chat = msg.key.remoteJid;
            const arg = args[0]?.toLowerCase();

            if (arg === "on") {
                setAtkTarget(chat);

                client.registerTracker("atk", m =>
                    !!m.message?.stickerMessage && !m.key.fromMe,
                    async (client, msg) => pushAtkTask(() => handleAtkSticker(client, msg))
                );

                return client.sendMessage(chat, {
                    text: "_Auto sticker enabled._"
                });

            } else if (arg === "off") {
                setAtkTarget(null);
                client.unregisterTracker("atk");

                return client.sendMessage(chat, {
                    text: "_Auto sticker disabled._"
                });

            } else if (arg === "queue") {
                return client.sendMessage(chat, {
                    text: `*Queue length:*${AtkQueue.length}*\n${getAtkStatus()}`
                });
            }

            return client.sendMessage(chat, {
                text: "*Usage:*\n> `.atake on/off/queue`"
            });
        }
    }
];