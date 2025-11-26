import { generateScript } from './script-generator.js';
import { generateVideo, loadImagesFromGCS } from './runway-video-generator.js';
import { generateSpeech } from './elevenlabs-tts.js';
import { transcribeAudio } from './whisper-transcribe.js';
import { renderFinalVideo, loadVideosFromGCS } from './creatomate-render.js';
import { uploadToGCS, initGCS } from './gcs-helper.js';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

/**
 * Batch Shorts Generator
 * 3개의 키워드를 각각 처리하여 3개의 완전한 쇼츠 영상 생성
 */

/**
 * 키워드에 맞는 콘텐츠 스타일 자동 선택
 */
function getContentStyle(keyword) {
  const kw = (keyword.keyword_en || keyword.keyword_jp || '').toLowerCase();
  if (kw.includes('funny') || kw.includes('面白')) return 'comedy';
  if (kw.includes('healing') || kw.includes('癒')) return 'healing';
  if (kw.includes('anime') || kw.includes('アニメ')) return 'story';
  if (kw.includes('education') || kw.includes('learn')) return 'educational';
  return 'motivational';
}

/**
 * 키워드에 맞는 타겟 감정 자동 선택
 */
function getTargetEmotion(keyword) {
  const kw = (keyword.keyword_en || keyword.keyword_jp || '').toLowerCase();
  if (kw.includes('funny') || kw.includes('面白')) return 'funny';
  if (kw.includes('healing') || kw.includes('癒')) return 'calm';
  if (kw.includes('touching') || kw.includes('感動')) return 'touching';
  return 'empathy';
}

/**
 * 단일 키워드에 대한 전체 파이프라인 실행
 */
async function processSingleKeyword(keyword, options) {
  const {
    openaiApiKey,
    stabilityApiKey,
    runwayApiKey,
    elevenLabsApiKey,
    creatomateApiKey,
    gcsBucket,
    gcsFolder,
    googleCredentialsPath,
    durationSeconds = 40,
    language = 'japanese',
    voiceId = '21m00Tcm4TlvDq8ikWAM',
    outputDir = './output',
  } = options;

  const keywordText = keyword.keyword_jp || keyword.keyword_en || keyword.keyword_kr;
  const contentStyle = getContentStyle(keyword);
  const targetEmotion = getTargetEmotion(keyword);

  console.log(`\n[Batch] Processing keyword: ${keywordText}`);
  console.log(`  Style: ${contentStyle}, Emotion: ${targetEmotion}`);

  const result = {
    keyword,
    folder: gcsFolder,
    success: false,
    steps: {},
  };

  try {
    // Step 1: 대본 생성
    console.log('\n  [Step 1] Generating script...');
    const scriptResult = await generateScript({
      keywords: keywordText,
      apiKey: openaiApiKey,
      contentStyle,
      targetEmotion,
      durationSeconds,
      language,
      voiceStyle: 'calm_warm',
      includeScenes: true,
      outputDir,
      gcsBucket,
      gcsFolder,
      googleCredentialsPath,
    });
    result.steps.script = {
      title: scriptResult.script?.title,
      scenes: scriptResult.scenes?.length || 0,
    };
    console.log(`    ✓ Script generated: ${result.steps.script.scenes} scenes`);

    // Step 2: 이미지 생성
    console.log('\n  [Step 2] Generating images...');
    const imageResults = await generateImagesFromScript(scriptResult, {
      stabilityApiKey,
      gcsBucket,
      gcsFolder,
      googleCredentialsPath,
      outputDir,
    });
    result.steps.images = imageResults.length;
    console.log(`    ✓ Images generated: ${imageResults.length}`);

    // Step 3: 음성 생성
    console.log('\n  [Step 3] Generating audio...');
    const audioResult = await generateSpeech({
      text: scriptResult.script?.full_script,
      apiKey: elevenLabsApiKey,
      voiceId,
      gcsBucket,
      gcsFolder,
      googleCredentialsPath,
      outputDir,
    });
    result.steps.audio = {
      duration: audioResult.duration,
      size: audioResult.size,
    };
    console.log(`    ✓ Audio generated: ${(audioResult.size / 1024).toFixed(2)} KB`);

    // Step 4: 자막 생성
    console.log('\n  [Step 4] Generating subtitles...');
    const subtitleResult = await transcribeAudio({
      audioSource: audioResult.gcs?.url || path.join(outputDir, 'narration.mp3'),
      apiKey: openaiApiKey,
      language: language === 'japanese' ? 'ja' : language === 'korean' ? 'ko' : 'en',
      gcsBucket,
      gcsFolder,
      googleCredentialsPath,
      outputDir,
    });
    result.steps.subtitles = subtitleResult.total_segments;
    console.log(`    ✓ Subtitles generated: ${subtitleResult.total_segments} segments`);

    // Step 5: 영상 생성
    console.log('\n  [Step 5] Generating videos...');
    const videoResult = await generateVideo({
      folder: gcsFolder,
      apiKey: runwayApiKey,
      gcsBucket,
      googleCredentialsPath,
      outputDir,
    });
    result.steps.videos = videoResult.successful;
    console.log(`    ✓ Videos generated: ${videoResult.successful}`);

    // Step 6: 최종 합성
    console.log('\n  [Step 6] Rendering final video...');
    const finalResult = await renderFinalVideo({
      folder: gcsFolder,
      apiKey: creatomateApiKey,
      gcsBucket,
      googleCredentialsPath,
      outputDir,
    });
    result.steps.final = {
      url: finalResult.gcs?.url,
      duration: finalResult.total_duration,
    };
    console.log(`    ✓ Final video: ${finalResult.gcs?.url}`);

    result.success = true;
    result.finalVideo = finalResult.gcs?.url;

  } catch (error) {
    console.error(`    ✗ Error: ${error.message}`);
    result.error = error.message;
  }

  return result;
}

