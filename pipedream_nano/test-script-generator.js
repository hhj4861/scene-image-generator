/**
 * Script Generator 로컬 테스트
 * Gemini API를 사용하여 대본 생성 테스트
 */

import 'dotenv/config';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-3-pro-preview";

async function testScriptGenerator() {
  console.log("=".repeat(50));
  console.log("🎬 Script Generator 테스트 (Gemini)");
  console.log("=".repeat(50));
  console.log(`모델: ${GEMINI_MODEL}`);
  console.log(`API Key: ${GEMINI_API_KEY ? "설정됨 ✅" : "없음 ❌"}`);

  if (!GEMINI_API_KEY) {
    console.error("\n❌ GEMINI_API_KEY가 .env 파일에 설정되지 않았습니다.");
    process.exit(1);
  }

  // 테스트 파라미터
  const topic = "시바견";
  const content_angle = "shocking_facts";
  const content_style = "pet";
  const target_emotion = "warm";
  const duration_seconds = 30;
  const language = "japanese";

  // 앵글 가이드
  const angleGuides = {
    shocking_facts: {
      hook_template: "99%의 사람들이 모르는 {topic}의 비밀",
      structure: "충격적 사실 제시 → 왜 몰랐는지 → 더 놀라운 사실들 → 시청자 반응 유도",
      requirements: "구체적인 숫자, 연구 결과, 또는 검증된 사실 포함 필수",
      examples: [
        "시바견이 절대로 하지 않는 행동이 있는데, 이유가 충격적입니다",
        "고양이가 박스를 좋아하는 진짜 이유, 과학자들도 놀랐습니다",
      ],
      avoid: ["~에 대해 알아보겠습니다", "오늘은 ~를 소개합니다"],
    },
  };

  const angle = angleGuides[content_angle];
  const estimatedChars = duration_seconds * 4; // 일본어 초당 4자
  const sceneCount = Math.ceil(duration_seconds / 5);

  // 프롬프트 생성
  const prompt = `You are an expert viral content creator specializing in YouTube Shorts that get millions of views.

## 🎯 TOPIC: "${topic}"

## 📐 CONTENT ANGLE:
- Type: ${content_angle}
- Hook Template: "${angle.hook_template.replace('{topic}', topic)}"
- Structure: ${angle.structure}
- Requirements: ${angle.requirements}

### ✅ GOOD HOOK EXAMPLES:
${angle.examples.map(ex => `- "${ex}"`).join('\n')}

### ❌ PHRASES TO AVOID:
${angle.avoid.map(av => `- "${av}"`).join('\n')}

## 📊 CONTENT SETTINGS:
- Content Style: ${content_style}
- Target Emotion: ${target_emotion}
- Duration: ${duration_seconds} seconds
- Language: Japanese
- Estimated characters: ~${estimatedChars} characters
- Number of scenes: ${sceneCount}

## Requirements:
1. 日本語で書いてください
2. Write a script that is AT LEAST ${estimatedChars} characters long
3. Include scene descriptions for image generation

## Output Format (JSON):
{
  "title": {
    "japanese": "Japanese title",
    "korean": "한국어 제목",
    "english": "English title"
  },
  "hook": "First 2 seconds hook",
  "full_script": "Complete narration script in Japanese",
  "script_segments": [
    {
      "segment_number": 1,
      "start_time": 0,
      "end_time": 5,
      "narration": "Narration text",
      "scene_description": "Visual description for image generation"
    }
  ],
  "hashtags": {
    "japanese": ["#shorts"],
    "english": ["#shorts"]
  }
}

Return ONLY valid JSON, no markdown formatting.`;

  const systemPrompt = `You are an expert viral content scriptwriter specializing in Japanese YouTube Shorts. Always respond with valid JSON only.`;

  console.log("\n📤 Gemini API 호출 중...\n");

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${systemPrompt}\n\n${prompt}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error("❌ API 에러:", JSON.stringify(error, null, 2));
      return;
    }

    const data = await response.json();

    // 응답 파싱
    let responseContent = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!responseContent) {
      console.error("❌ 응답이 비어있습니다:", JSON.stringify(data, null, 2));
      return;
    }

    console.log("📥 Raw 응답 (처음 500자):");
    console.log(responseContent.substring(0, 500) + "...\n");

    // JSON 파싱
    if (responseContent.startsWith("```json")) {
      responseContent = responseContent.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (responseContent.startsWith("```")) {
      responseContent = responseContent.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      responseContent = jsonMatch[0];
    }

    const script = JSON.parse(responseContent);

    console.log("=".repeat(50));
    console.log("✅ 생성 완료!");
    console.log("=".repeat(50));

    console.log("\n📌 제목:");
    console.log(`  일본어: ${script.title?.japanese}`);
    console.log(`  한국어: ${script.title?.korean}`);
    console.log(`  영어: ${script.title?.english}`);

    console.log("\n🎣 Hook:");
    console.log(`  ${script.hook}`);

    console.log("\n📝 전체 스크립트:");
    console.log(`  ${script.full_script?.substring(0, 200)}...`);

    console.log("\n🎬 장면 수:", script.script_segments?.length || 0);

    if (script.script_segments?.length > 0) {
      console.log("\n첫 번째 장면:");
      const seg = script.script_segments[0];
      console.log(`  시간: ${seg.start_time}s - ${seg.end_time}s`);
      console.log(`  나레이션: ${seg.narration?.substring(0, 100)}...`);
      console.log(`  장면 설명: ${seg.scene_description?.substring(0, 100)}...`);
    }

    console.log("\n#️⃣ 해시태그:");
    console.log(`  일본어: ${script.hashtags?.japanese?.join(", ")}`);
    console.log(`  영어: ${script.hashtags?.english?.join(", ")}`);

  } catch (error) {
    console.error("❌ 에러:", error.message);
    if (error.cause) {
      console.error("원인:", error.cause);
    }
  }
}

testScriptGenerator();
