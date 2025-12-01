/**
 * Topic Generator 테스트
 * pipedream_puppy/topic-generator.mjs 테스트
 *
 * 실행 방법:
 * 1. 자동 생성 모드:
 *    GEMINI_API_KEY="your-key" node pipedream_puppy/test_code/topic/test-topic-generator.mjs
 *
 * 2. 풍자/패러디 모드:
 *    GEMINI_API_KEY="your-key" USER_TOPIC="쿠팡 개인정보 유출 3700만건" USER_HINT="중국, 차우차우, 사료 털림" node pipedream_puppy/test_code/topic/test-topic-generator.mjs
 */

import axios from 'axios';

// Pipedream 환경 시뮬레이션
const $ = {
  exports: {},
  export(key, value) {
    this.exports[key] = value;
    if (key !== '$summary') {
      console.log(`📤 Export [${key}]:`, typeof value === 'object' ? JSON.stringify(value, null, 2) : value);
    }
  }
};

// 설정
const config = {
  gemini_api_key: process.env.GEMINI_API_KEY,
  gemini_model: "gemini-2.0-flash-exp",
  generate_count: 3,
  target_platform: "youtube_shorts",
  language: "korean", // korean으로 변경해서 풍자 결과 확인
  // 사용자 입력 (환경변수로 받음)
  user_topic_input: process.env.USER_TOPIC || null,
  user_keyword_hint: process.env.USER_HINT || null,
};

