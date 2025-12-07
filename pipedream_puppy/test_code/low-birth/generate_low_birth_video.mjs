/**
 * Low Birth Rate Video Generator
 * Generates Veo 3 videos one scene at a time (RPM 2 limit)
 * WITH audio generation and action keyword detection
 * Usage: node generate_low_birth_video.mjs [scene_index]
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

// ★★★ Action Keyword Map (Korean narration → English action) ★★★
const actionKeywordMap = {
    "핫팩 댄스": "doing cute hot pack dance, bouncing rhythmically with hot pack",
    "핫팩댄스": "doing cute hot pack dance, bouncing rhythmically with hot pack",
    "댄스": "dancing energetically with body moving rhythmically",
    "춤추": "dancing happily with cute moves",
    "춤을": "dancing with adorable swaying motions",
    "춤": "dancing with cute body movements",
    "흔들흔들": "swaying body side to side playfully",
    "흔들": "swaying body gently",
    "폴짝폴짝": "hopping repeatedly with joy, bouncing up and down energetically",
    "폴짝": "hopping cutely, bouncing with excitement",
    "뛰어다": "running and jumping around playfully",
    "뛰어": "jumping excitedly with energy",
    "점프": "jumping up high with enthusiasm",
    "깡충깡충": "hopping like a bunny, bouncing cutely",
    "깡충": "bouncing hop, cute jumping motion",
    "펄쩍": "leaping up suddenly, big jump",
    "빙글빙글": "spinning around playfully, twirling in circles",
    "빙글": "spinning in a circle, cute twirl",
    "돌아가": "turning around in circles",
    "돌아": "turning motion, spinning",
    "회전": "spinning in place, rotating playfully",
    "꼬리 흔": "wagging tail happily and energetically",
    "꼬리를 흔": "wagging tail with excitement",
    "꼬리가 흔": "tail wagging automatically with joy",
    "살랑살랑": "swaying tail or body gently, soft wagging",
    "달려": "running forward quickly with excitement",
    "뛰어가": "running towards something eagerly",
    "달리": "running with speed",
    "뒹굴뒹굴": "rolling around playfully on the ground",
    "뒹굴": "rolling over cutely",
    "앉아": "sitting down cutely",
    "누워": "lying down comfortably",
    "일어나": "standing up, getting up energetically",
    "벌떡": "jumping up suddenly, getting up quickly",
    "박수": "clapping front paws together cutely",
    "손 흔들": "waving paw in greeting",
    "동동": "stomping or tapping feet cutely",
    "고개를 갸웃": "tilting head cutely to the side",
    "갸웃": "cute head tilt, curious pose",
    "하품": "yawning adorably",
    "기지개": "stretching body, doing a stretch",
    "부르르": "shaking body, shivering motion",
    // Celebration actions
    "신나": "jumping up with front paws raised high, ecstatic celebration",
    "올레": "raising front paws high in victory, celebrating enthusiastically",
    "만세": "standing on hind legs with both paws up, hooray pose",
    "아싸": "pumping fist (or paw) in the air, celebrating success",
    "야호": "jumping with paws up in the air, shouting with joy",
    // ★ 추가된 부분: 다양한 웃음 모션
    "웃음": "laughing out loud with mouth open, whole body shaking with laughter",
    "하하하": "laughing out loud with mouth open, whole body shaking with laughter",
    "하하": "laughing happily, open mouth smile",
    "호호호": "giggling cutely with paw covering mouth, refined laughter",
    "호호": "cute giggle, shy laughter",
    "깔깔깔": "rolling on floor laughing, uncontrollable laughter",
    "깔깔": "laughing energetically, joyful expression",
    "푸하하": "bursting into sudden laughter, mouth wide open",
    "미소": "smiling gently with eyes squinting",
    "방긋": "beaming with a big cheerful smile",
    "싱글벙글": "smiling continuously with joy, happy face",
    "ㅋㅋ": "short chuckle, giggling",
};

// Detect actions from narration
function detectActions(narration) {
    if (!narration) return [];
    const detected = [];
    for (const [keyword, action] of Object.entries(actionKeywordMap)) {
        if (narration.includes(keyword)) {
            detected.push({ keyword, action });
        }
    }
    return detected;
}

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Load script data
const scriptData = JSON.parse(fs.readFileSync(SCRIPT_PATH, 'utf8'));
const scenes = scriptData.$return_value?.scenes || [];

console.log(`📜 Loaded ${scenes.length} scenes from vedio_script.json`);

// Get scene index from command line
const sceneIndex = parseInt(process.argv[2] || '0');
if (sceneIndex < 0 || sceneIndex >= scenes.length) {
    console.error(`❌ Invalid scene index: ${sceneIndex}. Valid range: 0-${scenes.length - 1}`);
    process.exit(1);
}

const scene = scenes[sceneIndex];
const imageFile = `scene_00${sceneIndex}.png`;
const imagePath = path.join(IMAGE_DIR, imageFile);

if (!fs.existsSync(imagePath)) {
    console.error(`❌ Image not found: ${imagePath}`);
    process.exit(1);
}

console.log(`\n🎬 Generating video for Scene ${sceneIndex + 1}/${scenes.length}`);
console.log(`📷 Image: ${imageFile}`);
console.log(`⏱️ Duration: ${scene.duration_seconds}s`);

// Get narration
const narration = scene.dialogue?.script || scene.narration || "";
const narrationEnglish = scene.dialogue?.script_english || scene.narration_english || "";
console.log(`💬 Narration (KR): ${narration.substring(0, 60)}...`);
console.log(`💬 Narration (EN): ${narrationEnglish.substring(0, 60)}...`);

// Detect actions from narration
const detectedActions = detectActions(narration);
if (detectedActions.length > 0) {
    console.log(`🎭 Detected Actions:`);
    detectedActions.forEach(a => console.log(`   - "${a.keyword}" → ${a.action}`));
}

// Read image as base64
const imageBuffer = fs.readFileSync(imagePath);
const imageBase64 = imageBuffer.toString('base64');

// ★★★ DETECT SPEAKER TYPE (MUST BE FIRST) ★★★
const speakerType = scene.scene_details?.speaker || "main"; // "main" = 땅콩(dog), "sub1" = 할비(human)
const characterType = scene.scene_details?.character_type || "animal";
const characterName = scene.scene_details?.character_name || "땅콩";
const isHumanSpeaker = characterType === "human" || speakerType === "sub1";

console.log(`🎤 Speaker: ${characterName} (${speakerType}, ${characterType})`);

// Build enhanced prompt with action cues
let prompt = scene.prompt || "";

// ★★★ NO TEXT/SUBTITLES/WATERMARKS - CRITICAL ★★★
prompt += ` ABSOLUTELY NO TEXT in the video. No subtitles. No captions. No watermarks. No Korean text. No English text. No letters. No words. No signs. No banners. Clean video only.`;

// Add action cues if detected (but for professional scenes, keep dog seated)
const isSerious = scene.emotion?.primary === "confident" || narration.includes("전문가") || narration.includes("정부");
if (detectedActions.length > 0 && !isSerious) {
    const actionDescriptions = detectedActions.map(a => a.action).join(", ");
    prompt += ` IMPORTANT ACTION: Dog is ${actionDescriptions} while speaking.`;
} else if (!isHumanSpeaker) {
    // Professional/serious dog scene: stay seated and calm
    prompt += ` The dog stays calmly seated in place, maintaining a professional composed posture. No standing up. No excessive movement. Dog speaks with authority while staying still.`;
}

// ★★★ SPEECH SPEED - SLOW DOWN ★★★
prompt += ` IMPORTANT: Speech must be SLOW and clear. Take time between words. Not rushed. Natural pauses between sentences.`;

// Add lip sync instruction with mouth_shapes
const lipSyncInfo = scene.lip_sync_style || {};
const mouthShapes = scene.mouth_shapes || {};

// ★★★ LIP SYNC BASED ON SPEAKER TYPE ★★★
if (Object.keys(mouthShapes).length > 0) {
    if (isHumanSpeaker) {
        // Human speaker (할비): Man's mouth moves, dog stays quiet
        prompt += ` CRITICAL LIP SYNC: The man's mouth moves precisely matching Korean speech. Open mouth wide for "아, 하, 가" sounds, round lips for "오, 우" sounds, stretch lips for "이, 에" sounds. The man is speaking the dialogue out loud. The dog (if visible) stays quiet with mouth closed, just listening with attentive expression.`;
    } else {
        // Dog speaker (땅콩): Dog's mouth moves
        prompt += ` CRITICAL LIP SYNC: The dog's mouth moves precisely matching Korean speech. Open mouth wide for "아, 하, 가" sounds, round lips for "오, 우" sounds, stretch lips for "이, 에" sounds. Visible lip movements synced perfectly to audio. The dog is speaking the dialogue out loud.`;
    }
    console.log(`👄 Lip Sync: Enabled for ${isHumanSpeaker ? 'Human (할비)' : 'Dog (땅콩)'} (${Object.keys(mouthShapes).length} syllables)`);
}

// ★★★ VOICE SETTINGS BASED ON SPEAKER TYPE ★★★
let voiceInstruction = "";
if (isHumanSpeaker) {
    // Human speaker (할비): 50s male warm voice
    const emotionInfo = scene.emotion?.primary || "warm";
    voiceInstruction = ` CRITICAL AUDIO: The man speaks with a warm, deep, authoritative 50s male Korean voice. Characteristics: mature, thoughtful, fatherly tone, calm and caring. Emotion: ${emotionInfo}.`;
    voiceInstruction += ` The man says in Korean: "${narration.substring(0, 80)}..."`;
    voiceInstruction += ` IMPORTANT: Use a 50-year-old mature male voice, NOT a child or female voice. Deep, warm, fatherly Korean male voice.`;
    console.log(`🔊 Voice: 50s Korean Male (warm, fatherly)`);
} else {
    // Dog speaker (땅콩): Baby voice
    const mainCharVoice = scene.voice_settings?.["땅콩"] || scriptData.$return_value?.voice_settings?.main || {};
    const voiceType = mainCharVoice.type || "Korean baby infant voice, 2-3 years old";
    const voiceTone = mainCharVoice.tone || "cute";
    const voiceCharacteristics = mainCharVoice.characteristics || "very slow speech, babbling pronunciation, slight lisp, baby talk";
    const emotionInfo = scene.emotion?.primary || mainCharVoice.emotion || "excited";

    voiceInstruction = ` CRITICAL AUDIO: The dog speaks with ${voiceType}. Voice characteristics: ${voiceCharacteristics}. Tone: ${voiceTone}. Emotion: ${emotionInfo}.`;
    voiceInstruction += ` The dog says in Korean baby voice: "${narration.substring(0, 80)}..."`;
    voiceInstruction += ` IMPORTANT: Use a 2-3 year old toddler/baby voice, NOT an adult voice. Very high-pitched, cute, slow baby talk with slight lisp.`;
    console.log(`🔊 Voice: Korean Baby Voice (2-3 years old, ${voiceTone})`);
}

prompt += voiceInstruction;
console.log(`\n📝 Prompt (truncated): ${prompt.substring(0, 300)}...`);

// Initialize Google GenAI
const ai = new GoogleGenAI({ apiKey: API_KEY });

// Main execution
async function main() {
    console.log(`\n🚀 Starting video generation with Veo 3 Fast (WITH AUDIO)...`);

    try {
        // Generate video with audio enabled
        let operation = await ai.models.generateVideos({
            model: 'veo-3.0-fast-generate-001',
            prompt: prompt,
            image: {
                imageBytes: imageBase64,
                mimeType: 'image/png',
            },
            config: {
                aspectRatio: '9:16',
                durationSeconds: scene.duration_seconds || 6,
                includeAudio: true,  // ★★★ AUDIO ENABLED ★★★
            },
        });

        console.log(`📝 Operation started, polling for completion...`);

        // Poll for completion
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

        // Download video
        if (operation.response?.generatedVideos?.length > 0) {
            const outputFile = path.join(OUTPUT_DIR, `scene_${sceneIndex}.mp4`);
            await ai.files.download({
                file: operation.response.generatedVideos[0].video,
                downloadPath: outputFile,
            });

            const stats = fs.statSync(outputFile);
            console.log(`💾 Saved to: ${outputFile} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
            console.log(`🔊 Audio: Included (Veo 3 native audio)`);
        } else {
            throw new Error('No video in response');
        }

        console.log(`\n🎉 Scene ${sceneIndex} completed!`);
        console.log(`\n📌 To generate the next scene, run:`);
        console.log(`   node generate_low_birth_video.mjs ${sceneIndex + 1}`);
        console.log(`\n⏰ Remember: RPM 2 limit - wait ~30 seconds before the next request`);
    } catch (err) {
        console.error(`\n❌ Error: ${err.message}`);
        if (err.response) {
            console.error(`Response: ${JSON.stringify(err.response, null, 2)}`);
        }
        process.exit(1);
    }
}

main();