/**
 * 스크립트에서 이미지 생성
 */
async function generateImagesFromScript(scriptResult, options) {
  const {
    stabilityApiKey,
    gcsBucket,
    gcsFolder,
    googleCredentialsPath,
    outputDir,
  } = options;

  const scenes = scriptResult.scenes || [];
  const results = [];
  const FormData = (await import('form-data')).default;

  // GCS 초기화
  const storage = initGCS(googleCredentialsPath);

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const filename = `scene_${String(i + 1).padStart(3, '0')}_${scene.start}-${scene.end}.png`;

    console.log(`    Generating image ${i + 1}/${scenes.length}...`);

    const prompt = `${scene.prompt}, anime style, high quality, detailed illustration, vibrant colors, 9:16 vertical format`;

    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('aspect_ratio', '9:16');
    formData.append('output_format', 'png');

    try {
      const response = await axios({
        method: 'POST',
        url: 'https://api.stability.ai/v2beta/stable-image/generate/sd3',
        headers: {
          'Authorization': `Bearer ${stabilityApiKey}`,
          'Accept': 'image/*',
          ...formData.getHeaders(),
        },
        data: formData,
        responseType: 'arraybuffer',
      });

      // 로컬 저장
      const localPath = path.join(outputDir, filename);
      await fs.writeFile(localPath, Buffer.from(response.data));

      // GCS 업로드
      let gcsUrl = null;
      if (gcsBucket && gcsFolder && storage) {
        const bucket = storage.bucket(gcsBucket);
        const destination = `${gcsFolder}/${filename}`;
        await bucket.file(destination).save(Buffer.from(response.data), {
          contentType: 'image/png',
        });
        gcsUrl = `https://storage.googleapis.com/${gcsBucket}/${destination}`;
      }

      results.push({
        index: i + 1,
        filename,
        localPath,
        url: gcsUrl,
        start: scene.start,
        end: scene.end,
      });

      // Rate limit
      if (i < scenes.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`      Error generating image ${i + 1}: ${error.message}`);
    }
  }

  return results;
}

/**
 * 배치 생성 메인 함수
 * @param {Array} keywords - 키워드 배열
 * @param {Object} options - 옵션
 */
export async function batchGenerate(keywords, options) {
  const {
    openaiApiKey,
    stabilityApiKey,
    runwayApiKey,
    elevenLabsApiKey,
    creatomateApiKey,
    gcsBucket,
    googleCredentialsPath,
    durationSeconds = 40,
    language = 'japanese',
    voiceId = '21m00Tcm4TlvDq8ikWAM',
    outputDir = './output',
  } = options;

  // 최대 3개 키워드만 처리
  const targetKeywords = keywords.slice(0, 3);

  console.log('\n========================================');
  console.log('Batch Shorts Generator');
  console.log(`Processing ${targetKeywords.length} keywords`);
  console.log('========================================');

  const results = [];

  for (let i = 0; i < targetKeywords.length; i++) {
    const keyword = targetKeywords[i];
    const keywordText = keyword.keyword_en || keyword.keyword_jp || keyword.keyword_kr || `keyword_${i + 1}`;
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const gcsFolder = `batch_${timestamp}_${i + 1}_${keywordText.replace(/\s+/g, '_')}`;

    console.log(`\n[${i + 1}/${targetKeywords.length}] Keyword: ${keywordText}`);
    console.log(`Folder: ${gcsFolder}`);

    const result = await processSingleKeyword(keyword, {
      openaiApiKey,
      stabilityApiKey,
      runwayApiKey,
      elevenLabsApiKey,
      creatomateApiKey,
      gcsBucket,
      gcsFolder,
      googleCredentialsPath,
      durationSeconds,
      language,
      voiceId,
      outputDir: path.join(outputDir, gcsFolder),
    });

    results.push(result);

    // 다음 키워드 처리 전 대기
    if (i < targetKeywords.length - 1) {
      console.log('\n  Waiting 5 seconds before next keyword...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // 결과 요약
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  console.log('\n========================================');
  console.log('Batch Generation Complete');
  console.log(`Success: ${successCount}/${targetKeywords.length}`);
  console.log(`Failed: ${failCount}/${targetKeywords.length}`);
  console.log('========================================\n');

  // 결과 저장
  const summaryPath = path.join(outputDir, 'batch_summary.json');
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(summaryPath, JSON.stringify({
    total: targetKeywords.length,
    success: successCount,
    failed: failCount,
    results,
    generated_at: new Date().toISOString(),
  }, null, 2));
  console.log(`Summary saved: ${summaryPath}`);

  return {
    total: targetKeywords.length,
    success: successCount,
    failed: failCount,
    results,
  };
}

export default { batchGenerate };
