import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function transcribe() {
  const audioPath = path.join(__dirname, 'audio.mp3');

  console.log('Whisper API 호출 중...');

  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: 'whisper-1',
    language: 'ko',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment']
  });

  // Save full result
  fs.writeFileSync(
    path.join(__dirname, 'whisper_result.json'),
    JSON.stringify(transcription, null, 2)
  );

  // Save transcript text
  fs.writeFileSync(
    path.join(__dirname, 'transcript.txt'),
    transcription.text
  );

  console.log('완료!');
  console.log('전체 텍스트:', transcription.text.substring(0, 200) + '...');
  console.log('\n세그먼트 수:', transcription.segments?.length || 0);

  // Print segments with timestamps
  if (transcription.segments) {
    console.log('\n=== 세그먼트 목록 ===');
    transcription.segments.forEach((seg, i) => {
      console.log(`[${seg.start.toFixed(2)}s - ${seg.end.toFixed(2)}s] ${seg.text}`);
    });
  }
}

transcribe().catch(console.error);
