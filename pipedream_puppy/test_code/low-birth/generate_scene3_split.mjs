/**
 * Scene 3 Triple Split Generator
 * Generates Scene 3 as 3 parts (3a, 3b, 3c) with the same image, each 4 seconds
 * Usage: node generate_scene3_split.mjs [part: a, b, or c]
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
const scene = scenes[3]; // Scene 3 (index 3)

// Get part from command line
const part = process.argv[2] || 'a';
if (!['a', 'b', 'c'].includes(part)) {
    console.error(`❌ Invalid part: ${part}. Use 'a', 'b', or 'c'`);
    process.exit(1);
}

// Split the narration into 3 parts
const fullNarration = scene.dialogue?.script || scene.narration || "";

// Find split points at punctuation near 1/3 and 2/3 marks
const third1 = Math.floor(fullNarration.length / 3);
const third2 = Math.floor(fullNarration.length * 2 / 3);

let split1 = fullNarration.indexOf('!', third1 - 15);
if (split1 === -1 || split1 > third1 + 15) {
    split1 = fullNarration.indexOf(' ', third1);
}
if (split1 === -1) split1 = third1;

let split2 = fullNarration.indexOf('!', third2 - 15);
if (split2 === -1 || split2 > third2 + 15) {
    split2 = fullNarration.indexOf(' ', third2);
}
if (split2 === -1) split2 = third2;

const narrationA = fullNarration.substring(0, split1 + 1).trim();
const narrationB = fullNarration.substring(split1 + 1, split2 + 1).trim();
const narrationC = fullNarration.substring(split2 + 1).trim();

const narrations = { a: narrationA, b: narrationB, c: narrationC };
const narration = narrations[part];
const durationSeconds = 4; // All parts: 4초

console.log(`📜 Scene 3 Triple Split Mode`);
console.log(`\n🎬 Generating Scene 3${part.toUpperCase()}`);
console.log(`📷 Image: scene_003.png (same for all parts)`);
console.log(`⏱️ Duration: ${durationSeconds}s per part (total: 12s)`);
console.log(`\n💬 Full Narration: ${fullNarration.substring(0, 60)}...`);
console.log(`\n📍 Part A: "${narrationA.substring(0, 40)}..."`);
console.log(`📍 Part B: "${narrationB.substring(0, 40)}..."`);
console.log(`📍 Part C: "${narrationC.substring(0, 40)}..."`);
console.log(`\n🎯 Current Part ${part.toUpperCase()}: "${narration.substring(0, 50)}..."`);

// Read image as base64
const imagePath = path.join(IMAGE_DIR, 'scene_003.png');
const imageBuffer = fs.readFileSync(imagePath);
const imageBase64 = imageBuffer.toString('base64');

// Build prompt
let prompt = scene.prompt || "";

// NO TEXT
prompt += ` ABSOLUTELY NO TEXT in the video. No subtitles. No captions. No watermarks. Clean video only.`;

// Seated posture
prompt += ` The dog stays calmly seated in place, maintaining a professional composed posture. No standing up. Dog speaks with authority while staying still.`;

// Slow speech
prompt += ` IMPORTANT: Speech must be SLOW and clear. Take time between words.`;

// Lip sync - 4 seconds only so should be reliable
prompt += ` CRITICAL LIP SYNC: The dog's mouth moves precisely matching Korean speech for ENTIRE ${durationSeconds} seconds. Visible lip movements synced to audio CONTINUOUSLY.`;

// Voice
const mainCharVoice = scene.voice_settings?.["땅콩"] || scriptData.$return_value?.voice_settings?.main || {};
const voiceType = mainCharVoice.type || "Korean baby infant voice, 2-3 years old";
const emotionInfo = scene.emotion?.primary || "confident";
prompt += ` CRITICAL AUDIO: The dog speaks with ${voiceType}. Emotion: ${emotionInfo}.`;
prompt += ` The dog says in Korean baby voice: "${narration}"`;
prompt += ` IMPORTANT: Use a 2-3 year old toddler/baby voice, slow baby talk.`;

console.log(`\n🔊 Voice: Korean Baby Voice (${emotionInfo})`);
console.log(`\n📝 Prompt length: ${prompt.length} chars`);

// Initialize Google GenAI
const ai = new GoogleGenAI({ apiKey: API_KEY });

// Main execution
async function main() {
    console.log(`\n🚀 Starting video generation for Scene 3${part.toUpperCase()}...`);

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
            const outputFile = path.join(OUTPUT_DIR, `scene_3${part}.mp4`);
            await ai.files.download({
                file: operation.response.generatedVideos[0].video,
                downloadPath: outputFile,
            });

            const stats = fs.statSync(outputFile);
            console.log(`💾 Saved to: ${outputFile} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        } else {
            throw new Error('No video in response');
        }

        console.log(`\n🎉 Scene 3${part.toUpperCase()} completed!`);

        const nextPart = part === 'a' ? 'b' : part === 'b' ? 'c' : null;
        if (nextPart) {
            console.log(`\n📌 To generate Part ${nextPart.toUpperCase()}, run:`);
            console.log(`   node generate_scene3_split.mjs ${nextPart}`);
        } else {
            console.log(`\n✅ All 3 parts completed! Combine with FFmpeg if needed.`);
        }
    } catch (err) {
        console.error(`\n❌ Error: ${err.message}`);
        process.exit(1);
    }
}

main();
