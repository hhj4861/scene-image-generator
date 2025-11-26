/**
 * 파이프라인 테스트 스크립트
 *
 * 각 단계별 테스트:
 * - node test-pipeline.js list       : GCS 폴더 목록 조회
 * - node test-pipeline.js images     : GCS 최근 이미지 조회
 * - node test-pipeline.js script     : 대본 생성 테스트 (NEW)
 * - node test-pipeline.js tts        : ElevenLabs TTS 테스트
 * - node test-pipeline.js whisper    : Whisper 자막 생성 테스트
 * - node test-pipeline.js runway     : Runway 영상 생성 테스트
 * - node test-pipeline.js creatomate : Creatomate 합성 테스트
 * - node test-pipeline.js full-new   : 대본부터 시작하는 전체 파이프라인 (NEW)
 * - node test-pipeline.js all        : 기존 이미지 기반 파이프라인
 */

import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { generateScript } from './src/script-generator.js';
import { generateSpeech, VOICES } from './src/elevenlabs-tts.js';
import { transcribeAudio } from './src/whisper-transcribe.js';
import { generateVideos } from './src/runway-video-generator.js';
import { renderFinalVideo } from './src/creatomate-render.js';
import { optimizeMetadata, testYouTubeMetadata } from './src/youtube-upload.js';
import {
  listFolders,
  getLatestImages,
  getLatestVideos,
  getLatestAudio,
  getLatestSubtitles,
} from './src/gcs-helper.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 환경 변수
const CONFIG = {
  openaiApiKey: process.env.OPENAI_API_KEY,
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY,
  runwayApiKey: process.env.RUNWAY_API_KEY,
  creatomateApiKey: process.env.CREATOMATE_API_KEY,
  stabilityApiKey: process.env.STABILITY_API_KEY,
  googleCredentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || './google-credentials.json',
  gcsBucket: process.env.GCS_BUCKET_NAME || 'scene-image-generator-storage-mcp-test-457809',
  outputDir: './output',
};

/**
 * GCS 폴더 목록 조회
 */
async function testListFolders() {
  console.log('\n' + '='.repeat(60));
  console.log('GCS: List Folders');
  console.log('='.repeat(60));

  const folders = await listFolders({
    bucket: CONFIG.gcsBucket,
    credentialsPath: CONFIG.googleCredentialsPath,
  });

  console.log(`\nFound ${folders.length} folders:`);
  folders.slice(0, 10).forEach((folder, i) => {
    console.log(`  ${i + 1}. ${folder}`);
  });

  if (folders.length > 10) {
    console.log(`  ... and ${folders.length - 10} more`);
  }

  return folders;
}

/**
 * GCS 최근 이미지 조회
 */
async function testGetImages(folderName) {
  console.log('\n' + '='.repeat(60));
  console.log('GCS: Get Latest Images');
  console.log('='.repeat(60));

  const result = await getLatestImages({
    bucket: CONFIG.gcsBucket,
    credentialsPath: CONFIG.googleCredentialsPath,
    folderName,
  });

  console.log(`\nFolder: ${result.folder}`);
  console.log(`Images: ${result.images.length}`);
  result.images.forEach((img, i) => {
    console.log(`  ${i + 1}. ${img.filename} (${img.start}s - ${img.end}s)`);
  });

  if (result.metadata) {
    console.log(`\nMetadata:`);
    console.log(`  - Title: ${result.metadata.style_guide?.title}`);
    console.log(`  - Style: ${result.metadata.style_guide?.art_style}`);
  }

  return result;
}

/**
 * 대본 생성 테스트
 */
