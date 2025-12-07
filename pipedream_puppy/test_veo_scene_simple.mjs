
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- CONFIGURATION ---
const API_KEY = process.env.GOOGLE_API_KEY || "YOUR_GOOGLE_API_KEY";
const IMAGE_PATH = "./pipedream_puppy/image_sample/scene_001.png"; // Changed to scene_001
const OUTPUT_DIR = "./pipedream_puppy/output";
const VEO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_ID = "veo-3.0-fast-generate-001";

// --- PROMPT for Scene 1 ---
// Derived from User JSON:
// Narration: "존경하는 댕국민 여러분! 핫초코 게이트의 진실을 밝히겠습니다!"
// Image Prompt: EXTREME CLOSE-UP of Pomeranian dog's face, wearing a pink bow tie, WIDE EYES with determination...
// Video Prompt: lip_sync: yes, facial_expression: serious and determined.
const PROMPT = `[CRITICAL: ABSOLUTELY NO TEXT, NO SUBTITLES, NO CAPTIONS, NO WRITTEN CHARACTERS OF ANY KIND VISIBLE IN VIDEO]
8K cinematic video. Generate ONLY clean video with ZERO text on screen. Use the provided reference image (Pomeranian with pink bow tie) as the exact visual base.

Scene Description:
EXTREME CLOSE-UP of the Pomeranian dog's face. The dog has a determined, serious expression with wide, sparkling eyes. Ears perked up high.
Bright studio lighting. Vibrant colorful background. High Contrast.
The dog is "speaking" to the camera in a press conference style.

Action & Lip Sync:
The dog looks directly at the camera.
LIP SYNC: The dog's mouth moves naturally to match the following Korean speech (Audio should be generated if possible, or video should match implied speech):
"존경하는 댕국민 여러분! 핫초코 게이트의 진실을 밝히겠습니다!" (Jon-gyeong-ha-neun daeng-guk-min yeo-reo-bun! Hot-cho-co gate-ui jin-sil-eul bal-hi-get-seum-ni-da!)
Mouth opens and closes clearly and rhythmically to mimic speaking this sentence.
Slight head nod for emphasis.
The dog's appearance (pink bow tie, fur color, face) must stay IDENTICAL to the reference image.

ABSOLUTE CRITICAL RULE: NO TEXT ON SCREEN. NO SUBTITLES. NO WATERMARKS. Video must be 100% clean.
VOICE (AUDIO ONLY): Cute toddler girl voice, serious tone.`;

async function generateVideo() {
    console.log("🚀 Starting Veo 3 Video Generation Test (Scene 1)...");

    // 1. Prepare Output Directory
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // 2. Load Image
    const imagePath = path.resolve(IMAGE_PATH);
    if (!fs.existsSync(imagePath)) {
        console.error(`❌ Image not found at: ${imagePath}`);
        return;
    }
    console.log(`📸 Using image: ${imagePath}`);
    const imageBuffer = fs.readFileSync(imagePath);
    const imageBase64 = imageBuffer.toString('base64');
    const mimeType = "image/png";

    // 3. Submit Request
    const endpoint = `${VEO_BASE_URL}/models/${MODEL_ID}:predictLongRunning`;

    console.log("📡 Submitting request to Google Veo 3 API...");
    try {
        const response = await axios.post(endpoint, {
            instances: [{
                prompt: PROMPT,
                image: { bytesBase64Encoded: imageBase64, mimeType }
            }],
            parameters: {
                aspectRatio: "9:16",
                durationSeconds: 4 // Duration from JSON for segment 1
            }
        }, {
            headers: {
                "Content-Type": "application/json",
                "X-goog-api-key": API_KEY
            }
        });

        const operationName = response.data.name;
        console.log(`✅ Request submitted! Operation Name: ${operationName}`);

        // 4. Poll for Completion
        await pollOperation(operationName);

    } catch (error) {
        console.error("❌ Error submitting request:");
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
        } else {
            console.error(error.message);
        }
    }
}

async function pollOperation(operationName) {
    console.log("⏳ Polling for result (this may take 1-2 minutes)...");
    const pollUrl = `${VEO_BASE_URL}/${operationName}`;
    let attempts = 0;
    const maxAttempts = 60;

    while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 5000));
        attempts++;
        process.stdout.write(".");

        try {
            const res = await axios.get(pollUrl, {
                headers: { "X-goog-api-key": API_KEY }
            });

            if (res.data.done) {
                console.log("\n✨ Operation Done!");

                if (res.data.error) {
                    console.error("❌ Generation Failed:", res.data.error);
                    return;
                }

                const response = res.data.response;
                // Locate Video URL
                let videoUrl = null;
                // Check all possible paths
                if (response.generatedSamples && response.generatedSamples[0].video) {
                    videoUrl = response.generatedSamples[0].video.uri;
                } else if (response.generateVideoResponse?.generatedSamples?.[0]?.video?.uri) {
                    videoUrl = response.generateVideoResponse.generatedSamples[0].video.uri;
                } else if (response.generatedVideos?.[0]?.video?.uri) {
                    videoUrl = response.generatedVideos[0].video.uri;
                }

                if (!videoUrl) {
                    // Last ditch attempt to check top level result
                    const topLevel = res.data.result; // sometimes it's wrapped in result
                    if (topLevel?.generatedSamples?.[0]?.video?.uri) {
                        videoUrl = topLevel.generatedSamples[0].video.uri;
                    }
                }

                if (!videoUrl) {
                    console.error("❌ No video URL found in response:", JSON.stringify(response, null, 2));
                    console.error("DEBUG Full Response:", JSON.stringify(res.data, null, 2));
                    return;
                }

                console.log(`🎥 Video Generated! URL: ${videoUrl}`);
                await downloadVideo(videoUrl);
                return;
            }
        } catch (error) {
            console.error("\n⚠️ Polling Error (retrying):", error.message);
        }
    }
    console.error("\nTIMEOUT: Operation took too long.");
}

async function downloadVideo(url) {
    console.log("⬇️ Downloading video...");
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: { "X-goog-api-key": API_KEY }
        });

        const outputPath = path.join(OUTPUT_DIR, "scene_001_press_conference.mp4");
        fs.writeFileSync(outputPath, response.data);
        console.log(`✅ Video saved to: ${outputPath}`);
    } catch (error) {
        console.error("❌ Download Failed:", error.message);
    }
}

// Run
generateVideo();
