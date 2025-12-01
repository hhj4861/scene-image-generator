/**
 * Hedra 기반 파이프라인 테스트
 *
 * speaker별 동작 모션:
 * - puppy: 입 움직임 + 감정 표현 (말하는 강아지)
 * - owner: 고개 끄덕임/반응 (듣는 강아지, 입 다물고)
 *
 * 파이프라인:
 * 1. 이미지 생성 (Imagen 4)
 * 2. 음성 생성 (ElevenLabs TTS)
 * 3. 비디오 생성 (Hedra Character 3)
 * 4. 최종 합성 (FFmpeg)
 */

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =====================
// 환경 설정
// =====================
const CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || '',
  HEDRA_API_KEY: process.env.HEDRA_API_KEY || '',

  VOICE_PUPPY: 'axF6wO2S4OLQLeC9UaUc',
  VOICE_OWNER: 'BbsagRO6ohd8MKPS2Ob0',

  OUTPUT_DIR: path.join(__dirname, 'test_output'),
};

const HEDRA_CHARACTER_3_MODEL_ID = 'd1dd37a3-e39a-4854-a298-6510289f9cf2';

// =====================
// 테스트 스크립트 (speaker별 hedra_prompt 포함)
// =====================
const SCRIPT = {
  folder_name: `hedra_test_${new Date().toISOString().split('T')[0].replace(/-/g, '')}_${uuidv4().split('-')[0]}`,

  puppy_character: {
    name: '땅콩',
    breed: 'Pomeranian',
    image_prompt: 'cute fluffy orange Pomeranian puppy, small round face, bright dark eyes, fluffy orange-cream fur, tiny black nose, pointed ears, adorable expression'
  },

  script_segments: [
    {
      index: 1,
      speaker: 'puppy',
      narration: '아빠! 땅콩이 사자후 보여줄까? 어흥! 내가 제일 쎄다!',
      emotion: 'excited',
      puppy_pose: 'standing proudly with chest out, confident pose',
      background: 'cozy living room with soft warm lighting',
      // puppy가 말할 때: 입 크게 벌리며 말하기, 자신감 넘치는 표정
      hedra_prompt: 'Cute Pomeranian puppy talking excitedly with wide mouth movements, confident proud expression, chest puffed out, bright sparkling eyes, ears perked up forward, expressive face showing excitement and pride, mouth opening wide for emphasis, energetic head movements'
    },
    {
      index: 2,
      speaker: 'owner',
      narration: '우리 땅콩이 진짜 호랑이네! 으르렁!',
      emotion: 'amused',
      puppy_pose: 'looking up happily, pleased with praise',
      background: 'cozy living room with soft warm lighting',
      // owner가 말할 때: 강아지는 입 다물고 기쁘게 반응, 고개 끄덕임
      hedra_prompt: 'Cute Pomeranian puppy listening happily with closed mouth, NOT talking, gentle nodding head up and down, pleased happy expression, bright eyes looking up, ears relaxed, subtle joyful movements, receiving praise contentedly, soft smile with mouth closed'
    },
    {
      index: 3,
      speaker: 'puppy',
      narration: '에헤헤... 이번엔 미어캣! 땅콩이 미어캣도 잘해! 읭?',
      emotion: 'playful',
      puppy_pose: 'standing on hind legs like meerkat, looking around curiously',
      background: 'cozy living room with soft warm lighting',
      // puppy가 말할 때: 장난스럽게 말하기, 미어캣 포즈
      hedra_prompt: 'Cute Pomeranian puppy talking playfully with mouth movements, standing upright on hind legs like meerkat, looking around curiously while speaking, playful giggly expression, bright curious eyes darting around, ears alert and moving, adorable mischievous smile, head tilting side to side'
    },
    {
      index: 4,
      speaker: 'owner',
      narration: '그래, 땅콩이 미어캣처럼 두리번두리번 해봐!',
      emotion: 'encouraging',
      puppy_pose: 'standing on hind legs, looking left and right',
      background: 'cozy living room with soft warm lighting',
      // owner가 말할 때: 강아지는 입 다물고 두리번거림
      hedra_prompt: 'Cute Pomeranian puppy standing on hind legs with closed mouth, NOT talking, looking left and right curiously like meerkat, alert attentive expression, ears moving to listen, head turning side to side smoothly, bright curious eyes scanning around, mouth stays closed, gentle swaying motion'
    },
    {
      index: 5,
      speaker: 'puppy',
      narration: '읭? 읭? 꺄악! 털 젖었어! 미어캣 아니고 물에 빠진 쥐다!',
      emotion: 'surprised',
      puppy_pose: 'wet fur, shocked expression, water droplets visible',
      background: 'cozy living room with soft warm lighting',
      // puppy가 말할 때: 놀라서 말하기, 충격받은 표정
      hedra_prompt: 'Cute Pomeranian puppy talking with surprised shocked expression, mouth opening wide in surprise, wet messy fur with water droplets, wide startled eyes, ears flattened back in shock, dramatic surprised facial movements, speaking with panicked voice, head shaking in disbelief, cute distressed expression'
    },
    {
      index: 6,
      speaker: 'owner',
      narration: '아이고, 우리 땅콩이 쥐돌이 됐네! 괜찮아, 아빠가 닦아줄게!',
      emotion: 'loving',
      puppy_pose: 'wet fur being gently dried, calm accepting expression',
      background: 'cozy living room with soft warm lighting',
      // owner가 말할 때: 강아지는 입 다물고 편안하게 닦임당함
      hedra_prompt: 'Cute Pomeranian puppy with wet fur being dried, closed mouth NOT talking, calm peaceful expression, eyes half-closed in comfort, relaxed ears, gentle nodding, accepting loving care, soft content smile with mouth closed, subtle happy movements, feeling warm and loved'
    }
  ],
};

