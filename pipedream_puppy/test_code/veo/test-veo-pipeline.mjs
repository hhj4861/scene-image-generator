/**
 * Veo 3 Fast 기반 파이프라인 테스트
 *
 * speaker별 동작 모션:
 * - puppy: 입 움직임 + 감정 표현 + Veo 자체 음성 (말하는 강아지)
 * - owner: 고개 끄덕임/반응 (듣는 강아지, 입 다물고) + TTS 음성 합성
 *
 * 파이프라인:
 * 1. 이미지 생성 (Imagen 4)
 * 2. 비디오 생성 (Veo 3 Fast)
 *    - puppy: Veo 자체 음성 포함 (비용: $0.40/초)
 *    - owner: 음성 없이 영상만 생성 (비용: $0.20/초) + TTS 합성
 * 3. TTS 생성 (owner 씬만 - ElevenLabs)
 * 4. FFmpeg로 owner 씬 음성 합성
 * 5. 최종 합성 (FFmpeg concat)
 */

import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =====================
// 환경 설정
// =====================
const CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || '',

  VOICE_OWNER: 'XB0fDUnXU5powFXDhCwa', // 인자한 할머니 음성 (Charlotte - warm grandma)

  OUTPUT_DIR: path.join(__dirname, 'test_output'),
};

