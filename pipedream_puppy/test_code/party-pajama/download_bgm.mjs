import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BGM_URL = "https://cdn1.suno.ai/9a0604be-6f66-41b1-be78-3022ab188833.mp3";
const DEST_PATH = path.join(__dirname, 'bgm.mp3');

async function downloadBgm() {
    console.log(`Downloading BGM to ${DEST_PATH}...`);
    const writer = fs.createWriteStream(DEST_PATH);
    const response = await axios({
        url: BGM_URL,
        method: 'GET',
        responseType: 'stream'
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

downloadBgm().then(() => console.log("BGM Download Complete")).catch(console.error);