// =====================
// 1. 이미지 생성 (Imagen 4)
// =====================
async function generateImages() {
  console.log('\n📸 [STEP 1] 이미지 생성 (Imagen 4)...');

  const puppyPrompt = SCRIPT.puppy_character.image_prompt;
  const stylePrefix = 'photorealistic, ultra realistic, 8k, professional pet photography';
  const styleSuffix = 'DSLR quality, natural lighting, sharp focus, cute adorable';

  const IMAGEN_URL = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict';

  const results = [];
  const outputFolder = path.join(CONFIG.OUTPUT_DIR, SCRIPT.folder_name);
  fs.mkdirSync(outputFolder, { recursive: true });

  for (const segment of SCRIPT.script_segments) {
    const scenePrompt = `${puppyPrompt}, ${segment.puppy_pose}, ${segment.background}, ${segment.emotion} expression`;
    const finalPrompt = `${scenePrompt}, ${stylePrefix}, ${styleSuffix}`;

    console.log(`  - Scene ${segment.index}: ${segment.puppy_pose.substring(0, 40)}...`);

    try {
      const response = await axios.post(IMAGEN_URL, {
        instances: [{ prompt: finalPrompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: '9:16',
          personGeneration: 'allow_adult'
        }
      }, {
        headers: {
          'x-goog-api-key': CONFIG.GEMINI_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 120000
      });

      if (response.data.predictions?.[0]?.bytesBase64Encoded) {
        const filename = `scene_${String(segment.index).padStart(3, '0')}.png`;
        const filepath = path.join(outputFolder, filename);

        const imageBuffer = Buffer.from(response.data.predictions[0].bytesBase64Encoded, 'base64');
        fs.writeFileSync(filepath, imageBuffer);

        results.push({
          index: segment.index,
          filename,
          filepath,
          ...segment
        });

        console.log(`    ✓ 저장: ${filename}`);
      }
    } catch (error) {
      console.error(`    ✗ Scene ${segment.index} 실패:`, error.response?.data?.error?.message || error.message);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n📸 이미지 생성 완료: ${results.length}/${SCRIPT.script_segments.length}`);
  return results;
}

// =====================
// 2. 음성 생성 (ElevenLabs TTS)
// =====================
async function generateTTS() {
  console.log('\n🎤 [STEP 2] 음성 생성 (ElevenLabs TTS)...');

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, SCRIPT.folder_name);
  const results = [];

  for (const segment of SCRIPT.script_segments) {
    const voiceId = segment.speaker === 'puppy' ? CONFIG.VOICE_PUPPY : CONFIG.VOICE_OWNER;
    const speakerIcon = segment.speaker === 'puppy' ? '🐕' : '👤';

    console.log(`  - Scene ${segment.index} ${speakerIcon} [${segment.speaker}]: "${segment.narration.substring(0, 25)}..."`);

    try {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          text: segment.narration,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.5, use_speaker_boost: true }
        },
        {
          headers: { 'xi-api-key': CONFIG.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
          responseType: 'arraybuffer'
        }
      );

      const audioBuffer = Buffer.from(response.data);
      const audioFilename = `audio_${String(segment.index).padStart(3, '0')}.mp3`;
      const audioFilepath = path.join(outputFolder, audioFilename);
      fs.writeFileSync(audioFilepath, audioBuffer);

      results.push({
        index: segment.index,
        filename: audioFilename,
        filepath: audioFilepath,
        speaker: segment.speaker,
        narration: segment.narration,
      });

      console.log(`    ✓ 저장: ${audioFilename} (${(audioBuffer.length / 1024).toFixed(1)}KB)`);

    } catch (error) {
      console.error(`    ✗ Scene ${segment.index} TTS 실패:`, error.response?.data || error.message);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n🎤 TTS 생성 완료: ${results.length}/${SCRIPT.script_segments.length}`);
  return results;
}

// =====================
// 3. Hedra 비디오 생성
// =====================
async function uploadHedraAsset(type, name, filePath) {
  const assetResponse = await axios.post('https://api.hedra.com/web-app/public/assets', {
    name, type
  }, {
    headers: { 'x-api-key': CONFIG.HEDRA_API_KEY, 'Content-Type': 'application/json' }
  });

  const buffer = fs.readFileSync(filePath);
  const formData = new FormData();
  const contentType = type === 'image' ? 'image/png' : 'audio/mpeg';
  formData.append('file', buffer, { filename: name, contentType });

  await axios.post(`https://api.hedra.com/web-app/public/assets/${assetResponse.data.id}/upload`, formData, {
    headers: { 'x-api-key': CONFIG.HEDRA_API_KEY, ...formData.getHeaders() }
  });

  return assetResponse.data.id;
}

async function generateHedraVideo(imageFile, audioFile, hedraPrompt, outputPath, sceneIndex) {
  const imageAssetId = await uploadHedraAsset('image', `scene_${sceneIndex}.png`, imageFile);
  const audioAssetId = await uploadHedraAsset('audio', `audio_${sceneIndex}.mp3`, audioFile);

  const genResponse = await axios.post('https://api.hedra.com/web-app/public/generations', {
    type: 'video',
    ai_model_id: HEDRA_CHARACTER_3_MODEL_ID,
    start_keyframe_id: imageAssetId,
    audio_id: audioAssetId,
    generated_video_inputs: {
      resolution: '720p',
      aspect_ratio: '9:16',
      text_prompt: hedraPrompt
    }
  }, {
    headers: { 'x-api-key': CONFIG.HEDRA_API_KEY, 'Content-Type': 'application/json' }
  });

  const genId = genResponse.data.id;

  // 완료 대기
  let videoUrl = null;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const status = await axios.get(`https://api.hedra.com/web-app/public/generations/${genId}/status`, {
      headers: { 'x-api-key': CONFIG.HEDRA_API_KEY }
    });

    if (i % 4 === 0) console.log(`      [${(i + 1) * 5}초] 상태: ${status.data.status}`);

    if (status.data.status === 'complete') {
      videoUrl = status.data.url || status.data.download_url;
      break;
    }
    if (status.data.status === 'error') {
      throw new Error(status.data.error_message || 'Generation failed');
    }
  }

  if (!videoUrl) throw new Error('Timeout');

  const videoResponse = await axios.get(videoUrl, { responseType: 'arraybuffer' });
  fs.writeFileSync(outputPath, Buffer.from(videoResponse.data));
  return outputPath;
}

async function generateVideos(images, audioFiles) {
  console.log('\n🎬 [STEP 3] 비디오 생성 (Hedra Character 3)...');
  console.log('  - puppy (강아지 말하기) → 입 움직임 + 감정 표현');
  console.log('  - owner (주인 말하기) → 고개 끄덕임/반응 (입 다물고)');

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, SCRIPT.folder_name);
  const results = [];

  for (const image of images) {
    const segment = SCRIPT.script_segments.find(s => s.index === image.index);
    const audio = audioFiles.find(a => a.index === image.index);
    const speakerIcon = segment.speaker === 'puppy' ? '🐕' : '👤';
    const actionDesc = segment.speaker === 'puppy' ? '말하기' : '듣기/반응';

    console.log(`\n  - Scene ${image.index} ${speakerIcon} [${segment.speaker}→${actionDesc}]`);
    console.log(`    대사: "${segment.narration.substring(0, 30)}..."`);
    console.log(`    프롬프트: "${segment.hedra_prompt.substring(0, 50)}..."`);

    if (!audio) {
      console.log(`    ⚠️ 오디오 없음 - 스킵`);
      continue;
    }

    try {
      const videoFilename = `video_${String(image.index).padStart(3, '0')}_hedra.mp4`;
      const videoFilepath = path.join(outputFolder, videoFilename);

      await generateHedraVideo(image.filepath, audio.filepath, segment.hedra_prompt, videoFilepath, image.index);

      const stats = fs.statSync(videoFilepath);
      console.log(`    ✓ 완료: ${videoFilename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

      results.push({
        index: image.index,
        filename: videoFilename,
        filepath: videoFilepath,
        speaker: segment.speaker,
        narration: segment.narration,
      });

    } catch (error) {
      console.error(`    ✗ Hedra 실패:`, error.message);
    }
  }

  const puppyCount = results.filter(v => v.speaker === 'puppy').length;
  const ownerCount = results.filter(v => v.speaker === 'owner').length;
  console.log(`\n🎬 비디오 생성 완료: ${results.length}/${images.length} (puppy: ${puppyCount}, owner: ${ownerCount})`);

  return results;
}

// =====================
// 4. 최종 합성 (FFmpeg)
// =====================
function concatenateVideos(videos, outputPath) {
  const outputFolder = path.dirname(outputPath);
  const sortedVideos = [...videos].sort((a, b) => a.index - b.index);

  // concat 파일 생성
  const concatFilepath = path.join(outputFolder, 'concat.txt');
  const concatContent = sortedVideos.map(v => `file '${v.filename}'`).join('\n');
  fs.writeFileSync(concatFilepath, concatContent);

  // FFmpeg concat
  const cmd = `cd "${outputFolder}" && ffmpeg -y -f concat -safe 0 -i concat.txt -c copy "${path.basename(outputPath)}"`;
  execSync(cmd, { stdio: 'pipe' });

  return outputPath;
}

// =====================
// 메인 실행
// =====================
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🎬 Hedra 파이프라인 테스트');
  console.log('  (speaker별 동작 모션: puppy=말하기, owner=듣기/반응)');
  console.log('═══════════════════════════════════════════════════════════');

  // API 키 체크
  if (!CONFIG.GEMINI_API_KEY || !CONFIG.ELEVENLABS_API_KEY || !CONFIG.HEDRA_API_KEY) {
    console.error('\n❌ 필수 API 키가 없습니다:');
    console.error(`   GEMINI_API_KEY: ${CONFIG.GEMINI_API_KEY ? '✓' : '✗'}`);
    console.error(`   ELEVENLABS_API_KEY: ${CONFIG.ELEVENLABS_API_KEY ? '✓' : '✗'}`);
    console.error(`   HEDRA_API_KEY: ${CONFIG.HEDRA_API_KEY ? '✓' : '✗'}`);
    process.exit(1);
  }

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, SCRIPT.folder_name);

  console.log(`\n📁 출력 폴더: ${outputFolder}`);
  console.log(`📝 총 ${SCRIPT.script_segments.length}개 씬`);
  console.log('\n📋 스크립트 (speaker별 동작):');
  SCRIPT.script_segments.forEach(s => {
    const marker = s.speaker === 'puppy' ? '🐕 말하기' : '👤 듣기';
    console.log(`   ${s.index}. [${marker}] ${s.narration.substring(0, 30)}...`);
  });

  // Step 1: 이미지 생성
  const images = await generateImages();
  if (images.length === 0) {
    console.error('\n❌ 이미지 생성 실패');
    process.exit(1);
  }

  // Step 2: TTS 음성 생성
  const audioFiles = await generateTTS();
  if (audioFiles.length === 0) {
    console.error('\n❌ TTS 생성 실패');
    process.exit(1);
  }

  // Step 3: Hedra 비디오 생성
  const videos = await generateVideos(images, audioFiles);

  // Step 4: 최종 합성
  if (videos.length > 0) {
    console.log('\n🔗 [STEP 4] 최종 영상 합성 (FFmpeg)...');
    const finalPath = path.join(outputFolder, 'final_hedra_shorts.mp4');
    concatenateVideos(videos, finalPath);
    const stats = fs.statSync(finalPath);
    console.log(`  ✓ 최종 영상: final_hedra_shorts.mp4 (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  }

  // 결과 요약
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  📊 결과 요약');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📸 이미지: ${images.length}개`);
  console.log(`  🎤 TTS 음성: ${audioFiles.length}개`);
  console.log(`  🎬 Hedra 비디오: ${videos.length}개`);
  console.log(`     - puppy (말하기): ${videos.filter(v => v.speaker === 'puppy').length}개`);
  console.log(`     - owner (듣기/반응): ${videos.filter(v => v.speaker === 'owner').length}개`);
  console.log(`  📁 출력: ${outputFolder}`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
