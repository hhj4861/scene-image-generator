/**
 * Low-Birth Rate Video Render Test (GCS Upload Version)
 * Uploads videos to GCS, then calls FFmpeg VM
 */

import { Storage } from '@google-cloud/storage';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIG ---
const FFMPEG_VM_URL = "http://34.64.168.173:3000";
const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";
const FOLDER_NAME = `test_lowbirth_${Date.now()}`;

// BGM URL
const BGM_URL = "https://cdn1.suno.ai/2bc13c1d-4541-4eab-aa2c-e4e92c3808ed.mp3";

// Header and Footer
const HEADER_TEXT = "[댕댕] 땅콩이의 충격적인 저출산 대책 ㅋㅋ";
const HEADER_TEXT_EN = "Puppy's SHOCKING Solution to Low Birth Rate LOL";
const FOOTER_TEXT = "구독하면 귀여운 애기 생김";
const FOOTER_TEXT_EN = "Subscribe for cute babies";

// --- LOAD VIDEO ORDER DATA ---
const VIDEO_ORDER_JSON = path.join(__dirname, 'script', 'final_video_order.json');
const videoOrderData = JSON.parse(fs.readFileSync(VIDEO_ORDER_JSON, 'utf8'));
const VIDEO_DIR = path.join(__dirname, 'generated_videos');

console.log("🚀 Low-Birth Rate Video Render Test (GCS Version)");
console.log(`📜 Header: ${HEADER_TEXT}`);
console.log(`📜 Footer: ${FOOTER_TEXT}`);
console.log(`🎵 BGM: ${BGM_URL}`);
console.log(`📂 Folder: ${FOLDER_NAME}\n`);

// --- UPLOAD TO GCS ---
async function uploadToGCS(localPath, gcsPath) {
    const storage = new Storage();
    const bucket = storage.bucket(GCS_BUCKET);

    console.log(`  Uploading ${path.basename(localPath)}...`);
    await bucket.upload(localPath, { destination: gcsPath });

    return `https://storage.googleapis.com/${GCS_BUCKET}/${gcsPath}`;
}

// --- MAIN ---
async function main() {
    const videoOrder = videoOrderData.video_order;

    // 1. Upload videos to GCS
    console.log("📤 Step 1: Uploading videos to GCS...\n");
    const videos = [];

    for (let i = 0; i < videoOrder.length; i++) {
        const scene = videoOrder[i];
        const localPath = path.join(VIDEO_DIR, scene.file);

        if (!fs.existsSync(localPath)) {
            console.error(`  ❌ File not found: ${localPath}`);
            continue;
        }

        const gcsPath = `${FOLDER_NAME}/${scene.file}`;
        const url = await uploadToGCS(localPath, gcsPath);

        videos.push({
            url,
            index: i,
            duration: scene.duration_seconds || 4,
            narration: scene.narration_korean || "",
            narration_korean: scene.narration_korean || "",
            narration_english: scene.narration_english || "",
            dialogue: {
                script: scene.narration_korean || "",
                script_english: scene.narration_english || "",
            },
            speaker: scene.speaker || "main",
            character_name: scene.character_name || "땅콩"
        });
    }

    console.log(`\n✅ Uploaded ${videos.length} videos\n`);

    // 2. Build payload
    const payload = {
        videos: videos,
        bgm_url: BGM_URL,
        bgm_volume: 0.15,
        header_text: HEADER_TEXT,
        header_text_english: HEADER_TEXT_EN,
        footer_text: FOOTER_TEXT,
        footer_text_english: FOOTER_TEXT_EN,
        subtitle_enabled: true,
        subtitle_english_enabled: true,
        width: 1080,
        height: 1920,
        output_bucket: GCS_BUCKET,
        output_path: `${FOLDER_NAME}/final_lowbirth_new_layout.mp4`,
        folder_name: FOLDER_NAME
    };

    // 3. Call FFmpeg VM
    console.log("🔗 Step 2: Calling FFmpeg VM...\n");
    console.log(`  Endpoint: ${FFMPEG_VM_URL}/render/puppy`);
    console.log(`  Videos: ${videos.length}`);
    console.log(`  BGM: ✅`);
    console.log(`  Subtitles: Korean ✅, English ✅\n`);

    try {
        const startTime = Date.now();

        const res = await fetch(`${FFMPEG_VM_URL}/render/puppy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            timeout: 600000
        });

        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`VM Error (${res.status}): ${txt}`);
        }

        const json = await res.json();
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log("===========================================");
        console.log("✅ SUCCESS!");
        console.log("===========================================");
        console.log(`⏱️  Time: ${elapsed}s`);
        console.log(`📹 Output: ${json.url}`);
        console.log(`📊 Stats:`, JSON.stringify(json.stats, null, 2));
        console.log(`⚡ Performance:`, JSON.stringify(json.performance, null, 2));

    } catch (err) {
        console.error("❌ Failed:", err.message);
    }
}

main();
