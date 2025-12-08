/**
 * Center Framing Test
 * Crop 가이드라인을 적용한 영상 생성 + FFmpeg 조합 테스트
 */

import { Storage } from '@google-cloud/storage';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIG ---
const GEMINI_API_KEY = "";
const FFMPEG_VM_URL = "http://34.64.168.173:3000";
const GCS_BUCKET = "shorts-videos-storage-mcp-test-457809";
const FOLDER_NAME = `test_center_framing_${Date.now()}`;

// Veo 3 API
const VEO_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_ID = "veo-3.0-fast-generate-001";

// Test content
const HEADER_TEXT = "[댕댕] 땅콩이의 충격적인 저출산 대책";
const HEADER_TEXT_EN = "Puppy's SHOCKING Solution to Low Birth Rate";
const FOOTER_TEXT = "구독하면 귀여운 애기 생김";
const FOOTER_TEXT_EN = "Subscribe for cute babies";

const SCENE_DATA = {
    narration_korean: "여러분! 제가 드디어 저출산 문제 해결책을 찾았어요!",
    narration_english: "Everyone! I finally found a solution to the low birth rate problem!"
};

console.log("🚀 Center Framing Test (Crop 45% 고려 영상 생성)");
console.log(`📂 Folder: ${FOLDER_NAME}\n`);

// --- Helper: Image to Base64 ---
async function imageToBase64(imagePath) {
    const imageBuffer = fs.readFileSync(imagePath);
    return imageBuffer.toString('base64');
}

// --- Helper: Get MIME type ---
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    return 'image/png';
}

// --- Step 1: Generate Video with Veo 3 (Image-to-Video) ---
async function generateVeoVideo(imagePath) {
    console.log("🎬 Step 1: Generating video with Veo 3 (Image-to-Video)...\n");

    // ★★★ 이미지가 이미 center framing으로 생성되었으므로 그대로 사용 ★★★
    const imageBase64 = await imageToBase64(imagePath);
    const mimeType = getMimeType(imagePath);

    const prompt = `8K cinematic video. Cute adorable Pomeranian puppy with golden-brown fur, wearing round glasses and gray knit sweater. Puppy is sitting at a desk with books, looking directly at camera. Puppy speaks with gentle mouth movements, excited happy expression. Warm soft natural lighting. Professional studio background. Real living dog, NOT a mascot, NOT a costume. NO TEXT anywhere in frame. No subtitles.`;

    console.log(`  Source Image: ${path.basename(imagePath)}`);
    console.log(`  Aspect Ratio: 9:16 (Portrait)`);
    console.log(`  Duration: 4 seconds`);
    console.log(`  Mode: Image-to-Video`);
    console.log(`  Prompt: ${prompt.substring(0, 80)}...\n`);

    const createUrl = `${VEO_BASE_URL}/models/${MODEL_ID}:predictLongRunning`;

    try {
        const createResponse = await fetch(createUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': GEMINI_API_KEY,
            },
            body: JSON.stringify({
                instances: [{
                    prompt: prompt,
                    image: { bytesBase64Encoded: imageBase64, mimeType },  // ★★★ Cropped image as reference ★★★
                }],
                parameters: {
                    aspectRatio: "9:16",
                    durationSeconds: 4
                },
            }),
        });

        if (!createResponse.ok) {
            const errorText = await createResponse.text();
            throw new Error(`Veo 3 API Error: ${createResponse.status} - ${errorText}`);
        }

        const createResult = await createResponse.json();
        const operationName = createResult.name;

        if (!operationName) {
            throw new Error("No operation name returned from Veo 3");
        }

        console.log(`  ✅ Operation started: ${operationName}\n`);

        // Poll for completion
        console.log("  ⏳ Waiting for video generation...");
        const pollUrl = `${VEO_BASE_URL}/${operationName}`;

        let attempts = 0;
        const maxAttempts = 60;

        while (attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 5000));
            attempts++;

            const pollResponse = await fetch(pollUrl, {
                headers: { 'x-goog-api-key': GEMINI_API_KEY },
            });

            if (!pollResponse.ok) {
                console.log(`  Poll error: ${pollResponse.status}`);
                continue;
            }

            const pollResult = await pollResponse.json();

            if (pollResult.done) {
                console.log(`\n  ✅ Video generation complete! (${attempts * 5}s)\n`);

                if (pollResult.error) {
                    throw new Error(`Veo 3 Error: ${JSON.stringify(pollResult.error)}`);
                }

                const response = pollResult.response;
                console.log("  Response:", JSON.stringify(response, null, 2).substring(0, 1000));

                const genVideoResp = response?.generateVideoResponse;

                if (genVideoResp?.generatedSamples?.[0]?.video?.uri) {
                    return genVideoResp.generatedSamples[0].video.uri;
                }

                // Check for RAI filtering
                if (response?.raiMediaFilteredCount > 0) {
                    throw new Error(`Video filtered by safety (RAI). Count: ${response.raiMediaFilteredCount}`);
                }

                throw new Error("No video URI in response");
            }

            process.stdout.write(`  Attempt ${attempts}/${maxAttempts}...\r`);
        }

        throw new Error("Video generation timed out");

    } catch (error) {
        throw new Error(`Veo 3 generation failed: ${error.message}`);
    }
}

