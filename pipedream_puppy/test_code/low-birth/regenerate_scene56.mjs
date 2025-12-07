/**
 * Scene 6 Regeneration with Enhanced Lip Sync
 * Uses scene_000.png image
 * IMPROVED: More explicit lip sync timing and mouth shape instructions
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
const OUTPUT_DIR = path.join(__dirname, 'generated_videos');

// Narration (30 syllables approximately, 6 seconds = ~5 syllables per second)
const narration = "하지만... 괜찮아, 구독자분들은 나처럼 귀여운 애기를 갖고 싶을꺼에요 흐흐흐흐흐흐~";
const durationSeconds = 6;

// Read image
const imagePath = path.join(IMAGE_DIR, 'scene_000.png');
const imageBuffer = fs.readFileSync(imagePath);
const imageBase64 = imageBuffer.toString('base64');

console.log(`📜 Scene 6 Regeneration - Enhanced Lip Sync`);
console.log(`📷 Image: scene_000.png`);
console.log(`⏱️ Duration: ${durationSeconds}s`);
console.log(`💬 Narration: ${narration}`);

// ★ IMPROVED: Build detailed lip sync prompt with timing
const lipSyncPrompt = `
DOG LIP SYNC CRITICAL INSTRUCTIONS:
The dog MUST move its mouth in sync with Korean speech for the ENTIRE 6 seconds.

MOUTH MOVEMENT SEQUENCE (slow speech, 5 syllables per second):
0:00-0:00.5 - Mouth closed, neutral face
0:00.5-0:01 - "하지만" - mouth opens wide (하), stretches sideways (지), opens wide (만)
0:01-0:01.5 - Brief pause, mouth slightly open
0:01.5-0:02 - "괜찮아" - lips round (괜), jaw drops (찮), wide open (아)
0:02-0:03 - "구독자분들은" - lips round (구), round O (독), wide (자), forward (분), stretch (들), close (은)
0:03-0:04 - "나처럼 귀여운" - wide (나), rounded (처럼), forward (귀), medium (여), forward (운)
0:04-0:04.5 - "애기를 갖고" - stretched (애), sideways (기), wide (갖), round O (고)
0:04.5-0:05 - "싶을꺼에요" - sideways (싶), stretch (을), rounded (꺼), stretched (에), round O (요)
0:05-0:06 - "흐흐흐~" LAUGHING - mouth wide open with joyful expression, body shaking with laughter

The mouth MUST be actively moving matching these syllables. Dog is SPEAKING not just posing.
Mouth opens and closes continuously matching the audio throughout the entire video.
`.trim();

// Build prompt
let prompt = `8K cinematic video of a Pomeranian dog SPEAKING TO CAMERA.

CHARACTER: Golden cream Pomeranian with brown ears, fluffy fur, dark brown eyes, black nose, pointy erect ears, round face, small size, wearing pink bow tie. Sitting facing camera.

SETTING: Comfortable living room, bright studio lighting.

${lipSyncPrompt}

VOICE: Korean baby infant voice, 2-3 years old, cute and adorable. Speaking: "${narration}"

EXPRESSION TRANSITION:
0:00-0:02 - Thoughtful, slightly pouty expression while speaking "하지만... 괜찮아"
0:02-0:04 - Confident, cheerful while speaking about subscribers
0:04-0:06 - BURSTING INTO LAUGHTER with "흐흐흐~", eyes squinting with joy, big smile, body shaking with happy giggles

CRITICAL RULES:
- Dog's mouth MUST move throughout the video synced to Korean speech
- Mouth opens and closes matching each syllable
- NO static face - mouth is continuously animated
- Real living animal, NOT a toy or mascot
- NO text, subtitles, watermarks
- Dog stays seated with natural head movements`;

console.log(`\n📝 Prompt length: ${prompt.length} chars`);

// Initialize AI
const ai = new GoogleGenAI({ apiKey: API_KEY });

async function main() {
    console.log(`\n🚀 Starting Scene 6 generation with enhanced lip sync...`);

    try {
        let operation = await ai.models.generateVideos({
            model: 'veo-3.0-fast-generate-001',
            prompt: prompt,
            image: { imageBytes: imageBase64, mimeType: 'image/png' },
            config: { aspectRatio: '9:16', durationSeconds, includeAudio: true },
        });

        console.log(`📝 Operation started, polling...`);
        let pollCount = 0;
        while (!operation.done) {
            await new Promise(r => setTimeout(r, 5000));
            pollCount++;
            if (pollCount % 4 === 0) console.log(`⏳ [${pollCount * 5}s] Processing...`);
            operation = await ai.operations.getVideosOperation({ operation });
            if (pollCount > 60) throw new Error('Timeout');
        }

        console.log(`\n✅ Complete!`);
        if (operation.response?.generatedVideos?.length > 0) {
            const outputFile = path.join(OUTPUT_DIR, 'scene_6.mp4');
            await ai.files.download({
                file: operation.response.generatedVideos[0].video,
                downloadPath: outputFile,
            });
            const stats = fs.statSync(outputFile);
            console.log(`💾 Saved: ${outputFile} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        }
        console.log(`\n🎉 Scene 6 completed with enhanced lip sync!`);
    } catch (err) {
        console.error(`\n❌ Error: ${err.message}`);
        process.exit(1);
    }
}

main();
