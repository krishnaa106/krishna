const fs = require("fs");
const path = require("path");

const functions = {};
const files = fs.readdirSync(__dirname);

files.forEach((file) => {
    if (file.endsWith(".js") && file !== "index.js") {
        const moduleExports = require(path.join(__dirname, file));
        Object.assign(functions, moduleExports);
    }
});

module.exports = functions;
