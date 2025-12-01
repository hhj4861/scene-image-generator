/**
 * Script Generator 테스트 - 등장인물 이미지 분석 기반 대본 생성
 *
 * 테스트 시나리오:
 * 1. 주인공(강아지) + 조연1(할머니) 이미지 제공
 * 2. 이미지 분석 후 캐릭터 정보 추출
 * 3. 캐릭터 정보 기반 대본 생성
 *
 * 실행 방법:
 * 1. 일반 모드:
 *    GEMINI_API_KEY="your-key" node pipedream_puppy/test_code/script/test-script-generator.mjs
 *
 * 2. 풍자/패러디 모드 (Topic Generator 출력 시뮬레이션):
 *    GEMINI_API_KEY="your-key" SATIRE_MODE=1 node pipedream_puppy/test_code/script/test-script-generator.mjs
 */

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  IMAGE_SAMPLE_DIR: path.join(__dirname, '..', '..', 'image_sample'),
  OUTPUT_DIR: path.join(__dirname, '..', 'test_output'),
  SATIRE_MODE: process.env.SATIRE_MODE === '1',
};

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-24:generateContent';

// 이미지 분석 함수
async function analyzeCharacterImage(imagePath, characterType) {
  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString('base64');
  const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  const analysisPrompt = characterType === 'animal'
    ? `Analyze this animal image. Return JSON only:
{
  "character_type": "animal",
  "species": "종류 (예: dog, cat, rabbit)",
  "breed": "품종 (예: Pomeranian, Persian)",
  "estimated_age": "추정 나이 (예: puppy, adult, senior)",
  "gender_appearance": "외형상 성별 추정 (male/female/unknown)",
  "fur_color": "털 색상",
  "fur_texture": "털 질감 (fluffy/smooth/curly 등)",
  "eye_color": "눈 색상",
  "size": "크기 (small/medium/large)",
  "distinctive_features": ["특징1", "특징2"],
  "accessories": ["착용하고 있는 것들 (옷, 목줄 등)"],
  "personality_impression": "외형에서 느껴지는 성격 (cute/playful/calm 등)",
  "image_generation_prompt": "detailed English prompt for consistent image generation",
  "suggested_voice_type": "추천 음성 타입 (예: baby_girl, child_boy, adult_female)"
}`
    : `Analyze this person image. Return JSON only:
{
  "character_type": "human",
  "estimated_age_range": "추정 연령대 (예: 20s, 30s, 40s, 50s, 60s+)",
  "gender": "성별 (male/female)",
  "ethnicity": "민족/인종 추정",
  "hair_color": "머리 색상",
  "hair_style": "머리 스타일",
  "eye_color": "눈 색상",
  "facial_features": "얼굴 특징",
  "body_type": "체형",
  "clothing": "착용 의상",
  "accessories": ["악세서리"],
  "personality_impression": "외형에서 느껴지는 성격/분위기",
  "image_generation_prompt": "detailed English prompt for consistent image generation",
  "suggested_voice_type": "추천 음성 타입 (예: elderly_female, adult_male, child_female)"
}`;

  const response = await axios.post(
    GEMINI_URL,
    {
      contents: [{
        parts: [
          { text: analysisPrompt },
          { inline_data: { mime_type: mimeType, data: imageBase64 } }
        ]
      }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
    },
    {
      headers: {
        'x-goog-api-key': CONFIG.GEMINI_API_KEY,
        'Content-Type': 'application/json',
      },
    }
  );

  let content = response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
}

// 풍자 모드용 토픽 데이터 (Topic Generator 출력 시뮬레이션)
function getSatireTopicData() {
  return {
    topic: "중국 차우차우 털린 썰 푼다… 3700만개 사료 실화?",
    is_satire: true,
    original_topic: "쿠팡 개인정보 유출 3700만건",
    keyword_hint: "중국, 차우차우, 사료 털림",
    satire_info: {
      original_reference: "쿠팡 개인정보 유출 3700만건",
      transformation_method: "쿠팡→중국집, 개인정보→사료, 유출→털림",
      humor_point: "강아지 시점에서 사료가 털린 분노를 표현"
    },
    story_summary: "중국집 차우차우한테 3700만개의 사료를 털린 강아지가 분노하며 사연을 털어놓는 이야기",
    hook: "차우차우가 내 사료 3700만개를 털었다고?!",
    narration_style: "분노와 억울함이 담긴 토로식 나레이션",
    emotional_journey: "분노 → 억울함 → 복수 다짐 → 귀여운 협박",
    daily_context: {
      date: new Date().toISOString().split('T')[0],
      season: "겨울",
      day_of_week: "일요일",
    },
  };
}

// 일반 모드용 토픽 데이터
function getNormalTopicData() {
  return {
    topic: "강아지가 할머니에게 애교를 부리며 간식 달라고 하는 이야기",
    is_satire: false,
    original_topic: null,
    keyword_hint: null,
    satire_info: null,
    story_summary: "할머니에게 애교를 부려 간식을 얻어내는 강아지의 귀여운 작전",
    hook: "할미~ 간식 주세요~",
    narration_style: "귀여운 아기 강아지의 애교 넘치는 나레이션",
    emotional_journey: "기대 → 애교 → 행복",
    daily_context: {
      date: new Date().toISOString().split('T')[0],
      season: "겨울",
      day_of_week: "일요일",
    },
  };
}

// 스크립트 생성 함수
async function generateScript(characters, topicData, language, duration) {
  const topic = topicData.topic;
  const isSatire = topicData.is_satire || false;
  const originalTopic = topicData.original_topic;
  const keywordHint = topicData.keyword_hint;
  const satireInfo = topicData.satire_info;
  const storyContext = {
    story_summary: topicData.story_summary,
    hook: topicData.hook,
    narration_style: topicData.narration_style,
    emotional_journey: topicData.emotional_journey,
  };
  const dailyContext = topicData.daily_context;
  const characterDescriptions = Object.entries(characters).map(([key, char]) => {
    const analysis = char.analysis;
    if (analysis.character_type === 'animal') {
      return `- ${char.name} (${key.toUpperCase()}): ${analysis.species || 'animal'}, ${analysis.breed || 'unknown breed'}, ${analysis.estimated_age || 'unknown age'}, ${analysis.personality_impression || 'cute'} personality, Voice: ${analysis.suggested_voice_type || 'baby_girl'}
  외형: ${analysis.image_generation_prompt || 'cute animal'}
  특징: ${(analysis.distinctive_features || []).join(', ') || 'adorable'}
  악세서리: ${(analysis.accessories || []).join(', ') || 'none'}`;
    } else {
      return `- ${char.name} (${key.toUpperCase()}): ${analysis.gender || 'unknown'}, ${analysis.estimated_age_range || 'unknown age'}, ${analysis.personality_impression || 'friendly'} personality, Voice: ${analysis.suggested_voice_type || 'adult'}
  외형: ${analysis.image_generation_prompt || 'person'}
  의상: ${analysis.clothing || 'casual'}
  특징: ${analysis.facial_features || ''}`;
    }
  }).join('\n\n');

  const langConfig = {
    japanese: { instruction: '日本語で書いてください。' },
    korean: { instruction: '한국어로 작성해주세요.' },
    english: { instruction: 'Write in English.' },
  };
  const lang = langConfig[language];
  const sceneCount = Math.ceil(duration / 5);

  const prompt = `Create a ${duration}s viral YouTube Short script with DETAILED visual descriptions.

★★★ CHARACTERS (이미지 분석 결과 기반) ★★★
${characterDescriptions}

★★★ CRITICAL - CHARACTER APPEARANCE CONSISTENCY ★★★
${Object.entries(characters).map(([key, char]) =>
  `- ${char.name}: ${char.analysis.image_generation_prompt || ''}
   모든 씬에서 동일한 외형 유지!`
).join('\n')}

TOPIC: ${topic}
${dailyContext ? `CONTEXT: ${dailyContext.season}, ${dailyContext.day_of_week}` : ''}

${isSatire ? `★★★ 풍자/패러디 모드 (CRITICAL!) ★★★
이 콘텐츠는 실제 이슈를 강아지 세계로 풍자한 것입니다.

📰 원본 주제: ${originalTopic || 'N/A'}
🔑 변환 힌트: ${keywordHint || 'N/A'}
${satireInfo ? `
🎭 풍자 정보:
- 원본 참조: ${satireInfo.original_reference || 'N/A'}
- 변환 방법: ${satireInfo.transformation_method || 'N/A'}
- 웃음 포인트: ${satireInfo.humor_point || 'N/A'}` : ''}

★ 풍자 스크립트 규칙:
1. 원본 주제의 핵심 구조(숫자, 규모, 임팩트)를 유지
2. 사람/기업 요소를 강아지 세계 요소로 치환
3. 풍자적 유머를 유지하면서 귀엽게 표현
4. 시사적 내용을 강아지 시점에서 재해석
5. 후킹 대사에 원본 주제의 핵심 숫자/키워드 포함
` : ''}

${storyContext.story_summary ? `★★★ 스토리 가이드 ★★★
📖 스토리 요약: ${storyContext.story_summary}
🎣 후킹 대사: ${storyContext.hook || 'N/A'}
🎭 나레이션 스타일: ${storyContext.narration_style || 'N/A'}
💓 감정 여정: ${storyContext.emotional_journey || 'N/A'}
` : ''}

SCRIPT RULES:
- 주인공(${characters.main.name})이 주로 말하고 (60-70%)
- 조연들이 반응하거나 대화 (30-40%)
- 캐릭터별 성격과 목소리 특성 반영
- 스토리가 자연스럽게 이어지도록 구성
- speaker 필드는 반드시 다음 중 하나: "main", "sub1", "sub2", "sub3"

${lang.instruction}

★★★ OUTPUT FORMAT ★★★
Return JSON only:
{
  "title":{"japanese":"","korean":"","english":""},
  "full_script":"complete dialogue script",
  "location_setting":"전체 스토리가 진행되는 주요 장소",
  "script_segments":[
    {
      "segment_number":1,
      "speaker":"main or sub1 or sub2 or sub3",
      "character_name":"캐릭터 이름",
      "narration":"대사 내용",
      "image_prompt":"이미지 생성용 상세 프롬프트 (영어)",
      "video_prompt":{
        "character_action":"캐릭터 동작 설명",
        "lip_sync":"yes or no",
        "facial_expression":"표정",
        "body_movement":"몸 움직임",
        "camera_movement":"카메라 무빙"
      },
      "scene_details":{
        "location":"indoor or outdoor",
        "background":"배경 설명",
        "weather":"날씨",
        "lighting":"조명",
        "mood":"분위기",
        "characters_in_scene":["등장 캐릭터"]
      },
      "audio_details":{
        "voice_style":"음성 스타일",
        "sound_effects":"효과음",
        "background_sound":"배경음"
      },
      "emotion":"감정"
    }
  ],
  "music_mood":"cute/funny/emotional/heartwarming",
  "overall_style":"photorealistic"
}

Create ${sceneCount} segments with complete visual details!`;

  const response = await axios.post(
    GEMINI_URL,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 4096 },
    },
    {
      headers: {
        'x-goog-api-key': CONFIG.GEMINI_API_KEY,
        'Content-Type': 'application/json',
      },
    }
  );

  let content = response.data.candidates[0].content.parts[0].text.trim();
  content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : content);
}

