import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { Storage } from '@google-cloud/storage';

/**
 * Script Generator
 * OpenAI GPT를 사용하여 쇼츠용 대본 생성
 */

/**
 * 스타일 가이드
 */
const STYLE_GUIDES = {
  motivational: {
    structure: "도입(공감) → 문제제기 → 해결/깨달음 → 행동촉구",
    tone: "희망적이고 격려하는",
    keywords_jp: ["頑張る", "夢", "挑戦", "成長", "自分を信じる"],
  },
  healing: {
    structure: "평온한 시작 → 감성적 전개 → 위로의 메시지 → 따뜻한 마무리",
    tone: "부드럽고 위로하는",
    keywords_jp: ["癒し", "大丈夫", "ゆっくり", "心", "優しい"],
  },
  story: {
    structure: "상황설정 → 갈등/전환점 → 클라이맥스 → 여운있는 결말",
    tone: "서사적이고 몰입감있는",
    keywords_jp: ["物語", "出会い", "運命", "変化", "始まり"],
  },
  comedy: {
    structure: "기대설정 → 반전 → 펀치라인 → 웃음포인트",
    tone: "유머러스하고 가벼운",
    keywords_jp: ["面白い", "笑", "まさか", "なんで", "草"],
  },
  educational: {
    structure: "흥미유발 질문 → 핵심정보 → 실용적 팁 → 요약",
    tone: "친절하고 명확한",
    keywords_jp: ["知ってた", "実は", "コツ", "方法", "ポイント"],
  },
  cute: {
    structure: "귀여운 등장 → 사랑스러운 행동 → 감탄 포인트 → 힐링 마무리",
    tone: "사랑스럽고 귀여운",
    keywords_jp: ["かわいい", "癒し", "ふわふわ", "もふもふ", "キュン"],
  },
  pet: {
    structure: "반려동물 소개 → 귀여운 일상 → 교감 순간 → 따뜻한 마무리",
    tone: "따뜻하고 애정어린",
    keywords_jp: ["犬", "猫", "ペット", "家族", "癒し", "かわいい"],
  },
};

const EMOTION_GUIDES = {
  touching: "감동을 주는, 눈물이 날 것 같은",
  healing: "마음이 편안해지는, 위로받는",
  funny: "웃음이 나는, 유쾌한",
  empathy: "공감되는, 나도 그래",
  passion: "열정이 불타오르는, 도전하고 싶은",
  calm: "평온한, 차분해지는",
  cute: "귀엽고 사랑스러운, 심쿵하는",
  warm: "따뜻하고 포근한, 마음이 녹는",
};

const VOICE_GUIDES = {
  calm_warm: "차분하고 따뜻한 톤, 천천히 말하듯",
  energetic: "활기차고 빠른 톤, 열정적으로",
  emotional: "감성적이고 깊은 톤, 감정을 담아",
  professional: "명확하고 신뢰감있는 톤",
  friendly: "친근하고 편안한 톤, 친구에게 말하듯",
  soft: "부드럽고 나긋나긋한 톤, 속삭이듯",
  cheerful: "밝고 경쾌한 톤, 즐거운 느낌으로",
};

const LANGUAGE_CONFIG = {
  japanese: {
    name: "일본어",
    instruction: "日本語で書いてください。自然な日本語表現を使用してください。",
    chars_per_second: 4,
  },
  korean: {
    name: "한국어",
    instruction: "한국어로 작성해주세요. 자연스러운 한국어 표현을 사용해주세요.",
    chars_per_second: 5,
  },
  english: {
    name: "영어",
    instruction: "Write in English. Use natural, conversational English.",
    chars_per_second: 12,
  },
};

/**
 * 대본 생성
 * @param {object} options - 옵션
 * @returns {Promise<object>} - 생성된 대본
 */
