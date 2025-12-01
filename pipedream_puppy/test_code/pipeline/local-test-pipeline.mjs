/**
 * 로컬 파이프라인 테스트 (전체 플로우)
 * 땅콩이 스크립트 기반 전체 플로우 테스트
 *
 * 파이프라인:
 * 1. 이미지 생성 (Imagen 4)
 * 2. 음성 생성 (ElevenLabs TTS)
 * 3. 비디오 생성 (Veo + FFmpeg 오디오 합성)
 *    - puppy: 입 움직임 프롬프트로 Veo 영상 생성 후 TTS 오디오 합성
 *    - owner: 모션 프롬프트로 Veo 영상 생성 후 TTS 오디오 합성
 * 4. 자막 생성 (Whisper - 오디오 기반 타임스탬프)
 * 5. BGM 생성 (MusicAPI)
 * 6. 최종 합성 (Creatomate)
 *
 * 실행: node local-test-pipeline.mjs
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
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  MUSICAPI_KEY: process.env.MUSICAPI_KEY || '',
  CREATOMATE_API_KEY: process.env.CREATOMATE_API_KEY || '',

  // ElevenLabs 음성 설정
  VOICE_PUPPY: process.env.VOICE_PUPPY || 'axF6wO2S4OLQLeC9UaUc', // 클론된 귀여운 아기 목소리 (YouTube baby girl voice)
  VOICE_OWNER: process.env.VOICE_OWNER || 'iP95p4xoKVk53GoZ742B', // Chris (casual, middle-aged male) - 인자한 남성 목소리

  OUTPUT_DIR: path.join(__dirname, 'test_output'),
};

// =====================
// 테스트용 고정 스크립트 (땅콩이)
// =====================
const FIXED_SCRIPT = {
  folder_name: `test_${new Date().toISOString().split('T')[0].replace(/-/g, '')}_${uuidv4().split('-')[0]}`,
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
      background: 'cozy living room with soft lighting',
      start_time: 16,
      end_time: 22,
      duration: 6
    },
    {
      index: 6,
      speaker: 'owner',
      narration: '아이고, 우리 땅콩이 쥐돌이 됐네! 괜찮아, 아빠가 닦아줄게!',
      emotion: 'loving',
      puppy_pose: 'wet fur being dried with white fluffy towel, owner hands gently drying the puppy, water drops visible on fur, loving care moment',
      background: 'cozy living room with soft lighting',
      start_time: 22,
      end_time: 27,
      duration: 5
    }
  ],

  total_duration_seconds: 27
};

// =====================
// 1. 이미지 생성 (Imagen 4)
// =====================
async function generateImages(script) {
  console.log('\n📸 [STEP 1] 이미지 생성 시작...');

  const puppyPrompt = script.puppy_character.image_prompt;
  const stylePrefix = 'photorealistic, ultra realistic, 8k, professional pet photography';
  const styleSuffix = 'DSLR quality, natural lighting, sharp focus, cute adorable';
  const consistencyPrompt = `EXACT SAME orange Pomeranian puppy: ${puppyPrompt}`;

  const IMAGEN_URL = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict';

  const results = [];
  const outputFolder = path.join(CONFIG.OUTPUT_DIR, script.folder_name);
  fs.mkdirSync(outputFolder, { recursive: true });

  for (const segment of script.script_segments) {
    const scenePrompt = `${puppyPrompt}, ${segment.puppy_pose}, ${segment.background}, ${segment.emotion} expression`;
    const finalPrompt = `${scenePrompt}, ${consistencyPrompt}, ${stylePrefix}, ${styleSuffix}`;

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
          narration: segment.narration,
          speaker: segment.speaker,
          emotion: segment.emotion,
          puppy_pose: segment.puppy_pose,
          duration: segment.duration,
          start: segment.start_time,
          end: segment.end_time
        });

        console.log(`    ✓ 저장: ${filename}`);
      }
    } catch (error) {
      console.error(`    ✗ Scene ${segment.index} 실패:`, error.response?.data?.error?.message || error.message);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n📸 이미지 생성 완료: ${results.length}/${script.script_segments.length}`);
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
// 3. 자막 생성 (Whisper - 오디오 기반 타임스탬프)
// =====================
async function generateSubtitles(audioFiles, script) {
  console.log('\n📝 [STEP 3] 자막 생성 (Whisper)...');

  if (!CONFIG.OPENAI_API_KEY) {
    console.log('  ⚠️ OPENAI_API_KEY 없음 - Whisper 스킵');
    console.log('  → 스크립트 기반 자막 사용');

    // 스크립트 기반 자막 생성
    return script.script_segments.map(seg => ({
      index: seg.index,
      start: seg.start_time,
      end: seg.end_time,
      text: seg.narration,
      speaker: seg.speaker,
    }));
  }

  if (audioFiles.length === 0) {
    console.log('  ⚠️ 오디오 파일 없음 - 스크립트 기반 자막 사용');
    return script.script_segments.map(seg => ({
      index: seg.index,
      start: seg.start_time,
      end: seg.end_time,
      text: seg.narration,
      speaker: seg.speaker,
    }));
  }

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, script.folder_name);
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

      // 타임스탬프 조정 (누적 시간 기준)
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

      // 오디오 길이만큼 누적
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
// 헬퍼: 오디오 길이 확인 (ffprobe)
// =====================
function getAudioDuration(audioPath) {
  try {
    const result = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`, { stdio: 'pipe' });
    return parseFloat(result.toString().trim());
  } catch (e) {
    console.log('    ffprobe 실패, 기본값 5초 사용');
    return 5;
  }
}

// =====================
// 헬퍼: FFmpeg로 영상 + 오디오 합성
// =====================
function combineVideoAudio(videoPath, audioPath, outputPath) {
  const cmd = `ffmpeg -y -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "${outputPath}"`;
  try {
    execSync(cmd, { stdio: 'pipe' });
    return outputPath;
  } catch (e) {
    console.error('    FFmpeg 오류:', e.message);
    throw e;
  }
}

// =====================
// 4. 비디오 생성 (Veo + FFmpeg 오디오 합성)
// =====================
async function generateVideos(images, audioFiles, script) {
  console.log('\n🎬 [STEP 4] 비디오 생성 시작 (Veo + FFmpeg)...');
  console.log('  - puppy (강아지 대사) → Veo (입 움직임) + TTS 합성');
  console.log('  - owner (주인 대사) → Veo (모션) + TTS 합성');

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, script.folder_name);
  const results = [];

  const VEO_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
  const VEO_MODEL = 'veo-2.0-generate-001';

  for (const image of images) {
    const segment = script.script_segments.find(s => s.index === image.index);
    const audio = audioFiles.find(a => a.index === image.index);
    const speakerIcon = segment.speaker === 'puppy' ? '🐕' : '👤';

    console.log(`  - Scene ${image.index} ${speakerIcon} [${segment.speaker}→Veo]: "${segment.narration.substring(0, 25)}..."`);

    // 오디오 길이 확인
    let audioDuration = segment.duration || 5;
    if (audio?.filepath && fs.existsSync(audio.filepath)) {
      audioDuration = getAudioDuration(audio.filepath);
      console.log(`    오디오 길이: ${audioDuration.toFixed(2)}초`);
    }

    // Veo 영상 길이 계산 (5-8초 범위)
    const veoDuration = Math.max(5, Math.min(8, Math.ceil(audioDuration)));

    // 프롬프트 생성 (speaker에 따라 다름)
    // 네거티브: 텍스트, 워터마크, 글씨 생성 방지
    const noTextSuffix = ', no text, no watermark, no letters, no subtitles, no captions, clean video';
    let veoPrompt;
    if (segment.speaker === 'puppy') {
      // 강아지 말하기 - 입 움직임 강조 (단일 테스트와 동일한 프롬프트)
      veoPrompt = `A cute fluffy Pomeranian puppy talking and speaking with mouth opening and closing naturally, the dog is looking at the camera with bright expressive eyes, mouth movements as if speaking words, subtle head tilts, ${segment.background}, high quality animation${noTextSuffix}`;
    } else {
      // 주인 대사 - 듣는 강아지 모션
      veoPrompt = `cute Pomeranian puppy listening attentively, ${segment.emotion} expression, natural subtle movement, breathing, ear twitching, ${segment.background}, photorealistic pet video${noTextSuffix}`;
    }

    try {
      const imageBuffer = fs.readFileSync(image.filepath);
      const imageBase64 = imageBuffer.toString('base64');

      const createResponse = await axios.post(`${VEO_BASE_URL}/models/${VEO_MODEL}:predictLongRunning`, {
        instances: [{
          prompt: veoPrompt,
          image: {
            bytesBase64Encoded: imageBase64,
            mimeType: 'image/png',
          },
        }],
        parameters: {
          aspectRatio: '9:16',
          sampleCount: 1,
          durationSeconds: veoDuration,
          personGeneration: 'dont_allow',
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

      // 완료 대기
      let videoResult = null;
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 5000));

        const statusResponse = await axios.get(`${VEO_BASE_URL}/${operationName}`, {
          headers: { 'X-goog-api-key': CONFIG.GEMINI_API_KEY },
        });

        const status = statusResponse.data;
        if (i % 6 === 0) console.log(`    [${(i + 1) * 5}초] done: ${status.done || false}`);

        if (status.done) {
          if (status.error) {
            throw new Error(JSON.stringify(status.error));
          }
          videoResult = status.response;
          break;
        }
      }

      if (!videoResult) throw new Error('Veo 타임아웃');

      // 비디오 데이터 추출
      const samples = videoResult.generateVideoResponse?.generatedSamples || videoResult.generatedSamples;
      let videoBuffer = null;

      if (samples && samples.length > 0) {
        const videoData = samples[0].video;
        if (videoData?.bytesBase64Encoded) {
          videoBuffer = Buffer.from(videoData.bytesBase64Encoded, 'base64');
        } else if (videoData?.uri) {
          const isVeoUrl = videoData.uri.includes('generativelanguage.googleapis.com');
          const downloadHeaders = isVeoUrl ? { 'X-goog-api-key': CONFIG.GEMINI_API_KEY } : {};
          const videoResponse = await axios.get(videoData.uri, {
            responseType: 'arraybuffer',
            headers: downloadHeaders,
          });
          videoBuffer = Buffer.from(videoResponse.data);
        }
      }

      if (!videoBuffer) throw new Error('Veo 응답에 비디오 없음');

      // Veo 원본 영상 저장
      const veoRawFilename = `video_${String(image.index).padStart(3, '0')}_veo_raw.mp4`;
      const veoRawFilepath = path.join(outputFolder, veoRawFilename);
      fs.writeFileSync(veoRawFilepath, videoBuffer);
      console.log(`    ✓ Veo 원본: ${veoRawFilename} (${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

      // FFmpeg로 TTS 오디오 합성
      let finalVideoFilepath = veoRawFilepath;
      let finalVideoFilename = veoRawFilename;

      if (audio?.filepath && fs.existsSync(audio.filepath)) {
        console.log(`    → FFmpeg 오디오 합성 중...`);
        finalVideoFilename = `video_${String(image.index).padStart(3, '0')}_veo.mp4`;
        finalVideoFilepath = path.join(outputFolder, finalVideoFilename);

        combineVideoAudio(veoRawFilepath, audio.filepath, finalVideoFilepath);
        console.log(`    ✓ 합성 완료: ${finalVideoFilename}`);
      }

      results.push({
        index: image.index,
        filename: finalVideoFilename,
        filepath: finalVideoFilepath,
        url: finalVideoFilepath,
        speaker: segment.speaker,
        narration: segment.narration,
        duration: audioDuration,
        start: segment.start_time,
        end: segment.end_time,
        source: 'veo',
        has_audio: !!audio?.filepath,
      });

    } catch (error) {
      console.error(`    ✗ Veo 실패:`, error.response?.data?.error?.message || error.message);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  const puppyCount = results.filter(v => v.speaker === 'puppy').length;
  const ownerCount = results.filter(v => v.speaker === 'owner').length;
  console.log(`\n🎬 비디오 생성 완료: ${results.length}/${images.length} (puppy: ${puppyCount}, owner: ${ownerCount})`);

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
// 6. 최종 합성 (Creatomate)
// =====================
async function composeFinalVideo(videos, subtitles, script, bgmUrl) {
  console.log('\n🎥 [STEP 6] 최종 영상 합성 (Creatomate)...');

  const outputFolder = path.join(CONFIG.OUTPUT_DIR, script.folder_name);
  const sortedVideos = [...videos].sort((a, b) => a.index - b.index);

  // Elements 생성
  let currentTime = 0;
  const elements = [];

  // 배경
  elements.push({
    type: 'shape',
    shape: 'rectangle',
    width: '100%',
    height: '100%',
    fill_color: '#F5F5F5',
    time: 0,
  });

  // 비디오 (이미 TTS 오디오가 합성된 상태)
  for (const video of sortedVideos) {
    const duration = video.duration || 5;

    // 비디오 (오디오 포함)
    elements.push({
      type: 'video',
      source: video.url,
      time: currentTime,
      duration,
      fit: 'contain',
    });

    // 비디오에서 오디오 추출
    elements.push({
      type: 'audio',
      source: video.url,
      time: currentTime,
      duration,
      volume: '100%',
    });

    currentTime += duration;
  }

  const totalDuration = currentTime;

  // BGM
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

  // 자막 (Whisper 결과 기반)
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

  console.log(`  → 총 ${elements.length}개 요소, ${totalDuration}초`);

  // Creatomate Source 저장
  const creatomateSource = {
    output_format: 'mp4',
    width: 1080,
    height: 1920,
    frame_rate: 30,
    duration: totalDuration,
    elements,
  };
  fs.writeFileSync(path.join(outputFolder, 'creatomate_source.json'), JSON.stringify(creatomateSource, null, 2));

  if (!CONFIG.CREATOMATE_API_KEY) {
    console.log('  ⚠️ CREATOMATE_API_KEY 없음 - API 호출 스킵');

    // ffmpeg 명령어 출력
    const concatFilepath = path.join(outputFolder, 'concat.txt');
    const concatContent = sortedVideos.map(v => `file '${v.filename}'`).join('\n');
    fs.writeFileSync(concatFilepath, concatContent);

    console.log('\n  📝 ffmpeg 명령어로 수동 합성:');
    console.log(`  cd "${outputFolder}"`);
    console.log(`  ffmpeg -f concat -safe 0 -i concat.txt -c copy final_output.mp4`);

    return { creatomateSource, outputFolder };
  }

  // Creatomate API 호출
  try {
    console.log('  → Creatomate API 호출...');

    const createResponse = await axios.post('https://api.creatomate.com/v1/renders', {
      output_format: 'mp4',
      source: creatomateSource,
    }, {
      headers: {
        'Authorization': `Bearer ${CONFIG.CREATOMATE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    const renderId = createResponse.data[0].id;
    console.log(`  → Render ID: ${renderId}`);

    // 완료 대기
    let renderUrl = null;
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 5000));

      const status = await axios.get(`https://api.creatomate.com/v1/renders/${renderId}`, {
        headers: { 'Authorization': `Bearer ${CONFIG.CREATOMATE_API_KEY}` },
      });

      if (status.data.status === 'succeeded') {
        renderUrl = status.data.url;
        break;
      }
      if (status.data.status === 'failed') {
        throw new Error(`Creatomate failed: ${status.data.error_message}`);
      }

      if (i % 6 === 0 && i > 0) console.log(`    ... 대기 중 (${i * 5}초)`);
    }

    if (renderUrl) {
      // 최종 영상 다운로드
      const videoResponse = await axios.get(renderUrl, { responseType: 'arraybuffer' });
      const finalFilepath = path.join(outputFolder, 'final_shorts.mp4');
      fs.writeFileSync(finalFilepath, Buffer.from(videoResponse.data));

      console.log(`  ✓ 최종 영상 저장: final_shorts.mp4`);
      return { creatomateSource, outputFolder, finalUrl: finalFilepath };
    }

  } catch (error) {
    console.error('  ✗ Creatomate 실패:', error.response?.data || error.message);
  }

  return { creatomateSource, outputFolder };
}

// =====================
// 메인 실행
// =====================
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🐕 땅콩이 파이프라인 로컬 테스트 (전체 플로우)');
  console.log('═══════════════════════════════════════════════════════════');

  // API 키 체크
  if (!CONFIG.GEMINI_API_KEY) {
    console.error('\n❌ GEMINI_API_KEY 환경변수를 설정하세요');
    process.exit(1);
  }

  const script = FIXED_SCRIPT;
  const outputFolder = path.join(CONFIG.OUTPUT_DIR, script.folder_name);

  console.log(`\n📁 출력 폴더: ${outputFolder}`);
  console.log(`📝 총 ${script.script_segments.length}개 씬, ${script.total_duration_seconds}초`);
  console.log('\n📋 스크립트:');
  script.script_segments.forEach(s => {
    const marker = s.speaker === 'puppy' ? '🐕' : '👤';
    console.log(`   ${s.index}. ${marker} [${s.speaker}] ${s.narration.substring(0, 35)}...`);
  });

  console.log('\n🔑 API 키 상태:');
  console.log(`   GEMINI_API_KEY: ${CONFIG.GEMINI_API_KEY ? '✓' : '✗'}`);
  console.log(`   ELEVENLABS_API_KEY: ${CONFIG.ELEVENLABS_API_KEY ? '✓' : '✗'}`);
  console.log(`   OPENAI_API_KEY: ${CONFIG.OPENAI_API_KEY ? '✓' : '✗'}`);
  console.log(`   MUSICAPI_KEY: ${CONFIG.MUSICAPI_KEY ? '✓' : '✗'}`);
  console.log(`   CREATOMATE_API_KEY: ${CONFIG.CREATOMATE_API_KEY ? '✓' : '✗'}`);

  // Step 1: 이미지 생성
  const images = await generateImages(script);
  if (images.length === 0) {
    console.error('\n❌ 이미지 생성 실패');
    process.exit(1);
  }

  // Step 2: TTS 음성 생성 (ElevenLabs)
  const audioFiles = await generateTTS(script);

  // Step 3: 자막 생성 (Whisper)
  const subtitles = await generateSubtitles(audioFiles, script);

  // Step 4: 비디오 생성 (Speaker별 분기)
  const videos = await generateVideos(images, audioFiles, script);

  // Step 5: BGM 생성
  const bgmUrl = await generateBGM(script);

  // Step 6: 최종 합성 (Creatomate)
  await composeFinalVideo(videos, subtitles, script, bgmUrl);

  // 스크립트 저장
  const scriptPath = path.join(outputFolder, 'script.json');
  fs.writeFileSync(scriptPath, JSON.stringify(script, null, 2));

  // 결과 요약
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  📊 결과 요약');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📸 이미지: ${images.length}개`);
  console.log(`  🎤 TTS 음성: ${audioFiles.length}개`);
  console.log(`  📝 자막: ${subtitles.length}개 세그먼트`);
  console.log(`  🎬 비디오: ${videos.length}개 (Veo + FFmpeg 합성)`);
  console.log(`     - puppy (말하기): ${videos.filter(v => v.speaker === 'puppy').length}개`);
  console.log(`     - owner (모션): ${videos.filter(v => v.speaker === 'owner').length}개`);
  console.log(`  🎵 BGM: ${bgmUrl ? '✓' : '✗'}`);
  console.log(`  📁 출력: ${outputFolder}`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

// 실행
main().catch(console.error);
