import axios from 'axios';
import fs from 'fs/promises';
import { createWriteStream, createReadStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import archiver from 'archiver';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STABILITY_API_KEY = process.env.STABILITY_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ENGINE_ID = 'stable-diffusion-xl-1024-v1-0';
const API_URL = `https://api.stability.ai/v1/generation/${ENGINE_ID}/text-to-image`;

// GCS 설정 (Service Account)
const GOOGLE_CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH || './google-credentials.json';
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'scene-image-generator-storage-mcp-test-457809';

// 출력 디렉토리
const OUTPUT_DIR = './output';

// OpenAI 클라이언트 초기화
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

/**
 * GPT를 사용하여 대본 분석 및 스타일 가이드 생성
 */
async function analyzeScriptAndGenerateStyle(scriptText, scenes) {
  console.log('\n[AI Analysis] Analyzing script to determine visual style...');

  const analysisPrompt = `You are an expert visual director and art director. Analyze the following script and scene descriptions to determine the best visual style and consistent character design.

## SCRIPT (Full Text):
${scriptText}

## SCENE PROMPTS:
${scenes.map((s, i) => `Scene ${i + 1} (${s.start}s-${s.end}s): ${s.image_prompt}`).join('\n')}

## YOUR TASK:
Based on the script's tone, emotion, target audience, and narrative, provide:

1. **art_style**: Choose ONE consistent art style that best fits this content:
   - "photorealistic cinematic" (realistic film look)
   - "anime japanese animation" (Japanese anime style)
   - "digital illustration" (modern digital art)
   - "watercolor soft" (soft painterly style)
   - "3d rendered pixar style" (3D animation look)

2. **character_description**: A detailed, CONSISTENT character description that will be used across ALL scenes. Include:
   - Gender, approximate age
   - Ethnicity/nationality (match the script's cultural context)
   - Hair style and color
   - Key physical features
   - Typical clothing/outfit

3. **mood_keywords**: 3-5 keywords that capture the overall mood/atmosphere

4. **color_palette**: Describe the color tone (warm/cool/neutral, saturated/muted, etc.)

5. **title**: A short title (2-4 words, English, no spaces use underscore) that captures the essence of the script

6. **enhanced_prompts**: For EACH scene, provide an enhanced prompt that:
   - Incorporates the consistent character description
   - Maintains the art style
   - Keeps the original scene intent
   - Adds technical quality keywords

Respond in JSON format:
{
  "art_style": "chosen style",
  "character_description": "detailed character description",
  "mood_keywords": ["keyword1", "keyword2", "keyword3"],
  "color_palette": "color description",
  "title": "short_title",
  "style_prefix": "technical prefix to add to all prompts for consistency",
  "style_suffix": "technical suffix to add to all prompts for quality",
  "enhanced_prompts": [
    {
      "scene_index": 0,
      "original": "original prompt",
      "enhanced": "enhanced prompt with character and style"
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert visual director. Always respond with valid JSON only, no markdown code blocks.'
        },
        {
          role: 'user',
          content: analysisPrompt
        }
      ],
      temperature: 0.7,
      max_tokens: 4000
    });

    const content = response.choices[0].message.content;
    const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const styleGuide = JSON.parse(jsonStr);

    console.log('[AI Analysis] Style determined:');
    console.log(`  - Art Style: ${styleGuide.art_style}`);
    console.log(`  - Title: ${styleGuide.title}`);
    console.log(`  - Character: ${styleGuide.character_description.substring(0, 80)}...`);
    console.log(`  - Mood: ${styleGuide.mood_keywords.join(', ')}`);
    console.log(`  - Color Palette: ${styleGuide.color_palette}`);

    return styleGuide;
  } catch (error) {
    console.error('[AI Analysis] Error:', error.message);
    throw new Error(`Script analysis failed: ${error.message}`);
  }
}

/**
 * Stability AI API를 사용하여 이미지 생성
 */
async function generateImage(prompt, sceneIndex) {
  console.log(`\n[Scene ${sceneIndex + 1}] Generating image...`);
  console.log(`Prompt: ${prompt.substring(0, 100)}...`);

  try {
    const response = await axios({
      method: 'POST',
      url: API_URL,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${STABILITY_API_KEY}`
      },
      data: {
        text_prompts: [{ text: prompt, weight: 1 }],
        cfg_scale: 7,
        height: 1536,
        width: 640,
        samples: 1,
        steps: 30
      }
    });

    if (!response.data || !response.data.artifacts || !response.data.artifacts[0]) {
      throw new Error('No image artifacts returned from API');
    }

    const base64Image = response.data.artifacts[0].base64;
    return Buffer.from(base64Image, 'base64');
  } catch (error) {
    if (error.response) {
      console.error(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw new Error(`Image generation failed for scene ${sceneIndex + 1}: ${error.message}`);
  }
}

/**
 * JSON 파일에서 씬 데이터 로드
 */
async function loadScenesFromFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * 모든 씬에 대한 이미지 생성 (스타일 가이드 적용)
 */
async function generateAllSceneImages(enhancedPrompts, originalScenes, styleGuide) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const results = [];

  for (let i = 0; i < enhancedPrompts.length; i++) {
    const enhanced = enhancedPrompts[i];
    const scene = originalScenes[i];
    const finalPrompt = `${styleGuide.style_prefix}, ${enhanced.enhanced}, ${styleGuide.style_suffix}`;

    try {
      const imageBuffer = await generateImage(finalPrompt, i);
      const filename = `scene_${String(i + 1).padStart(3, '0')}_${scene.start}-${scene.end}.png`;
      const filepath = path.join(OUTPUT_DIR, filename);

      await fs.writeFile(filepath, imageBuffer);
      console.log(`[Scene ${i + 1}] Saved: ${filepath}`);

      results.push({
        index: i,
        start: scene.start,
        end: scene.end,
        original_prompt: enhanced.original,
        enhanced_prompt: enhanced.enhanced,
        final_prompt: finalPrompt,
        filename: filename,
        filepath: filepath,
        status: 'success'
      });

      if (i < enhancedPrompts.length - 1) {
        console.log('Waiting 1 second before next request...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`[Scene ${i + 1}] Error: ${error.message}`);
      results.push({
        index: i,
        start: scene.start,
        end: scene.end,
        original_prompt: enhanced.original,
        enhanced_prompt: enhanced.enhanced,
        status: 'failed',
        error: error.message
      });
    }
  }

  return results;
}

/**
 * 이미지 파일들을 ZIP으로 압축
 * @param {Array} results - 생성 결과 배열
 * @param {string} title - 프로젝트 제목
 * @returns {Promise<string>} - ZIP 파일 경로
 */
async function createZipArchive(results, title) {
  const successfulResults = results.filter(r => r.status === 'success');

  if (successfulResults.length === 0) {
    throw new Error('No successful images to archive');
  }

  // 파일명 생성: 날짜_uuid_title.zip
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
  const uuid = uuidv4().split('-')[0]; // 짧은 UUID (첫 8자리)
  const safeTitle = title.replace(/[^a-zA-Z0-9_]/g, '_');
  const zipFilename = `${dateStr}_${uuid}_${safeTitle}.zip`;
  const zipPath = path.join(OUTPUT_DIR, zipFilename);

  console.log(`\n[Archive] Creating ZIP: ${zipFilename}`);

  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`[Archive] ZIP created: ${zipPath} (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`);
      resolve(zipPath);
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // 성공한 이미지들만 추가
    for (const result of successfulResults) {
      archive.file(result.filepath, { name: result.filename });
    }

    archive.finalize();
  });
}

