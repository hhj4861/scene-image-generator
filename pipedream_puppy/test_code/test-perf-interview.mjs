/**
 * 퍼포먼스 타입 스크립트 생성 테스트
 * 인터뷰 + 퍼포먼스 하이브리드 구조
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyBAetgB-_9XwtEgvm4mJ49LYYL-z6legts";

const PERFORMANCE_TYPE = process.argv[2] || "beatbox";
console.log(`\n🎤 테스트 퍼포먼스 타입: ${PERFORMANCE_TYPE}\n`);

const mockTopicGeneratorOutput = {
  topic: "강아지 비트박스 배틀",
  content_type: "performance",
  script_format: "interview",
};

async function testPerformanceInterview() {
  console.log("=".repeat(60));
  console.log("🧪 퍼포먼스 스크립트 테스트 (인터뷰 + 퍼포먼스 하이브리드)");
  console.log("=".repeat(60));

  const prompt = `Create a viral YouTube Short script for a PUPPY PERFORMANCE video.

TOPIC: 강아지 비트박스 배틀

## 🎤 콘텐츠 타입: 퍼포먼스 (PERFORMANCE MODE)

퍼포먼스 콘텐츠는 **인터뷰 형식 중간에 퍼포먼스 씬을 삽입**하는 구조입니다!

### ⚠️ VEO3 VIDEO DURATION RULES (매우 중요!)
- ⚠️ Veo3는 4초, 6초, 8초만 지원! (5초, 7초 등 불가능!)
- 각 씬의 duration은 반드시 4, 6, 8 중 하나로 설정!
- 씬 개수: 8개 (인터뷰 3개 + 퍼포먼스 3단계 + 마무리 2개)
- 퍼포먼스 씬 duration: start(6초), break(4초), resume(6초)

### 📋 전체 스크립트 구조 (8개 세그먼트)

1. **인터뷰 질문 1** - speaker: "interviewer" (존대말 필수!)
   - scene_type: "interview_question"
   - duration: 6
   - 예: "땅콩 씨, 비트박스를 시작하게 된 계기가 무엇인가요?"

2. **인터뷰 대답 1** - speaker: "main"
   - scene_type: "interview_answer"
   - duration: 4
   - 예: "어릴 때부터 리듬을 타는 게 너무 좋았어요!"

3. **인터뷰 질문 2 (퍼포먼스 유도)** - speaker: "interviewer"
   - scene_type: "interview_question"
   - duration: 6
   - 예: "그렇군요! 그럼 오늘 비트박스 실력을 보여주시겠어요?"

4. **퍼포먼스 시작** - speaker: "main"
   - scene_type: "performance_start"
   - duration: 6
   - narration: "" (대사 없음!)
   - has_narration: false
   - audio_details: {"bgm_featured": true, "bgm_volume": 0.8}

5. **퍼포먼스 멈춤 + 대사** - speaker: "main"
   - scene_type: "performance_break"
   - duration: 4
   - narration: "콩파민!" (짧은 단어!)
   - has_narration: true
   - audio_details: {"bgm_featured": false, "bgm_volume": 0, "voice_effect": "robotic"}

6. **퍼포먼스 재개** - speaker: "main"
   - scene_type: "performance_resume"
   - duration: 6
   - narration: "" (대사 없음!)
   - has_narration: false
   - audio_details: {"bgm_featured": true, "bgm_volume": 0.8}

7. **인터뷰 마무리** - speaker: "interviewer"
   - scene_type: "interview_question"
   - duration: 4
   - 예: "와! 정말 대단하시네요! 마지막으로 한마디 해주세요."

8. **아웃트로** - speaker: "main"
   - scene_type: "interview_answer"
   - duration: 4
   - 예: "헥헥... 구독하고 좋아요 눌러주세요!"

### 🎙️ 인터뷰어 규칙
⚠️ **인터뷰어는 항상 존대말!**
- ❌ 금지: "땅콩아, 비트박스 해봐" (반말)
- ✅ 올바른: "땅콩 씨, 비트박스 실력을 보여주시겠어요?" (존대말)

한국어로 작성해주세요.

★★★ OUTPUT FORMAT (JSON only) ★★★
{
  "title": {"korean": "", "english": ""},
  "script_segments": [
    {
      "segment_number": 1,
      "duration": 6,
      "speaker": "interviewer/main",
      "character_name": "인터뷰어/땅콩",
      "scene_type": "interview_question/interview_answer/performance_start/performance_break/performance_resume",
      "narration": "대사 또는 빈 문자열",
      "has_narration": true/false,
      "emotion": "감정",
      "audio_details": {"bgm_featured": true/false, "bgm_volume": 0.8/0, "voice_effect": null/"robotic"}
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

    // 세그먼트 분석
    console.log(`\n📊 세그먼트 분석:`);

    let interviewerCount = 0;
    let performanceStartCount = 0;
    let performanceBreakCount = 0;
    let performanceResumeCount = 0;
    let interviewerUsingInformal = false;

    const informalPatterns = [/뭐야\?/, /어때\?/, /했어\?/, /됐어\?/, /해봐/, /해줘/];

    script.script_segments?.forEach((seg, idx) => {
      if (seg.speaker === "interviewer") {
        interviewerCount++;
        if (informalPatterns.some(p => p.test(seg.narration || ""))) {
          interviewerUsingInformal = true;
        }
      }
      if (seg.scene_type === "performance_start") performanceStartCount++;
      if (seg.scene_type === "performance_break") performanceBreakCount++;
      if (seg.scene_type === "performance_resume") performanceResumeCount++;

      const sceneIcon = seg.scene_type?.includes("performance") ? "🎵" :
                       seg.speaker === "interviewer" ? "🎙️" : "🐕";

      console.log(`\n[${idx + 1}] ${sceneIcon} ${seg.scene_type}`);
      console.log(`    speaker: ${seg.speaker}`);
      console.log(`    duration: ${seg.duration || "(미설정)"}초`);
      console.log(`    대사: ${seg.narration ? `"${seg.narration.substring(0, 50)}"` : "(없음)"}`);
      console.log(`    bgm: ${seg.audio_details?.bgm_featured ? "80%" : "0%"}`);
      if (seg.audio_details?.voice_effect) {
        console.log(`    voice_effect: ${seg.audio_details.voice_effect}`);
      }
    });

    // 총 영상 길이 계산
    const totalDuration = script.script_segments?.reduce((sum, seg) => sum + (seg.duration || 0), 0) || 0;
    console.log(`\n⏱️ 총 영상 길이: ${totalDuration}초`);

    // Veo3 허용 duration 검증
    const VEO3_ALLOWED = [4, 6, 8];
    const invalidDurations = script.script_segments?.filter(seg =>
      seg.duration && !VEO3_ALLOWED.includes(seg.duration)
    ) || [];
    const allDurationsValid = invalidDurations.length === 0;

    if (!allDurationsValid) {
      console.log(`\n⚠️ Veo3 미지원 duration 발견:`);
      invalidDurations.forEach(seg => {
        console.log(`   - 씬 ${seg.segment_number}: ${seg.duration}초 (4, 6, 8만 가능)`);
      });
    }

    // 검증 결과
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🔍 검증 결과:`);
    const checks = [
      { name: "인터뷰어 질문 존재", pass: interviewerCount > 0 },
      { name: "인터뷰어 존대말 사용", pass: !interviewerUsingInformal },
      { name: "performance_start 존재", pass: performanceStartCount > 0 },
      { name: "performance_break 존재", pass: performanceBreakCount > 0 },
      { name: "performance_resume 존재", pass: performanceResumeCount > 0 },
      { name: "Veo3 duration 준수 (4,6,8초)", pass: allDurationsValid },
    ];

    checks.forEach(check => {
      console.log(`   ${check.pass ? "✅" : "❌"} ${check.name}`);
    });

    const allPassed = checks.every(c => c.pass);
    console.log(`\n${allPassed ? "🎉 모든 검증 통과!" : "⚠️ 일부 검증 실패"}`);

    console.log(`\n✅ 테스트 완료!`);

  } catch (error) {
    console.error(`\n❌ 오류 발생:`, error.message);
  }
}

testPerformanceInterview();