async function testScript(options = {}) {
  console.log('\n' + '='.repeat(60));
  console.log('TEST: Script Generator');
  console.log('='.repeat(60));

  if (!CONFIG.openaiApiKey) {
    console.error('Error: OPENAI_API_KEY is not set');
    return null;
  }

  const {
    keywords = '자기계발, 도전, 성장, 희망',
    contentStyle = 'motivational',
    targetEmotion = 'passion',
    durationSeconds = 40,
    language = 'japanese',
    voiceStyle = 'calm_warm',
  } = options;

  console.log(`\nGenerating script...`);
  console.log(`  - Keywords: ${keywords}`);
  console.log(`  - Style: ${contentStyle}`);
  console.log(`  - Duration: ${durationSeconds}s`);

  // 폴더명 생성 (날짜_uuid_title)
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const uuid = Math.random().toString(36).substring(2, 10);
  const folderName = `${timestamp}_${uuid}_Script_Test`;

  const result = await generateScript({
    keywords,
    apiKey: CONFIG.openaiApiKey,
    contentStyle,
    targetEmotion,
    durationSeconds,
    language,
    voiceStyle,
    includeScenes: true,
    outputDir: CONFIG.outputDir,
    gcsBucket: CONFIG.gcsBucket,
    gcsFolder: folderName,
    googleCredentialsPath: CONFIG.googleCredentialsPath,
  });

  console.log('\n--- Generated Script ---');
  console.log(`Title: ${result.script.title?.japanese || result.script.title?.korean}`);
  console.log(`Full Script:\n${result.script.full_script}`);
  console.log(`\nScenes: ${result.scenes.length}`);
  result.scenes.forEach((scene, i) => {
    console.log(`  ${i + 1}. [${scene.start}-${scene.end}s] ${scene.narration?.substring(0, 30)}...`);
  });

  return { ...result, folder: folderName };
}

/**
 * ElevenLabs TTS 테스트
 */
async function testTTS(scriptText, folderName) {
  console.log('\n' + '='.repeat(60));
  console.log('TEST: ElevenLabs TTS');
  console.log('='.repeat(60));

  if (!CONFIG.elevenlabsApiKey) {
    console.error('Error: ELEVENLABS_API_KEY is not set');
    return null;
  }

  // scriptText가 없으면 GCS metadata에서 가져오기
  let text = scriptText;
  let folder = folderName;

  if (!text) {
    console.log('\nNo script text provided, fetching from GCS metadata...');

    // 먼저 script.json 확인
    try {
      const scriptData = await getScriptFromGCS(folder);
      if (scriptData?.script?.full_script) {
        text = scriptData.script.full_script;
        console.log('  - Found script.json');
      }
    } catch (e) {
      // script.json 없음
    }

    // script.json 없으면 metadata에서
    if (!text) {
      const imageData = await getLatestImages({
        bucket: CONFIG.gcsBucket,
        credentialsPath: CONFIG.googleCredentialsPath,
        folderName: folder,
      });
      folder = imageData.folder;

      if (imageData.metadata?.script_text) {
        text = imageData.metadata.script_text;
      } else {
        // 기본 테스트 텍스트
        text = `朝、目が覚めた瞬間から始まる小さな挑戦。今日は絶対に負けたくない自分との戦いだ。`;
      }
    }
  }

  console.log(`\nScript: ${text.substring(0, 100)}...`);
  console.log(`Folder: ${folder}`);

  const result = await generateSpeech({
    text,
    apiKey: CONFIG.elevenlabsApiKey,
    voiceId: VOICES.RACHEL,
    modelId: "eleven_multilingual_v2",
    outputDir: CONFIG.outputDir,
    filename: 'narration.mp3',
    gcsBucket: CONFIG.gcsBucket,
    gcsFolder: folder,
    googleCredentialsPath: CONFIG.googleCredentialsPath,
  });

  console.log('\nResult:', JSON.stringify(result, null, 2));
  return { ...result, folder };
}

/**
 * GCS에서 script.json 가져오기
 */
async function getScriptFromGCS(folderName) {
  const { Storage } = await import('@google-cloud/storage');
  const storage = new Storage({ keyFilename: CONFIG.googleCredentialsPath });

  let targetFolder = folderName;
  if (!targetFolder) {
    const folders = await listFolders({
      bucket: CONFIG.gcsBucket,
      credentialsPath: CONFIG.googleCredentialsPath,
    });
    targetFolder = folders[0];
  }

  const [files] = await storage.bucket(CONFIG.gcsBucket).getFiles({
    prefix: `${targetFolder}/`,
  });

  const scriptFile = files.find(f => f.name.endsWith('script.json'));
  if (!scriptFile) {
    return null;
  }

  const [content] = await scriptFile.download();
  return JSON.parse(content.toString());
}

/**
 * Whisper 자막 생성 테스트
 */