async function testTopicGenerator() {
  console.log("🐕 Topic Generator 테스트 시작...\n");
  console.log("=".repeat(60));

  if (!config.gemini_api_key) {
    console.error("❌ GEMINI_API_KEY 환경변수가 필요합니다.");
    process.exit(1);
  }

  // 모드 표시
  const hasUserInput = !!(config.user_topic_input || config.user_keyword_hint);
  console.log(`\n📌 모드: ${hasUserInput ? '🎭 풍자/패러디 변환' : '🐕 자동 생성'}`);
  if (hasUserInput) {
    console.log(`   - 원본 주제: ${config.user_topic_input || '(없음)'}`);
    console.log(`   - 변환 힌트: ${config.user_keyword_hint || '(없음)'}`);
  }

  // =====================
  // 1. 날짜/시간/계절 기반 동적 요소 생성
  // =====================
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const dayOfWeek = now.getDay();
  const hour = now.getHours();

  const getSeason = (m) => {
    if (m >= 3 && m <= 5) return { name: "spring", ko: "봄", jp: "春", themes: ["벚꽃", "나들이", "꽃밭", "봄바람", "피크닉"] };
    if (m >= 6 && m <= 8) return { name: "summer", ko: "여름", jp: "夏", themes: ["수박", "바다", "수영장", "에어컨", "더위"] };
    if (m >= 9 && m <= 11) return { name: "autumn", ko: "가을", jp: "秋", themes: ["단풍", "낙엽", "밤", "고구마", "산책"] };
    return { name: "winter", ko: "겨울", jp: "冬", themes: ["눈", "핫초코", "난로", "이불", "크리스마스"] };
  };

  const dayThemes = {
    0: { name: "sunday", ko: "일요일", themes: ["휴식", "늦잠", "힐링"] },
    1: { name: "monday", ko: "월요일", themes: ["월요병", "출근", "피곤"] },
    2: { name: "tuesday", ko: "화요일", themes: ["루틴", "일상"] },
    3: { name: "wednesday", ko: "수요일", themes: ["주중", "버티기"] },
    4: { name: "thursday", ko: "목요일", themes: ["불금 전날", "기대감"] },
    5: { name: "friday", ko: "금요일", themes: ["불금", "퇴근", "행복"] },
    6: { name: "saturday", ko: "토요일", themes: ["주말", "놀이", "나들이"] },
  };

  const season = getSeason(month);
  const dayTheme = dayThemes[dayOfWeek];

  const specialDays = [];
  const dailySeed = year * 10000 + month * 100 + day;
  const randomThemes = ["먹방", "ASMR", "리액션", "챌린지", "반전", "감동", "귀여움폭발"];
  const todayRandomTheme = randomThemes[dailySeed % randomThemes.length];

  console.log(`\n📅 오늘의 컨텍스트:`);
  console.log(`   - 날짜: ${year}년 ${month}월 ${day}일 (${dayTheme.ko})`);
  console.log(`   - 계절: ${season.ko}`);
  console.log(`   - 랜덤 테마: ${todayRandomTheme}`);

  // =====================
  // 2. 언어/플랫폼 설정
  // =====================
  const langConfig = {
    japanese: { instruction: "日本語で出力してください。", name: "Japanese" },
    korean: { instruction: "한국어로 출력해주세요.", name: "Korean" },
    english: { instruction: "Output in English.", name: "English" },
  };

  const lang = langConfig[config.language];
  const platformGuides = {
    youtube_shorts: "YouTube Shorts: 0-3초 강력한 후킹, 세로 9:16, 60초 이내",
  };

  // =====================
  // 3. 프롬프트 생성
  // =====================
  const userInputSection = hasUserInput ? `
## 🎯 USER INPUT - SATIRE/PARODY TRANSFORMATION (CRITICAL!)

**Original Topic to Satirize**: "${config.user_topic_input || '(없음)'}"
**Conversion Hints**: "${config.user_keyword_hint || '(없음)'}"

### YOUR MISSION:
Transform the above real-world topic into a PUPPY-VERSION SATIRE/PARODY.

### TRANSFORMATION RULES:
1. **Keep the core structure** of the original topic (numbers, scale, impact)
2. **Replace human elements** with puppy/dog world equivalents
3. **Use the keyword hints** to guide the transformation
4. **Make it funny and cute** while maintaining the satirical edge

### TRANSFORMATION EXAMPLES:
| Original Topic | Keyword Hints | Puppy Version |
|---------------|---------------|---------------|
| 쿠팡 개인정보 유출 3700만건 | 중국, 차우차우, 사료 | "중국집 차우차우한테 3700만개 사료 털린 강아지의 분노" |
| 테슬라 자율주행 사고 | 로봇청소기, 충돌 | "자율주행 로봇청소기에 치인 강아지의 복수극" |
| 애플 비전프로 출시 | VR고글, 가상현실, 간식 | "VR고글 쓰고 가상 간식 먹방하는 강아지" |

### IMPORTANT:
- ALL ${config.generate_count} ideas must be variations of transforming the user's topic
- Each variation should have a different angle/approach
` : `
## 🎯 AUTO-GENERATE MODE:
Generate fresh puppy content ideas based on today's context.
Focus on: ${season.ko} themes, ${dayTheme.ko} vibes, ${todayRandomTheme} style.
`;

  const prompt = `You are a creative AI specializing in ADORABLE PUPPY content for viral short-form videos.
You excel at creating SATIRICAL/PARODY content that transforms real-world topics into cute puppy versions.

${userInputSection}

## 📅 TODAY'S CONTEXT:
- **Date**: ${year}년 ${month}월 ${day}일 (${dayTheme.ko})
- **Season**: ${season.ko}
- **Random Theme**: ${todayRandomTheme}

## 🐶 PUPPY CHARACTER:
- The puppy TALKS and narrates in first person
- Puppy wears cute clothes and accessories

## PLATFORM: ${platformGuides[config.target_platform]}

## OUTPUT REQUIREMENTS:
${lang.instruction}

## OUTPUT FORMAT (JSON only, no markdown):
{
  "generation_theme": "${hasUserInput ? '사용자 입력 기반 풍자/패러디' : '오늘의 테마'}",
  "user_input_transformed": ${hasUserInput},
  "original_topic": ${hasUserInput ? `"${config.user_topic_input || ''}"` : 'null'},
  "ideas": [
    {
      "id": 1,
      "category": "satire/food/daily/emotion/comedy/healing",
      "topic": "강아지 시점의 귀여운 제목",
      "keywords": "키워드1, 키워드2, 키워드3",
      "satire_info": {
        "original_reference": "원본 주제",
        "transformation_method": "변환 방법",
        "humor_point": "웃음 포인트"
      },
      "puppy_character": {
        "suggested_breed": "추천 품종",
        "personality": "성격",
        "outfit": "의상",
        "props": ["소품1"]
      },
      "story_summary": "스토리 요약",
      "hook": "후킹 대사",
      "narration_style": "나레이션 스타일",
      "emotional_journey": "감정1 → 감정2 → 감정3",
      "viral_elements": ["요소1", "요소2"],
      "viral_potential": 8,
      "is_similar_to_previous": false,
      "similarity_note": null
    }
  ],
  "best_pick": {
    "id": 1,
    "reason": "선택 이유"
  }
}`;

  console.log(`\n🤖 Gemini API 호출 중... (${config.gemini_model})`);

  // =====================
  // 4. Gemini API 호출
  // =====================
  const startTime = Date.now();

  try {
    const response = await axios({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini_model}:generateContent`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": config.gemini_api_key,
      },
      data: {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 1.0,
          maxOutputTokens: 8192,
        },
      },
    });

    const elapsed = Date.now() - startTime;
    console.log(`\n✅ API 응답 완료 (${elapsed}ms)`);

    // JSON 파싱
    let responseContent = response.data.candidates[0].content.parts[0].text.trim();

    if (responseContent.startsWith("```json")) {
      responseContent = responseContent.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (responseContent.startsWith("```")) {
      responseContent = responseContent.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      responseContent = jsonMatch[0];
    }

    const result = JSON.parse(responseContent);

    // =====================
    // 5. 결과 출력
    // =====================
    console.log("\n" + "=".repeat(60));
    console.log(`📊 생성 결과 (${hasUserInput ? '🎭 풍자 모드' : '🐕 자동 모드'})`);
    console.log("=".repeat(60));

    console.log(`\n🎨 테마: ${result.generation_theme}`);
    if (result.original_topic) {
      console.log(`📰 원본 주제: ${result.original_topic}`);
    }
    console.log(`📝 생성된 아이디어: ${result.ideas.length}개`);

    result.ideas.forEach((idea, idx) => {
      console.log(`\n${"─".repeat(50)}`);
      console.log(`\n[아이디어 ${idx + 1}] ${idea.topic}`);
      console.log(`  📂 카테고리: ${idea.category}`);
      console.log(`  🔑 키워드: ${idea.keywords}`);

      if (idea.satire_info && idea.satire_info.original_reference) {
        console.log(`  🎭 풍자 정보:`);
        console.log(`     - 원본: ${idea.satire_info.original_reference}`);
        console.log(`     - 변환: ${idea.satire_info.transformation_method}`);
        console.log(`     - 웃음 포인트: ${idea.satire_info.humor_point}`);
      }

      console.log(`  🐕 캐릭터: ${idea.puppy_character?.suggested_breed || 'N/A'} (${idea.puppy_character?.personality || 'N/A'})`);
      console.log(`  👗 의상: ${idea.puppy_character?.outfit || 'N/A'}`);
      console.log(`  📖 스토리: ${idea.story_summary}`);
      console.log(`  🎣 후킹: ${idea.hook}`);
      console.log(`  🎭 감정: ${idea.emotional_journey}`);
      console.log(`  🔥 바이럴 점수: ${idea.viral_potential}/10`);
    });

    // Best Pick
    if (result.best_pick) {
      const bestIdea = result.ideas.find(i => i.id === result.best_pick.id);
      console.log(`\n${"=".repeat(60)}`);
      console.log(`🏆 BEST PICK: [${result.best_pick.id}] ${bestIdea?.topic || 'N/A'}`);
      console.log(`   이유: ${result.best_pick.reason}`);
    }

    // 최종 출력
    const selectedIdea = result.ideas.find(i => i.id === result.best_pick?.id) || result.ideas[0];

    const output = {
      topic: selectedIdea.topic,
      keywords: selectedIdea.keywords,
      puppy_character: selectedIdea.puppy_character,
      satire_info: selectedIdea.satire_info || null,
      is_satire: hasUserInput,
      original_topic: config.user_topic_input || null,
      keyword_hint: config.user_keyword_hint || null,
      story_summary: selectedIdea.story_summary,
      hook: selectedIdea.hook,
      narration_style: selectedIdea.narration_style,
      emotional_journey: selectedIdea.emotional_journey,
      category: selectedIdea.category,
      daily_context: {
        date: `${year}-${month}-${day}`,
        season: season.ko,
        day_of_week: dayTheme.ko,
        random_theme: todayRandomTheme,
      },
      selected: selectedIdea,
      all_ideas: result.ideas,
      generation_theme: result.generation_theme,
      settings: {
        language: config.language,
        target_platform: config.target_platform,
        generated_count: result.ideas.length,
        mode: hasUserInput ? "satire_transform" : "auto_generate",
      },
      generated_at: new Date().toISOString(),
    };

    console.log(`\n${"=".repeat(60)}`);
    console.log("📤 Script Generator 연동용 출력:");
    console.log(JSON.stringify(output, null, 2));

    return output;

  } catch (error) {
    console.error("\n❌ 오류 발생:", error.response?.data || error.message);
    throw error;
  }
}

// 실행
testTopicGenerator()
  .then(result => {
    console.log("\n✅ 테스트 완료!");
  })
  .catch(error => {
    console.error("\n❌ 테스트 실패:", error.message);
    process.exit(1);
  });
