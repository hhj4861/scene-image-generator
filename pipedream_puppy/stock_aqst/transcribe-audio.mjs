/**
 * 음성 파일을 분석하여 자막 스크립트 생성
 * Gemini API 사용
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const audioPath = path.join(__dirname, 'narration', '음성.mp3');

async function transcribeAudio() {
  console.log('=== 음성 파일 자막 생성 ===\n');
  console.log(`파일: ${audioPath}`);

  // 파일 읽기
  const audioData = fs.readFileSync(audioPath);
  const base64Audio = audioData.toString('base64');

  console.log(`파일 크기: ${(audioData.length / 1024 / 1024).toFixed(2)} MB`);

  // Gemini API 호출
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`;

  const requestBody = {
    contents: [{
      parts: [
        {
          inline_data: {
            mime_type: "audio/mp3",
            data: base64Audio
          }
        },
        {
          text: `이 한국어 음성 파일을 분석하여 자막 스크립트를 생성해주세요.

요청사항:
1. 음성을 정확하게 텍스트로 변환해주세요
2. 타임스탬프를 포함해주세요 (시작시간 - 종료시간)
3. 문장 단위로 나눠주세요
4. 아래 JSON 형식으로 출력해주세요:

{
  "total_duration": "전체 길이 (예: 2:05)",
  "segments": [
    {
      "start": "00:00",
      "end": "00:05",
      "text": "자막 텍스트"
    }
  ]
}

JSON만 출력하고 다른 설명은 하지 마세요.`
        }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192
    }
  };

  console.log('\nGemini API 호출 중...\n');

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error: ${response.status} - ${error}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('No response from API');
  }

  console.log('=== 자막 스크립트 ===\n');
  console.log(text);

  // JSON 추출 및 저장
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const subtitleData = JSON.parse(jsonMatch[0]);
      const outputPath = path.join(__dirname, 'narration', 'subtitle_script.json');
      fs.writeFileSync(outputPath, JSON.stringify(subtitleData, null, 2), 'utf-8');
      console.log(`\n저장됨: ${outputPath}`);
    }
  } catch (e) {
    console.log('\nJSON 파싱 실패, 원본 텍스트 저장');
    const outputPath = path.join(__dirname, 'narration', 'subtitle_script.txt');
    fs.writeFileSync(outputPath, text, 'utf-8');
    console.log(`저장됨: ${outputPath}`);
  }
}

transcribeAudio().catch(console.error);