async function testWhisper(audioPathOrUrl, folderName) {
  console.log('\n' + '='.repeat(60));
  console.log('TEST: Whisper Transcribe');
  console.log('='.repeat(60));

  if (!CONFIG.openaiApiKey) {
    console.error('Error: OPENAI_API_KEY is not set');
    return null;
  }

  let audioPath = null;
  let audioUrl = null;
  let folder = folderName;

  // audioPathOrUrl이 없으면 GCS에서 가져오기
  if (!audioPathOrUrl) {
    console.log('\nNo audio provided, fetching from GCS...');
    const audioData = await getLatestAudio({
      bucket: CONFIG.gcsBucket,
      credentialsPath: CONFIG.googleCredentialsPath,
      folderName: folder,
    });

    if (!audioData) {
      console.error('Error: No audio file found in GCS');
      console.log('Run "node test-pipeline.js tts" first to generate audio.');
      return null;
    }

    audioUrl = audioData.url;
    folder = audioData.folder;
    console.log(`Found audio: ${audioUrl}`);
  } else if (audioPathOrUrl.startsWith('http')) {
    audioUrl = audioPathOrUrl;
  } else {
    audioPath = audioPathOrUrl;
  }

  const result = await transcribeAudio({
    audioPath,
    audioUrl,
    apiKey: CONFIG.openaiApiKey,
    language: 'ja',
    outputDir: CONFIG.outputDir,
    gcsBucket: CONFIG.gcsBucket,
    gcsFolder: folder,
    googleCredentialsPath: CONFIG.googleCredentialsPath,
  });

  console.log('\nResult:', JSON.stringify({
    ...result,
    subtitles: result.subtitles.slice(0, 3), // 처음 3개만 표시
  }, null, 2));

  return { ...result, folder };
}

/**
 * Runway 영상 생성 테스트
 */
async function testRunway(folderName, testOnly = false) {
  console.log('\n' + '='.repeat(60));
  console.log('TEST: Runway Video Generator');
  console.log('='.repeat(60));

  if (!CONFIG.runwayApiKey) {
    console.error('Error: RUNWAY_API_KEY is not set');
    return null;
  }

  // GCS에서 이미지 자동 조회
  console.log('\nFetching images from GCS...');
  const imageData = await getLatestImages({
    bucket: CONFIG.gcsBucket,
    credentialsPath: CONFIG.googleCredentialsPath,
    folderName,
  });

  if (!imageData.images || imageData.images.length === 0) {
    console.error('Error: No images found in GCS');
    return null;
  }

  console.log(`\nFolder: ${imageData.folder}`);
  console.log(`Found ${imageData.images.length} images:`);
  imageData.images.forEach((img, i) => {
    console.log(`  ${i + 1}. ${img.filename} (${img.start}s - ${img.end}s)`);
    console.log(`     ${img.url}`);
  });

  // testOnly 모드면 첫 번째 이미지만 테스트
  const imagesToProcess = testOnly ? imageData.images.slice(0, 1) : imageData.images;

  if (testOnly) {
    console.log('\n[TEST MODE] Processing only first image...');
  }

  const result = await generateVideos({
    images: imagesToProcess,
    runwayApiKey: CONFIG.runwayApiKey,
    outputDir: CONFIG.outputDir,
    videoDuration: 5,  // 5초 영상 (각 이미지마다)
    gcsBucket: CONFIG.gcsBucket,
    gcsFolder: imageData.folder,
    googleCredentialsPath: CONFIG.googleCredentialsPath,
  });

  console.log('\nResult:', JSON.stringify(result, null, 2));
  return { ...result, folder: imageData.folder };
}

/**
 * Creatomate 합성 테스트
 */
