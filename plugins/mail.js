const axios = require("axios");
const store = { currentEmail: null, cookies: "", xsrf: "", seen: new Set() };
const BASE = "https://www.emailnator.com";

function extractCookies(setCookieArray) {
  return setCookieArray.map(c => c.split(";")[0]).join("; ");
}

function extractXsrfToken(setCookieArray) {
  const xsrfCookie = setCookieArray.find(c => c.startsWith("XSRF-TOKEN"));
  return xsrfCookie
    ? decodeURIComponent(xsrfCookie.split("=")[1].split(";")[0])
    : null;
}

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function initSession() {
  const res = await axios.get(BASE, { headers: { "User-Agent": "Mozilla/5.0" } });
  const setCookie = res.headers["set-cookie"];
  if (!setCookie) throw new Error("No cookies received");
  store.cookies = extractCookies(setCookie);
  store.xsrf = extractXsrfToken(setCookie);
  if (!store.xsrf) throw new Error("Failed to extract XSRF token");
}

async function generateEmail() {
  const res = await axios.post(`${BASE}/generate-email`, { email: ["dotGmail"] }, {
    headers: {
      "x-xsrf-token": store.xsrf,
      "Content-Type": "application/json",
      "Cookie": store.cookies,
      "Referer": BASE + "/",
      "Origin": BASE,
      "User-Agent": "Mozilla/5.0",
      "X-Requested-With": "XMLHttpRequest"
    }
  });
  const email = res.data?.email?.[0];
  if (!email || !email.includes("@")) throw new Error("Invalid email generated");
  store.currentEmail = email;
  return email;
}

async function fetchMessageBody(email, messageID) {
  const res = await axios.post(`${BASE}/message-list`, { email, messageID }, {
    headers: {
      "x-xsrf-token": store.xsrf,
      "Content-Type": "application/json",
      "Cookie": store.cookies,
      "Referer": `${BASE}/mailbox/${email}/${messageID}`,
      "Origin": BASE,
      "User-Agent": "Mozilla/5.0",
      "X-Requested-With": "XMLHttpRequest"
    }
  });
  return res.data;
}

async function fetchInbox(email, showAll = false) {
  const res = await axios.post(`${BASE}/message-list`, { email }, {
    headers: {
      "x-xsrf-token": store.xsrf,
      "Content-Type": "application/json",
      "Cookie": store.cookies,
      "Referer": `${BASE}/mailbox/`,
      "Origin": BASE,
      "User-Agent": "Mozilla/5.0",
      "X-Requested-With": "XMLHttpRequest"
    }
  });

  const messages = res.data.messageData || [];
  if (messages.length === 0) return "📭 No messages found.";

  let output = "";
  for (const msg of messages) {
    if (!msg.messageID || (store.seen.has(msg.messageID) && !showAll)) continue;
    store.seen.add(msg.messageID);
    output += `\n📩 *Subject:* ${msg.subject}\n🧾 *From:* ${msg.from}`;
    try {
      const body = await fetchMessageBody(email, msg.messageID);
      const clean = stripHtml(body);
      output += `\n📝 *Message:* ${clean.slice(0, 1000)}...\n`;
    } catch (err) {
      output += `\n⚠️ Failed to fetch body: ${err.message}\n`;
    }
  }
  return output || "🔄 No new messages.";
}

module.exports = [
  {
    name: "tmail",
    desc: "Temporary email generator + fetcher",
    category: "tools",
    fromMe: false,
    cooldown: 3,

    execute: async (sock, msg, args) => {
      const input = args.join(" ").trim();
      const chat = msg.key.remoteJid;

      if (!store.cookies || !store.xsrf) await initSession();

      let email = store.currentEmail;
      let mode = "watch";

      if (input.toLowerCase() === "reload") {
        if (!email) return sock.sendMessage(chat, { text: "❌ No email to reload." });
        const inbox = await fetchInbox(email, true);
        return sock.sendMessage(chat, { text: `🔁 Reloaded inbox for ${email}\n${inbox}` });
      } else if (input && input.toLowerCase().startsWith("reload ")) {
        const custom = input.split(" ")[1];
        const inbox = await fetchInbox(custom, true);
        return sock.sendMessage(chat, { text: `🔁 Reloaded inbox for ${custom}\n${inbox}` });
      } else if (input && input.includes("@")) {
        email = input;
        store.currentEmail = email;
        store.seen.clear();
      } else {
        // Generate new
        email = await generateEmail();
        store.seen.clear();
      }

      await sock.sendMessage(chat, { text: `${email}` });
      await sock.sendMessage(chat, { text: "Session is active for 2 minutes"}) ;

      const endTime = Date.now() + 2 * 60 * 1000;
      const interval = setInterval(async () => {
        if (Date.now() >= endTime) return clearInterval(interval);
        try {
          const inbox = await fetchInbox(email);
          if (!inbox.includes("No new")) await sock.sendMessage(chat, { text: inbox });
        } catch (e) {
          console.log("[TMAIL ERR]", e.message);
        }
      }, 5000);
    }
  }
];