// =====================
// 테스트 스크립트 (speaker별 veo_prompt 포함)
// =====================
const SCRIPT = {
  folder_name: `veo_test_${new Date().toISOString().split('T')[0].replace(/-/g, '')}_${uuidv4().split('-')[0]}`,

  puppy_character: {
    name: '땅콩',
    breed: 'Pomeranian',
    image_prompt: 'cute fluffy orange Pomeranian puppy, small round face, bright dark eyes, fluffy orange-cream fur, tiny black nose, pointed ears, adorable expression'
  },

  script_segments: [
    {
      index: 1,
      speaker: 'puppy',
      narration: '할미! 땅콩이 사자후 보여줄까? 어흥! 내가 제일 쎄다!',
      emotion: 'excited',
      puppy_pose: 'standing proudly with chest out, confident pose',
      background: 'cozy living room with soft warm lighting',
      // puppy: Veo 자체 음성 사용 - 2-3살 여자아이 목소리 + 사자 포효
      veo_prompt: "A cute fluffy Pomeranian puppy talking with clear lip sync mouth movements. 2-3 year old toddler girl voice, cute innocent baby speech. The puppy opens and closes its mouth naturally while saying: '할미! 땅콩이 사자후 보여줄까?' then makes a loud powerful lion ROAR sound '어흥!' then toddler voice '내가 제일 쎄다!' Proud confident expression, chest puffed out, bright sparkling eyes, synchronized lip movements, cozy living room",
      include_audio: true,
    },
    {
      index: 2,
      speaker: 'owner',
      narration: '우리 땅콩이 진짜 호랑이네! 으르렁!',
      emotion: 'amused',
      puppy_pose: 'looking up happily, pleased with praise',
      background: 'cozy living room with soft warm lighting',
      // owner(할머니): 강아지는 입 다물고 기쁘게 반응
      veo_prompt: "A cute fluffy Pomeranian puppy with a happy smile, looking up at camera with pleased expression, mouth closed in gentle smile, NOT talking, NOT opening mouth, just smiling happily and nodding gently, bright joyful eyes, ears relaxed, subtle happy head movements, receiving praise contentedly, cozy living room",
      include_audio: false,
    },
    {
      index: 3,
      speaker: 'puppy',
      narration: '에헤헤... 이번엔 미어캣! 땅콩이 미어캣도 잘해! 읭?',
      emotion: 'playful',
      puppy_pose: 'standing on hind legs like meerkat, looking around curiously',
      background: 'cozy living room with soft warm lighting',
      // puppy: 2-3살 여자아이 목소리로 장난스럽게 미어캣 흉내
      veo_prompt: "A cute fluffy Pomeranian puppy talking playfully with lip sync. 2-3 year old toddler girl voice saying: '에헤헤... 이번엔 미어캣! 땅콩이 미어캣도 잘해! 읭?' Standing upright on hind legs like meerkat, looking around curiously while speaking, playful giggly expression, mouth opening and closing naturally, head tilting side to side, cozy living room",
      include_audio: true,
    },
    {
      index: 4,
      speaker: 'owner',
      narration: '그래, 땅콩이 미어캣처럼 두리번두리번 해봐!',
      emotion: 'encouraging',
      puppy_pose: 'standing on hind legs, looking left and right',
      background: 'cozy living room with soft warm lighting',
      // owner(할머니): 강아지는 입 다물고 두리번거림
      veo_prompt: "A cute fluffy Pomeranian puppy standing on hind legs like meerkat, mouth closed NOT talking, looking left and right curiously, alert attentive expression, head turning side to side smoothly, bright curious eyes scanning around, ears perked up and moving, gentle swaying motion, cozy living room",
      include_audio: false,
    },
    {
      index: 5,
      speaker: 'owner',
      narration: '우와~ 우리 땅콩이 미어캣 진짜 잘한다! 간식 줄까?',
      emotion: 'impressed',
      puppy_pose: 'standing proudly, ears perked up hearing treat',
      background: 'cozy living room with soft warm lighting',
      // owner(할머니): 강아지는 입 다물고 자랑스러워하며 간식 기대
      veo_prompt: "A cute fluffy Pomeranian puppy standing proudly with closed mouth NOT talking, ears perked up excitedly hearing the word treat, bright anticipating eyes, tail wagging, proud happy expression, subtle excited movements, looking up expectantly, cozy living room",
      include_audio: false,
    },
    {
      index: 6,
      speaker: 'puppy',
      narration: '간식?! 땅콩이 간식 좋아! 냠냠냠! 할미 사랑해!',
      emotion: 'excited',
      puppy_pose: 'eating treat happily, joyful expression',
      background: 'cozy living room with soft warm lighting',
      // puppy: 2-3살 여자아이 목소리로 간식 먹으며 행복하게
      veo_prompt: "A cute fluffy Pomeranian puppy talking excitedly with lip sync. 2-3 year old toddler girl voice saying: '간식?! 땅콩이 간식 좋아! 냠냠냠! 할미 사랑해!' Eating a small treat happily, mouth opening and closing, chewing motions, extremely happy joyful expression, bright sparkling eyes, tail wagging energetically, loving grateful look, cozy living room",
      include_audio: true,
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
// 2. Veo 3 Fast 비디오 생성
// =====================
async function generateVeoVideo(ai, imageFile, veoPrompt, includeAudio, outputPath) {
  const imageBuffer = fs.readFileSync(imageFile);
  const imageBase64 = imageBuffer.toString('base64');

  let operation = await ai.models.generateVideos({
    model: 'veo-3.0-fast-generate-001',
    prompt: veoPrompt,
    image: {
      imageBytes: imageBase64,
      mimeType: 'image/png',
    },
    config: {
      aspectRatio: '9:16',
      durationSeconds: 4,
      includeAudio: includeAudio,
    },
  });

  let pollCount = 0;
  while (!operation.done) {
    await new Promise(r => setTimeout(r, 5000));
    pollCount++;
    if (pollCount % 4 === 0) console.log(`      [${pollCount * 5}초] 대기 중...`);
    operation = await ai.operations.getVideosOperation({ operation });

    if (pollCount > 60) throw new Error('Veo 타임아웃');
  }

  if (operation.response?.generatedVideos?.length > 0) {
    await ai.files.download({
      file: operation.response.generatedVideos[0].video,
      downloadPath: outputPath,
    });
    return outputPath;
  }

  throw new Error('Veo 응답에 비디오 없음');
}

async function generateVideos(images) {
  console.log('\n🎬 [STEP 2] 비디오 생성 (Veo 3 Fast)...');
  console.log('  - puppy → Veo 자체 음성 포함 ($0.40/초)');
  console.log('  - owner → 음성 없이 영상만 ($0.20/초) + TTS 합성');

  const ai = new GoogleGenAI({ apiKey: CONFIG.GEMINI_API_KEY });
  const outputFolder = path.join(CONFIG.OUTPUT_DIR, SCRIPT.folder_name);
  const results = [];

  for (const image of images) {
    const segment = SCRIPT.script_segments.find(s => s.index === image.index);
    const speakerIcon = segment.speaker === 'puppy' ? '🐕' : '👤';
    const audioDesc = segment.include_audio ? '음성 포함' : '음성 없음';

    console.log(`\n  - Scene ${segment.index} ${speakerIcon} [${segment.speaker}] (${audioDesc})`);
    console.log(`    대사: "${segment.narration.substring(0, 30)}..."`);
    console.log(`    프롬프트: "${segment.veo_prompt.substring(0, 50)}..."`);

    try {
      const videoFilename = `video_${String(segment.index).padStart(3, '0')}_veo.mp4`;
      const videoFilepath = path.join(outputFolder, videoFilename);

      await generateVeoVideo(ai, image.filepath, segment.veo_prompt, segment.include_audio, videoFilepath);

      const stats = fs.statSync(videoFilepath);
      console.log(`    ✓ 완료: ${videoFilename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

      results.push({
        index: segment.index,
        filename: videoFilename,
        filepath: videoFilepath,
        speaker: segment.speaker,
        narration: segment.narration,
        include_audio: segment.include_audio,
      });

    } catch (error) {
      console.error(`    ✗ Veo 실패:`, error.message);
    }

    // Rate limit 방지
    await new Promise(r => setTimeout(r, 2000));
  }

  const puppyCount = results.filter(v => v.speaker === 'puppy').length;
  const ownerCount = results.filter(v => v.speaker === 'owner').length;
  console.log(`\n🎬 비디오 생성 완료: ${results.length}/${images.length} (puppy: ${puppyCount}, owner: ${ownerCount})`);

  return results;
}

// =====================
// 3. TTS 생성 (owner 씬만)
// =====================
async function generateOwnerTTS(videos) {
  console.log('\n🎤 [STEP 3] TTS 생성 (owner 씬만 - ElevenLabs)...');

  const ownerVideos = videos.filter(v => v.speaker === 'owner');
  if (ownerVideos.length === 0) {
    console.log('  ⚠️ owner 씬 없음 - TTS 스킵');
    return [];
  }

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, SCRIPT.folder_name);
  const results = [];

  for (const video of ownerVideos) {
    const segment = SCRIPT.script_segments.find(s => s.index === video.index);

    console.log(`  - Scene ${video.index}: "${segment.narration.substring(0, 25)}..."`);

    try {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${CONFIG.VOICE_OWNER}`,
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
      const audioFilename = `audio_${String(video.index).padStart(3, '0')}_owner.mp3`;
      const audioFilepath = path.join(outputFolder, audioFilename);
      fs.writeFileSync(audioFilepath, audioBuffer);

      results.push({
        index: video.index,
        filename: audioFilename,
        filepath: audioFilepath,
        videoFilepath: video.filepath,
      });

      console.log(`    ✓ 저장: ${audioFilename} (${(audioBuffer.length / 1024).toFixed(1)}KB)`);

    } catch (error) {
      console.error(`    ✗ TTS 실패:`, error.response?.data || error.message);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n🎤 TTS 생성 완료: ${results.length}/${ownerVideos.length}`);
  return results;
}

// =====================
// 4. FFmpeg로 owner 씬 음성 합성
// =====================
function combineVideoAudio(videoPath, audioPath, outputPath) {
  const cmd = `ffmpeg -y -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${outputPath}"`;
  execSync(cmd, { stdio: 'pipe' });
  return outputPath;
}

async function combineOwnerAudio(videos, ownerAudioFiles) {
  console.log('\n🔗 [STEP 4] owner 씬 음성 합성 (FFmpeg)...');

  if (ownerAudioFiles.length === 0) {
    console.log('  ⚠️ owner TTS 없음 - 합성 스킵');
    return videos;
  }

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, SCRIPT.folder_name);
  const updatedVideos = [...videos];

  for (const audio of ownerAudioFiles) {
    const videoIndex = updatedVideos.findIndex(v => v.index === audio.index);
    if (videoIndex === -1) continue;

    const video = updatedVideos[videoIndex];
    console.log(`  - Scene ${audio.index}: 영상 + TTS 합성`);

    try {
      const combinedFilename = `video_${String(audio.index).padStart(3, '0')}_veo_combined.mp4`;
      const combinedFilepath = path.join(outputFolder, combinedFilename);

      combineVideoAudio(video.filepath, audio.filepath, combinedFilepath);

      // 업데이트
      updatedVideos[videoIndex] = {
        ...video,
        filename: combinedFilename,
        filepath: combinedFilepath,
        include_audio: true,
      };

      console.log(`    ✓ 완료: ${combinedFilename}`);

    } catch (error) {
      console.error(`    ✗ 합성 실패:`, error.message);
    }
  }

  console.log(`\n🔗 owner 음성 합성 완료`);
  return updatedVideos;
}

// =====================
// 5. 최종 합성 (FFmpeg concat)
// =====================
function concatenateVideos(videos, outputPath) {
  console.log('\n🎥 [STEP 5] 최종 영상 합성 (FFmpeg concat)...');

  const outputFolder = path.dirname(outputPath);
  const sortedVideos = [...videos].sort((a, b) => a.index - b.index);

  // concat 파일 생성
  const concatFilepath = path.join(outputFolder, 'concat.txt');
  const concatContent = sortedVideos.map(v => `file '${v.filename}'`).join('\n');
  fs.writeFileSync(concatFilepath, concatContent);

  // FFmpeg concat
  const cmd = `cd "${outputFolder}" && ffmpeg -y -f concat -safe 0 -i concat.txt -c copy "${path.basename(outputPath)}"`;
  execSync(cmd, { stdio: 'pipe' });

  const stats = fs.statSync(outputPath);
  console.log(`  ✓ 최종 영상: ${path.basename(outputPath)} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

  return outputPath;
}

// =====================
// 비용 계산
// =====================
function calculateCost(videos) {
  let totalCost = 0;
  const duration = 4; // 각 영상 4초

  for (const video of videos) {
    if (video.speaker === 'puppy') {
      // Veo 음성 포함: $0.40/초
      totalCost += duration * 0.40;
    } else {
      // Veo 음성 없음: $0.20/초
      totalCost += duration * 0.20;
    }
  }

  // TTS 비용은 미미하므로 무시
  return totalCost;
}

// =====================
// 메인 실행
// =====================
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🎬 Veo 3 Fast 파이프라인 테스트');
  console.log('  (puppy=Veo음성, owner=TTS합성)');
  console.log('═══════════════════════════════════════════════════════════');

  // API 키 체크
  if (!CONFIG.GEMINI_API_KEY || !CONFIG.ELEVENLABS_API_KEY) {
    console.error('\n❌ 필수 API 키가 없습니다:');
    console.error(`   GEMINI_API_KEY: ${CONFIG.GEMINI_API_KEY ? '✓' : '✗'}`);
    console.error(`   ELEVENLABS_API_KEY: ${CONFIG.ELEVENLABS_API_KEY ? '✓' : '✗'}`);
    process.exit(1);
  }

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, SCRIPT.folder_name);

  console.log(`\n📁 출력 폴더: ${outputFolder}`);
  console.log(`📝 총 ${SCRIPT.script_segments.length}개 씬`);
  console.log('\n📋 스크립트 (speaker별 음성 처리):');
  SCRIPT.script_segments.forEach(s => {
    const marker = s.speaker === 'puppy' ? '🐕 Veo음성' : '👤 TTS합성';
    console.log(`   ${s.index}. [${marker}] ${s.narration.substring(0, 28)}...`);
  });

  // 예상 비용
  const puppyCount = SCRIPT.script_segments.filter(s => s.speaker === 'puppy').length;
  const ownerCount = SCRIPT.script_segments.filter(s => s.speaker === 'owner').length;
  const estimatedCost = (puppyCount * 4 * 0.40) + (ownerCount * 4 * 0.20);
  console.log(`\n💰 예상 비용: $${estimatedCost.toFixed(2)}`);
  console.log(`   - puppy (${puppyCount}개 × 4초 × $0.40): $${(puppyCount * 4 * 0.40).toFixed(2)}`);
  console.log(`   - owner (${ownerCount}개 × 4초 × $0.20): $${(ownerCount * 4 * 0.20).toFixed(2)}`);

  // Step 1: 이미지 생성
  const images = await generateImages();
  if (images.length === 0) {
    console.error('\n❌ 이미지 생성 실패');
    process.exit(1);
  }

  // Step 2: Veo 비디오 생성
  const videos = await generateVideos(images);
  if (videos.length === 0) {
    console.error('\n❌ 비디오 생성 실패');
    process.exit(1);
  }

  // Step 3: owner TTS 생성
  const ownerAudioFiles = await generateOwnerTTS(videos);

  // Step 4: owner 씬 음성 합성
  const finalVideos = await combineOwnerAudio(videos, ownerAudioFiles);

  // Step 5: 최종 합성
  const finalPath = path.join(outputFolder, 'final_veo_shorts.mp4');
  concatenateVideos(finalVideos, finalPath);

  // 실제 비용 계산
  const actualCost = calculateCost(videos);

  // 결과 요약
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  📊 결과 요약');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📸 이미지: ${images.length}개`);
  console.log(`  🎬 Veo 비디오: ${videos.length}개`);
  console.log(`     - puppy (Veo 음성): ${videos.filter(v => v.speaker === 'puppy').length}개`);
  console.log(`     - owner (TTS 합성): ${videos.filter(v => v.speaker === 'owner').length}개`);
  console.log(`  🎤 owner TTS: ${ownerAudioFiles.length}개`);
  console.log(`  💰 예상 비용: $${actualCost.toFixed(2)}`);
  console.log(`  📁 출력: ${outputFolder}`);
  console.log(`  🎥 최종 영상: final_veo_shorts.mp4`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