async function testCreatomate(folderName) {
  console.log('\n' + '='.repeat(60));
  console.log('TEST: Creatomate Render');
  console.log('='.repeat(60));

  if (!CONFIG.creatomateApiKey) {
    console.error('Error: CREATOMATE_API_KEY is not set');
    return null;
  }

  // GCS에서 데이터 자동 조회
  console.log('\nFetching data from GCS...');

  // 영상 조회
  const videoData = await getLatestVideos({
    bucket: CONFIG.gcsBucket,
    credentialsPath: CONFIG.googleCredentialsPath,
    folderName,
  });

  if (!videoData.videos || videoData.videos.length === 0) {
    console.error('Error: No videos found in GCS');
    console.log('Run "node test-pipeline.js runway" first to generate videos.');
    return null;
  }

  const folder = videoData.folder;

  // 오디오 조회
  const audioData = await getLatestAudio({
    bucket: CONFIG.gcsBucket,
    credentialsPath: CONFIG.googleCredentialsPath,
    folderName: folder,
  });

  if (!audioData) {
    console.error('Error: No audio found in GCS');
    console.log('Run "node test-pipeline.js tts" first to generate audio.');
    return null;
  }

  // 자막 조회
  const subtitleData = await getLatestSubtitles({
    bucket: CONFIG.gcsBucket,
    credentialsPath: CONFIG.googleCredentialsPath,
    folderName: folder,
  });

  if (!subtitleData) {
    console.error('Error: No subtitles found in GCS');
    console.log('Run "node test-pipeline.js whisper" first to generate subtitles.');
    return null;
  }

  console.log(`\nFolder: ${folder}`);
  console.log(`Videos: ${videoData.videos.length}`);
  console.log(`Audio: ${audioData.url}`);
  console.log(`Subtitles: ${subtitleData.subtitles.length} segments`);

  const result = await renderFinalVideo({
    videos: videoData.videos,
    audioUrl: audioData.url,
    subtitles: subtitleData.subtitles,
    apiKey: CONFIG.creatomateApiKey,
    outputDir: CONFIG.outputDir,
    filename: 'final_shorts.mp4',
    gcsBucket: CONFIG.gcsBucket,
    gcsFolder: folder,
    googleCredentialsPath: CONFIG.googleCredentialsPath,
  });

  console.log('\nResult:', JSON.stringify(result, null, 2));
  return { ...result, folder };
}

/**
 * 대본부터 시작하는 새로운 전체 파이프라인
 */
async function testFullNewPipeline(options = {}) {
  console.log('\n' + '='.repeat(60));
  console.log('TEST: Full New Pipeline (Script → Image → Video → Audio → Final)');
  console.log('='.repeat(60));

  const {
    keywords = '자기계발, 도전, 성장, 아침',
    contentStyle = 'motivational',
    targetEmotion = 'passion',
    durationSeconds = 40,
    language = 'japanese',
  } = options;

  // Step 1: 대본 생성
  console.log('\n[Step 1] Generating script...');
  const scriptResult = await testScript({
    keywords,
    contentStyle,
    targetEmotion,
    durationSeconds,
    language,
  });

  if (!scriptResult) {
    console.error('Script generation failed');
    return null;
  }

  const folder = scriptResult.folder;
  console.log(`  ✓ Script generated: ${scriptResult.scenes.length} scenes`);
  console.log(`  ✓ Folder: ${folder}`);

  // Step 2: 이미지 생성 (각 장면별)
  console.log('\n[Step 2] Generating images for each scene...');
  const imageResults = await generateImagesFromScript(scriptResult, folder);
  if (!imageResults || imageResults.length === 0) {
    console.error('Image generation failed');
    return null;
  }
  console.log(`  ✓ Generated ${imageResults.length} images`);

  // Step 3: TTS (대본 → 음성)
  console.log('\n[Step 3] Generating speech...');
  const ttsResult = await testTTS(scriptResult.script.full_script, folder);
  if (!ttsResult) {
    console.error('TTS generation failed');
    return null;
  }
  console.log(`  ✓ Audio generated`);

  // Step 4: Whisper (자막 생성)
  console.log('\n[Step 4] Transcribing audio for subtitles...');
  const whisperResult = await testWhisper(null, folder);
  if (!whisperResult) {
    console.error('Whisper transcription failed');
    return null;
  }
  console.log(`  ✓ Subtitles generated: ${whisperResult.subtitles.length} segments`);

  // Step 5: Runway (이미지 → 영상)
  console.log('\n[Step 5] Generating videos from images...');
  const runwayResult = await testRunway(folder, false);
  if (!runwayResult) {
    console.error('Video generation failed');
    return null;
  }
  console.log(`  ✓ Generated ${runwayResult.videos.length} videos`);

  // Step 6: Creatomate (최종 합성)
  console.log('\n[Step 6] Rendering final video...');
  const creatomateResult = await testCreatomate(folder);
  if (!creatomateResult) {
    console.error('Final rendering failed');
    return null;
  }

  console.log('\n' + '='.repeat(60));
  console.log('FULL NEW PIPELINE COMPLETE!');
  console.log('='.repeat(60));
  console.log(`\nFolder: ${folder}`);
  console.log(`Final video: ${creatomateResult.gcs?.url || creatomateResult.filepath}`);

  return {
    folder,
    script: scriptResult,
    images: imageResults,
    tts: ttsResult,
    whisper: whisperResult,
    runway: runwayResult,
    creatomate: creatomateResult,
  };
}

