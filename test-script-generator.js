import 'dotenv/config';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 테스트 설정
const testConfig = {
  topic: "시바견",
  content_angle: "shocking_facts",
  content_style: "pet",
  target_emotion: "cute",
  voice_style: "friendly",
  duration_seconds: 45,
  language: "korean",
};

// 앵글 가이드
const angleGuides = {
  shocking_facts: {
    hook_template: "99%의 사람들이 모르는 {topic}의 비밀",
    structure: "충격적 사실 제시 → 왜 몰랐는지 → 더 놀라운 사실들 → 시청자 반응 유도",
    requirements: "구체적인 숫자, 연구 결과, 또는 검증된 사실 포함 필수",
    examples: [
      "시바견이 절대로 하지 않는 행동이 있는데, 이유가 충격적입니다",
      "고양이가 박스를 좋아하는 진짜 이유, 과학자들도 놀랐습니다",
      "강아지 코가 젖어있는 이유, 알고 나면 소름돋습니다",
    ],
    avoid: ["~에 대해 알아보겠습니다", "오늘은 ~를 소개합니다"],
  },
  hidden_meaning: {
    hook_template: "{topic}이 {행동}하는 진짜 이유",
    structure: "행동 묘사 → 흔한 오해 → 진짜 이유 → 대처법",
    requirements: "과학적/행동학적 근거. 출처 있으면 더 좋음",
    examples: [
      "강아지가 발을 핥는 진짜 이유, 애정 표현 아닙니다",
      "고양이가 화장실 따라오는 숨겨진 의미",
      "강아지가 잘 때 발을 떠는 이유, 꿈 때문 아닙니다",
    ],
    avoid: ["~일 수도 있습니다", "여러 이유가 있습니다"],
  },
};

const styleGuides = {
  pet: {
    structure: "흥미로운 사실 → 귀여운 예시 → 깊은 정보 → 시청자 참여 유도",
    tone: "따뜻하면서도 정보성 있는",
    keywords_jp: ["犬", "猫", "ペット", "家族", "癒し", "かわいい", "驚き"],
  },
};

const emotionGuides = {
  cute: "귀엽고 사랑스러운, 심쿵하는",
};

const voiceGuides = {
  friendly: "친근하고 편안한 톤, 친구에게 말하듯",
};

const languageConfig = {
  korean: {
    name: "한국어",
    instruction: "한국어로 작성해주세요. 자연스러운 한국어 표현을 사용해주세요.",
    chars_per_second: 5,
  },
};

