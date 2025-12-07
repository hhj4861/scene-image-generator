import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIG ---
const FFMPEG_VM_URL = "http://34.64.168.173:3000";
const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";
const FOLDER_NAME = "20251206_party_pajama_vm";

// Local file server (assuming serve_files.mjs is running)
// The user needs to expose this via ngrok or similar
// For now, we'll prompt the user to provide the ngrok URL
const NGROK_URL = process.env.NGROK_URL || "https://YOUR_NGROK_URL.ngrok-free.app";

// BGM URL
const BGM_URL = "https://cdn1.suno.ai/9a0604be-6f66-41b1-be78-3022ab188833.mp3";

// --- LOAD DATA ---
const SCRIPT_JSON = path.join(__dirname, 'script_sample', 'script.json');
const VIDEO_PROMPT_JSON = path.join(__dirname, 'script_sample', 'vedio_prompt.json');

console.log("🚀 Loading Party Pajama data...");

const scriptData = JSON.parse(fs.readFileSync(SCRIPT_JSON, 'utf8'));
const promptData = JSON.parse(fs.readFileSync(VIDEO_PROMPT_JSON, 'utf8'));

// Extract titles
const titleObj = scriptData.$return_value?.title || scriptData.title || {};
const HEADER_KR = titleObj.korean || "땅콩이의 특별한 파자마 파티";
const HEADER_EN = titleObj.english || "Peanut's Special Pajama Party";
const FOOTER = "땅콩속보🚨";

console.log(`Header KR: ${HEADER_KR}`);
console.log(`Header EN: ${HEADER_EN}`);

// Extract scenes from vedio_prompt.json
const scenesRaw = promptData.$return_value?.scenes || [];

// Build videos array for VM API
const videos = scenesRaw.map((scene, i) => {
    const fileIndex = i + 1; // scene_1.mp4, scene_2.mp4, etc.
    return {
        url: `${NGROK_URL}/pipedream_puppy/test_code/party-pajama/script_sample/generated_videos/scene_${fileIndex}.mp4`,
        index: i,
        duration: scene.duration_seconds || 6,
        narration: scene.narration || "",
        narration_korean: scene.narration_korean || scene.narration || "",
        narration_english: scene.narration_english || "",
        dialogue: {
            script: scene.dialogue?.script || scene.narration || "",
            script_english: scene.dialogue?.script_english || scene.narration_english || "",
            interviewer: ""
        },
        spoken_language: scene.spoken_language || "korean",
        scene_type: scene.scene_details?.scene_type || "interview_answer",
        is_interview_question: scene.scene_details?.is_interview_question || false,
        speaker: scene.scene_details?.speaker || "main",
        character_name: scene.scene_details?.character_name || "땅콩"
    };
});

console.log(`Found ${videos.length} scenes.`);

// --- BUILD PAYLOAD ---
const payload = {
    videos: videos,
    bgm_url: BGM_URL,
    bgm_volume: 0.2,
    header_text: HEADER_KR,
    header_text_english: HEADER_EN,
    footer_text: FOOTER,
    subtitle_enabled: true,
    subtitle_english_enabled: true,
    width: 1080,
    height: 1920,
    output_bucket: GCS_BUCKET,
    output_path: `${FOLDER_NAME}/final_pajama_party.mp4`,
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
        console.error("   Run: NGROK_URL=https://your-url.ngrok-free.app node render_pajama_vm.mjs");
        console.error("   Or start ngrok: ngrok http 8080");
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