// --- Step 2: Download video from Veo 3 ---
async function downloadVeoVideo(veoUrl, localPath) {
    console.log("📥 Step 2: Downloading video from Veo 3...\n");

    const response = await fetch(veoUrl, {
        headers: { 'x-goog-api-key': GEMINI_API_KEY },
    });

    if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
    }

    const buffer = await response.buffer();
    fs.writeFileSync(localPath, buffer);

    // Check dimensions
    const { execSync } = await import('child_process');
    const dimensions = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${localPath}"`).toString().trim();
    console.log(`  ✅ Downloaded: ${localPath}`);
    console.log(`  📐 Dimensions: ${dimensions}\n`);

    return localPath;
}

// --- Step 3: Upload to GCS ---
async function uploadToGCS(localPath, gcsPath) {
    console.log("📤 Step 3: Uploading to GCS...\n");

    const storage = new Storage({
        keyFilename: '/Users/admin/Desktop/workSpace/socar/scene-image-generator/google-credentials.json'
    });
    const bucket = storage.bucket(GCS_BUCKET);

    await bucket.upload(localPath, { destination: gcsPath });

    const url = `https://storage.googleapis.com/${GCS_BUCKET}/${gcsPath}`;
    console.log(`  ✅ Uploaded: ${url}\n`);

    return url;
}

// --- Step 4: Call FFmpeg VM ---
async function callFFmpegVM(videoUrl) {
    console.log("🔧 Step 4: Calling FFmpeg VM...\n");

    const payload = {
        videos: [{
            url: videoUrl,
            index: 0,
            duration: 4,
            narration: SCENE_DATA.narration_korean,
            narration_korean: SCENE_DATA.narration_korean,
            narration_english: SCENE_DATA.narration_english,
            dialogue: {
                script: SCENE_DATA.narration_korean,
                script_english: SCENE_DATA.narration_english,
            },
            speaker: "main",
            character_name: "땅콩"
        }],
        bgm_url: null,
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
        output_path: `${FOLDER_NAME}/final_center_framing.mp4`,
        folder_name: FOLDER_NAME
    };

    const response = await fetch(`${FFMPEG_VM_URL}/render/puppy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        timeout: 300000
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`FFmpeg VM Error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log(`  ✅ FFmpeg render complete!\n`);

    return result;
}

// --- MAIN ---
async function main() {
    try {
        // Find source image
        const imageDir = path.join(__dirname, 'image');
        let imagePath = null;

        if (fs.existsSync(imageDir)) {
            const files = fs.readdirSync(imageDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
            if (files.length > 0) {
                imagePath = path.join(imageDir, files[0]);
            }
        }

        if (!imagePath) {
            // Download from GCS
            console.log("📋 Downloading source image from GCS...");
            const storage = new Storage({
                keyFilename: '/Users/admin/Desktop/workSpace/socar/scene-image-generator/google-credentials.json'
            });
            const [files] = await storage.bucket("scene-image-generator-storage-mcp-test-457809").getFiles({
                prefix: "low_birth",
                maxResults: 10
            });

            const imageFile = files.find(f => f.name.endsWith('.png') || f.name.endsWith('.jpg'));
            if (imageFile) {
                imagePath = `/tmp/test_source_image.png`;
                await imageFile.download({ destination: imagePath });
                console.log(`  Downloaded: ${imageFile.name} → ${imagePath}`);
            } else {
                throw new Error("No source image available");
            }
        }

        console.log(`\n📷 Source Image: ${imagePath}\n`);

        const startTime = Date.now();

        // Step 1: Generate video with Veo 3 (9:16 + Center Framing)
        const veoVideoUrl = await generateVeoVideo(imagePath);

        // Step 2: Download the video
        const localVideoPath = `/tmp/${FOLDER_NAME}_video.mp4`;
        await downloadVeoVideo(veoVideoUrl, localVideoPath);

        // Step 3: Upload to GCS
        const gcsVideoUrl = await uploadToGCS(localVideoPath, `${FOLDER_NAME}/source_center_framing.mp4`);

        // Step 4: Call FFmpeg VM
        const ffmpegResult = await callFFmpegVM(gcsVideoUrl);

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log("===========================================");
        console.log("✅ SUCCESS!");
        console.log("===========================================");
        console.log(`⏱️  Total Time: ${totalTime}s`);
        console.log(`📹 Final Output: ${ffmpegResult.url}`);
        console.log(`📊 Source Video: ${gcsVideoUrl}`);
        console.log(`🎯 Center Framing: Applied (Crop 45% safe zone)`);

        // Cleanup
        if (fs.existsSync(localVideoPath)) {
            fs.unlinkSync(localVideoPath);
        }

    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    }
}

main();
