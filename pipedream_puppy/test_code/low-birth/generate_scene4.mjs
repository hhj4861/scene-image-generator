/**
 * Scene 4 Special Generator
 * 할비 speaking, dog reacting (proud to surprised)
 * 6 seconds duration
 */

import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// API Config
const API_KEY = process.env.GOOGLE_API_KEY || "YOUR_GOOGLE_API_KEY";

// Paths
const IMAGE_DIR = path.join(__dirname, 'image');
const SCRIPT_PATH = path.join(__dirname, 'script', 'vedio_script.json');
const OUTPUT_DIR = path.join(__dirname, 'generated_videos');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Load script data
const scriptData = JSON.parse(fs.readFileSync(SCRIPT_PATH, 'utf8'));
const scenes = scriptData.$return_value?.scenes || [];
const scene = scenes[4]; // Scene 4 (index 4)

const narration = scene.dialogue?.script || scene.narration || "";
const durationSeconds = 6;

console.log(`📜 Scene 4 Special Mode (할비 + 강아지 반응)`);
console.log(`⏱️ Duration: ${durationSeconds}s`);
console.log(`💬 Narration: ${narration}`);

// Read image as base64
const imagePath = path.join(IMAGE_DIR, 'scene_004.png');
const imageBuffer = fs.readFileSync(imagePath);
const imageBase64 = imageBuffer.toString('base64');

// Build specialized prompt for Scene 4
let prompt = scene.prompt || "";

// NO TEXT
prompt += ` ABSOLUTELY NO TEXT in the video. No subtitles. No captions. No watermarks. Clean video only.`;

// ★★★ HALBI SPEAKING - 50s MALE VOICE ★★★
prompt += ` CRITICAL AUDIO: The man speaks with a warm, deep, authoritative 50s male Korean voice. Fatherly tone, slightly humorous. The man says in Korean: "${narration}"`;
prompt += ` IMPORTANT: Use a 50-year-old mature male voice, NOT a child voice. Deep, warm, fatherly Korean male voice with playful humor.`;

// ★★★ LIP SYNC - MAN ONLY, DOG MOUTH STAYS CLOSED ★★★
prompt += ` CRITICAL LIP SYNC RULE: ONLY the 50s man's mouth moves matching Korean speech for ALL 6 seconds. The man speaks the ENTIRE time from 0:00 to 0:06.`;
prompt += ` DOG MOUTH RULE: The dog's mouth MUST stay COMPLETELY CLOSED for the ENTIRE 6 seconds. Dog NEVER opens mouth. Dog NEVER speaks. Dog's lips do NOT move at all. The dog is ONLY LISTENING.`;

// ★★★ DOG REACTION - PROUD THEN SURPRISED (NO SPEAKING) ★★★
prompt += ` DOG BEHAVIOR (NO LIP MOVEMENT):`;
prompt += ` 0:00-0:04: Dog sits with a PROUD, SATISFIED expression. Dog nods head slightly agreeing. Dog looks pleased. DOG MOUTH CLOSED.`;
prompt += ` 0:04-0:06: Dog's expression changes to SHOCKED/SURPRISED. Wide eyes. Ears perked. Embarrassed realization. DOG MOUTH STILL CLOSED - just making a surprised FACE, not speaking.`;
prompt += ` IMPORTANT: The dog does NOT speak at any point. Only the man speaks. The dog's mouth stays shut for all 6 seconds.`;

// Slow speech
prompt += ` Speech must be SLOW and clear with natural pauses.`;

console.log(`\n🔊 Voice: 50s Korean Male (humorous)`);
console.log(`🐕 Dog: Proud (0-4s) → Surprised (4-6s)`);
console.log(`\n📝 Prompt length: ${prompt.length} chars`);

// Initialize Google GenAI
const ai = new GoogleGenAI({ apiKey: API_KEY });

// Main execution
async function main() {
    console.log(`\n🚀 Starting video generation for Scene 4 (6s)...`);

    try {
        let operation = await ai.models.generateVideos({
            model: 'veo-3.0-fast-generate-001',
            prompt: prompt,
            image: {
                imageBytes: imageBase64,
                mimeType: 'image/png',
            },
            config: {
                aspectRatio: '9:16',
                durationSeconds: durationSeconds,
                includeAudio: true,
            },
        });

        console.log(`📝 Operation started, polling for completion...`);

        let pollCount = 0;
        while (!operation.done) {
            await new Promise(r => setTimeout(r, 5000));
            pollCount++;
            if (pollCount % 4 === 0) console.log(`⏳ [${pollCount * 5}s] Still processing...`);
            operation = await ai.operations.getVideosOperation({ operation });

            if (pollCount > 60) {
                throw new Error('Operation timed out (5 minutes)');
            }
        }

        console.log(`\n✅ Generation complete!`);

        if (operation.response?.generatedVideos?.length > 0) {
            const outputFile = path.join(OUTPUT_DIR, 'scene_4.mp4');
            await ai.files.download({
                file: operation.response.generatedVideos[0].video,
                downloadPath: outputFile,
            });

            const stats = fs.statSync(outputFile);
            console.log(`💾 Saved to: ${outputFile} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        } else {
            throw new Error('No video in response');
        }

        console.log(`\n🎉 Scene 4 completed!`);
        console.log(`\n📌 To generate Scene 5, run:`);
        console.log(`   node generate_low_birth_video.mjs 5`);
    } catch (err) {
        console.error(`\n❌ Error: ${err.message}`);
        process.exit(1);
    }
}

main();
