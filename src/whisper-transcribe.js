import axios from 'axios';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import FormData from 'form-data';
import { Storage } from '@google-cloud/storage';

/**
 * Whisper Transcribe
 * 음성 파일을 텍스트로 변환하고 타임스탬프 추출
 */

const OPENAI_API_URL = "https://api.openai.com/v1";

/**
 * 음성 파일을 텍스트로 변환 (타임스탬프 포함)
 * @param {object} options - 옵션
 * @returns {Promise<object>} - 결과
 */
export async function transcribeAudio(options) {
  const {
    audioPath,        // 로컬 오디오 파일 경로
    audioUrl,         // 또는 오디오 URL
    apiKey,
    language = 'ja',
    outputDir = './output',
    gcsBucket,
    gcsFolder,
    googleCredentialsPath,
  } = options;

  console.log('\n[Whisper] Starting transcription...');
  console.log(`  - Language: ${language}`);

  let audioBuffer;

  // 1. 오디오 파일 로드
  if (audioPath) {
    console.log(`  - Source: ${audioPath}`);
    audioBuffer = await fs.readFile(audioPath);
  } else if (audioUrl) {
    console.log(`  - Source: ${audioUrl}`);
    const response = await axios({
      method: "GET",
      url: audioUrl,
      responseType: "arraybuffer",
    });
    audioBuffer = Buffer.from(response.data);
  } else {
    throw new Error('Either audioPath or audioUrl is required');
  }

  console.log(`  - Audio size: ${(audioBuffer.length / 1024).toFixed(2)} KB`);

  // 2. Whisper API 호출
  const formData = new FormData();
  formData.append("file", audioBuffer, {
    filename: "audio.mp3",
    contentType: "audio/mpeg",
  });
  formData.append("model", "whisper-1");
  formData.append("language", language);
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "word");
  formData.append("timestamp_granularities[]", "segment");

  const response = await axios({
    method: "POST",
    url: `${OPENAI_API_URL}/audio/transcriptions`,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      ...formData.getHeaders(),
    },
    data: formData,
    maxBodyLength: Infinity,
  });

  const transcription = response.data;

  console.log(`  - Duration: ${transcription.duration?.toFixed(2)}s`);
  console.log(`  - Segments: ${transcription.segments?.length || 0}`);
  console.log(`  - Text preview: ${transcription.text?.substring(0, 50)}...`);

  // 3. 자막 데이터 가공
  const subtitles = (transcription.segments || []).map((segment, index) => ({
    index,
    start: segment.start,
    end: segment.end,
    text: segment.text.trim(),
    words: segment.words || [],
  }));

  // 4. SRT 형식 생성
  const srtContent = generateSRT(subtitles);

  // 5. 로컬 저장
  await fs.mkdir(outputDir, { recursive: true });

  const jsonPath = path.join(outputDir, 'subtitles.json');
  const srtPath = path.join(outputDir, 'subtitles.srt');

  await fs.writeFile(jsonPath, JSON.stringify({
    subtitles,
    full_text: transcription.text,
    duration: transcription.duration,
    language: transcription.language,
  }, null, 2));
  console.log(`  - Saved: ${jsonPath}`);

  await fs.writeFile(srtPath, srtContent);
  console.log(`  - Saved: ${srtPath}`);

  // 6. GCS 업로드 (옵션)
  let gcsResult = null;
  if (gcsBucket && gcsFolder && googleCredentialsPath) {
    gcsResult = await uploadSubtitlesToGCS(jsonPath, srtPath, {
      bucket: gcsBucket,
      folder: gcsFolder,
      credentialsPath: googleCredentialsPath,
    });
  }

  return {
    success: true,
    full_text: transcription.text,
    duration: transcription.duration,
    language: transcription.language,
    total_segments: subtitles.length,
    subtitles,
    json_path: jsonPath,
    srt_path: srtPath,
    gcs: gcsResult,
  };
}

/**
 * SRT 형식 자막 생성
 */
function generateSRT(subtitles) {
  return subtitles.map((sub, i) => {
    const formatTime = (seconds) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.round((seconds % 1) * 1000);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    };
    return `${i + 1}\n${formatTime(sub.start)} --> ${formatTime(sub.end)}\n${sub.text}\n`;
  }).join('\n');
}

/**
 * GCS에 자막 파일 업로드
 */
async function uploadSubtitlesToGCS(jsonPath, srtPath, options) {
  const { bucket, folder, credentialsPath } = options;

  console.log('\n[GCS] Uploading subtitles...');

  const storage = new Storage({ keyFilename: credentialsPath });
  const bucketRef = storage.bucket(bucket);

  // JSON 업로드
  const jsonDest = `${folder}/subtitles.json`;
  await bucketRef.upload(jsonPath, {
    destination: jsonDest,
    metadata: { contentType: 'application/json' },
  });
  console.log(`  - Uploaded: subtitles.json`);

  // SRT 업로드
  const srtDest = `${folder}/subtitles.srt`;
  await bucketRef.upload(srtPath, {
    destination: srtDest,
    metadata: { contentType: 'text/plain' },
  });
  console.log(`  - Uploaded: subtitles.srt`);

  return {
    bucket,
    folder,
    json_url: `https://storage.googleapis.com/${bucket}/${jsonDest}`,
    srt_url: `https://storage.googleapis.com/${bucket}/${srtDest}`,
  };
}

export default { transcribeAudio };
