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

/**
 * Convert a .webp file to .mp4 using ezgif.com (scraping method)
 * @param {string} inputPath - Path to the .webp file
 * @param {string} outputPath - Path to save the resulting .mp4 file
 * @returns {Promise<string>} - Resolves to outputPath if successful
 */
async function webpToMp4(inputPath, outputPath) {
    // 1. Upload the .webp file to ezgif.com
    const uploadUrl = "https://ezgif.com/webp-to-mp4";
    const form = new (require('form-data'))();
    const fs = require('fs');
    form.append("new-image", fs.createReadStream(inputPath));
    const uploadResponse = await axios.post(uploadUrl, form, {
        headers: form.getHeaders(),
    });
    // 2. Parse response to extract the 'file' parameter
    const $ = cheerio.load(uploadResponse.data);
    const fileParam = $("form input[name='file']").attr("value");
    if (!fileParam) throw new Error("Failed to extract file parameter from upload step.");
    // 3. Send POST to process the conversion
    const processUrl = `https://ezgif.com/webp-to-mp4/${fileParam}`;
    const FormData = require('form-data');
    const processForm = new FormData();
    processForm.append("file", fileParam);
    processForm.append("convert", "Convert WebP to MP4!");
    const convertResponse = await axios.post(processUrl, processForm, {
        headers: processForm.getHeaders(),
    });
    // 4. Extract MP4 video URL
    const $$ = cheerio.load(convertResponse.data);
    const videoUrl = $$("#output > p > video > source").attr("src");
    if (!videoUrl) throw new Error("Failed to extract MP4 URL from conversion step.");
    const finalUrl = "https:" + videoUrl;
    // 5. Download the mp4 file to outputPath
    const writer = fs.createWriteStream(outputPath);
    const response = await axios.get(finalUrl, { responseType: "stream" });
    await new Promise((resolve, reject) => {
        response.data.pipe(writer);
        writer.on("finish", resolve);
        writer.on("error", reject);
    });
    return outputPath;
}

/**
 * Download Spotify track metadata and MP3 URL using FabDL API.
 * @param {string} trackUrl - The Spotify track URL.
 * @returns {Promise<{title: string, artist: string, image: string, url: string}>}
 */
async function spotifyDl(trackUrl) {
    try {
        // Fetch track information
        const trackRes = await axios.get("https://api.fabdl.com/spotify/get", {
            params: { url: trackUrl },
            headers: { "User-Agent": "Mozilla/5.0" }
        });

        const trackInfo = trackRes.data;
        if (!trackInfo?.result?.id) throw new Error("Track info not found.");

        // Start MP3 conversion job
        const convertRes = await axios.get(
            `https://api.fabdl.com/spotify/mp3-convert-task/${trackInfo.result.gid}/${trackInfo.result.id}`
        );
        const job = convertRes.data;
        if (!job?.result?.tid) throw new Error("Conversion job failed.");

        const tid = job.result.tid;
        let finalData;

        // Poll until conversion is complete
        for (let i = 0; i < 10; i++) {
            const statusRes = await axios.get(`https://api.fabdl.com/spotify/mp3-convert-progress/${tid}`);
            finalData = statusRes.data;

            if (finalData?.result?.status === 5 || finalData?.result?.download_url) break;
            await new Promise((r) => setTimeout(r, 2000));
        }

        if (!finalData?.result?.download_url) throw new Error("Failed to get download URL.");
        const downloadUrl = `https://api.fabdl.com${finalData.result.download_url}`;

        return {
            title: trackInfo.result.name,
            artist: trackInfo.result.artists,
            image: trackInfo.result.image,
            url: downloadUrl
        };
    } catch (err) {
        throw new Error(`Spotify Download Failed: ${err.message}`);
    }
}


module.exports = {
    pinterest,
    instaDl,
    ringtone,
    styletext,
    webpToMp4,
    spotifyDl
}