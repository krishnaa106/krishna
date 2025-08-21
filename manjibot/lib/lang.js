// root/lib/lang.js
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../config.env") });

/**
 * Wrap a string so it acts like a string but also has `.format(...)` only if needed.
 */
function makeString(str) {
  // Check if the string contains placeholders like {0}, {1}, etc.
  const hasPlaceholder = /{(\d+)}/.test(str);

  if (!hasPlaceholder) return str; // just return the string normally if no placeholder

  // Otherwise, attach the format method
  return Object.create(String.prototype, {
    format: {
      value: (...args) =>
        str.replace(/{(\d+)}/g, (m, i) => (args[i] !== undefined ? args[i] : m)),
    },
    toString: { value: () => str },
    valueOf: { value: () => str },
    raw: { value: str },
  });
}

/**
 * Load language JSON dynamically with format support.
 */
function loadLang(langCode) {
  const langFile = langCode || process.env.BOT_LANG || "en";
  const filePath = path.join(__dirname, "../lang", `${langFile}.json`);
  
  let data;
  if (fs.existsSync(filePath)) {
    data = fs.readFileSync(filePath, "utf-8");
  } else {
    const fallback = path.join(__dirname, "../lang/en.json");
    if (fs.existsSync(fallback)) {
      data = fs.readFileSync(fallback, "utf-8");
    } else {
      return {};
    }

  }

  const langObj = JSON.parse(data);

  // Recursively attach format only where needed
  function attachFormat(obj) {
    for (const key in obj) {
      if (typeof obj[key] === "string") {
        obj[key] = makeString(obj[key]);
      } else if (typeof obj[key] === "object" && obj[key] !== null) {
        attachFormat(obj[key]);
      }
    }
  }

  attachFormat(langObj);
  return langObj;
}

//      Export processed language object
module.exports = loadLang();
