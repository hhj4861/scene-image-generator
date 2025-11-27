// Test script for gemini-image-generator.mjs
// Usage: node test-gemini-image-generator.js
import { google } from "googleapis";
import { v4 as uuid } from "uuid";
import { Readable } from "stream";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyClH-yPbmKLXaDUKpBnhCDUIXREf24uOPI";
const GOOGLE_CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH || "./google-credentials.json";
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME || "scene-image-generator-storage-mcp-test-457809";

// Config
const CONFIG = {
  gemini_model: "gemini-2.0-flash-exp",
  imagen_model: "imagen-4.0-generate-001",
  aspect_ratio: "9:16",
  image_style: "anime",
};

// Test data
const TEST_SCRIPT = `朝の光が差し込む部屋で、若い女性が目を覚ます。
窓を開けて深呼吸をすると、新鮮な空気が肺を満たす。
今日も新しい一日が始まる。彼女は笑顔で一歩を踏み出す。`;

const TEST_SCENES = [
  { start: 0, end: 5, image_prompt: "Young woman waking up in morning light, cozy bedroom" },
  { start: 5, end: 10, image_prompt: "Woman opening window, breathing fresh air, sunrise view" },
  { start: 10, end: 15, image_prompt: "Woman smiling confidently, ready to start the day" },
];

// Style mapping
const styleMap = {
  anime: {
    name: "anime japanese animation",
    prefix: "anime style, japanese animation, high quality anime art, detailed anime illustration",
    suffix: "anime aesthetic, vibrant colors, clean lines, studio ghibli inspired",
  },
  photorealistic: {
    name: "photorealistic cinematic",
    prefix: "photorealistic, ultra realistic, 8k uhd, high detail photograph, cinematic lighting",
    suffix: "professional photography, realistic skin texture, natural lighting, DSLR quality",
  },
  cinematic: {
    name: "cinematic film still",
    prefix: "cinematic shot, movie still, film photography, dramatic lighting",
    suffix: "anamorphic lens, cinematic color grading, blockbuster movie quality, 35mm film",
  },
};

async function analyzeWithGemini(scriptText, scenes, selectedStyle) {
  console.log("\n📝 Step 1: Analyzing script with Gemini...");

  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.gemini_model}:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `You are an expert visual director creating a seamless video sequence.

## SCRIPT/NARRATION:
${scriptText}

## SCENE TIMING:
${scenes.map((s, i) => `Scene ${i + 1} (${s.start}s-${s.end}s): ${s.image_prompt}`).join('\n')}

## REQUIRED STYLE: "${selectedStyle.name}"

## CRITICAL REQUIREMENTS:
1. Define ONE main character with EXACT same appearance in ALL scenes
2. Consistent environment/background
3. Same color palette (3-4 colors)
4. Same lighting conditions

Output JSON only, no markdown:
{
  "main_character": "detailed character description",
  "environment": "environment description",
  "color_palette": "color scheme",
  "lighting": "lighting description",
  "title": "short_title",
  "enhanced_prompts": [
    { "scene_index": 0, "enhanced": "full prompt", "camera_angle": "angle", "motion_hint": "movement" }
  ]
}`
        }]
      }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`Gemini API Error: ${data.error.message}`);
  }

  let content = data.candidates[0].content.parts[0].text.trim();
  content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');

  const styleGuide = JSON.parse(content);
  console.log("✅ Style guide generated:");
  console.log(`   Title: ${styleGuide.title}`);
  console.log(`   Character: ${styleGuide.main_character?.substring(0, 60)}...`);
  console.log(`   Environment: ${styleGuide.environment?.substring(0, 60)}...`);

  return styleGuide;
}

