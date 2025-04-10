const { toggleAtake } = require("../lib");

module.exports = {
    name: "atake",
    desc: "Globally intercept stickers and send modified versions in the enabled chat",
    utility: "sticker",
    fromMe: true,
    execute: async (client, msg, args) => {
        await toggleAtake(client, msg, args);
    }
};
