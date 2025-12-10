/**
 * 인터뷰 타입 스크립트 생성 테스트
 * 인터뷰어가 존대말을 사용하는지 확인
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyBAetgB-_9XwtEgvm4mJ49LYYL-z6legts";

// Mock Topic Generator 출력 (인터뷰 타입 - 풍자)
const mockTopicGeneratorOutput = {
  topic: "쿠팡 개인정보 유출 사건을 강아지 세계로 풍자",
  content_type: "satire",
  content_type_config: {
    name: "풍자",
    emoji: "🎭",
    description: "시사/이슈를 강아지 세계로 풍자",
    tone: "satirical, clever, witty",
    mood: "playful but sharp",
    recommended_script_format: "interview",
    themes: ["시사 풍자"],
    emotion_range: ["분노", "억울", "당당"],
  },
  script_format: "interview",
};

async function testInterviewScript() {
  console.log("=".repeat(60));
  console.log("🧪 인터뷰 스크립트 생성 테스트 (존대말 확인)");
  console.log("=".repeat(60));

  const topicData = mockTopicGeneratorOutput;
  const effectiveTopic = topicData.topic;

  console.log(`\n📋 입력 정보:`);
  console.log(`   - 토픽: ${effectiveTopic}`);
  console.log(`   - 콘텐츠 타입: ${topicData.content_type}`);
  console.log(`   - 스크립트 형식: ${topicData.script_format}`);

  const targetDuration = 30;

  const prompt = `Create a ${targetDuration}s viral YouTube Short script.

TOPIC: ${effectiveTopic}

## 🎭 콘텐츠 타입: 풍자 (SATIRE MODE)

★★★ 스크립트 형식: INTERVIEW (매우 중요!!!) ★★★

🎤 **인터뷰 형식 (INTERVIEW FORMAT) - 반드시 이 형식으로 작성!**

### 🎙️ 인터뷰어 말투 규칙 (CRITICAL!)
⚠️ **인터뷰어는 항상 존대말(존칭)을 사용!**
- ❌ 금지: "콩아, 비트박스를 시작하게 된 계기가 뭐야?" (반말)
- ❌ 금지: "그래서 어떻게 됐어?" (반말)
- ✅ 올바른 예: "땅콩 씨, 비트박스를 시작하게 된 계기가 무엇인가요?" (존대말)
- ✅ 올바른 예: "그래서 어떻게 되셨나요?" (존대말)
- ✅ 올바른 예: "당시 심정이 어떠셨나요?" (존대말)
- 인터뷰어는 전문 뉴스 앵커처럼 격식있고 정중하게 질문!

**인터뷰 구성 (필수!):**
1. 인터뷰어가 질문할 때: speaker: "interviewer"
2. 주인공(강아지)이 대답할 때: speaker: "main"

**캐릭터:**
- main: 땅콩 (주인공 강아지)
- interviewer: 인터뷰어 (전문 뉴스 앵커, 존대말 필수!)

한국어로 작성해주세요.

★★★ OUTPUT FORMAT (JSON only) ★★★
{
  "title": {"korean": "", "english": ""},
  "script_segments": [
    {
      "segment_number": 1,
      "speaker": "interviewer 또는 main",
      "character_name": "인터뷰어 또는 땅콩",
      "scene_type": "interview_question 또는 interview_answer",
      "narration": "대사 내용",
      "has_narration": true,
      "emotion": "감정"
    }
  ]
}`;

  console.log(`\n🚀 Gemini API 호출 중...`);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      console.error(`\n❌ API 오류:`, data.error);
      return;
    }

    let content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "");
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const script = JSON.parse(jsonMatch ? jsonMatch[0] : content);

    console.log(`\n✅ 스크립트 생성 완료!`);
    console.log(`   - 제목: ${script.title?.korean || script.title?.english}`);
    console.log(`   - 총 세그먼트: ${script.script_segments?.length}개`);

    // 전체 JSON 출력
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📄 전체 JSON 출력:`);
    console.log(`${"=".repeat(60)}`);
    console.log(JSON.stringify(script, null, 2));
    console.log(`${"=".repeat(60)}`);

    // 인터뷰어 대사 검증
    console.log(`\n📊 인터뷰어 대사 분석:`);
    console.log("-".repeat(60));

    const interviewerSegments = script.script_segments?.filter(seg => seg.speaker === "interviewer") || [];
    
    interviewerSegments.forEach((seg, idx) => {
      const narration = seg.narration || "";
      // 반말 패턴 체크
      const informalPatterns = [
        /뭐야\?/,
        /어때\?/,
        /했어\?/,
        /됐어\?/,
        /봤어\?/,
        /알아\?/,
        /해줘/,
        /해봐/,
        /말해봐/,
        /보여줘/,
      ];
      
      const hasInformal = informalPatterns.some(pattern => pattern.test(narration));
      const status = hasInformal ? "❌ 반말 사용!" : "✅ 존대말 OK";
      
      console.log(`\n[인터뷰어 ${idx + 1}] ${status}`);
      console.log(`   대사: "${narration}"`);
    });

    // 요약
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📈 요약:`);
    console.log(`   - 총 세그먼트: ${script.script_segments?.length}개`);
    console.log(`   - 인터뷰어 질문: ${interviewerSegments.length}개`);
    console.log(`   - 주인공 대답: ${script.script_segments?.filter(seg => seg.speaker === "main").length}개`);

    console.log(`\n✅ 테스트 완료!`);

  } catch (error) {
    console.error(`\n❌ 오류 발생:`, error.message);
  }
}

// 실행
testInterviewScript();