async function testScriptGenerator() {
  console.log("═".repeat(60));
  console.log("🎬 Script Generator 테스트");
  console.log("═".repeat(60));
  console.log(`\n📝 주제: ${testConfig.topic}`);
  console.log(`📐 앵글: ${testConfig.content_angle}`);
  console.log(`⏱️  길이: ${testConfig.duration_seconds}초`);

  const angle = angleGuides[testConfig.content_angle];
  const style = styleGuides[testConfig.content_style];
  const emotion = emotionGuides[testConfig.target_emotion];
  const voice = voiceGuides[testConfig.voice_style];
  const lang = languageConfig[testConfig.language];

  const estimatedChars = testConfig.duration_seconds * lang.chars_per_second;
  const sceneCount = Math.ceil(testConfig.duration_seconds / 5);

  const prompt = `You are an expert viral content creator specializing in YouTube Shorts that get millions of views.

## 🎯 TOPIC: "${testConfig.topic}"

## 📐 CONTENT ANGLE (CRITICAL - FOLLOW THIS EXACTLY):
- Type: ${testConfig.content_angle}
- Hook Template: "${angle.hook_template.replace('{topic}', testConfig.topic)}"
- Structure: ${angle.structure}
- Requirements: ${angle.requirements}

### ✅ GOOD HOOK EXAMPLES (Study these patterns):
${angle.examples.map(ex => `- "${ex}"`).join('\n')}

### ❌ PHRASES TO AVOID (NEVER use these):
${angle.avoid.map(av => `- "${av}"`).join('\n')}

## 📊 CONTENT SETTINGS:
- Content Style: ${testConfig.content_style} (${style.tone})
- Target Emotion: ${emotion}
- Voice Style: ${voice}
- Duration: ${testConfig.duration_seconds} seconds
- Language: ${lang.name}
- Estimated characters: ~${estimatedChars} characters
- Number of scenes: ${sceneCount}

## 🔥 VIRAL CONTENT RULES (MANDATORY):

### 1. HOOK (First 3 seconds) - MAKE OR BREAK
- Must create IMMEDIATE curiosity or shock
- Use the hook template pattern above
- NO generic openings like "오늘은 ~에 대해..."
- Start with the most surprising fact or statement

### 2. SPECIFICITY IS KING
- ❌ BAD: "강아지는 후각이 좋습니다" (boring, everyone knows)
- ✅ GOOD: "강아지 코에는 3억개의 후각 수용체가 있는데, 이건 인간의 50배입니다"
- ❌ BAD: "산책이 중요합니다" (generic)
- ✅ GOOD: "옥스포드 대학 연구팀이 8년간 추적한 결과, 하루 23분 산책하는 강아지의 수명이 평균 2.7년 길었습니다"

### 3. EMOTIONAL TRIGGERS
- Surprise: "이건 아무도 몰랐는데..."
- Curiosity: "진짜 이유는 따로 있었습니다"

### 4. UNIQUE ANGLE REQUIREMENT
- Find information that 99% of similar videos DON'T cover
- Include at least ONE surprising statistic or research finding

## Japanese Market Keywords Reference:
${style.keywords_jp.join(", ")}

## Requirements:
1. ${lang.instruction}
2. Write a script that is AT LEAST ${estimatedChars} characters long
3. Follow the structure: ${style.structure}
4. Evoke the emotion: ${emotion}
5. Include natural pauses marked with "..."
6. Hook viewers in the first 2 seconds

## Output Format (JSON):
{
  "title": {
    "japanese": "Japanese title for YouTube",
    "korean": "한국어 제목",
    "english": "English title"
  },
  "hook": "First 2 seconds - attention grabber (must be shocking/curious)",
  "full_script": "Complete narration script in ${lang.name}",
  "script_segments": [
    {
      "segment_number": 1,
      "start_time": 0,
      "end_time": 5,
      "narration": "Narration text for this segment",
      "scene_description": "Detailed visual description for AI image generation - realistic photography style, specific details",
      "visual_keywords": ["keyword1", "keyword2"]
    }
  ],
  "hashtags": {
    "korean": ["#쇼츠", "#강아지"],
    "english": ["#shorts", "#dog"]
  },
  "key_facts": ["Surprising fact 1 used in script", "Surprising fact 2"],
  "total_duration": ${testConfig.duration_seconds}
}

Return ONLY valid JSON, no markdown formatting.`;

  console.log("\n🤖 GPT-4o 호출 중...\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert viral content scriptwriter. Create scripts that are SPECIFIC, SURPRISING, and ENGAGING. Avoid generic content at all costs. Always respond with valid JSON only.",
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.9,
      max_tokens: 4000,
    });

    let content = response.choices[0].message.content.trim();

    // JSON 파싱
    if (content.startsWith("```json")) {
      content = content.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (content.startsWith("```")) {
      content = content.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const script = JSON.parse(content);

    console.log("═".repeat(60));
    console.log("✅ 스크립트 생성 완료!");
    console.log("═".repeat(60));

    console.log("\n📌 제목:");
    console.log(`   한국어: ${script.title?.korean}`);
    console.log(`   일본어: ${script.title?.japanese}`);

    console.log("\n🎣 Hook (첫 문장):");
    console.log(`   "${script.hook}"`);

    console.log("\n📜 전체 스크립트:");
    console.log("─".repeat(60));
    console.log(script.full_script);
    console.log("─".repeat(60));

    console.log(`\n📊 글자수: ${script.full_script?.length}자 (목표: ${estimatedChars}자)`);

    console.log("\n🎬 장면 구성:");
    script.script_segments?.forEach((seg, i) => {
      console.log(`\n   [${seg.start_time}s - ${seg.end_time}s] 장면 ${i + 1}`);
      console.log(`   나레이션: ${seg.narration?.substring(0, 50)}...`);
      console.log(`   시각적 키워드: ${seg.visual_keywords?.join(", ")}`);
    });

    console.log("\n🔬 사용된 흥미로운 사실:");
    script.key_facts?.forEach((fact, i) => {
      console.log(`   ${i + 1}. ${fact}`);
    });

    console.log("\n#️⃣  해시태그:");
    console.log(`   ${script.hashtags?.korean?.join(" ")}`);

    return script;

  } catch (error) {
    console.error("\n❌ 에러:", error.message);
    throw error;
  }
}

// 실행
testScriptGenerator()
  .then(() => {
    console.log("\n" + "═".repeat(60));
    console.log("✅ 테스트 완료!");
    console.log("═".repeat(60));
  })
  .catch(error => {
    console.error("\n❌ 테스트 실패:", error.message);
    process.exit(1);
  });