/**
 * 대본의 각 장면에 대해 이미지 생성
 */
async function generateImagesFromScript(scriptResult, folder) {
  const { Storage } = await import('@google-cloud/storage');
  const axios = (await import('axios')).default;
  const FormData = (await import('form-data')).default;

  if (!CONFIG.stabilityApiKey) {
    console.error('Error: STABILITY_API_KEY is not set');
    return null;
  }

  const scenes = scriptResult.scenes;
  const storage = new Storage({ keyFilename: CONFIG.googleCredentialsPath });
  const bucket = storage.bucket(CONFIG.gcsBucket);

  const generatedImages = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    console.log(`\n  Generating image ${i + 1}/${scenes.length}...`);
    console.log(`    Prompt: ${scene.prompt?.substring(0, 60)}...`);

    try {
      // Stability AI 이미지 생성 (FormData 사용)
      const formData = new FormData();
      formData.append('prompt', `${scene.prompt}, anime style, high quality illustration, detailed background, cinematic lighting`);
      formData.append('aspect_ratio', '9:16');
      formData.append('output_format', 'png');

      const response = await axios({
        method: 'POST',
        url: 'https://api.stability.ai/v2beta/stable-image/generate/sd3',
        headers: {
          'Authorization': `Bearer ${CONFIG.stabilityApiKey}`,
          'Accept': 'image/*',
          ...formData.getHeaders(),
        },
        data: formData,
        responseType: 'arraybuffer',
      });

      const imageBuffer = Buffer.from(response.data);
      const filename = `scene_${String(i + 1).padStart(3, '0')}_${scene.start}-${scene.end}.png`;

      // 로컬 저장
      await fs.mkdir(CONFIG.outputDir, { recursive: true });
      const localPath = path.join(CONFIG.outputDir, filename);
      await fs.writeFile(localPath, imageBuffer);
      console.log(`    Saved: ${localPath}`);

      // GCS 업로드
      const destination = `${folder}/${filename}`;
      await bucket.file(destination).save(imageBuffer, {
        contentType: 'image/png',
      });

      const publicUrl = `https://storage.googleapis.com/${CONFIG.gcsBucket}/${destination}`;
      console.log(`    Uploaded: ${publicUrl}`);

      generatedImages.push({
        index: i,
        filename,
        url: publicUrl,
        start: scene.start,
        end: scene.end,
      });

      // Rate limit delay
      if (i < scenes.length - 1) {
        console.log('    Waiting 1 second...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`    Error: ${error.response?.data?.message || error.message}`);
      generatedImages.push({
        index: i,
        start: scene.start,
        end: scene.end,
        status: 'failed',
        error: error.message,
      });
    }
  }

  // metadata.json 저장
  const metadata = {
    folder,
    script: scriptResult.script,
    scenes: scriptResult.scenes,
    images: generatedImages,
    generated_at: new Date().toISOString(),
  };

  const metadataPath = path.join(CONFIG.outputDir, 'metadata.json');
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

  // GCS에 metadata 업로드
  await bucket.file(`${folder}/metadata.json`).save(JSON.stringify(metadata, null, 2), {
    contentType: 'application/json',
  });

  return generatedImages;
}

/**
 * 배치 생성 테스트 (3개 키워드 각각 전체 파이프라인)
 */
async function testBatchGenerate(keywordsJson) {
  console.log('\n' + '='.repeat(60));
  console.log('TEST: Batch Generate (3 Keywords → 3 Videos)');
  console.log('='.repeat(60));

  // 키워드 파싱
  let keywords;
  try {
    keywords = keywordsJson
      ? JSON.parse(keywordsJson)
      : [
          { keyword_jp: 'アニメ', keyword_en: 'anime', keyword_kr: '애니메이션' },
          { keyword_jp: '面白い', keyword_en: 'funny', keyword_kr: '재미있는' },
          { keyword_jp: '癒し', keyword_en: 'healing', keyword_kr: '힐링' },
        ];
  } catch (error) {
    console.error('Error parsing keywords JSON:', error.message);
    console.log('Using default keywords...');
    keywords = [
      { keyword_jp: 'アニメ', keyword_en: 'anime', keyword_kr: '애니메이션' },
      { keyword_jp: '面白い', keyword_en: 'funny', keyword_kr: '재미있는' },
      { keyword_jp: '癒し', keyword_en: 'healing', keyword_kr: '힐링' },
    ];
  }

  // 최대 3개만 처리
  const targetKeywords = keywords.slice(0, 3);
  console.log(`\nProcessing ${targetKeywords.length} keywords:`);
  targetKeywords.forEach((kw, i) => {
    console.log(`  ${i + 1}. ${kw.keyword_jp || kw.keyword_en || kw.keyword_kr}`);
  });

  const results = [];

  for (let i = 0; i < targetKeywords.length; i++) {
    const kw = targetKeywords[i];
    const keywordText = kw.keyword_jp || kw.keyword_en || kw.keyword_kr;
    const contentStyle = getContentStyleFromKeyword(kw);
    const targetEmotion = getTargetEmotionFromKeyword(kw);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${i + 1}/${targetKeywords.length}] Keyword: ${keywordText}`);
    console.log(`Style: ${contentStyle}, Emotion: ${targetEmotion}`);
    console.log('='.repeat(60));

    try {
      const result = await testFullNewPipeline({
        keywords: keywordText,
        contentStyle,
        durationSeconds: 40,
      });

      results.push({
        keyword: kw,
        success: true,
        folder: result?.folder,
        finalVideo: result?.creatomate?.gcs?.url,
      });
    } catch (error) {
      console.error(`Error: ${error.message}`);
      results.push({
        keyword: kw,
        success: false,
        error: error.message,
      });
    }

    // 다음 키워드 전 대기
    if (i < targetKeywords.length - 1) {
      console.log('\nWaiting 10 seconds before next keyword...');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  // 결과 요약
  const successCount = results.filter(r => r.success).length;
  console.log('\n' + '='.repeat(60));
  console.log('BATCH GENERATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nSuccess: ${successCount}/${targetKeywords.length}`);
  results.forEach((r, i) => {
    const kw = r.keyword.keyword_jp || r.keyword.keyword_en;
    if (r.success) {
      console.log(`  ${i + 1}. ✓ ${kw}: ${r.finalVideo || r.folder}`);
    } else {
      console.log(`  ${i + 1}. ✗ ${kw}: ${r.error}`);
    }
  });

  // 결과 저장
  const summaryPath = path.join(CONFIG.outputDir, 'batch_summary.json');
  await fs.mkdir(CONFIG.outputDir, { recursive: true });
  await fs.writeFile(summaryPath, JSON.stringify({
    total: targetKeywords.length,
    success: successCount,
    results,
    generated_at: new Date().toISOString(),
  }, null, 2));
  console.log(`\nSummary saved: ${summaryPath}`);

  return results;
}