/**
 * Google Cloud Storage에 이미지들을 폴더별로 업로드
 * @param {Array} results - 생성 결과 배열
 * @param {object} styleGuide - 스타일 가이드
 * @param {string} folderName - GCS 폴더명
 * @returns {Promise<object>} - 업로드 결과
 */
async function uploadToGCS(results, styleGuide, folderName) {
  console.log('\n[GCS] Initializing upload...');

  // Service Account 키 파일 확인
  const credentialsPath = path.resolve(__dirname, GOOGLE_CREDENTIALS_PATH);

  try {
    await fs.access(credentialsPath);
  } catch {
    console.log('[GCS] Credentials file not found. Skipping upload.');
    console.log(`  Expected path: ${credentialsPath}`);
    return null;
  }

  const successfulResults = results.filter(r => r.status === 'success');
  if (successfulResults.length === 0) {
    console.log('[GCS] No successful images to upload.');
    return null;
  }

  try {
    // GCS 클라이언트 초기화
    const storage = new Storage({
      keyFilename: credentialsPath
    });

    const bucket = storage.bucket(GCS_BUCKET_NAME);
    const uploadedFiles = [];

    console.log(`[GCS] Bucket: ${GCS_BUCKET_NAME}`);
    console.log(`[GCS] Folder: ${folderName}/`);
    console.log(`[GCS] Uploading ${successfulResults.length} images...`);

    // 이미지 파일들 업로드
    for (const result of successfulResults) {
      const destination = `${folderName}/${result.filename}`;

      await bucket.upload(result.filepath, {
        destination: destination,
        metadata: {
          contentType: 'image/png',
          metadata: {
            sceneIndex: String(result.index),
            start: String(result.start),
            end: String(result.end)
          }
        }
      });

      const publicUrl = `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${destination}`;
      uploadedFiles.push({
        filename: result.filename,
        gcsPath: destination,
        publicUrl: publicUrl,
        start: result.start,
        end: result.end
      });

      console.log(`  - Uploaded: ${result.filename}`);
    }

    // metadata.json 생성 및 업로드
    const metadata = {
      generated_at: new Date().toISOString(),
      folder: folderName,
      style_guide: {
        art_style: styleGuide.art_style,
        title: styleGuide.title,
        character_description: styleGuide.character_description,
        mood_keywords: styleGuide.mood_keywords,
        color_palette: styleGuide.color_palette
      },
      total_scenes: successfulResults.length,
      scenes: uploadedFiles.map((file, idx) => ({
        index: idx,
        filename: file.filename,
        url: file.publicUrl,
        start: file.start,
        end: file.end,
        duration: file.end - file.start
      }))
    };

    const metadataPath = path.join(OUTPUT_DIR, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    await bucket.upload(metadataPath, {
      destination: `${folderName}/metadata.json`,
      metadata: {
        contentType: 'application/json'
      }
    });
    console.log(`  - Uploaded: metadata.json`);

    const folderUrl = `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${folderName}`;

    console.log(`\n[GCS] Upload complete!`);
    console.log(`  - Folder: ${folderUrl}/`);
    console.log(`  - Files: ${uploadedFiles.length} images + metadata.json`);

    return {
      bucket: GCS_BUCKET_NAME,
      folder: folderName,
      folderUrl: folderUrl,
      gsUri: `gs://${GCS_BUCKET_NAME}/${folderName}/`,
      files: uploadedFiles,
      metadataUrl: `${folderUrl}/metadata.json`
    };
  } catch (error) {
    console.error(`[GCS] Upload failed: ${error.message}`);
    throw error;
  }
}

/**
 * 결과 요약 출력
 */
function printSummary(results, folderName, gcsResult) {
  console.log('\n' + '='.repeat(60));
  console.log('GENERATION SUMMARY');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.status === 'success');
  const failed = results.filter(r => r.status === 'failed');

  console.log(`Total scenes: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Folder: ${folderName}`);

  if (failed.length > 0) {
    console.log('\nFailed scenes:');
    failed.forEach(f => {
      console.log(`  - Scene ${f.index + 1} (${f.start}-${f.end}s): ${f.error}`);
    });
  }

  if (successful.length > 0) {
    console.log('\nGenerated images:');
    successful.forEach(s => {
      console.log(`  - ${s.filename}`);
    });
  }

  if (gcsResult) {
    console.log('\nGoogle Cloud Storage:');
    console.log(`  - Bucket: ${gcsResult.bucket}`);
    console.log(`  - Folder: ${gcsResult.folder}/`);
    console.log(`  - Files: ${gcsResult.files.length} images + metadata.json`);
    console.log(`  - Metadata: ${gcsResult.metadataUrl}`);
  }
}