async function runTest() {
  const isSatireMode = CONFIG.SATIRE_MODE;

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  📝 Script Generator 테스트 ${isSatireMode ? '(🎭 풍자 모드)' : '(일반 모드)'}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log();

  if (!CONFIG.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY가 설정되지 않았습니다.');
    process.exit(1);
  }

  // 테스트 출력 폴더
  const testFolder = path.join(CONFIG.OUTPUT_DIR, `test_script_${Date.now()}`);
  fs.mkdirSync(testFolder, { recursive: true });

  // =====================
  // 1. 캐릭터 이미지 분석
  // =====================
  console.log('🔍 [STEP 1] 캐릭터 이미지 분석...');
  console.log();

  const puppyImagePath = path.join(CONFIG.IMAGE_SAMPLE_DIR, '강아지샘플.jpeg');
  const ownerImagePath = path.join(CONFIG.IMAGE_SAMPLE_DIR, '할머니샘플.png');

  console.log('   📸 주인공(강아지) 분석 중...');
  const mainAnalysis = await analyzeCharacterImage(puppyImagePath, 'animal');
  console.log('   ✓ 주인공 분석 완료');
  console.log(`     - 종류: ${mainAnalysis?.species}, 품종: ${mainAnalysis?.breed}`);
  console.log(`     - 추정 나이: ${mainAnalysis?.estimated_age}`);
  console.log(`     - 성격: ${mainAnalysis?.personality_impression}`);
  console.log(`     - 추천 음성: ${mainAnalysis?.suggested_voice_type}`);
  console.log(`     - 악세서리: ${mainAnalysis?.accessories?.join(', ')}`);
  console.log();

  console.log('   📸 조연1(할머니) 분석 중...');
  const sub1Analysis = await analyzeCharacterImage(ownerImagePath, 'human');
  console.log('   ✓ 조연1 분석 완료');
  console.log(`     - 성별: ${sub1Analysis?.gender}, 연령대: ${sub1Analysis?.estimated_age_range}`);
  console.log(`     - 성격: ${sub1Analysis?.personality_impression}`);
  console.log(`     - 추천 음성: ${sub1Analysis?.suggested_voice_type}`);
  console.log(`     - 의상: ${sub1Analysis?.clothing}`);
  console.log();

  // 캐릭터 정보 구성
  const characters = {
    main: {
      name: '땅콩',
      role: 'main',
      analysis: mainAnalysis || {
        character_type: 'animal',
        species: 'dog',
        breed: 'Pomeranian',
        image_generation_prompt: 'cute Pomeranian puppy with golden cream fluffy fur',
        suggested_voice_type: 'baby_girl',
      },
    },
    sub1: {
      name: '할미',
      role: 'sub1',
      analysis: sub1Analysis || {
        character_type: 'human',
        estimated_age_range: '50s',
        gender: 'female',
        image_generation_prompt: 'middle-aged Asian woman',
        suggested_voice_type: 'elderly_female',
      },
    },
  };

  // =====================
  // 2. 대본 생성
  // =====================
  console.log('📝 [STEP 2] 대본 생성...');
  console.log();

  // 토픽 데이터 선택
  const topicData = isSatireMode ? getSatireTopicData() : getNormalTopicData();

  console.log(`   📌 토픽: ${topicData.topic}`);
  if (topicData.is_satire) {
    console.log(`   📰 원본 주제: ${topicData.original_topic}`);
    console.log(`   🔑 변환 힌트: ${topicData.keyword_hint}`);
  }
  console.log();

  const script = await generateScript(
    characters,
    topicData,
    'korean',
    30
  );

  console.log('   ✓ 대본 생성 완료');
  console.log();

  // =====================
  // 3. 결과 출력
  // =====================
  console.log('📋 [STEP 3] 결과 확인...');
  console.log();

  console.log('   📌 제목:');
  console.log(`     - 한국어: ${script.title?.korean}`);
  console.log(`     - 일본어: ${script.title?.japanese}`);
  console.log(`     - 영어: ${script.title?.english}`);
  console.log();

  console.log('   📌 장소: ' + script.location_setting);
  console.log('   📌 분위기: ' + script.music_mood);
  console.log();

  console.log('   📌 대본 세그먼트:');
  console.log('   ─────────────────────────────────────────');

  for (const seg of script.script_segments || []) {
    console.log(`   [씬 ${seg.segment_number}] ${seg.speaker} (${seg.character_name})`);
    console.log(`     💬 "${seg.narration}"`);
    console.log(`     😊 감정: ${seg.emotion}`);
    console.log(`     📍 배경: ${seg.scene_details?.background}`);
    console.log(`     🎬 동작: ${seg.video_prompt?.character_action}`);
    console.log();
  }

  // 결과 저장
  const result = {
    topic_info: {
      topic: topicData.topic,
      is_satire: topicData.is_satire,
      original_topic: topicData.original_topic,
      keyword_hint: topicData.keyword_hint,
      satire_info: topicData.satire_info,
      story_context: {
        story_summary: topicData.story_summary,
        hook: topicData.hook,
        narration_style: topicData.narration_style,
        emotional_journey: topicData.emotional_journey,
      },
      daily_context: topicData.daily_context,
    },
    characters,
    script,
    generated_at: new Date().toISOString(),
  };

  const outputPath = path.join(testFolder, 'script_result.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ✅ 테스트 완료!');
  console.log(`  📁 결과 저장: ${outputPath}`);
  console.log('═══════════════════════════════════════════════════════════');
}

runTest().catch(console.error);