/**
 * 키워드에서 콘텐츠 스타일 추론
 */
function getContentStyleFromKeyword(keyword) {
  const kw = (keyword.keyword_en || keyword.keyword_jp || '').toLowerCase();
  if (kw.includes('funny') || kw.includes('面白')) return 'comedy';
  if (kw.includes('healing') || kw.includes('癒')) return 'healing';
  if (kw.includes('anime') || kw.includes('アニメ')) return 'story';
  if (kw.includes('education') || kw.includes('learn')) return 'educational';
  return 'motivational';
}

/**
 * 키워드에서 타겟 감정 추론
 */
function getTargetEmotionFromKeyword(keyword) {
  const kw = (keyword.keyword_en || keyword.keyword_jp || '').toLowerCase();
  if (kw.includes('funny') || kw.includes('面白')) return 'funny';
  if (kw.includes('healing') || kw.includes('癒')) return 'calm';
  if (kw.includes('touching') || kw.includes('感動')) return 'touching';
  return 'empathy';
}

/**
 * YouTube 메타데이터 최적화 테스트
 */
async function testYouTube(folderName) {
  console.log('\n' + '='.repeat(60));
  console.log('TEST: YouTube Metadata Optimizer');
  console.log('='.repeat(60));

  if (!CONFIG.openaiApiKey) {
    console.error('Error: OPENAI_API_KEY is not set');
    return null;
  }

  // GCS에서 script.json 가져오기
  let scriptData;
  let folder = folderName;

  if (!folder) {
    // 최신 폴더 찾기
    const folders = await listFolders({
      bucket: CONFIG.gcsBucket,
      credentialsPath: CONFIG.googleCredentialsPath,
    });
    folder = folders[0];
  }

  console.log(`\nFolder: ${folder}`);

  try {
    scriptData = await getScriptFromGCS(folder);
    if (!scriptData) {
      // script.json이 없으면 metadata.json에서 시도
      const imageData = await getLatestImages({
        bucket: CONFIG.gcsBucket,
        credentialsPath: CONFIG.googleCredentialsPath,
        folderName: folder,
      });

      if (imageData.metadata?.script) {
        scriptData = { script: imageData.metadata.script };
      }
    }
  } catch (e) {
    console.error('Error loading script:', e.message);
  }

  if (!scriptData?.script) {
    console.log('\nNo script found. Using test data...');
    scriptData = {
      script: {
        title: { japanese: '心を癒す静かな時間' },
        full_script: '静かな朝、心が穏やかになる。深呼吸して、今日という日を迎えよう。',
        hashtags: {
          japanese: ['#癒し', '#リラックス', '#朝活'],
        },
      },
    };
  }

  console.log(`\nTitle: ${JSON.stringify(scriptData.script.title)}`);
  console.log(`Script: ${scriptData.script.full_script?.substring(0, 100)}...`);

  const result = await optimizeMetadata({
    apiKey: CONFIG.openaiApiKey,
    originalTitle: scriptData.script.title,
    scriptText: scriptData.script.full_script || '',
    hashtags: scriptData.script.hashtags || {},
    targetLanguage: 'japanese',
    contentCategory: '24',
  });

  console.log('\n--- Optimized Metadata ---');
  console.log(`Title: ${result.optimized_title}`);
  console.log(`SEO Score: ${result.seo_score}/100`);
  console.log(`Predicted: ${result.predicted_performance}`);
  console.log(`Tags (${result.tags?.length}): ${result.tags?.slice(0, 5).join(', ')}...`);
  console.log(`Thumbnail: ${result.thumbnail_text_suggestion}`);
  console.log(`Best Times: ${result.best_upload_times?.join(', ')}`);
  console.log(`\nDescription Preview:`);
  console.log(result.optimized_description?.substring(0, 300) + '...');

  // 결과 저장
  const outputPath = path.join(CONFIG.outputDir, 'youtube_metadata.json');
  await fs.mkdir(CONFIG.outputDir, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
  console.log(`\nSaved: ${outputPath}`);

  return result;
}

/**
 * 기존 전체 파이프라인 테스트
 */
async function testFullPipeline(folderName) {
  console.log('\n' + '='.repeat(60));
  console.log('TEST: Full Pipeline (Image → Video → Audio → Final)');
  console.log('='.repeat(60));

  // 0. 이미지 확인
  console.log('\n[Step 0] Checking images in GCS...');
  const imageData = await testGetImages(folderName);
  if (!imageData || !imageData.images.length) {
    console.error('Error: No images found. Run "node index.js" first.');
    return;
  }
  const folder = imageData.folder;

  // 1. TTS
  console.log('\n[Step 1] Generating speech...');
  const ttsResult = await testTTS(null, folder);
  if (!ttsResult) return;

  // 2. Whisper
  console.log('\n[Step 2] Transcribing audio...');
  const whisperResult = await testWhisper(null, folder);
  if (!whisperResult) return;

  // 3. Runway (첫 번째 이미지만 테스트)
  console.log('\n[Step 3] Generating videos (test mode - first image only)...');
  const runwayResult = await testRunway(folder, true);
  if (!runwayResult) return;

  // 4. Creatomate (영상이 충분하면)
  if (runwayResult.videos && runwayResult.videos.length > 0) {
    console.log('\n[Step 4] Rendering final video...');
    const creatomateResult = await testCreatomate(folder);
    if (creatomateResult) {
      console.log('\n' + '='.repeat(60));
      console.log('FULL PIPELINE COMPLETE!');
      console.log('='.repeat(60));
      console.log(`\nFinal video: ${creatomateResult.gcs?.url || creatomateResult.filepath}`);
      return { images: imageData, tts: ttsResult, whisper: whisperResult, runway: runwayResult, creatomate: creatomateResult };
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Pipeline Test Complete (partial)');
  console.log('='.repeat(60));
  console.log('\nGenerated files:');
  console.log(`  - Images: ${imageData.images.length}`);
  console.log(`  - Audio: ${ttsResult.gcs?.url || ttsResult.filepath}`);
  console.log(`  - Subtitles: ${whisperResult.gcs?.json_url || whisperResult.json_path}`);
  console.log(`  - Videos: ${runwayResult.videos?.length || 0}`);

  return { images: imageData, tts: ttsResult, whisper: whisperResult, runway: runwayResult };
}

/**
 * 메인
 */
async function main() {
  const command = process.argv[2] || 'help';
  const arg1 = process.argv[3];
  const arg2 = process.argv[4];

  console.log('Scene to Shorts Pipeline Tester');
  console.log('================================\n');

  switch (command) {
    case 'list':
      await testListFolders();
      break;

    case 'images':
      await testGetImages(arg1);
      break;

    case 'script':
      // node test-pipeline.js script "키워드1,키워드2" [style] [duration]
      await testScript({
        keywords: arg1 || '자기계발, 도전, 성장',
        contentStyle: arg2 || 'motivational',
        durationSeconds: parseInt(process.argv[5]) || 40,
      });
      break;

    case 'tts':
      await testTTS(null, arg1);
      break;

    case 'whisper':
      await testWhisper(null, arg1);
      break;

    case 'runway':
      // 두 번째 인자가 'test'면 첫 이미지만
      const testOnly = arg2 === 'test';
      await testRunway(arg1, testOnly);
      break;

    case 'runway-test':
      await testRunway(arg1, true);
      break;

    case 'creatomate':
      await testCreatomate(arg1);
      break;

    case 'youtube':
      await testYouTube(arg1);
      break;

    case 'full-new':
      // node test-pipeline.js full-new "키워드" [style] [duration]
      await testFullNewPipeline({
        keywords: arg1 || '자기계발, 도전, 성장, 아침',
        contentStyle: arg2 || 'motivational',
        durationSeconds: parseInt(process.argv[5]) || 40,
      });
      break;

    case 'all':
    case 'full':
      await testFullPipeline(arg1);
      break;

    case 'batch':
      // node test-pipeline.js batch '[{"keyword_jp":"アニメ","keyword_en":"anime"},...]'
      await testBatchGenerate(arg1);
      break;

    case 'help':
    default:
      console.log('Usage: node test-pipeline.js <command> [args]\n');
      console.log('Commands:');
      console.log('  list                        - List GCS folders');
      console.log('  images [folder]             - Show images in folder');
      console.log('  script "keywords" [style]   - Generate script from keywords');
      console.log('  tts [folder]                - Generate speech with ElevenLabs');
      console.log('  whisper [folder]            - Transcribe audio with Whisper');
      console.log('  runway [folder]             - Generate videos with Runway');
      console.log('  runway-test [folder]        - Generate video for first image only');
      console.log('  creatomate [folder]         - Render final video');
      console.log('  youtube [folder]            - Optimize YouTube metadata with AI');
      console.log('  full-new "keywords" [style] - Full pipeline from script');
      console.log('  batch "[{json}]"            - Batch generate 3 keywords');
      console.log('  all [folder]                - Full pipeline from existing images');
      console.log('\nScript Styles:');
      console.log('  motivational, healing, story, comedy, educational');
      console.log('\nExamples:');
      console.log('  node test-pipeline.js list');
      console.log('  node test-pipeline.js script "힐링,휴식,평온" healing 40');
      console.log('  node test-pipeline.js full-new "자기계발,도전" motivational 40');
      console.log('  node test-pipeline.js all');
      console.log('\nRequired environment variables:');
      console.log('  GOOGLE_CREDENTIALS_PATH - GCS service account JSON');
      console.log('  GCS_BUCKET_NAME         - GCS bucket name');
      console.log('  OPENAI_API_KEY          - For script generation & Whisper');
      console.log('  STABILITY_API_KEY       - For image generation');
      console.log('  ELEVENLABS_API_KEY      - For TTS');
      console.log('  RUNWAY_API_KEY          - For video generation');
      console.log('  CREATOMATE_API_KEY      - For final rendering');
      break;
  }
}

main().catch(console.error);
