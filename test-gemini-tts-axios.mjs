/**
 * Gemini 2.5 Pro TTS 테스트 - axios 버전
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error('❌ GEMINI_API_KEY 환경변수가 필요합니다.');
  process.exit(1);
}

const samples = [
  {
    name: 'baby_girl_low',
    description: '2-3세 여자아기 낮은톤',
    prompt: `Say in a very soft, low-pitched, cute toddler girl voice (2-3 years old), speaking slowly and sweetly in Korean: "안녕하세요~ 저는 땅콩이에요. 오늘 간식 먹었어요~ 맛있었어요!"`,
    voice: 'Kore'
  },
  {
    name: 'baby_girl_low_v2',
    description: '2-3세 여자아기 낮은톤 (Aoede)',
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
    description: '2-3세 남자아기 낮은톤 (Puck)',
    prompt: `Speak as a 2-3 year old baby boy with a low, gentle voice in Korean. Sound like a shy little boy: "아빠~ 이거 뭐야? 신기해요..."`,
    voice: 'Puck'
  }
];

function createWavFile(pcmData, filename) {
  const sampleRate = 24000;
  const bitsPerSample = 16;
  const numChannels = 1;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const fileSize = 36 + dataSize;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  const wavBuffer = Buffer.concat([header, pcmData]);
  fs.writeFileSync(filename, wavBuffer);
  return filename;
}

async function generateTTS(sample) {
  console.log(`\n🎤 생성 중: ${sample.description}`);
  console.log(`   음성: ${sample.voice}`);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-tts:generateContent?key=${API_KEY}`;

  try {
    const response = await axios.post(url, {
      contents: [{
        parts: [{ text: sample.prompt }]
      }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: sample.voice }
          }
        }
      }
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000
    });

    const audioData = response.data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!audioData) {
      console.log(`   ❌ 오디오 데이터 없음`);
      console.log(`   응답:`, JSON.stringify(response.data).substring(0, 200));
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
    console.log(`   ❌ 에러: ${error.response?.data?.error?.message || error.message}`);
    if (error.response?.data) {
      console.log(`   상세:`, JSON.stringify(error.response.data).substring(0, 300));
    }
    return null;
  }
}

async function main() {
  console.log('🎵 Gemini 2.5 Pro TTS 아기 음성 샘플 생성 (axios)');
  console.log('='.repeat(50));

  const results = [];

  for (const sample of samples) {
    const result = await generateTTS(sample);
    results.push({ ...sample, file: result });
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n' + '='.repeat(50));
  console.log('📁 결과:');
  results.forEach(r => {
    console.log(`   ${r.file ? '✅' : '❌'} ${r.name} - ${r.description}`);
  });
}

main().catch(console.error);
