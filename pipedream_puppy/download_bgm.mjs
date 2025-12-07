
import fs from 'fs';
import axios from 'axios';
import path from 'path';

const BGM_URL = "https://cdn1.suno.ai/96a9e389-15ce-45c1-9046-38cfe67ef129.mp3";
const OUTPUT_PATH = "./pipedream_puppy/output/bgm.mp3";

async function downloadBgm() {
    console.log(`Downloading BGM from ${BGM_URL}...`);
    const response = await axios({
        method: 'get',
        url: BGM_URL,
        responseType: 'stream'
    });

    const writer = fs.createWriteStream(OUTPUT_PATH);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

downloadBgm().then(() => console.log("BGM Downloaded!"));
