/**
 * 퍼포먼스 타입 스크립트 생성 테스트
 * 새로운 3단계 구조: performance_start → performance_break → performance_resume
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyBAetgB-_9XwtEgvm4mJ49LYYL-z6legts";

// 테스트할 퍼포먼스 타입
const PERFORMANCE_TYPE = process.argv[2] || "beatbox";
console.log(`\n🎤 테스트 퍼포먼스 타입: ${PERFORMANCE_TYPE}\n`);

// Mock Topic Generator 출력 (퍼포먼스 타입)
const mockTopicGeneratorOutput = {
  topic: PERFORMANCE_TYPE === "beatbox" ? "강아지 비트박스 배틀" :
         PERFORMANCE_TYPE === "singing" ? "강아지가 부르는 감성 발라드" :
         PERFORMANCE_TYPE === "dance" ? "강아지 틱톡 댄스 챌린지" :
         PERFORMANCE_TYPE === "rap" ? "간식왕 강아지의 랩 배틀" :
         PERFORMANCE_TYPE === "instrument" ? "강아지 피아노 연주회" :
         "강아지 비트박스 배틀",
  content_type: "performance",
  content_type_config: {
    name: "퍼포먼스",
    emoji: "🎤",
    description: "비트박스, 노래, 댄스, 랩 등 음악 퍼포먼스",
    tone: "rhythmic, energetic, musical, entertaining",
    mood: "performance-driven, show-like",
    recommended_script_format: "monologue",
    themes: ["비트박스", "노래", "댄스", "랩", "악기 연주", "리듬"],
    emotion_range: ["신남", "자신감", "열정", "집중", "즐거움"],
  },
  script_format: "monologue",
};

async function testPerformanceScript() {
  console.log("=" .repeat(60));
  console.log("🧪 퍼포먼스 스크립트 생성 테스트 (새로운 3단계 구조)");
  console.log("=" .repeat(60));

  const topicData = mockTopicGeneratorOutput;
  const contentType = topicData.content_type;
  const contentTypeConfig = topicData.content_type_config;
  const effectiveTopic = topicData.topic;

  console.log(`\n📋 입력 정보:`);
  console.log(`   - 토픽: ${effectiveTopic}`);
  console.log(`   - 콘텐츠 타입: ${contentType}`);

  const targetDuration = 30;

  const prompt = `Create a ${targetDuration}s viral YouTube Short script for a PUPPY PERFORMANCE video.

TOPIC: ${effectiveTopic}

## 🎤 콘텐츠 타입: 퍼포먼스 (PERFORMANCE MODE)

### ⚠️⚠️⚠️ CRITICAL RULES ⚠️⚠️⚠️

#### 1. 캐릭터 제한 (매우 중요!)
- ❌ **sub1, sub2, sub3 캐릭터 사용 금지!** (할미, 할비 등 조연 등장 금지!)
- ❌ **인터뷰어 사용 금지!** (인터뷰 형식 금지!)
- ✅ **오직 main 캐릭터(주인공 강아지 "땅콩")만 등장!**
- ✅ speaker는 항상 "main"만 사용!

#### 2. 스크립트 형식
- ✅ 독백(monologue) 형식으로만 작성!
- ✅ 주인공이 카메라를 보고 직접 말하는 형식!

### 🎵 퍼포먼스 씬 구조 (10초 분량, 3단계)

#### STEP 1: 퍼포먼스 시작 (4초)
- **scene_type**: "performance_start"
- **narration**: "" (대사 없음!)
- **has_narration**: false
- **audio_details.bgm_featured**: true
- **audio_details.bgm_volume**: 0.8
- 설명: BGM ${PERFORMANCE_TYPE} 음악이 나오고, 강아지가 BGM에 맞춰 입을 움직임

#### STEP 2: 퍼포먼스 중간 멈춤 + 짧은 대사 (2초)
- **scene_type**: "performance_break"
- **narration**: 짧은 한마디 (예: "콩파민!", "부웅!" 등 2-3글자)
- **has_narration**: true
- **audio_details.bgm_featured**: false (BGM 멈춤!)
- **audio_details.bgm_volume**: 0
- **audio_details.voice_effect**: "robotic"
- 설명: BGM이 멈추고, 강아지가 기계음으로 짧은 단어를 외침

#### STEP 3: 퍼포먼스 재개 (4초)
- **scene_type**: "performance_resume"
- **narration**: "" (대사 없음!)
- **has_narration**: false
- **audio_details.bgm_featured**: true
- **audio_details.bgm_volume**: 0.8
- 설명: BGM 다시 시작, 강아지가 BGM에 맞춰 다시 립싱크

### 📋 전체 스크립트 구조 (30초 기준 - 6개 세그먼트)

1. **인트로 (5초)** - scene_type: "intro", narration: "안녕! 오늘 내 ${PERFORMANCE_TYPE === "beatbox" ? "비트박스" : PERFORMANCE_TYPE} 실력 보여줄게!"
2. **빌드업 (5초)** - scene_type: "buildup", narration: "준비됐어? 간다!"
3. **퍼포먼스 시작 (4초)** - scene_type: "performance_start", narration: ""
4. **퍼포먼스 멈춤 (2초)** - scene_type: "performance_break", narration: "${PERFORMANCE_TYPE === "beatbox" ? "콩파민!" : "짜잔!"}"
5. **퍼포먼스 재개 (4초)** - scene_type: "performance_resume", narration: ""
6. **아웃트로 (5초)** - scene_type: "outro", narration: "헥헥... 어때? 죽이지? 구독 눌러줘!"

한국어로 작성해주세요. speaker는 모두 "main"만 사용!

★★★ OUTPUT FORMAT (JSON only) ★★★
{
  "title": {"korean": "", "english": ""},
  "script_segments": [
    {
      "segment_number": 1,
      "speaker": "main",
      "character_name": "땅콩",
      "scene_type": "intro/buildup/performance_start/performance_break/performance_resume/outro",
      "narration": "대사 또는 빈 문자열",
      "has_narration": true/false,
      "emotion": "감정",
      "audio_details": {
        "bgm_featured": true/false,
        "bgm_volume": 0.8/0,
        "voice_effect": null/"robotic"
      }
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

    // =====================
    // 전체 JSON 출력
    // =====================
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📄 전체 JSON 출력:`);
    console.log(`${"=".repeat(60)}`);
    console.log(JSON.stringify(script, null, 2));
    console.log(`${"=".repeat(60)}`);

    // =====================
    // 세그먼트 분석
    // =====================
    console.log(`\n📊 세그먼트 분석:`);
    console.log("-".repeat(60));

    let performanceStartCount = 0;
    let performanceBreakCount = 0;
    let performanceResumeCount = 0;
    let introCount = 0;
    let outroCount = 0;
    let subCharacterUsed = false;

    script.script_segments?.forEach((seg, idx) => {
      const isStart = seg.scene_type === "performance_start";
      const isBreak = seg.scene_type === "performance_break";
      const isResume = seg.scene_type === "performance_resume";

      if (isStart) performanceStartCount++;
      if (isBreak) performanceBreakCount++;
      if (isResume) performanceResumeCount++;
      if (seg.scene_type === "intro" || seg.scene_type === "buildup") introCount++;
      if (seg.scene_type === "outro") outroCount++;
      if (seg.speaker !== "main") subCharacterUsed = true;

      // 검증
      let status = "✅ 정상";
      if (isStart && seg.narration && seg.narration.trim()) {
        status = "❌ 오류: performance_start인데 대사있음";
      }
      if (isResume && seg.narration && seg.narration.trim()) {
        status = "❌ 오류: performance_resume인데 대사있음";
      }
      if (isBreak && (!seg.narration || !seg.narration.trim())) {
        status = "⚠️ 경고: performance_break인데 대사없음";
      }
      if (seg.speaker !== "main") {
        status = "❌ 오류: main이 아닌 speaker 사용!";
      }

      console.log(`\n[${idx + 1}] ${seg.scene_type} ${status}`);
      console.log(`    - speaker: ${seg.speaker}`);
      console.log(`    - 대사: ${seg.narration ? `"${seg.narration.substring(0, 40)}${seg.narration.length > 40 ? '...' : ''}"` : "(없음)"}`);
      console.log(`    - has_narration: ${seg.has_narration}`);
      console.log(`    - bgm_featured: ${seg.audio_details?.bgm_featured}`);
      console.log(`    - bgm_volume: ${seg.audio_details?.bgm_volume}`);
      if (seg.audio_details?.voice_effect) {
        console.log(`    - voice_effect: ${seg.audio_details.voice_effect}`);
      }
    });

    // 요약
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📈 요약:`);
    console.log(`   - 인트로/빌드업: ${introCount}개`);
    console.log(`   - performance_start: ${performanceStartCount}개`);
    console.log(`   - performance_break: ${performanceBreakCount}개`);
    console.log(`   - performance_resume: ${performanceResumeCount}개`);
    console.log(`   - 아웃트로: ${outroCount}개`);

    // 검증 결과
    console.log(`\n🔍 검증 결과:`);
    const checks = [
      { name: "performance_start 존재", pass: performanceStartCount > 0 },
      { name: "performance_break 존재", pass: performanceBreakCount > 0 },
      { name: "performance_resume 존재", pass: performanceResumeCount > 0 },
      { name: "sub 캐릭터 미사용", pass: !subCharacterUsed },
    ];

    checks.forEach(check => {
      console.log(`   ${check.pass ? "✅" : "❌"} ${check.name}`);
    });

    const allPassed = checks.every(c => c.pass);
    console.log(`\n${allPassed ? "🎉 모든 검증 통과!" : "⚠️ 일부 검증 실패"}`);

    // BGM 정보 시뮬레이션
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🎵 BGM 구조 시뮬레이션:`);

    const bgmInfo = {
      is_performance: true,
      primary_performance_type: PERFORMANCE_TYPE,
      bgm_style: PERFORMANCE_TYPE === "beatbox" ? "beatbox rhythmic, mouth percussion, vocal drums" :
                 PERFORMANCE_TYPE === "dance" ? "dance beat, EDM rhythm, energetic" :
                 PERFORMANCE_TYPE === "rap" ? "hip-hop beat, trap instrumental, 808 bass" :
                 "energetic rhythmic",
      performance_structure: {
        start_segments: script.script_segments?.filter(s => s.scene_type === "performance_start"),
        break_segments: script.script_segments?.filter(s => s.scene_type === "performance_break"),
        resume_segments: script.script_segments?.filter(s => s.scene_type === "performance_resume"),
      },
    };

    console.log(`\n퍼포먼스 타입: ${bgmInfo.primary_performance_type}`);
    console.log(`BGM 스타일: ${bgmInfo.bgm_style}`);
    console.log(`\nBGM 타임라인:`);

    let currentTime = 0;
    script.script_segments?.forEach((seg, idx) => {
      const duration = 5; // 각 세그먼트 약 5초
      const bgmStatus = seg.audio_details?.bgm_featured ? "🔊 BGM 80%" : "🔇 BGM 0%";
      const ttsStatus = seg.has_narration && seg.scene_type === "performance_break" ? "🎤 기계음 TTS" :
                       seg.has_narration ? "🎤 TTS" : "";

      console.log(`   ${currentTime}s-${currentTime + duration}s: ${seg.scene_type} ${bgmStatus} ${ttsStatus}`);
      currentTime += duration;
    });

    console.log(`\n✅ 테스트 완료!`);

  } catch (error) {
    console.error(`\n❌ 오류 발생:`, error.message);
  }
}

// 실행
testPerformanceScript();
