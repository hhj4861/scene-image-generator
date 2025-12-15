/**
 * Gemini 2.5 Pro TTS 테스트 - 아기 음성 샘플 생성
 *
 * 사용법:
 * GEMINI_API_KEY=your_api_key node test-gemini-tts.mjs
 */

import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error('❌ GEMINI_API_KEY 환경변수가 필요합니다.');
  console.error('사용법: GEMINI_API_KEY=your_api_key node test-gemini-tts.mjs');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// 테스트할 음성 샘플들
const samples = [
  {
    name: 'baby_girl_low',
    description: '2-3세 여자아기 낮은톤',
    prompt: `Say in a very soft, low-pitched, cute toddler girl voice (2-3 years old), speaking slowly and sweetly in Korean: "안녕하세요~ 저는 땅콩이에요. 오늘 간식 먹었어요~ 맛있었어요!"`,
    voice: 'Kore'  // 한국어 지원 음성
  },
  {
    name: 'baby_girl_low_v2',
    description: '2-3세 여자아기 낮은톤 (다른 음성)',
    prompt: `Speak as a 2-3 year old baby girl with a low, gentle, sleepy voice tone in Korean. Speak very slowly like a drowsy toddler: "엄마~ 졸려요... 안아줘요..."`,
    voice: 'Aoede'
  },
  {
    name: 'baby_boy_low',
    description: '2-3세 남자아기 낮은톤',
    prompt: `Say in a low-pitched, soft, cute toddler boy voice (2-3 years old), speaking slowly in Korean: "안녕~ 나 멍멍이야. 공놀이 좋아해요~ 같이 놀자!"`,
    voice: 'Kore'
  },
  {
    name: 'baby_boy_low_v2',
    description: '2-3세 남자아기 낮은톤 (다른 음성)',
    prompt: `Speak as a 2-3 year old baby boy with a low, gentle voice in Korean. Sound like a shy little boy: "아빠~ 이거 뭐야? 신기해요..."`,
    voice: 'Puck'
  }
];

// WAV 파일 생성 함수
function createWavFile(pcmData, filename) {
  // WAV 헤더 생성 (24000Hz, 16bit, mono)
  const sampleRate = 24000;
  const bitsPerSample = 16;
  const numChannels = 1;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const fileSize = 36 + dataSize;

  const header = Buffer.alloc(44);

  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize, 4);
  header.write('WAVE', 8);

  // fmt chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20);  // audio format (PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  const wavBuffer = Buffer.concat([header, pcmData]);
  fs.writeFileSync(filename, wavBuffer);

  return filename;
}

async function generateTTS(sample) {
  console.log(`\n🎤 생성 중: ${sample.description}`);
  console.log(`   프롬프트: ${sample.prompt.substring(0, 80)}...`);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro-preview-tts',
      contents: [{ parts: [{ text: sample.prompt }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: sample.voice },
          },
        },
      },
    });

    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!audioData) {
      console.log(`   ❌ 오디오 데이터 없음`);
      return null;
    }

    const audioBuffer = Buffer.from(audioData, 'base64');
    const outputDir = '/home/user/scene-image-generator/tts_samples';

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const filename = path.join(outputDir, `${sample.name}.wav`);
    createWavFile(audioBuffer, filename);

    const duration = (audioBuffer.length / (24000 * 2)).toFixed(2);
    console.log(`   ✅ 저장됨: ${filename}`);
    console.log(`   📊 길이: ${duration}초, 크기: ${(audioBuffer.length / 1024).toFixed(1)}KB`);

    return filename;
  } catch (error) {
    console.log(`   ❌ 에러: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('🎵 Gemini 2.5 Pro TTS 아기 음성 샘플 생성');
  console.log('=' .repeat(50));

  const results = [];

  for (const sample of samples) {
    const result = await generateTTS(sample);
    results.push({ ...sample, file: result });

    // API 레이트 리밋 방지
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n' + '='.repeat(50));
  console.log('📁 생성된 파일들:');
  console.log('   /home/user/scene-image-generator/tts_samples/');

  results.forEach(r => {
    if (r.file) {
      console.log(`   ✅ ${r.name}.wav - ${r.description}`);
    } else {
      console.log(`   ❌ ${r.name} - 생성 실패`);
    }
  });
}

main().catch(console.error);
