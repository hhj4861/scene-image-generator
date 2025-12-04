import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Puppy Video Generator",
  description: "Script Generator 결과를 받아 Veo 3용 비디오 생성 프롬프트 생성",

  props: {
    script_generator_output: {
      type: "string",
      label: "Script Generator Output (JSON)",
      description: "{{JSON.stringify(steps.Puppy_Script_Generator.$return_value)}}",
    },
  },

  async run({ $ }) {
    // =====================
    // 1. Script Generator 결과 파싱
    // =====================
    let scriptData = null;
    try {
      scriptData = typeof this.script_generator_output === "string"
        ? JSON.parse(this.script_generator_output)
        : this.script_generator_output;
    } catch (e) {
      throw new Error(`Failed to parse script generator output: ${e.message}`);
    }

    if (!scriptData) {
      throw new Error("Script generator output is required");
    }

    const characters = scriptData.characters || {};
    const script = scriptData.script || {};
    const scriptSegments = script.script_segments || [];
    const scriptFormat = scriptData.topic_info?.script_format || "interview";
    const contentType = scriptData.content_type || "satire";
    const effectiveTopic = scriptData.topic_info?.topic || "귀여운 강아지의 일상";

    // ★★★ 일관성 정보 추출 (script-generator에서 전달) ★★★
    const consistencyInfo = scriptData.consistency || {};

    $.export("input_info", {
      segments_count: scriptSegments.length,
      characters_count: Object.keys(characters).length,
      script_format: scriptFormat,
      content_type: contentType,
      has_consistency_info: !!scriptData.consistency,
    });

    // =====================
    // 2. 음성 스타일 매핑
    // =====================
    const voiceStyleMap = {
      main: "super cute baby voice, 2-3 years old infant, low-pitched adorable tone, soft cooing babbling speech, innocent baby talk with slight lisp",
      sub1: "warm gentle elderly woman voice, loving grandmother tone",
      sub2: "kind mature adult male voice, gentle father figure",
      sub3: "friendly adult female voice, caring and warm",
      interviewer: "Korean female news anchor, 30s, professional friendly tone",
    };

    // =====================
    // 3. 한글 입모양 매핑 (Veo 3 립싱크용) - 모음 기반
    // =====================
    // 한글 중성(모음) 21개에 대한 입모양 정의
    const vowelMouthShapes = {
      0: "mouth wide open jaw drops",      // ㅏ
      1: "mouth open lips stretched",       // ㅐ
      2: "mouth wide open jaw drops",      // ㅑ
      3: "mouth open lips stretched",       // ㅒ
      4: "mouth medium open rounded",       // ㅓ
      5: "mouth open stretched",            // ㅔ
      6: "mouth medium open rounded",       // ㅕ
      7: "mouth open stretched",            // ㅖ
      8: "lips form round O",               // ㅗ
      9: "lips round then wide",            // ㅘ
      10: "lips round then stretched",      // ㅙ
      11: "lips round O shape",             // ㅚ
      12: "lips form round O",              // ㅛ
      13: "lips push forward round",        // ㅜ
      14: "lips forward then open",         // ㅝ
      15: "lips forward then stretched",    // ㅞ
      16: "lips push forward round",        // ㅟ
      17: "lips push forward round",        // ㅠ
      18: "lips stretch wide teeth close",  // ㅡ
      19: "lips stretch then sideways",     // ㅢ
      20: "lips stretch sideways teeth visible", // ㅣ
    };

    // 한글 음절에서 모음 추출 및 입모양 생성
    const extractMouthShapes = (text) => {
      if (!text) return null;
      const shapes = {};
      const chars = text.replace(/[^가-힣]/g, '').split('');

      for (const char of chars) {
        if (shapes[char]) continue; // 이미 추출된 글자 스킵

        const code = char.charCodeAt(0);
        if (code >= 0xAC00 && code <= 0xD7A3) {
          // 한글 음절 분해: 중성(모음) 인덱스 추출
          const syllableIndex = code - 0xAC00;
          const vowelIndex = Math.floor((syllableIndex % (21 * 28)) / 28);
          const mouthShape = vowelMouthShapes[vowelIndex];
          if (mouthShape) {
            shapes[char] = mouthShape;
          }
        }
      }
      return Object.keys(shapes).length > 0 ? shapes : null;
    };

    // =====================
    // 4. 액션 키워드 감지 및 매핑 (대사에서 동작 추출)
    // =====================
    const actionKeywordMap = {
      // 춤/댄스
      "핫팩 댄스": "doing cute hot pack dance, bouncing rhythmically with hot pack",
      "핫팩댄스": "doing cute hot pack dance, bouncing rhythmically with hot pack",
      "댄스": "dancing energetically with body moving rhythmically",
      "춤추": "dancing happily with cute moves",
      "춤을": "dancing with adorable swaying motions",
      "춤": "dancing with cute body movements",
      "흔들흔들": "swaying body side to side playfully",
      "흔들": "swaying body gently",

      // 뛰기/점프
      "폴짝폴짝": "hopping repeatedly with joy, bouncing up and down energetically",
      "폴짝": "hopping cutely, bouncing with excitement",
      "뛰어다": "running and jumping around playfully",
      "뛰어": "jumping excitedly with energy",
      "점프": "jumping up high with enthusiasm",
      "깡충깡충": "hopping like a bunny, bouncing cutely",
      "깡충": "bouncing hop, cute jumping motion",
      "펄쩍": "leaping up suddenly, big jump",

      // 돌기/회전
      "빙글빙글": "spinning around playfully, twirling in circles",
      "빙글": "spinning in a circle, cute twirl",
      "돌아가": "turning around in circles",
      "돌아": "turning motion, spinning",
      "회전": "spinning in place, rotating playfully",

      // 꼬리/흔들기
      "꼬리 흔": "wagging tail happily and energetically",
      "꼬리를 흔": "wagging tail with excitement",
      "꼬리가 흔": "tail wagging automatically with joy",
      "살랑살랑": "swaying tail or body gently, soft wagging",

      // 달리기/이동
      "달려": "running forward quickly with excitement",
      "뛰어가": "running towards something eagerly",
      "달리": "running with speed",
      "뒹굴뒹굴": "rolling around playfully on the ground",
      "뒹굴": "rolling over cutely",

      // 앉기/눕기
      "앉아": "sitting down cutely",
      "누워": "lying down comfortably",
      "엎드려": "lying face down, prostrate position",
      "일어나": "standing up, getting up energetically",
      "벌떡": "jumping up suddenly, getting up quickly",

      // 손/발 동작
      "박수": "clapping front paws together cutely",
      "손 흔들": "waving paw in greeting",
      "손을 흔들": "waving paw hello or goodbye",
      "발을 동동": "stomping feet impatiently, tapping paws",
      "동동": "stomping or tapping feet cutely",
      "발버둥": "kicking legs playfully, flailing paws",

      // 먹기/냄새
      "먹": "eating or chewing something",
      "냄새": "sniffing around curiously",
      "킁킁": "sniffing with nose twitching",

      // 기타 귀여운 동작
      "고개를 갸웃": "tilting head cutely to the side",
      "갸웃": "cute head tilt, curious pose",
      "하품": "yawning adorably",
      "기지개": "stretching body, doing a stretch",
      "부르르": "shaking body, shivering motion",
      "부들부들": "trembling or shaking slightly",
    };

    // 대사에서 액션 키워드 감지 함수
    const detectActionsFromNarration = (narration) => {
      if (!narration) return [];
      const detected = [];
      // 긴 키워드를 먼저 검사 (핫팩 댄스 > 댄스)
      const sortedKeywords = Object.keys(actionKeywordMap).sort((a, b) => b.length - a.length);
      for (const keyword of sortedKeywords) {
        if (narration.includes(keyword)) {
          detected.push({ keyword, action: actionKeywordMap[keyword] });
        }
      }
      return detected;
    };

    // =====================
    // 4-1. 퍼포먼스 씬 타입별 비디오 프롬프트 설정 + 악세서리
    // =====================
    const performanceVideoPrompts = {
      beatbox: {
        start: "doing beatbox performance, mouth rhythmically opening and closing to the beat, head bobbing, body grooving, cool confident expression",
        break: "pausing beatbox, looking directly at camera with confident smirk, dramatic freeze pose, about to say something",
        resume: "resuming beatbox performance, mouth moving to beat rhythm, head bobbing energetically, body swaying",
        accessories: "wearing cool black sunglasses, gold chain necklace, backwards snapback cap",
      },
      singing: {
        start: "singing passionately, mouth moving to melody, eyes slightly closed feeling the music, swaying gently",
        break: "pausing singing, looking at camera with emotional expression, microphone visible",
        resume: "continuing singing with emotion, mouth moving to melody, gentle swaying",
        accessories: "holding wireless microphone, wearing sparkly stage outfit, small earpiece",
      },
      dance: {
        start: "dancing energetically, paws moving to beat, body grooving, happy excited expression",
        break: "freeze pose in dance, looking at camera with excited expression, dynamic pose held",
        resume: "resuming dance with full energy, spinning move, jumping, joyful expression",
        accessories: "wearing trendy sunglasses, colorful LED sneakers, sporty headband",
      },
      rap: {
        start: "rapping with swagger, mouth moving to rhythm, hand gestures, confident head movements",
        break: "pausing rap, confident pose looking at camera, swag expression",
        resume: "continuing rap performance, mouth moving to beat, hand gestures, head nodding, cool expression",
        accessories: "wearing oversized sunglasses, thick gold chain, sideways snapback cap, holding microphone",
      },
      hiphop: {
        start: "hip-hop style performance, swagger pose, head nodding to beat, body grooving",
        break: "pausing performance, confident pose looking at camera, swag expression",
        resume: "continuing hip-hop performance, body grooving, head nodding, cool expression",
        accessories: "wearing oversized sunglasses, thick gold chain, sideways snapback cap, baggy clothes",
      },
      instrument: {
        start: "playing instrument passionately, paws on instrument, body moving with melody, focused expression",
        break: "pausing performance, looking at camera proudly, instrument visible",
        resume: "continuing instrument performance, paws moving on instrument, body swaying with music",
        accessories: "wearing round stylish glasses, bow tie, formal vest",
      },
      kpop: {
        start: "K-pop dance performance, synchronized move, polished expression, dynamic choreography",
        break: "freeze pose, looking at camera with idol smile, camera ready pose",
        resume: "continuing K-pop performance, dynamic choreography, energetic expression",
        accessories: "wearing stylish outfit, small accessories, polished look, idol-style fashion",
      },
    };

    // =====================
    // 4-1. 일관된 배경 설정 (script-generator의 consistency 정보 우선 사용)
    // =====================
    // ★★★ script-generator에서 전달된 일관성 정보 사용 ★★★
    const consistentBackground = consistencyInfo.consistent_background
      || scriptSegments[0]?.scene_details?.background
      || "clean professional studio background with soft gradient";

    const consistentLighting = consistencyInfo.consistent_lighting
      || scriptSegments[0]?.scene_details?.lighting
      || "warm soft natural lighting";

    // 퍼포먼스용 일관된 스테이지 배경
    const performanceStageBackground = consistencyInfo.performance_stage_background
      || "dark concert stage with purple and blue neon lights, colorful spotlights from above, subtle smoke effects at the bottom";

    // 주인공 캐릭터 프롬프트
    const mainCharacterPrompt = consistencyInfo.main_character_prompt
      || characters.main?.image_prompt
      || "cute adorable puppy";

    // 실제 강아지 강조 문구
    const realDogEmphasis = consistencyInfo.real_dog_emphasis
      || "Real living dog. Actual puppy. NOT a mascot. NOT a costume. NOT a plush toy. NOT a stuffed animal. NOT a person in dog mask. Real fur. Real animal.";

    // 텍스트 제거 문구 (강화)
    const noTextEmphasis = consistencyInfo.no_text_emphasis
      || "ABSOLUTE CRITICAL: NO TEXT ON SCREEN. NEVER show text, letters, Korean hangul, Chinese, Japanese characters, English words, garbled/corrupted text artifacts, random symbols, broken characters, subtitles, captions, signs, banners, posters, watermarks, labels, or ANY writing anywhere in frame.";

    // =====================
    // 4-2. 퍼포먼스 타입 전역 감지 (script-generator의 consistency 정보 우선 사용)
    // =====================
    // ★★★ script-generator에서 전달된 퍼포먼스 정보 사용 ★★★
    const hasPerformanceScenes = consistencyInfo.has_performance
      || scriptSegments.some(seg =>
        ["performance_start", "performance_break", "performance_resume"].includes(seg.scene_type)
      );

    // 전역 퍼포먼스 타입
    const globalPerformanceType = consistencyInfo.performance_type
      || scriptSegments.find(seg => seg.performance_type)?.performance_type
      || scriptData.bgm?.primary_performance_type
      || "beatbox";

    // ★★★ 퍼포먼스 악세서리 (script-generator에서 전달된 것 사용) ★★★
    const globalPerformanceAccessories = consistencyInfo.performance_accessories
      || (hasPerformanceScenes
        ? (performanceVideoPrompts[globalPerformanceType]?.accessories || performanceVideoPrompts.beatbox.accessories)
        : "");

    $.export("consistency_used", {
      background: consistentBackground,
      lighting: consistentLighting,
      main_prompt: mainCharacterPrompt,
      has_performance: hasPerformanceScenes,
      performance_type: globalPerformanceType,
      accessories: globalPerformanceAccessories,
    });

    // =====================
    // 5. 씬별 비디오 생성 정보 구성 (Veo 3 최적화)
    // =====================
    const scenes = scriptSegments.map((seg, idx) => {
      const speaker = seg.speaker || "main";
      const isInterviewQuestion = seg.scene_type === "interview_question";
      const isFlashback = seg.scene_type === "flashback";

      // ★★★ 인터뷰 질문 씬: 화면에 보이는 캐릭터 결정 ★★★
      // speaker가 "interviewer"면 다음 씬의 응답자(interviewee)를 화면에 표시
      // speaker가 "main"이면서 interview_question이면 땅콩이 직접 질문하는 씬 (땅콩 표시)
      let visibleCharacterKey = speaker;

      if (isInterviewQuestion && speaker === "interviewer") {
        // 다음 씬에서 응답자 찾기
        const nextSeg = scriptSegments[idx + 1];
        if (nextSeg && nextSeg.scene_type === "interview_answer") {
          visibleCharacterKey = nextSeg.speaker || "main";
        } else {
          // characters_in_scene에서 찾기 (등록된 캐릭터 중 interviewer가 아닌 것)
          const charsInScene = seg.scene_details?.characters_in_scene || [];
          // characters 객체에서 role이 "interviewer"가 아닌 캐릭터 이름들 추출
          const registeredCharNames = Object.values(characters)
            .filter(c => c.role !== "interviewer")
            .map(c => c.name);
          // characters_in_scene 중 등록된 캐릭터 찾기
          const visibleChar = charsInScene.find(charName => registeredCharNames.includes(charName));
          if (visibleChar) {
            // 캐릭터 이름으로 key 찾기
            const foundKey = Object.entries(characters).find(([k, v]) => v.name === visibleChar)?.[0];
            if (foundKey) visibleCharacterKey = foundKey;
          }
        }
      }

      // 화면에 보이는 캐릭터 (인터뷰 질문 시 interviewee 사용)
      const character = characters[visibleCharacterKey] || characters.main;
      const hasNarration = seg.has_narration ?? !!(seg.narration && seg.narration.trim());

      // ★★★ 퍼포먼스 씬 감지 (script-generator에서 전달된 값 우선 사용) ★★★
      const isPerformanceStart = seg.scene_type === "performance_start";
      const isPerformanceBreak = seg.scene_type === "performance_break";
      const isPerformanceResume = seg.scene_type === "performance_resume";
      const isAnyPerformance = seg.is_performance ?? (isPerformanceStart || isPerformanceBreak || isPerformanceResume);

      // 퍼포먼스 타입 및 phase (script-generator에서 전달된 값 사용)
      const performanceType = seg.performance_type || globalPerformanceType;
      const performancePhase = seg.performance_phase || (isPerformanceStart ? "start" : isPerformanceBreak ? "break" : isPerformanceResume ? "resume" : null);

      // ★★★ TTS 정보 (script-generator에서 전달된 값 사용) ★★★
      const ttsEnabled = seg.tts_enabled ?? (isPerformanceBreak ? true : (isAnyPerformance ? false : hasNarration));
      const ttsVoice = seg.tts_voice || null;
      const voiceEffect = seg.voice_effect || (isPerformanceBreak ? "robotic" : null);

      // ★★★ 인터뷰어가 말하는 씬인지 (캐릭터는 듣기만) ★★★
      const isInterviewerSpeaking = isInterviewQuestion && speaker === "interviewer";

      // 캐릭터가 말하는 경우에만 립싱크 필요 (인터뷰어가 말할 때는 캐릭터 립싱크 없음)
      const dogLipSync = seg.dog_lip_sync ?? (isAnyPerformance ? "yes" : (!isInterviewerSpeaking && hasNarration));

      // 대사에서 한글 입모양 추출 (캐릭터가 말할 때만)
      const mouthShapes = (hasNarration && !isInterviewerSpeaking) ? extractMouthShapes(seg.narration) : null;

      // 캐릭터 외형 정보 추출
      const charAnalysis = character || {};
      const characterAppearance = {
        base: charAnalysis.image_prompt || "cute adorable puppy",
        species: charAnalysis.species || "dog",
        breed: charAnalysis.breed || "unknown",
        fur_color: charAnalysis.fur_color || "",
        fur_texture: charAnalysis.fur_texture || "",
        outfit: charAnalysis.clothing || seg.video_prompt?.costume || "",
        accessories: charAnalysis.accessories || [],
        props: seg.video_prompt?.props || [],
        distinctive_features: charAnalysis.distinctive_features || [],
      };

      // 씬별 배경/환경 정보 (★★★ 일관된 배경 사용 ★★★)
      const sceneEnvironment = {
        background: consistentBackground, // 일관된 배경 사용
        location: seg.scene_details?.location || "indoor",
        lighting: consistentLighting, // 일관된 조명 사용
        weather: seg.scene_details?.weather || "none",
        mood: seg.scene_details?.mood || "comfortable",
        props_in_scene: seg.scene_details?.props || [],
        special_effects: seg.video_prompt?.special_effects || "",
      };

      // ★★★ 캐릭터 타입 확인 (동물 vs 사람) ★★★
      const characterType = character.character_type || "animal";
      const isAnimalCharacter = characterType === "animal";
      const isSubCharacter = speaker.startsWith("sub");

      // 캐릭터 설명 생성 (타입에 따라)
      const getCharacterDescription = () => {
        if (!isSubCharacter) {
          return "Dog"; // 주인공은 항상 강아지
        }
        if (isAnimalCharacter) {
          const breed = character.breed || "dog";
          const species = character.species || "dog";
          return breed !== "unknown" ? breed : species;
        } else {
          const age = character.estimated_age_range || "";
          const gender = character.gender || "";
          if (age && gender) return `${age} ${gender} person`;
          return "Person";
        }
      };
      const characterDesc = getCharacterDescription();

      // ★★★ 첫 씬 후킹 최적화 감지 (쇼츠 썸네일 효과) ★★★
      const isHookScene = seg.is_hook_scene || seg.thumbnail_optimized || idx === 0;

      // 8K 시네마틱 프롬프트 생성 (옷/악세서리/배경 포함)
      const generateVeoPrompt = () => {
        // ★★★ 첫 씬 후킹 강조 문구 ★★★
        const hookSceneEmphasis = isHookScene
          ? "EXTREME CLOSE-UP of face, BRIGHT vivid colors, HIGH CONTRAST, sparkling expressive eyes, dynamic attention-grabbing composition. "
          : "";
        // 캐릭터 외형 프롬프트 조합
        let charPrompt = characterAppearance.base;
        if (characterAppearance.outfit) {
          charPrompt += `, wearing ${characterAppearance.outfit}`;
        }
        if (characterAppearance.accessories?.length > 0) {
          charPrompt += `, with ${characterAppearance.accessories.join(", ")}`;
        }
        if (characterAppearance.props?.length > 0) {
          charPrompt += `, holding ${characterAppearance.props.join(", ")}`;
        }

        // ★★★ 일관된 배경 프롬프트 ★★★
        let bgPrompt = consistentBackground;
        if (sceneEnvironment.props_in_scene?.length > 0) {
          bgPrompt += `. Scene includes ${sceneEnvironment.props_in_scene.join(", ")}`;
        }
        if (sceneEnvironment.special_effects) {
          bgPrompt += `. ${sceneEnvironment.special_effects}`;
        }

        const emotionPrompt = seg.emotion || "neutral";
        const lightingPrompt = consistentLighting;

        // ★★★ 퍼포먼스 씬 처리 (전역 악세서리 + 일관된 스테이지 배경) ★★★
        if (isAnyPerformance && performancePhase) {
          const perfPrompts = performanceVideoPrompts[globalPerformanceType] || performanceVideoPrompts.beatbox;
          const perfPrompt = perfPrompts[performancePhase] || perfPrompts.start;

          // ★★★ 전역 퍼포먼스 악세서리 사용 (모든 퍼포먼스 씬 동일) ★★★
          const perfCharPrompt = `${characterAppearance.base}, ${globalPerformanceAccessories}`;

          if (isPerformanceStart || isPerformanceResume) {
            // 퍼포먼스 시작/재개: BGM에 맞춰 립싱크 (TTS 없음) (★ 첫 씬이면 hookSceneEmphasis 적용 ★)
            return `8K cinematic performance video. ${hookSceneEmphasis}${perfCharPrompt}, ${perfPrompt}. ${performanceStageBackground}. Dog performing alone on stage. Dog's mouth moves rhythmically to the beat. Energetic dynamic camera. Same dog appearance maintained. ${realDogEmphasis}. ${noTextEmphasis}. No subtitles. No microphone in frame. No human hands. No people. Single dog performer only.`;
          } else if (isPerformanceBreak) {
            // 퍼포먼스 브레이크: 짧은 대사 (기계음 TTS) - 안전 필터 방지용 프롬프트 (★ 첫 씬이면 hookSceneEmphasis 적용 ★)
            return `8K cinematic performance video. ${hookSceneEmphasis}${perfCharPrompt}, ${perfPrompt}. ${performanceStageBackground}. Dog pauses dramatically alone on stage, looks directly at camera with confident expression, mouth opens slightly then closes. Dramatic freeze pose moment. Same dog appearance maintained. ${realDogEmphasis}. ${noTextEmphasis}. No subtitles. No microphone in frame. No human hands. No people. Single dog performer only.`;
          }
        }

        // ★★★ 캐릭터 타입에 따른 강조 문구 ★★★
        const realCharEmphasis = isAnimalCharacter
          ? "Real living animal. Actual pet. NOT a mascot. NOT a costume. NOT a plush toy. NOT a stuffed animal. NOT a person in animal mask. Real fur. Real animal."
          : "Real person. Natural appearance. NOT animated. NOT cartoon.";

        // ★★★ 인터뷰 질문 씬 처리 ★★★
        // speaker === "interviewer" → 인터뷰어가 질문, 캐릭터는 듣는 포즈 (입 닫힘)
        // speaker !== "interviewer" → 캐릭터가 직접 질문 (립싱크 필요)
        const isInterviewerSpeaking = isInterviewQuestion && speaker === "interviewer";

        if (isInterviewerSpeaking) {
          // 인터뷰어가 질문: interviewee 캐릭터가 듣는 장면 (lip_sync 없음) (★ 첫 씬이면 hookSceneEmphasis 적용 ★)
          // ★★★ 인터뷰어가 말할 때 마이크 필수 등장 ★★★
          const interviewMicPrompt = `Professional broadcast microphone visible in frame pointing toward the ${characterDesc.toLowerCase()}. SIMPLE PLAIN SOLID BLACK microphone (completely clean surface, NO text, NO logos, NO labels, NO writing, NO Korean characters, NO markings whatsoever).`;
          if (isAnimalCharacter) {
            return `8K cinematic interview video. ${hookSceneEmphasis}${charPrompt} sitting, listening attentively to interviewer question. ${bgPrompt}. ${lightingPrompt}. ${interviewMicPrompt} ${characterDesc} has curious listening expression, head slightly tilted, ears perked up. IMPORTANT: ${characterDesc} mouth must stay COMPLETELY CLOSED throughout entire video. ${characterDesc} is NOT talking. ${characterDesc} is only listening. Natural breathing only. Occasional gentle blinks and subtle head tilts. ${realCharEmphasis}. ${noTextEmphasis}. ABSOLUTELY NO TEXT, NO LETTERS, NO CHARACTERS, NO WRITING anywhere in frame. No subtitles. No human hands. No people. Single ${characterDesc.toLowerCase()} only.`;
          } else {
            return `8K cinematic interview video. ${hookSceneEmphasis}${charPrompt} sitting, listening attentively to interviewer question. ${bgPrompt}. ${lightingPrompt}. ${interviewMicPrompt} ${characterDesc} has interested listening expression. IMPORTANT: Mouth must stay closed. Only listening with natural posture. ${realCharEmphasis}. ${noTextEmphasis}. ABSOLUTELY NO TEXT, NO LETTERS, NO CHARACTERS, NO WRITING anywhere in frame. No subtitles.`;
          }
        } else if (isFlashback) {
          // ★★★ 회상 장면: 액션 감지하여 동작 프롬프트 추가 ★★★
          const detectedActions = detectActionsFromNarration(seg.narration);
          const actionPrompt = detectedActions.length > 0
            ? ` ${characterDesc} is ${detectedActions.map(a => a.action).join(", ")}.`
            : "";
          return `8K cinematic flashback video. ${hookSceneEmphasis}${charPrompt} in recalled scene.${actionPrompt} ${bgPrompt}. Slightly dreamy/vintage filter effect. ${emotionPrompt} expression. ${lightingPrompt}. ${realCharEmphasis}. ${noTextEmphasis}. No subtitles.`;
        } else if (hasNarration) {
          // ★★★ 대사 장면: 액션 감지하여 동작 프롬프트 추가 ★★★
          const detectedActions = detectActionsFromNarration(seg.narration);
          const actionPrompt = detectedActions.length > 0
            ? ` IMPORTANT ACTION: ${characterDesc} is ${detectedActions.map(a => a.action).join(", ")} while speaking.`
            : "";
          if (isAnimalCharacter) {
            return `8K cinematic video. ${hookSceneEmphasis}${charPrompt} facing camera. ${bgPrompt}. ${lightingPrompt}. ${characterDesc} with gentle mouth movements.${actionPrompt} ${emotionPrompt} expression. Same ${characterDesc.toLowerCase()} appearance maintained throughout. ${realCharEmphasis}. ${noTextEmphasis}. No subtitles. No microphone. No human hands. No people. Single ${characterDesc.toLowerCase()} only.`;
          } else {
            return `8K cinematic video. ${hookSceneEmphasis}${charPrompt} facing camera. ${bgPrompt}. ${lightingPrompt}. ${characterDesc} speaking with natural mouth movements.${actionPrompt} ${emotionPrompt} expression. Same appearance maintained throughout. ${realCharEmphasis}. ${noTextEmphasis}. No subtitles.`;
          }
        } else {
          // 리액션/대기 장면 (★ 첫 씬이면 hookSceneEmphasis 적용 ★)
          if (isAnimalCharacter) {
            return `8K cinematic video. ${hookSceneEmphasis}${charPrompt} sitting alone. ${bgPrompt}. ${lightingPrompt}. ${emotionPrompt} expression, natural subtle movements. ${realCharEmphasis}. ${noTextEmphasis}. No subtitles. No microphone. No human hands. No people. Single ${characterDesc.toLowerCase()} only.`;
          } else {
            return `8K cinematic video. ${hookSceneEmphasis}${charPrompt}. ${bgPrompt}. ${lightingPrompt}. ${emotionPrompt} expression, natural subtle movements. ${realCharEmphasis}. ${noTextEmphasis}. No subtitles.`;
          }
        }
      };

      // 립싱크 타이밍 생성
      const generateLipSyncTiming = () => {
        // 인터뷰어가 말하는 씬은 캐릭터 립싱크 없음
        const isInterviewerSpeaking = isInterviewQuestion && speaker === "interviewer";
        if (isInterviewerSpeaking) return null;
        if (!hasNarration) return null;

        const text = seg.narration;
        const duration = seg.duration || 5;
        const timing = {};

        // 대기 시간 (0.5초)
        timing[`0.0_to_0.5_sec`] = {
          audio: "Silence",
          mouth: "Closed, relaxed",
          expression: `${seg.emotion || 'neutral'}, preparing to speak`,
        };

        // 대사 구간
        timing[`0.5_to_${duration}_sec`] = {
          text: text,
          mouth: "Precise mouth movements matching Korean syllables",
          expression: seg.emotion_transition || seg.emotion || "expressive",
        };

        return timing;
      };

      // ★★★ Veo3 제한: 씬당 최대 8초 ★★★
      const VEO3_MAX_DURATION = 8;
      const sceneDuration = Math.min(seg.duration || 5, VEO3_MAX_DURATION);

      // ★★★ veo_script_sample JSON 형식에 맞춘 출력 ★★★
      // 대화 타이밍 생성 (veo_script_sample 형식)
      const generateDialogueTiming = () => {
        const timing = {};
        const dur = sceneDuration;

        if (isInterviewerSpeaking) {
          // 인터뷰어가 질문: 인터뷰어 음성, interviewee 캐릭터는 듣기만
          timing[`0.0_to_0.5_sec`] = "Silence, character waiting";
          timing[`0.5_to_${dur}_sec`] = "Interviewer audio, character mouth closed, listening";
        } else if (isPerformanceStart || isPerformanceResume) {
          // 퍼포먼스: BGM에 맞춰 움직임
          timing[`0.0_to_${dur}_sec`] = "BGM playing, dog mouth moves to beat, no TTS";
        } else if (isPerformanceBreak) {
          // 퍼포먼스 브레이크: 잠시 멈추고 대사
          timing[`0.0_to_1.0_sec`] = "Pause, dramatic freeze";
          timing[`1.0_to_${dur}_sec`] = `Dog speaks "${seg.narration}" with robotic voice`;
        } else if (hasNarration) {
          // 일반 대사
          timing[`0.0_to_0.5_sec`] = "Silence, dog waiting";
          timing[`0.5_to_${dur}_sec`] = `${seg.character_name || '강아지'} audio, subtle mouth movement`;
        } else {
          timing[`0.0_to_${dur}_sec`] = "Natural breathing, subtle movements";
        }

        return timing;
      };

      // 일관성 체크 정보 생성
      const generateConsistencyCheck = () => {
        const checks = {
          fur_color: characterAppearance.fur_color
            ? `${characterAppearance.fur_color} must stay same at all times`
            : "Fur color must stay consistent",
          background: `${sceneEnvironment.background} must look same throughout`,
        };

        if (characterAppearance.outfit) {
          checks.costume = `${characterAppearance.outfit} must be visible throughout`;
        }
        if (characterAppearance.accessories?.length > 0) {
          checks.accessories = `${characterAppearance.accessories.join(", ")} must be visible throughout`;
        }

        return checks;
      };

      return {
        video: idx + 1,
        title: `${scriptData.title?.korean || effectiveTopic} - Scene ${idx + 1}`,
        duration: `${sceneDuration} seconds`,
        duration_seconds: sceneDuration,
        veo3_compliant: sceneDuration <= VEO3_MAX_DURATION,
        resolution: "8K",

        // ★★★ Veo 3 프롬프트 (핵심!) ★★★
        prompt: generateVeoPrompt(),

        // ★★★ 대화 정보 (veo_script_sample 형식) ★★★
        dialogue: {
          timing: generateDialogueTiming(),
          interviewer: isInterviewerSpeaking ? (seg.narration || "") : null,
          [seg.character_name || "main"]: !isInterviewerSpeaking && hasNarration ? (seg.narration || "") : null,
          script: seg.narration || "",
          script_english: seg.narration_english || "",
          audio_only: true,
        },

        // ★★★ 음성 설정 (veo_script_sample 형식) ★★★
        voice_settings: isInterviewerSpeaking ? {
          interviewer: {
            type: "Korean female news anchor, 30s, professional friendly tone",
            consistent_across: "All videos",
          },
        } : {
          [seg.character_name || speaker]: speaker === "main" ? {
            type: "Korean baby infant voice, 2-3 years old, low-pitched adorable tone",
            tone: seg.audio_details?.voice_tone || "super cute, soft cooing",
            characteristics: "very slow speech, babbling pronunciation, slight lisp, baby talk with soft low voice",
            emotion: seg.emotion || "neutral",
            laugh_style: "Adorable baby giggling, soft cooing laughter",
            consistent_across: "All videos",
          } : {
            type: voiceStyleMap[speaker] || "natural voice",
            consistent_across: "All videos",
          },
        },

        // ★★★ 시각적 연속성 (veo_script_sample 형식) ★★★
        visual_continuity: {
          instruction: `Same visual appearance for all ${sceneDuration} seconds`,
          [`0.0_to_${Math.floor(sceneDuration/2)}_sec`]: {
            base: "Reference image exactly",
            dog: "Same as reference",
            mouth: isInterviewerSpeaking ? "Closed" : (hasNarration ? "Subtle lip sync" : "Closed"),
          },
          [`${Math.floor(sceneDuration/2)}_to_${sceneDuration}_sec`]: {
            base: "Same reference image, do not change",
            dog: `Same ${characterAppearance.fur_color || 'fur color'}, same face, same ${characterAppearance.outfit || 'appearance'}`,
            mouth: hasNarration && !isInterviewerSpeaking ? "Subtle open and close for lip sync only" : "Closed",
            change_only: hasNarration && !isInterviewerSpeaking ? "Mouth movement" : "None",
            keep_same: "Everything else identical to reference image",
          },
        },

        // ★★★ 립싱크 스타일 (veo_script_sample 형식) ★★★
        lip_sync_style: isPerformanceStart || isPerformanceResume ? {
          // 퍼포먼스 시작/재개: BGM에 맞춰 립싱크
          type: "Performance lip sync to BGM",
          method: "Mouth moves rhythmically to background music beat",
          mouth_movement: "Rhythmic opening and closing to beat",
          face: "Cool, confident, energetic expression",
          body: "Head bobbing, body grooving to beat",
          audio_source: "bgm",
          dog_speaks: false,
          tts_enabled: false,
          bgm_volume: 0.8,
          note: "BGM 80% 볼륨, 강아지 입이 BGM 비트에 맞춰 움직임",
        } : isPerformanceBreak ? {
          // 퍼포먼스 브레이크: 기계음 TTS
          type: "Performance break - robotic TTS",
          method: "Dog pauses and speaks short word with robotic voice",
          mouth_movement: "Short word pronunciation with robotic effect",
          face: "Confident smirk, looking at camera",
          body: "Dramatic freeze pose",
          audio_source: "tts",
          dog_speaks: true,
          tts_enabled: true,
          voice_effect: "robotic",
          bgm_volume: 0,
          note: "BGM 멈춤, 기계음 TTS로 짧은 단어 (콩파민!) 발성",
        } : isInterviewerSpeaking ? {
          // 인터뷰어가 질문: interviewee 캐릭터는 듣기만 함
          type: "Listening pose - NO lip sync",
          method: "Character listens while interviewer speaks",
          mouth_movement: "NONE - mouth stays CLOSED",
          face: "Curious, attentive listening expression",
          body: "Subtle movements - occasional nod, ear twitch, blink",
          audio_source: "interviewer",
          dog_speaks: false,
          note: "Play interviewer TTS audio while interviewee shows listening animation",
        } : hasNarration ? {
          type: "Subtle talking photo style",
          method: "Minimal mouth animation on static image",
          mouth_movement: "Small natural opening and closing matching Korean syllables",
          face: "Keep same expression, only mouth area moves slightly",
          do_not: "Do not regenerate dog image, do not change dog appearance",
          dog_speaks: true,
        } : {
          type: "Static or minimal movement",
          mouth: "Closed or natural breathing",
          dog_speaks: false,
        },

        // 캐릭터 외형 정보
        character_appearance: characterAppearance,

        // 씬 환경 정보
        scene_environment: sceneEnvironment,

        // 인터뷰어가 질문하는 씬 전용 정보
        interview_question_info: isInterviewerSpeaking ? {
          interviewee_state: "listening",
          interviewee_lip_sync: false,
          interviewee_mouth: "CLOSED",
          interviewee_expression: "curious, attentive, head slightly tilted",
          interviewee_animation: "subtle nods, ear twitching, blinking",
          audio_source: "interviewer TTS",
          interviewer_text: seg.narration || "",
          visible_character: visibleCharacterKey,
          note: "interviewee는 말하지 않음 - 인터뷰어 음성만 재생, interviewee는 듣는 표정",
        } : null,

        // 씬 상세
        scene_details: {
          scene_type: seg.scene_type || "narration",
          speaker: speaker,
          character_name: seg.character_name,
          // ★★★ 캐릭터 타입 정보 추가 ★★★
          character_type: characterType,
          is_animal_character: isAnimalCharacter,
          character_description: characterDesc,
          location: sceneEnvironment.location,
          background: sceneEnvironment.background,
          lighting: sceneEnvironment.lighting,
          weather: sceneEnvironment.weather,
          mood: sceneEnvironment.mood,
          props_in_scene: sceneEnvironment.props_in_scene,
          special_effects: sceneEnvironment.special_effects,
          is_flashback: isFlashback,
          is_interview_question: isInterviewQuestion,
          // ★★★ 퍼포먼스 정보 ★★★
          is_performance: isAnyPerformance,
          performance_type: isAnyPerformance ? performanceType : null,
          performance_phase: performancePhase,
        },

        // ★★★ 퍼포먼스 전용 정보 ★★★
        performance_info: isAnyPerformance ? {
          type: performanceType,
          phase: performancePhase,
          is_start: isPerformanceStart,
          is_break: isPerformanceBreak,
          is_resume: isPerformanceResume,
          bgm_volume: (isPerformanceStart || isPerformanceResume) ? 0.8 : 0,
          tts_enabled: isPerformanceBreak,
          voice_effect: isPerformanceBreak ? "robotic" : null,
          lip_sync_to: (isPerformanceStart || isPerformanceResume) ? "bgm" : "tts",
          narration: isPerformanceBreak ? (seg.narration || "콩파민!") : null,
          note: isPerformanceStart ? "BGM 시작, 강아지 입이 BGM에 맞춰 움직임" :
                isPerformanceBreak ? "BGM 멈춤, 기계음으로 짧은 단어 외침" :
                isPerformanceResume ? "BGM 재개, 강아지 립싱크 계속" : null,
        } : null,

        // 감정 정보
        emotion: {
          primary: seg.emotion || "neutral",
          transition: seg.emotion_transition || null,
          ending_expression: seg.action_cues?.ending_expression || null,
        },

        // ★★★ 일관성 체크 (veo_script_sample 형식) ★★★
        consistency_check: generateConsistencyCheck(),

        // ★★★ 출력 설정 (veo_script_sample 형식) ★★★
        output: {
          format: "Clean video only",
          text_overlays: false,
          subtitles: false,
          captions: false,
          watermarks: false,
        },

        // ★★★ 립싱크 타이밍 (캐릭터가 말할 때만) ★★★
        lip_sync_timing: hasNarration && !isInterviewerSpeaking ? generateLipSyncTiming() : null,

        // ★★★ 한글 입모양 매핑 (Veo 3 립싱크 참고용) ★★★
        mouth_shapes: mouthShapes,

        // ★★★ TTS 정보 (script-generator에서 전달된 값 포함) ★★★
        tts_info: {
          tts_enabled: ttsEnabled,
          tts_voice: ttsVoice,
          voice_effect: voiceEffect,
          dog_lip_sync: dogLipSync,
        },

        // 기존 호환성 필드
        index: seg.index,
        segment_number: seg.segment_number,
        start: seg.start_time,
        end: seg.end_time,
        narration: seg.narration || "",
        narration_korean: seg.narration_korean || seg.narration || "",  // ★ 한글 자막용
        narration_english: seg.narration_english || "",
        spoken_language: seg.spoken_language || "korean",  // ★ 캐릭터 언어
        has_narration: hasNarration,
        image_prompt: seg.image_prompt,
        video_prompt: seg.video_prompt,
        audio_details: seg.audio_details,
        action_cues: seg.action_cues || {},
        // ★★★ 대사에서 감지된 액션 (동작 프롬프트에 반영됨) ★★★
        detected_actions: detectActionsFromNarration(seg.narration),
        // ★★★ 첫 씬 후킹 최적화 플래그 (쇼츠 썸네일 효과) ★★★
        is_hook_scene: seg.is_hook_scene || idx === 0,  // script-generator에서 전달 또는 첫 씬
        thumbnail_optimized: seg.thumbnail_optimized || idx === 0,
      };
    });

    // =====================
    // 5. 캐릭터 프롬프트 추출
    // =====================
    const characterPrompts = Object.fromEntries(
      Object.entries(characters).map(([key, char]) => [key, char.image_prompt || ""])
    );

    // =====================
    // 6. 액션 감지 통계
    // =====================
    const scenesWithActions = scenes.filter(s => s.detected_actions && s.detected_actions.length > 0);
    $.export("action_detection_stats", {
      total_scenes: scenes.length,
      scenes_with_actions: scenesWithActions.length,
      actions_summary: scenesWithActions.map(s => ({
        scene: s.video,
        narration_preview: (s.narration || "").substring(0, 50),
        detected: s.detected_actions.map(a => a.keyword),
      })),
    });

    // =====================
    // 7. 결과 반환
    // =====================
    $.export("$summary", `Video generation info prepared for ${scenes.length} scenes (${scenesWithActions.length} with actions detected)`);

    return {
      // 메타 정보
      folder_name: scriptData.folder_name,
      total_scenes: scenes.length,
      script_format: scriptFormat,
      content_type: contentType,

      // 전역 설정
      resolution: "8K",
      format: "Clean video only",
      text_overlays: false,
      subtitles: false,
      watermarks: false,
      overall_style: script.overall_style || "photorealistic",

      // 캐릭터 프롬프트
      character_prompts: characterPrompts,

      // ★★★ 캐릭터 전체 정보 (veo3-video-generator에서 character_type 등 사용) ★★★
      characters: characters,

      // 음성 설정 (Veo 3용)
      voice_settings: {
        main: {
          type: "Korean baby infant voice, 2-3 years old, low-pitched adorable tone",
          tone: "super cute, innocent, soft cooing, sometimes whiny or excited",
          characteristics: "very slow speech, babbling pronunciation, slight lisp, baby talk with soft low voice",
          laugh_style: "Adorable baby giggling, soft cooing laughter, infectious cute chuckling",
          consistent_across: "All videos",
        },
        interviewer: {
          type: "Korean female news anchor, 30s, professional friendly tone",
          characteristics: "clear, warm, professional",
          consistent_across: "All videos",
        },
        sub1: {
          type: characters.sub1?.voice_type === "elderly_female"
            ? "Warm elderly woman voice, loving grandmother tone"
            : "Adult female voice, warm and caring",
          consistent_across: "All videos",
        },
      },

      // 인터뷰 배경 설정 (인터뷰 형식일 때)
      interview_background: scriptFormat === 'interview' ? {
        type: "Interview studio or themed background",
        description: `Professional interview setting matching the topic: ${effectiveTopic}`,
        lighting: "Warm soft studio lighting",
        props: "Microphone visible or implied",
        consistency: "Same background throughout all interview segments",
      } : null,

      // 씬별 비디오 생성 정보
      scenes: scenes,

      // 총 영상 길이 (씬별 duration 합계)
      total_duration_seconds: scenes.reduce((sum, scene) => sum + (scene.duration_seconds || 0), 0),

      // 원본 스크립트 참조 (필요시)
      script_reference: {
        title: scriptData.title,
        topic: scriptData.topic_info?.topic,
      },
    };
  },
});