async function generateImageWithImagen(prompt, index) {
  console.log(`\n🖼️  Generating image ${index + 1}...`);
  console.log(`   Prompt: ${prompt.substring(0, 80)}...`);

  const IMAGEN_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.imagen_model}:predict`;

  const response = await fetch(IMAGEN_API_URL, {
    method: "POST",
    headers: {
      "x-goog-api-key": GEMINI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: CONFIG.aspect_ratio,
        personGeneration: "allow_adult",
      },
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`Imagen API Error: ${data.error.message}`);
  }

  if (data.predictions && data.predictions[0]) {
    console.log(`   ✅ Image generated successfully!`);
    return data.predictions[0].bytesBase64Encoded;
  }

  throw new Error("No image generated");
}

async function uploadToGCS(imageBase64, filename, metadata) {
  console.log(`\n☁️  Uploading ${filename} to GCS...`);

  const credentials = JSON.parse(fs.readFileSync(GOOGLE_CREDENTIALS_PATH, "utf8"));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
  });

  const storage = google.storage({ version: 'v1', auth });

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
  const shortUuid = uuid().split('-')[0];
  const folderName = `${dateStr}_${shortUuid}_test_gemini`;

  const objectName = `${folderName}/${filename}`;
  const imageBuffer = Buffer.from(imageBase64, 'base64');

  const bufferStream = new Readable();
  bufferStream.push(imageBuffer);
  bufferStream.push(null);

  await storage.objects.insert({
    bucket: GCS_BUCKET_NAME,
    name: objectName,
    media: { mimeType: 'image/png', body: bufferStream },
    requestBody: {
      name: objectName,
      contentType: 'image/png',
      metadata,
    },
  });

  const publicUrl = `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${objectName}`;
  console.log(`   ✅ Uploaded: ${publicUrl}`);

  return { url: publicUrl, folderName };
}

async function main() {
  console.log("🚀 Testing Gemini Image Generator\n");
  console.log("=" .repeat(60));
  console.log(`Config:`);
  console.log(`  Gemini Model: ${CONFIG.gemini_model}`);
  console.log(`  Imagen Model: ${CONFIG.imagen_model}`);
  console.log(`  Aspect Ratio: ${CONFIG.aspect_ratio}`);
  console.log(`  Image Style: ${CONFIG.image_style}`);
  console.log("=" .repeat(60));

  const selectedStyle = styleMap[CONFIG.image_style];

  try {
    // Step 1: Analyze with Gemini
    const styleGuide = await analyzeWithGemini(TEST_SCRIPT, TEST_SCENES, selectedStyle);

    // Step 2: Generate images with Imagen
    const consistencyPrefix = `${styleGuide.main_character}, ${styleGuide.environment}, ${styleGuide.color_palette}, ${styleGuide.lighting}`;

    const generatedImages = [];

    for (let i = 0; i < Math.min(styleGuide.enhanced_prompts.length, 2); i++) { // 테스트용으로 2개만
      const enhanced = styleGuide.enhanced_prompts[i];
      const scene = TEST_SCENES[i];

      const finalPrompt = `${selectedStyle.prefix}, ${consistencyPrefix}, ${enhanced.enhanced}, ${enhanced.camera_angle || ''}, ${enhanced.motion_hint || ''}, ${selectedStyle.suffix}`;

      const imageBase64 = await generateImageWithImagen(finalPrompt, i);

      generatedImages.push({
        index: i,
        start: scene.start,
        end: scene.end,
        base64: imageBase64,
        filename: `scene_${String(i + 1).padStart(3, '0')}_${scene.start}-${scene.end}.png`,
      });

      // Rate limit
      if (i < styleGuide.enhanced_prompts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    console.log(`\n✅ Generated ${generatedImages.length} images`);

    // Step 3: Upload to GCS
    let folderName = null;
    const uploadedFiles = [];

    for (const image of generatedImages) {
      const result = await uploadToGCS(image.base64, image.filename, {
        sceneIndex: String(image.index),
        start: String(image.start),
        end: String(image.end),
      });

      uploadedFiles.push({ filename: image.filename, url: result.url });
      folderName = result.folderName;
    }

    // Final result
    console.log("\n" + "=" .repeat(60));
    console.log("🎉 TEST COMPLETED SUCCESSFULLY!\n");
    console.log("Results:");
    console.log(`  Folder: ${folderName}`);
    console.log(`  Images: ${uploadedFiles.length}`);
    uploadedFiles.forEach(f => console.log(`    - ${f.url}`));

  } catch (error) {
    console.error("\n❌ Error:", error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

main();
