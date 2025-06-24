const qs = require('qs');
const axios = require('axios')
const cheerio = require('cheerio')

require("dotenv").config();

function pinterest(query) {
    return new Promise(async (resolve, reject) => {
        try {
            const { data } = await axios.get(
                'https://id.pinterest.com/search/pins/?autologin=true&q=' + encodeURIComponent(query),
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0',
                        'cookie': process.env.PINTEREST_COOKIE,
                    }
                }
            );

            const $ = cheerio.load(data);
            const result = new Set();

            $('img').each((i, el) => {
                const src = $(el).attr('src') || $(el).attr('data-src');

                if (src && src.includes('pinimg.com') && /\/(236x|474x|736x)\//.test(src)) {
                    const clean = src.replace(/236x|474x|564x/g, '736x');

                    if (
                        !clean.endsWith('.svg') &&
                        !clean.includes('blank.gif') &&
                        !clean.includes('data:image') &&
                        !result.has(clean)
                    ) {
                        result.add(clean);
                    }
                }
            });

            resolve([...result]);
        } catch (err) {
            reject(err);
        }
    });
}



/**
 * Scrapes Instagram download link using snapvideo.app
 * @param {string} url - Instagram URL
 * @returns {Promise<string|null>} - Direct video URL or null
 */

//I remember i was so sleepy when i wrote this function,
//and i made this in termux
async function instaDl(url) {
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "Origin": "https://snapvideo.app",
    "Referer": "https://snapvideo.app/en",
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36",
    "X-Requested-With": "XMLHttpRequest"
  };

  const postData = qs.stringify({ q: url, vt: "instagram" });

  try {
    const res = await axios.post("https://snapvideo.app/api/ajaxSearch", postData, { headers });
    const $ = cheerio.load(res.data?.data || "");
    const videoLink = $('a[title="Download Video"]').attr("href");
    return videoLink || null;
  } catch (err) {
    console.error("instaDl error:", err.message);
    return null;
  }
}


function ringtone(title) {
    return new Promise((resolve, reject) => {
        axios.get('https://meloboom.com/en/search/'+title)
        .then((get) => {
            let $ = cheerio.load(get.data)
            let fetchedresult = []
            $('#__next > main > section > div.jsx-2244708474.container > div > div > div > div:nth-child(4) > div > div > div > ul > li').each(function (a, b) {
                fetchedresult.push({ title: $(b).find('h4').text(), source: 'https://meloboom.com/'+$(b).find('a').attr('href'), audio: $(b).find('audio').attr('src') })
            })
            resolve(fetchedresult)
        })
    })
}

function styletext(teks) {
    return new Promise((resolve, reject) => {
        axios.get('http://qaz.wtf/u/convert.cgi?text='+teks)
        .then(({ data }) => {
            let $ = cheerio.load(data)
            let fetchedresult = []
            $('table > tbody > tr').each(function (a, b) {
                fetchedresult.push({ name: $(b).find('td:nth-child(1) > span').text(), result: $(b).find('td:nth-child(2)').text().trim() })
            })
            resolve(fetchedresult)
        })
    })
}

module.exports = {
    pinterest,
    instaDl,
    ringtone,
    styletext
}