/**
 * 메인 함수
 */
async function main() {
  console.log('='.repeat(60));
  console.log('SCENE IMAGE GENERATOR - AI-Powered Style Consistency');
  console.log('='.repeat(60));

  // API 키 확인
  if (!STABILITY_API_KEY) {
    console.error('Error: STABILITY_API_KEY is not set in .env file');
    process.exit(1);
  }

  if (!OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY is not set in .env file');
    process.exit(1);
  }

  const scenesFilePath = process.argv[2] || './scenes.json';

  try {
    // 씬 데이터 로드
    console.log(`\nLoading scenes from: ${scenesFilePath}`);
    const data = await loadScenesFromFile(scenesFilePath);

    if (!data.scenes || !Array.isArray(data.scenes) || data.scenes.length === 0) {
      throw new Error('Scenes array is missing or empty in JSON file');
    }

    console.log(`Found ${data.scenes.length} scenes to process`);

    if (!data.script_text) {
      throw new Error('script_text is required for AI style analysis');
    }

    console.log('\nScript text:');
    console.log(data.script_text.substring(0, 100) + '...');

    // AI 분석으로 스타일 가이드 생성
    const styleGuide = await analyzeScriptAndGenerateStyle(data.script_text, data.scenes);

    // 스타일 가이드 저장
    const styleGuidePath = path.join(OUTPUT_DIR, 'style_guide.json');
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.writeFile(styleGuidePath, JSON.stringify(styleGuide, null, 2));
    console.log(`\nStyle guide saved to: ${styleGuidePath}`);

    // 이미지 생성
    const results = await generateAllSceneImages(
      styleGuide.enhanced_prompts,
      data.scenes,
      styleGuide
    );

    // 폴더명 생성: 날짜_uuid_title
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const uuid = uuidv4().split('-')[0];
    const safeTitle = (styleGuide.title || 'scene_images').replace(/[^a-zA-Z0-9_]/g, '_');
    const folderName = `${dateStr}_${uuid}_${safeTitle}`;

    // GCS 업로드 (이미지 원본 + metadata.json)
    let gcsResult = null;
    try {
      gcsResult = await uploadToGCS(results, styleGuide, folderName);
    } catch (error) {
      console.error(`[GCS] Skipping due to error: ${error.message}`);
    }

    // 결과 요약
    printSummary(results, folderName, gcsResult);

    // 결과를 JSON 파일로 저장
    const resultsPath = path.join(OUTPUT_DIR, 'generation_results.json');
    await fs.writeFile(resultsPath, JSON.stringify({
      generated_at: new Date().toISOString(),
      folder_name: folderName,
      style_guide: {
        art_style: styleGuide.art_style,
        title: styleGuide.title,
        character_description: styleGuide.character_description,
        mood_keywords: styleGuide.mood_keywords,
        color_palette: styleGuide.color_palette
      },
      total_scenes: results.length,
      successful: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'failed').length,
      gcs: gcsResult,
      results: results
    }, null, 2));
    console.log(`\nResults saved to: ${resultsPath}`);

  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }
}

// 실행
main();