export async function generateScript(options) {
  const {
    keywords,
    apiKey,
    contentStyle = 'motivational',
    targetEmotion = 'passion',
    durationSeconds = 40,
    language = 'japanese',
    voiceStyle = 'calm_warm',
    includeScenes = true,
    outputDir = './output',
    // GCS 옵션
    gcsBucket,
    gcsFolder,
    googleCredentialsPath,
  } = options;

  console.log('\n[Script Generator] Starting...');
  console.log(`  - Keywords: ${keywords}`);
  console.log(`  - Style: ${contentStyle}`);
  console.log(`  - Emotion: ${targetEmotion}`);
  console.log(`  - Duration: ${durationSeconds}s`);
  console.log(`  - Language: ${language}`);

  const style = STYLE_GUIDES[contentStyle] || STYLE_GUIDES.motivational;
  const emotion = EMOTION_GUIDES[targetEmotion] || EMOTION_GUIDES.passion;
  const voice = VOICE_GUIDES[voiceStyle] || VOICE_GUIDES.calm_warm;
  const lang = LANGUAGE_CONFIG[language] || LANGUAGE_CONFIG.japanese;

  const estimatedChars = durationSeconds * lang.chars_per_second;
  const sceneCount = Math.ceil(durationSeconds / 5); // 5초당 1장면

  const prompt = `You are an expert scriptwriter for viral YouTube Shorts targeting the Japanese market.

## Input Information:
- Keywords: ${keywords}
- Content Style: ${contentStyle} (${style.tone})
- Structure: ${style.structure}
- Target Emotion: ${emotion}
- Voice Style: ${voice}
- Duration: ${durationSeconds} seconds
- Language: ${lang.name}
- Estimated characters: ~${estimatedChars} characters
- Number of scenes: ${sceneCount}

## Japanese Market Keywords Reference:
${style.keywords_jp.join(", ")}

## Requirements:
1. ${lang.instruction}
2. Write a script that fits exactly ${durationSeconds} seconds when read aloud
3. Follow the structure: ${style.structure}
4. Evoke the emotion: ${emotion}
5. Voice style should be: ${voice}
6. Include natural pauses marked with "..." for emotional effect
7. The script should hook viewers in the first 2 seconds
8. IMPORTANT: Create exactly ${sceneCount} scenes, each approximately 5 seconds

${includeScenes ? `
## Scene Descriptions:
For each scene (approximately every 5 seconds), provide:
- Detailed visual description for AI image generation
- Include anime/illustration style specifications
- Describe character expressions, poses, background, lighting, mood
- Each scene should visually represent the narration content
` : ""}

## Output Format (JSON):
{
  "title": {
    "japanese": "Japanese title for YouTube",
    "korean": "한국어 제목",
    "english": "English title"
  },
  "hook": "First 2 seconds - attention grabber (in ${lang.name})",
  "full_script": "Complete narration script in ${lang.name} - must be readable in ${durationSeconds} seconds",
  "script_segments": [
    {
      "segment_number": 1,
      "start_time": 0,
      "end_time": 5,
      "narration": "Narration text for this segment (in ${lang.name})",
      "emotion_note": "How to deliver this part"${includeScenes ? `,
      "scene_description": "Detailed visual description for image generation - anime style, character details, background, mood, lighting. Must be in English for AI image generation."` : ""},
    }
  ],
  "hashtags": {
    "japanese": ["#shorts", "#日本語ハッシュタグ"],
    "english": ["#shorts", "#EnglishHashtags"]
  },
  "thumbnail_idea": "Thumbnail concept description",
  "music_suggestion": "Background music style recommendation",
  "total_duration": ${durationSeconds},
  "target_audience": "Target audience description"
}

IMPORTANT:
- script_segments must have exactly ${sceneCount} segments
- Each segment must be 5 seconds (except possibly the last one)
- The full_script must be exactly ${durationSeconds} seconds when read at normal pace
- All scene_description must be in English for AI image generation

Return ONLY valid JSON, no markdown formatting.`;

  const response = await axios({
    method: 'POST',
    url: 'https://api.openai.com/v1/chat/completions',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    data: {
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an expert viral content scriptwriter specializing in Japanese YouTube Shorts. You understand Japanese culture, emotions, and what makes content go viral in Japan. You write scripts that are emotionally resonant, culturally appropriate, and optimized for short-form video. Always respond with valid JSON only.`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    },
  });

  let script;
  try {
    let responseContent = response.data.choices[0].message.content.trim();

    // Remove markdown code blocks if present
    if (responseContent.startsWith('```json')) {
      responseContent = responseContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (responseContent.startsWith('```')) {
      responseContent = responseContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      responseContent = jsonMatch[0];
    }

    script = JSON.parse(responseContent);
  } catch (error) {
    console.error('  - Error parsing response:', error.message);
    throw new Error(`Failed to parse OpenAI response: ${error.message}`);
  }

  console.log(`  - Generated: "${script.title?.japanese || script.title?.korean}"`);
  console.log(`  - Segments: ${script.script_segments?.length || 0}`);

  // 결과 정리
  const result = {
    input: {
      keywords,
      content_style: contentStyle,
      target_emotion: targetEmotion,
      duration: durationSeconds,
      language,
      voice_style: voiceStyle,
    },
    script,
    // 파이프라인 연동용 데이터
    scenes: script.script_segments?.map((seg, idx) => ({
      index: idx + 1,
      start: seg.start_time,
      end: seg.end_time,
      narration: seg.narration,
      prompt: seg.scene_description || `Scene ${idx + 1}`,
    })) || [],
    generated_at: new Date().toISOString(),
  };

  // 로컬 저장
  await fs.mkdir(outputDir, { recursive: true });
  const scriptPath = path.join(outputDir, 'script.json');
  await fs.writeFile(scriptPath, JSON.stringify(result, null, 2));
  console.log(`  - Saved: ${scriptPath}`);

  // GCS 업로드 (옵션)
  let gcsResult = null;
  if (gcsBucket && gcsFolder && googleCredentialsPath) {
    gcsResult = await uploadToGCS(result, {
      bucket: gcsBucket,
      folder: gcsFolder,
      credentialsPath: googleCredentialsPath,
    });
  }

  return {
    ...result,
    filepath: scriptPath,
    gcs: gcsResult,
  };
}

/**
 * GCS 업로드
 */
async function uploadToGCS(scriptData, options) {
  const { bucket, folder, credentialsPath } = options;

  console.log('\n[GCS] Uploading script...');

  const storage = new Storage({ keyFilename: credentialsPath });
  const bucketRef = storage.bucket(bucket);

  const destination = `${folder}/script.json`;
  const file = bucketRef.file(destination);

  await file.save(JSON.stringify(scriptData, null, 2), {
    contentType: 'application/json',
  });

  const publicUrl = `https://storage.googleapis.com/${bucket}/${destination}`;
  console.log(`  - Uploaded: ${publicUrl}`);

  return {
    bucket,
    folder,
    url: publicUrl,
  };
}

export default { generateScript };
