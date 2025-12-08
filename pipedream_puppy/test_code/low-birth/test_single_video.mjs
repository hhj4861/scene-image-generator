/**
 * Single Video Test - 1개 영상만으로 빠른 레이아웃 테스트
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
const FOLDER_NAME = `test_single_${Date.now()}`;

// Header and Footer
const HEADER_TEXT = "[댕댕] 땅콩이의 충격적인 저출산 대책";
const HEADER_TEXT_EN = "Puppy's SHOCKING Solution to Low Birth Rate";
const FOOTER_TEXT = "구독하면 귀여운 애기 생김";
const FOOTER_TEXT_EN = "Subscribe for cute babies";

// --- LOAD FIRST VIDEO ONLY ---
const VIDEO_ORDER_JSON = path.join(__dirname, 'script', 'final_video_order.json');
const videoOrderData = JSON.parse(fs.readFileSync(VIDEO_ORDER_JSON, 'utf8'));
const VIDEO_DIR = path.join(__dirname, 'generated_videos');

console.log("🚀 Single Video Test");
console.log(`📜 Header: ${HEADER_TEXT}`);
console.log(`📜 Footer: ${FOOTER_TEXT}`);
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

    // 첫 번째 영상만 사용
    const firstScene = videoOrder[0];
    const localPath = path.join(VIDEO_DIR, firstScene.file);

    if (!fs.existsSync(localPath)) {
        console.error(`❌ File not found: ${localPath}`);
        return;
    }

    console.log("📤 Uploading 1 video to GCS...\n");
    const gcsPath = `${FOLDER_NAME}/${firstScene.file}`;
    const url = await uploadToGCS(localPath, gcsPath);

    const videos = [{
        url,
        index: 0,
        duration: firstScene.duration_seconds || 4,
        narration: firstScene.narration_korean || "",
        narration_korean: firstScene.narration_korean || "",
        narration_english: firstScene.narration_english || "",
        dialogue: {
            script: firstScene.narration_korean || "",
            script_english: firstScene.narration_english || "",
        },
        speaker: firstScene.speaker || "main",
        character_name: firstScene.character_name || "땅콩"
    }];

    console.log(`✅ Uploaded 1 video\n`);

    // Build payload
    const payload = {
        videos: videos,
        bgm_url: null, // BGM 없이 테스트
        bgm_volume: 0,
        header_text: HEADER_TEXT,
        header_text_english: HEADER_TEXT_EN,
        footer_text: FOOTER_TEXT,
        footer_text_english: FOOTER_TEXT_EN,
        subtitle_enabled: true,
        subtitle_english_enabled: true,
        width: 1080,
        height: 1920,
        output_bucket: GCS_BUCKET,
        output_path: `${FOLDER_NAME}/test_single.mp4`,
        folder_name: FOLDER_NAME
    };

    console.log("🔗 Calling FFmpeg VM...\n");
    console.log(`  Endpoint: ${FFMPEG_VM_URL}/render/puppy`);
    console.log(`  Videos: 1`);
    console.log(`  Header: ${HEADER_TEXT}`);
    console.log(`  Footer: ${FOOTER_TEXT}\n`);

    try {
        const startTime = Date.now();

        const res = await fetch(`${FFMPEG_VM_URL}/render/puppy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            timeout: 300000
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

    } catch (err) {
        console.error("❌ Failed:", err.message);
    }
}

main();
