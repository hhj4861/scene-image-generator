import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { Storage } from '@google-cloud/storage';

/**
 * ElevenLabs TTS
 * 텍스트를 음성으로 변환
 */

const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1";

// 인기 Voice ID 목록
export const VOICES = {
  RACHEL: "21m00Tcm4TlvDq8ikWAM",      // Rachel - calm, warm
  DOMI: "AZnzlk1XvdvUeBnXmlld",         // Domi - strong, confident
  BELLA: "EXAVITQu4vr4xnSDxMaL",        // Bella - soft, gentle
  ANTONI: "ErXwobaYiN019PkySvjV",       // Antoni - well-rounded
  ELLI: "MF3mGyEYCl7XYWbV9V6O",         // Elli - emotional
  JOSH: "TxGEqnHWrfWFTfGW9XjX",         // Josh - deep, narrative
  ARNOLD: "VR6AewLTigWG4xSOukaG",       // Arnold - crisp, energetic
  ADAM: "pNInz6obpgDQGcFmaJgB",         // Adam - deep, clear
  SAM: "yoZ06aMxZJJ28mfd3POQ",          // Sam - raspy, dynamic
};

/**
 * 텍스트를 음성으로 변환
 * @param {object} options - 옵션
 * @returns {Promise<object>} - 결과
 */
export async function generateSpeech(options) {
  const {
    text,
    apiKey,
    voiceId = VOICES.RACHEL,
    modelId = "eleven_multilingual_v2",
    stability = 0.5,
    similarityBoost = 0.75,
    outputDir = './output',
    filename = 'narration.mp3',
    gcsBucket,
    gcsFolder,
    googleCredentialsPath,
  } = options;

  console.log('\n[ElevenLabs] Starting TTS...');
  console.log(`  - Text length: ${text.length} characters`);
  console.log(`  - Voice ID: ${voiceId}`);
  console.log(`  - Model: ${modelId}`);

  try {
    // 1. ElevenLabs API 호출
    const response = await axios({
      method: "POST",
      url: `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}`,
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      data: {
        text: text,
        model_id: modelId,
        voice_settings: {
          stability: stability,
          similarity_boost: similarityBoost,
        },
      },
      responseType: "arraybuffer",
    });

    const audioBuffer = Buffer.from(response.data);
    console.log(`  - Audio size: ${(audioBuffer.length / 1024).toFixed(2)} KB`);

    // 2. 로컬 저장
    await fs.mkdir(outputDir, { recursive: true });
    const filepath = path.join(outputDir, filename);
    await fs.writeFile(filepath, audioBuffer);
    console.log(`  - Saved: ${filepath}`);

    // 3. GCS 업로드 (옵션)
    let gcsResult = null;
    if (gcsBucket && gcsFolder && googleCredentialsPath) {
      gcsResult = await uploadAudioToGCS(filepath, filename, {
        bucket: gcsBucket,
        folder: gcsFolder,
        credentialsPath: googleCredentialsPath,
      });
    }

    return {
      success: true,
      filename,
      filepath,
      size: audioBuffer.length,
      voiceId,
      modelId,
      textLength: text.length,
      gcs: gcsResult,
    };
  } catch (error) {
    console.error(`[ElevenLabs] Error: ${error.message}`);
    if (error.response) {
      console.error(`  - Status: ${error.response.status}`);
      console.error(`  - Data: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

/**
 * 사용 가능한 음성 목록 조회
 */
export async function listVoices(apiKey) {
  console.log('\n[ElevenLabs] Fetching available voices...');

  const response = await axios({
    method: "GET",
    url: `${ELEVENLABS_API_URL}/voices`,
    headers: {
      "xi-api-key": apiKey,
    },
  });

  const voices = response.data.voices.map(v => ({
    voice_id: v.voice_id,
    name: v.name,
    category: v.category,
    labels: v.labels,
  }));

  console.log(`  - Found ${voices.length} voices`);
  return voices;
}

/**
 * GCS에 오디오 업로드
 */
async function uploadAudioToGCS(filepath, filename, options) {
  const { bucket, folder, credentialsPath } = options;

  console.log('\n[GCS] Uploading audio...');

  const storage = new Storage({ keyFilename: credentialsPath });
  const bucketRef = storage.bucket(bucket);
  const destination = `${folder}/${filename}`;

  await bucketRef.upload(filepath, {
    destination,
    metadata: { contentType: 'audio/mpeg' },
  });

  const publicUrl = `https://storage.googleapis.com/${bucket}/${destination}`;
  console.log(`  - Uploaded: ${publicUrl}`);

  return {
    bucket,
    folder,
    url: publicUrl,
  };
}

export default { generateSpeech, listVoices, VOICES };
