/**
 * Step 2~6 테스트 (이미지 생성 스킵)
 * 기존 이미지를 사용해서 TTS → 자막 → 비디오 → BGM → 합성 테스트
 *
 * 실행: node test-steps-2-to-6.mjs
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =====================
// 환경 설정
// =====================
const CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  HEDRA_API_KEY: process.env.HEDRA_API_KEY || '',
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  MUSICAPI_KEY: process.env.MUSICAPI_KEY || '',
  CREATOMATE_API_KEY: process.env.CREATOMATE_API_KEY || '',

  // ElevenLabs 음성 설정
  VOICE_PUPPY: process.env.VOICE_PUPPY || 'ocZQ262SsZb9RIxcQBOj', // Lulu Lollipop - 귀여운 아기 목소리 (high-pitched, giggly, youthful)
  VOICE_OWNER: process.env.VOICE_OWNER || 'iP95p4xoKVk53GoZ742B', // Chris (casual, middle-aged male) - 인자한 남성 목소리

  // 기존 이미지 폴더
  EXISTING_FOLDER: 'test_20251129_348fc310',
  OUTPUT_DIR: path.join(__dirname, 'test_output'),
};

// =====================
// 테스트용 고정 스크립트 (땅콩이)
// =====================
const FIXED_SCRIPT = {
  folder_name: CONFIG.EXISTING_FOLDER, // 기존 폴더 사용
  language: 'korean',
  title: {
    korean: '땅콩이의 사자후 vs 미어캣',
    japanese: '땅콩の獅子吼 vs ミーアキャット',
    english: "Peanut's Lion Roar vs Meerkat"
  },

  characters: {
    puppy: {
      name: '땅콩',
      voice_type: 'female_child',
      voice_description: 'cute baby-like female voice'
    },
    owner: {
      name: '아빠',
      voice_type: 'male_adult',
      voice_description: 'warm gentle male voice'
    }
  },

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
      puppy_pose: 'standing proudly with chest out, mouth open like roaring',
      background: 'cozy living room with soft lighting',
      start_time: 0,
      end_time: 5,
      duration: 5
    },
    {
      index: 2,
      speaker: 'owner',
      narration: '우리 땅콩이 진짜 호랑이네! 으르렁!',
      emotion: 'amused',
      puppy_pose: 'looking up at camera with happy smile',
      background: 'cozy living room with soft lighting',
      start_time: 5,
      end_time: 8,
      duration: 3
    },
    {
      index: 3,
      speaker: 'puppy',
      narration: '에헤헤... 이번엔 미어캣! 땅콩이 미어캣도 잘해! 읭?',
      emotion: 'playful',
      puppy_pose: 'standing on hind legs like meerkat, looking around',
      background: 'cozy living room with soft lighting',
      start_time: 8,
      end_time: 13,
      duration: 5
    },
    {
      index: 4,
      speaker: 'owner',
      narration: '그래, 땅콩이 미어캣처럼 두리번두리번 해봐!',
      emotion: 'encouraging',
      puppy_pose: 'standing on hind legs, looking left and right curiously',
      background: 'cozy living room with soft lighting',
      start_time: 13,
      end_time: 16,
      duration: 3
    },
    {
      index: 5,
      speaker: 'puppy',
      narration: '읭? 읭? 꺄악! 털 젖었어! 미어캣 아니고 물에 빠진 쥐다!',
      emotion: 'surprised',
      puppy_pose: 'wet fur, shocked wide eyes, water droplets on face',
      background: 'bathroom with tiles, water splashes',
      start_time: 16,
      end_time: 22,
      duration: 6
    },
    {
      index: 6,
      speaker: 'owner',
      narration: '아이고, 우리 땅콩이 쥐돌이 됐네! 괜찮아, 아빠가 닦아줄게!',
      emotion: 'loving',
      puppy_pose: 'wrapped in fluffy white towel, only face visible, cute look',
      background: 'warm cozy bathroom',
      start_time: 22,
      end_time: 27,
      duration: 5
    }
  ],

  total_duration_seconds: 27
};

// =====================
// 기존 이미지 로드
// =====================
function loadExistingImages(script) {
  console.log('\n📸 [STEP 1] 기존 이미지 로드...');

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, script.folder_name);
  const results = [];

  for (const segment of script.script_segments) {
    const filename = `scene_${String(segment.index).padStart(3, '0')}.png`;
    const filepath = path.join(outputFolder, filename);

    if (fs.existsSync(filepath)) {
      results.push({
        index: segment.index,
        filename,
        filepath,
        narration: segment.narration,
        speaker: segment.speaker,
        emotion: segment.emotion,
        puppy_pose: segment.puppy_pose,
        duration: segment.duration,
        start: segment.start_time,
        end: segment.end_time
      });
      console.log(`  ✓ ${filename} (${segment.speaker})`);
    } else {
      console.log(`  ✗ ${filename} 없음`);
    }
  }

  console.log(`\n📸 이미지 로드 완료: ${results.length}/${script.script_segments.length}`);
  return results;
}

// =====================
// 2. 음성 생성 (ElevenLabs TTS - Speaker별)
// =====================
async function generateTTS(script) {
  console.log('\n🎤 [STEP 2] 음성 생성 (ElevenLabs TTS)...');

  if (!CONFIG.ELEVENLABS_API_KEY) {
    console.log('  ⚠️ ELEVENLABS_API_KEY 없음 - TTS 스킵');
    return [];
  }

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, script.folder_name);
  const results = [];

  for (const segment of script.script_segments) {
    const voiceId = segment.speaker === 'puppy' ? CONFIG.VOICE_PUPPY : CONFIG.VOICE_OWNER;
    const speakerIcon = segment.speaker === 'puppy' ? '🐕' : '👤';

    console.log(`  - Scene ${segment.index} ${speakerIcon} [${segment.speaker}]: "${segment.narration.substring(0, 25)}..."`);

    try {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          text: segment.narration,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        },
        {
          headers: {
            'xi-api-key': CONFIG.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
          },
          responseType: 'arraybuffer',
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
        duration: segment.duration,
        start: segment.start_time,
        end: segment.end_time,
      });

      console.log(`    ✓ 저장: ${audioFilename} (${(audioBuffer.length / 1024).toFixed(1)}KB)`);

    } catch (error) {
      console.error(`    ✗ Scene ${segment.index} TTS 실패:`, error.response?.data || error.message);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n🎤 TTS 생성 완료: ${results.length}/${script.script_segments.length}`);
  return results;
}

// =====================
// 3. 자막 생성 (Whisper 또는 스크립트 기반)
// =====================
async function generateSubtitles(audioFiles, script) {
  console.log('\n📝 [STEP 3] 자막 생성...');

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, script.folder_name);

  // Whisper 없으면 스크립트 기반 자막 사용
  if (!CONFIG.OPENAI_API_KEY || audioFiles.length === 0) {
    console.log('  → 스크립트 기반 자막 사용');

    const results = script.script_segments.map(seg => ({
      index: seg.index,
      start: seg.start_time,
      end: seg.end_time,
      text: seg.narration,
      speaker: seg.speaker,
    }));

    // SRT 파일 저장
    const srtContent = results.map((sub, i) => {
      const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.round((seconds % 1) * 1000);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
      };
      return `${i + 1}\n${formatTime(sub.start)} --> ${formatTime(sub.end)}\n${sub.text}\n`;
    }).join('\n');

    fs.writeFileSync(path.join(outputFolder, 'subtitles.srt'), srtContent);
    fs.writeFileSync(path.join(outputFolder, 'subtitles.json'), JSON.stringify(results, null, 2));

    console.log(`\n📝 자막 생성 완료: ${results.length}개 세그먼트`);
    return results;
  }

  // Whisper 사용
  console.log('  → Whisper로 자막 생성...');
  const results = [];
  let cumulativeTime = 0;

  for (const audio of audioFiles) {
    console.log(`  - Scene ${audio.index}: ${audio.filename}`);

    try {
      const audioBuffer = fs.readFileSync(audio.filepath);

      const formData = new FormData();
      formData.append('file', audioBuffer, {
        filename: 'audio.mp3',
        contentType: 'audio/mpeg',
      });
      formData.append('model', 'whisper-1');
      formData.append('language', 'ko');
      formData.append('response_format', 'verbose_json');
      formData.append('timestamp_granularities[]', 'segment');

      const response = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`,
            ...formData.getHeaders(),
          },
        }
      );

      const segments = response.data.segments || [];
      for (const seg of segments) {
        results.push({
          index: audio.index,
          start: cumulativeTime + seg.start,
          end: cumulativeTime + seg.end,
          text: seg.text.trim(),
          speaker: audio.speaker,
        });
      }

      cumulativeTime += response.data.duration || audio.duration;
      console.log(`    ✓ ${segments.length}개 세그먼트 (${response.data.duration?.toFixed(1)}초)`);

    } catch (error) {
      console.error(`    ✗ Whisper 실패:`, error.response?.data || error.message);

      // 실패 시 스크립트 기반 자막 추가
      const seg = script.script_segments.find(s => s.index === audio.index);
      if (seg) {
        results.push({
          index: seg.index,
          start: seg.start_time,
          end: seg.end_time,
          text: seg.narration,
          speaker: seg.speaker,
        });
      }
    }

    await new Promise(r => setTimeout(r, 500));
  }

  // SRT 파일 저장
  const srtContent = results.map((sub, i) => {
    const formatTime = (seconds) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.round((seconds % 1) * 1000);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    };
    return `${i + 1}\n${formatTime(sub.start)} --> ${formatTime(sub.end)}\n${sub.text}\n`;
  }).join('\n');

  fs.writeFileSync(path.join(outputFolder, 'subtitles.srt'), srtContent);
  fs.writeFileSync(path.join(outputFolder, 'subtitles.json'), JSON.stringify(results, null, 2));

  console.log(`\n📝 자막 생성 완료: ${results.length}개 세그먼트`);
  return results;
}

// =====================
// 4. 비디오 생성 (Speaker별 분기: puppy→Hedra, owner→Veo)
// =====================
async function generateVideos(images, audioFiles, script) {
  console.log('\n🎬 [STEP 4] 비디오 생성 시작 (Speaker별 분기)...');
  console.log('  - puppy (강아지 대사) → Hedra (립싱크)');
  console.log('  - owner (주인 대사) → Veo (모션)');

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, script.folder_name);
  const results = [];

  // Hedra 모델 ID 조회 - Hedra Character 3 (requires_audio_input: true)
  // d1dd37a3-e39a-4854-a298-6510289f9cf2 = Hedra Character 3 (립싱크용)
  const HEDRA_CHARACTER_3_MODEL_ID = 'd1dd37a3-e39a-4854-a298-6510289f9cf2';
  let hedraModelId = null;
  if (CONFIG.HEDRA_API_KEY) {
    try {
      const modelsResponse = await axios.get('https://api.hedra.com/web-app/public/models', {
        headers: { 'x-api-key': CONFIG.HEDRA_API_KEY }
      });
      // Hedra Character 3 모델 찾기 (requires_audio_input: true)
      const character3Model = modelsResponse.data?.find(m =>
        m.name?.includes('Character 3') || m.requires_audio_input === true
      );
      hedraModelId = character3Model?.id || HEDRA_CHARACTER_3_MODEL_ID;
      console.log(`  - Hedra 모델: ${hedraModelId} (${character3Model?.name || 'Character 3'})`);
    } catch (e) {
      console.log(`  - Hedra 모델 조회 실패, 기본값 사용:`, e.response?.data || e.message);
      hedraModelId = HEDRA_CHARACTER_3_MODEL_ID;
    }
  }

  for (const image of images) {
    const segment = script.script_segments.find(s => s.index === image.index);
    const audio = audioFiles.find(a => a.index === image.index);

    if (segment.speaker === 'puppy') {
      // ========== Hedra (립싱크) ==========
      console.log(`  - Scene ${image.index} [puppy→Hedra]: "${segment.narration.substring(0, 25)}..."`);

      if (!CONFIG.HEDRA_API_KEY || !hedraModelId) {
        console.log(`    ⚠️ HEDRA_API_KEY 없음 또는 모델 없음 - 스킵`);
        continue;
      }

      try {
        // 1. 이미지 업로드
        const assetResponse = await axios.post('https://api.hedra.com/web-app/public/assets', {
          name: image.filename,
          type: 'image'
        }, {
          headers: { 'x-api-key': CONFIG.HEDRA_API_KEY, 'Content-Type': 'application/json' }
        });

        const imageBuffer = fs.readFileSync(image.filepath);
        const formData = new FormData();
        formData.append('file', imageBuffer, { filename: image.filename, contentType: 'image/png' });

        await axios.post(`https://api.hedra.com/web-app/public/assets/${assetResponse.data.id}/upload`, formData, {
          headers: { 'x-api-key': CONFIG.HEDRA_API_KEY, ...formData.getHeaders() }
        });

        console.log(`    → 이미지 업로드 완료: ${assetResponse.data.id}`);

        // 2. 오디오 업로드 (ElevenLabs 오디오 사용)
        let audioAssetId = null;
        if (audio) {
          const audioAssetResponse = await axios.post('https://api.hedra.com/web-app/public/assets', {
            name: audio.filename,
            type: 'audio'
          }, {
            headers: { 'x-api-key': CONFIG.HEDRA_API_KEY, 'Content-Type': 'application/json' }
          });

          const audioBuffer = fs.readFileSync(audio.filepath);
          const audioFormData = new FormData();
          audioFormData.append('file', audioBuffer, { filename: audio.filename, contentType: 'audio/mpeg' });

          await axios.post(`https://api.hedra.com/web-app/public/assets/${audioAssetResponse.data.id}/upload`, audioFormData, {
            headers: { 'x-api-key': CONFIG.HEDRA_API_KEY, ...audioFormData.getHeaders() }
          });

          audioAssetId = audioAssetResponse.data.id;
          console.log(`    → 오디오 업로드 완료: ${audioAssetId}`);
        }

        // 3. 비디오 생성
        const durationMs = Math.round(segment.duration * 1000); // 초 → 밀리초
        const requestData = {
          type: 'video',
          ai_model_id: hedraModelId,
          start_keyframe_id: assetResponse.data.id,
          generated_video_inputs: {
            resolution: '720p',
            aspect_ratio: '9:16',
            text_prompt: segment.narration,
            text: segment.narration,
            duration_ms: durationMs
          }
        };

        if (audioAssetId) {
          requestData.audio_id = audioAssetId;
        }

        const genResponse = await axios.post('https://api.hedra.com/web-app/public/generations', requestData, {
          headers: { 'x-api-key': CONFIG.HEDRA_API_KEY, 'Content-Type': 'application/json' }
        });

        console.log(`    → 비디오 생성 시작: ${genResponse.data.id}`);

        // 4. 완료 대기
        let videoUrl = null;
        for (let i = 0; i < 120; i++) {
          await new Promise(r => setTimeout(r, 5000));

          const status = await axios.get(`https://api.hedra.com/web-app/public/generations/${genResponse.data.id}/status`, {
            headers: { 'x-api-key': CONFIG.HEDRA_API_KEY }
          });

          if (status.data.status === 'complete') {
            videoUrl = status.data.url || status.data.download_url;
            break;
          }
          if (status.data.status === 'error') {
            throw new Error(status.data.error_message || 'Unknown error');
          }

          if (i % 6 === 0 && i > 0) console.log(`    ... 대기 중 (${i * 5}초, status: ${status.data.status})`);
        }

        if (videoUrl) {
          const videoResponse = await axios.get(videoUrl, { responseType: 'arraybuffer' });
          const videoFilename = `video_${String(image.index).padStart(3, '0')}_hedra.mp4`;
          const videoFilepath = path.join(outputFolder, videoFilename);
          fs.writeFileSync(videoFilepath, Buffer.from(videoResponse.data));

          results.push({
            index: image.index,
            filename: videoFilename,
            filepath: videoFilepath,
            url: videoFilepath,
            speaker: segment.speaker,
            narration: segment.narration,
            duration: segment.duration,
            start: segment.start_time,
            end: segment.end_time,
            source: 'hedra'
          });

          console.log(`    ✓ 저장: ${videoFilename}`);
        }
      } catch (error) {
        console.error(`    ✗ Hedra 실패:`, error.response?.data || error.message);
      }

    } else {
      // ========== Veo (모션) ==========
      console.log(`  - Scene ${image.index} [owner→Veo]: "${segment.narration.substring(0, 25)}..."`);

      try {
        const VEO_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
        const VEO_MODEL = 'veo-3.0-fast-generate-001';

        const imageBuffer = fs.readFileSync(image.filepath);
        const imageBase64 = imageBuffer.toString('base64');

        const motionPrompt = `cute puppy listening, ${segment.emotion} expression, ${segment.puppy_pose}, natural subtle movement, breathing, ear twitching, gentle camera movement, high quality video`;

        const createResponse = await axios.post(`${VEO_BASE_URL}/models/${VEO_MODEL}:predictLongRunning`, {
          instances: [{
            prompt: motionPrompt,
            image: {
              bytesBase64Encoded: imageBase64,
              mimeType: 'image/png',
            },
          }],
          parameters: {
            aspectRatio: '9:16',
            durationSeconds: 6,
            personGeneration: 'allow_adult',
          },
        }, {
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': CONFIG.GEMINI_API_KEY,
          },
          timeout: 300000,
        });

        const operationName = createResponse.data.name;
        console.log(`    → Operation: ${operationName?.split('/').pop()}`);

        let videoUrl = null;
        for (let i = 0; i < 72; i++) {
          await new Promise(r => setTimeout(r, 5000));

          const statusResponse = await axios.get(`${VEO_BASE_URL}/${operationName}`, {
            headers: { 'X-goog-api-key': CONFIG.GEMINI_API_KEY },
          });

          if (statusResponse.data.done) {
            if (statusResponse.data.error) {
              throw new Error(`Veo failed: ${statusResponse.data.error.message}`);
            }

            const response = statusResponse.data.response;

            if (response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri) {
              videoUrl = response.generateVideoResponse.generatedSamples[0].video.uri;
            }
            if (!videoUrl && response?.generatedVideos?.[0]?.video?.uri) {
              videoUrl = response.generatedVideos[0].video.uri;
            }
            if (!videoUrl && response?.videos?.[0]) {
              videoUrl = response.videos[0].gcsUri || response.videos[0].uri;
            }

            if (videoUrl?.startsWith('gs://')) {
              const gsMatch = videoUrl.match(/gs:\/\/([^/]+)\/(.+)/);
              if (gsMatch) {
                videoUrl = `https://storage.googleapis.com/${gsMatch[1]}/${gsMatch[2]}`;
              }
            }

            break;
          }

          if (i % 6 === 0 && i > 0) console.log(`    ... 대기 중 (${i * 5}초)`);
        }

        if (videoUrl) {
          const isVeoUrl = videoUrl.includes('generativelanguage.googleapis.com');
          const downloadHeaders = isVeoUrl ? { 'X-goog-api-key': CONFIG.GEMINI_API_KEY } : {};

          const videoResponse = await axios.get(videoUrl, {
            responseType: 'arraybuffer',
            headers: downloadHeaders,
          });

          const videoFilename = `video_${String(image.index).padStart(3, '0')}_veo.mp4`;
          const videoFilepath = path.join(outputFolder, videoFilename);
          fs.writeFileSync(videoFilepath, Buffer.from(videoResponse.data));

          results.push({
            index: image.index,
            filename: videoFilename,
            filepath: videoFilepath,
            url: videoFilepath,
            speaker: segment.speaker,
            narration: segment.narration,
            duration: segment.duration,
            start: segment.start_time,
            end: segment.end_time,
            source: 'veo',
            audio_filepath: audio?.filepath,
          });

          console.log(`    ✓ 저장: ${videoFilename}`);
        }
      } catch (error) {
        console.error(`    ✗ Veo 실패:`, error.response?.data?.error?.message || error.message);
      }
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  const hedraCount = results.filter(v => v.source === 'hedra').length;
  const veoCount = results.filter(v => v.source === 'veo').length;
  console.log(`\n🎬 비디오 생성 완료: ${results.length}/${images.length} (Hedra: ${hedraCount}, Veo: ${veoCount})`);

  return results;
}

// =====================
// 5. BGM 생성 (MusicAPI)
// =====================
async function generateBGM(script) {
  console.log('\n🎵 [STEP 5] BGM 생성 (MusicAPI)...');

  if (!CONFIG.MUSICAPI_KEY) {
    console.log('  ⚠️ MUSICAPI_KEY 없음 - BGM 스킵');
    return null;
  }

  try {
    const MUSICAPI_BASE = 'https://api.musicapi.ai/api/v1';
    const bgmTags = 'cute, playful, heartwarming, gentle, warm, background music';

    const createResponse = await axios.post(`${MUSICAPI_BASE}/sonic/create`, {
      mv: 'sonic-v4-5',
      make_instrumental: true,
      custom_mode: true,
      title: 'Shorts_BGM',
      tags: bgmTags,
    }, {
      headers: {
        'Authorization': `Bearer ${CONFIG.MUSICAPI_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    const taskId = createResponse.data.task_id;
    console.log(`  → Task ID: ${taskId}`);

    let bgmUrl = null;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000));

      const statusResponse = await axios.get(`${MUSICAPI_BASE}/sonic/task/${taskId}`, {
        headers: { 'Authorization': `Bearer ${CONFIG.MUSICAPI_KEY}` },
      });

      const songs = statusResponse.data.data || [];
      if (songs.length > 0 && songs[0].audio_url && !songs[0].audio_url.includes('audiopipe')) {
        bgmUrl = songs[0].audio_url;
        break;
      }

      if (i % 6 === 0 && i > 0) console.log(`    ... 대기 중 (${i * 5}초)`);
    }

    if (bgmUrl) {
      console.log(`  ✓ BGM 생성 완료: ${bgmUrl.substring(0, 60)}...`);
      return bgmUrl;
    }

  } catch (error) {
    console.error('  ✗ BGM 생성 실패:', error.response?.data || error.message);
  }

  return null;
}

// =====================
// 6. 최종 합성 안내 (Creatomate 또는 ffmpeg)
// =====================
async function composeFinalVideo(videos, subtitles, script, bgmUrl) {
  console.log('\n🎥 [STEP 6] 최종 영상 합성...');

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, script.folder_name);
  const sortedVideos = [...videos].sort((a, b) => a.index - b.index);

  // ffmpeg concat 파일 생성
  const concatFilepath = path.join(outputFolder, 'concat.txt');
  const concatContent = sortedVideos.map(v => `file '${v.filename}'`).join('\n');
  fs.writeFileSync(concatFilepath, concatContent);

  // Creatomate source 생성
  let currentTime = 0;
  const elements = [];

  elements.push({
    type: 'shape',
    shape: 'rectangle',
    width: '100%',
    height: '100%',
    fill_color: '#F5F5F5',
    time: 0,
  });

  for (const video of sortedVideos) {
    const duration = video.duration || 5;

    elements.push({
      type: 'video',
      source: video.url,
      time: currentTime,
      duration,
      fit: 'contain',
    });

    if (video.source === 'hedra') {
      elements.push({
        type: 'audio',
        source: video.url,
        time: currentTime,
        duration,
        volume: '100%',
      });
    } else if (video.audio_filepath) {
      elements.push({
        type: 'audio',
        source: video.audio_filepath,
        time: currentTime,
        duration,
        volume: '100%',
      });
    }

    currentTime += duration;
  }

  const totalDuration = currentTime;

  if (bgmUrl) {
    elements.push({
      type: 'audio',
      source: bgmUrl,
      time: 0,
      duration: totalDuration,
      volume: '20%',
      audio_fade_out: '2s',
    });
  }

  for (const sub of subtitles) {
    if (sub.text?.trim()) {
      elements.push({
        type: 'text',
        text: sub.text.trim(),
        time: sub.start,
        duration: sub.end - sub.start,
        width: '90%',
        x: '50%',
        y: '85%',
        x_anchor: '50%',
        y_anchor: '50%',
        font_family: 'Noto Sans KR',
        font_size: '5vw',
        font_weight: '700',
        fill_color: '#FFFFFF',
        background_color: 'rgba(0,0,0,0.6)',
        background_x_padding: '3%',
        background_y_padding: '2%',
        background_border_radius: '5%',
        text_align: 'center',
      });
    }
  }

  const creatomateSource = {
    output_format: 'mp4',
    width: 1080,
    height: 1920,
    frame_rate: 30,
    duration: totalDuration,
    elements,
  };

  fs.writeFileSync(path.join(outputFolder, 'creatomate_source.json'), JSON.stringify(creatomateSource, null, 2));

  console.log(`  → 총 ${elements.length}개 요소, ${totalDuration}초`);
  console.log('  📄 creatomate_source.json 저장 완료');
  console.log('  📄 concat.txt 저장 완료');

  console.log('\n  📝 ffmpeg 수동 합성 명령어:');
  console.log(`  cd "${outputFolder}"`);
  console.log(`  ffmpeg -f concat -safe 0 -i concat.txt -c copy final_output.mp4`);

  return { creatomateSource, outputFolder };
}

// =====================
// 메인 실행
// =====================
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🐕 땅콩이 파이프라인 테스트 (Step 2~6)');
  console.log('═══════════════════════════════════════════════════════════');

  const script = FIXED_SCRIPT;
  const outputFolder = path.join(CONFIG.OUTPUT_DIR, script.folder_name);

  console.log(`\n📁 기존 이미지 폴더: ${outputFolder}`);
  console.log(`📝 총 ${script.script_segments.length}개 씬, ${script.total_duration_seconds}초`);

  console.log('\n🔑 API 키 상태:');
  console.log(`   GEMINI_API_KEY: ${CONFIG.GEMINI_API_KEY ? '✓' : '✗'}`);
  console.log(`   HEDRA_API_KEY: ${CONFIG.HEDRA_API_KEY ? '✓' : '✗'}`);
  console.log(`   ELEVENLABS_API_KEY: ${CONFIG.ELEVENLABS_API_KEY ? '✓' : '✗'}`);
  console.log(`   OPENAI_API_KEY: ${CONFIG.OPENAI_API_KEY ? '✓' : '✗'}`);
  console.log(`   MUSICAPI_KEY: ${CONFIG.MUSICAPI_KEY ? '✓' : '✗'}`);
  console.log(`   CREATOMATE_API_KEY: ${CONFIG.CREATOMATE_API_KEY ? '✓' : '✗'}`);

  // Step 1: 기존 이미지 로드
  const images = loadExistingImages(script);
  if (images.length === 0) {
    console.error('\n❌ 이미지 없음');
    process.exit(1);
  }

  // Step 2: TTS 음성 생성 (ElevenLabs)
  const audioFiles = await generateTTS(script);

  // Step 3: 자막 생성 (Whisper 또는 스크립트 기반)
  const subtitles = await generateSubtitles(audioFiles, script);

  // Step 4: 비디오 생성 (Speaker별 분기)
  const videos = await generateVideos(images, audioFiles, script);

  // Step 5: BGM 생성
  const bgmUrl = await generateBGM(script);

  // Step 6: 최종 합성
  await composeFinalVideo(videos, subtitles, script, bgmUrl);

  // 스크립트 저장
  const scriptPath = path.join(outputFolder, 'script.json');
  fs.writeFileSync(scriptPath, JSON.stringify(script, null, 2));

  // 결과 요약
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  📊 결과 요약');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📸 이미지: ${images.length}개 (기존)`);
  console.log(`  🎤 TTS 음성: ${audioFiles.length}개`);
  console.log(`  📝 자막: ${subtitles.length}개 세그먼트`);
  console.log(`  🎬 비디오: ${videos.length}개`);
  console.log(`     - Hedra (립싱크): ${videos.filter(v => v.source === 'hedra').length}개`);
  console.log(`     - Veo (모션): ${videos.filter(v => v.source === 'veo').length}개`);
  console.log(`  🎵 BGM: ${bgmUrl ? '✓' : '✗'}`);
  console.log(`  📁 출력: ${outputFolder}`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

// 실행
main().catch(console.error);
