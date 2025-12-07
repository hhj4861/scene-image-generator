/**
 * Low-Birth Rate Video Render Script
 * Renders final YouTube Shorts video with subtitles, BGM, and header/footer
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIG ---
const FFMPEG_VM_URL = "http://34.64.168.173:3000";
const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";
const FOLDER_NAME = "20251206_low_birth_final";

// ngrok URL (set via environment variable)
const NGROK_URL = process.env.NGROK_URL || "https://YOUR_NGROK_URL.ngrok-free.app";

// BGM URL
const BGM_URL = "https://cdn1.suno.ai/2bc13c1d-4541-4eab-aa2c-e4e92c3808ed.mp3";

// Header and Footer
const HEADER_TEXT = "[댕댕] 땅콩이의 충격적인 저출산 대책 ㅋㅋ";
const HEADER_TEXT_EN = "Puppy's SHOCKING Solution to Low Birth Rate LOL";
const FOOTER_TEXT = "구독하면 귀여운 애기 생김";

// --- LOAD VIDEO ORDER DATA ---
const VIDEO_ORDER_JSON = path.join(__dirname, 'script', 'final_video_order.json');
const videoOrderData = JSON.parse(fs.readFileSync(VIDEO_ORDER_JSON, 'utf8'));

console.log("🚀 Low-Birth Rate Video Render");
console.log(`📜 Header: ${HEADER_TEXT}`);
console.log(`📜 Footer: ${FOOTER_TEXT}`);
console.log(`🎵 BGM: ${BGM_URL}`);

// --- VERIFY SUBTITLES ---
console.log("\n📋 Verifying Subtitles...");
const videoOrder = videoOrderData.video_order;

videoOrder.forEach((scene, i) => {
    const hasKorean = !!scene.narration_korean;
    const hasEnglish = !!scene.narration_english;
    const file = scene.file;
    const index = scene.index;

    console.log(`  [${i}] ${file} (index: ${index})`);
    console.log(`      KR: ${hasKorean ? '✅' : '❌'} ${scene.narration_korean?.substring(0, 40)}...`);
    console.log(`      EN: ${hasEnglish ? '✅' : '❌'} ${scene.narration_english?.substring(0, 40)}...`);

    if (!hasKorean || !hasEnglish) {
        console.error(`      ⚠️ Missing subtitle for ${file}!`);
    }
});

console.log(`\n✅ Total scenes: ${videoOrder.length}`);
console.log(`⏱️ Total duration: ${videoOrderData.total_duration_seconds}s`);

// --- BUILD VIDEOS ARRAY ---
const videos = videoOrder.map((scene, i) => {
    const videoPath = `pipedream_puppy/test_code/low-birth/generated_videos/${scene.file}`;

    return {
        url: `${NGROK_URL}/${videoPath}`,
        index: i,
        duration: scene.duration_seconds || 4,
        narration: scene.narration_korean || "",
        narration_korean: scene.narration_korean || "",
        narration_english: scene.narration_english || "",
        dialogue: {
            script: scene.narration_korean || "",
            script_english: scene.narration_english || "",
            interviewer: ""
        },
        spoken_language: "korean",
        scene_type: "interview_answer",
        is_interview_question: false,
        speaker: scene.speaker || "main",
        character_name: scene.character_name || "땅콩"
    };
});

console.log(`\n📹 Video URLs:`);
videos.forEach((v, i) => {
    console.log(`  [${i}] ${v.url.split('/').pop()}: ${v.duration}s`);
});

// --- BUILD PAYLOAD ---
const payload = {
    videos: videos,
    bgm_url: BGM_URL,
    bgm_volume: 0.2,
    header_text: HEADER_TEXT,
    header_text_english: HEADER_TEXT_EN,
    footer_text: FOOTER_TEXT,
    subtitle_enabled: true,
    subtitle_english_enabled: true,
    width: 1080,
    height: 1920,
    output_bucket: GCS_BUCKET,
    output_path: `${FOLDER_NAME}/low_birth_final.mp4`,
    folder_name: FOLDER_NAME
};

// --- CALL VM ---
async function callVM() {
    console.log("\n🔗 Calling FFmpeg VM...");
    console.log(`Endpoint: ${FFMPEG_VM_URL}/render/puppy`);
    console.log(`Videos: ${videos.length}`);
    console.log(`BGM: ${BGM_URL}`);

    if (NGROK_URL.includes("YOUR_NGROK_URL")) {
        console.error("\n❌ ERROR: You need to set the NGROK_URL environment variable!");
        console.error("   Run: NGROK_URL=https://your-url.ngrok-free.app node render_low_birth_vm.mjs");
        console.error("   Or start ngrok: ngrok http 8080");

        console.log("\n📋 Payload Preview (for manual verification):");
        console.log(JSON.stringify(payload, null, 2));
        return;
    }

    try {
        const res = await fetch(`${FFMPEG_VM_URL}/render/puppy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`VM Error (${res.status}): ${txt}`);
        }

        const json = await res.json();
        console.log("\n✅ VM Response:", JSON.stringify(json, null, 2));
        console.log(`\n🎉 Final Video URL: ${json.url}`);
    } catch (err) {
        console.error("❌ Failed to call VM:", err.message);
    }
}

callVM();
