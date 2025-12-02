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
      main: "cute adorable toddler girl voice, 2-3 years old, slow sweet innocent speech, baby talk",
      sub1: "warm gentle elderly woman voice, loving grandmother tone",
      sub2: "kind mature adult male voice, gentle father figure",
      sub3: "friendly adult female voice, caring and warm",
      interviewer: "Korean female news anchor, 30s, professional friendly tone",
    };

    // =====================
    // 3. 한글 입모양 매핑 (Veo 3 립싱크용)
    // =====================
    const koreanMouthShapes = {
      "ㅏ": "Mouth wide open, jaw drops",
      "ㅑ": "Mouth wide open, jaw drops",
      "ㅓ": "Mouth medium open, lips slightly rounded",
      "ㅕ": "Mouth medium open, lips slightly rounded",
      "ㅗ": "Lips form small round O shape",
      "ㅛ": "Lips form small round O shape",
      "ㅜ": "Lips push forward, small round opening",
      "ㅠ": "Lips push forward, small round opening",
      "ㅡ": "Lips stretch wide horizontally, teeth close",
      "ㅣ": "Lips stretch sideways, teeth slightly visible",
      "ㅐ": "Mouth open, lips stretched sideways",
      "ㅔ": "Mouth open, lips stretched sideways",
      "아": "Mouth wide open, relaxed",
      "어": "Mouth medium open, rounded",
      "오": "Lips form small round O shape",
      "우": "Lips push forward, small round",
      "으": "Lips stretch wide, teeth close",
      "이": "Lips stretch sideways, teeth visible",
      "에": "Mouth open, stretched",
      "애": "Mouth open wide, stretched",
      "가": "Mouth opens wide, jaw drops",
      "나": "Tongue touches roof, mouth opens wide",
      "다": "Tongue touches roof, mouth medium open",
      "라": "Tongue flicks, mouth opens",
      "마": "Lips press together then open wide",
      "바": "Lips press together then open",
      "사": "Teeth close, air through, mouth opens",
      "자": "Tongue touches teeth, mouth opens",
      "하": "Mouth opens with breath",
    };

    // 대사에서 한글 입모양 추출 함수
    const extractMouthShapes = (text) => {
      if (!text) return null;
      const shapes = {};
      const chars = text.replace(/[^가-힣]/g, '').split('');
      for (const char of chars) {
        if (!shapes[char] && koreanMouthShapes[char]) {
          shapes[char] = koreanMouthShapes[char];
        }
      }
      return Object.keys(shapes).length > 0 ? shapes : null;
    };

    // =====================
    // 4. 퍼포먼스 씬 타입별 비디오 프롬프트 설정 + 악세서리
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

    // 텍스트 제거 문구
    const noTextEmphasis = consistencyInfo.no_text_emphasis
      || "No text anywhere. No signs. No banners. No posters. No letters. No words. No writing. No Korean text. No watermarks.";

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
      const character = characters[speaker] || characters.main;
      const hasNarration = seg.has_narration ?? !!(seg.narration && seg.narration.trim());
      const isInterviewQuestion = seg.scene_type === "interview_question" || speaker === "interviewer";
      const isFlashback = seg.scene_type === "flashback";

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
      const dogLipSync = seg.dog_lip_sync ?? (isAnyPerformance ? "yes" : (!isInterviewQuestion && hasNarration));

      // 대사에서 한글 입모양 추출 (강아지가 말할 때만)
      const mouthShapes = (hasNarration && !isInterviewQuestion) ? extractMouthShapes(seg.narration) : null;

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

      // 8K 시네마틱 프롬프트 생성 (옷/악세서리/배경 포함)
      const generateVeoPrompt = () => {
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
            // 퍼포먼스 시작/재개: BGM에 맞춰 립싱크 (TTS 없음)
            return `8K cinematic performance video. ${perfCharPrompt}, ${perfPrompt}. ${performanceStageBackground}. Dog performing alone on stage. Dog's mouth moves rhythmically to the beat. Energetic dynamic camera. Same dog appearance maintained. ${realDogEmphasis}. ${noTextEmphasis}. No subtitles. No microphone in frame. No human hands. No people. Single dog performer only.`;
          } else if (isPerformanceBreak) {
            // 퍼포먼스 브레이크: 짧은 대사 (기계음 TTS) - 안전 필터 방지용 프롬프트
            return `8K cinematic performance video. ${perfCharPrompt}, ${perfPrompt}. ${performanceStageBackground}. Dog pauses dramatically alone on stage, looks directly at camera with confident expression, mouth opens slightly then closes. Dramatic freeze pose moment. Same dog appearance maintained. ${realDogEmphasis}. ${noTextEmphasis}. No subtitles. No microphone in frame. No human hands. No people. Single dog performer only.`;
          }
        }

        if (isInterviewQuestion) {
          // 인터뷰 질문: 강아지가 듣는 장면 (lip_sync 없음, 인터뷰어 음성만 재생)
          // ★★★ 안전 필터 + 품질 강화: 사람/손/마이크 제거, 입 닫힘 강조 ★★★
          return `8K cinematic video. ${charPrompt} sitting alone, listening attentively. ${bgPrompt}. ${lightingPrompt}. Dog has curious listening expression, head slightly tilted, ears perked up. IMPORTANT: Dog mouth must stay COMPLETELY CLOSED throughout entire video. Dog is NOT talking. Dog is only listening. Natural breathing only. Occasional gentle blinks and subtle head tilts. ${realDogEmphasis}. ${noTextEmphasis}. No subtitles. No microphone. No human hands. No people. Single dog only.`;
        } else if (isFlashback) {
          // 회상 장면
          return `8K cinematic flashback video. ${charPrompt} in recalled scene. ${bgPrompt}. Slightly dreamy/vintage filter effect. ${emotionPrompt} expression. ${lightingPrompt}. ${realDogEmphasis}. ${noTextEmphasis}. No subtitles.`;
        } else if (hasNarration) {
          // 대사 장면
          return `8K cinematic video. ${charPrompt} sitting alone facing camera. ${bgPrompt}. ${lightingPrompt}. Dog with gentle mouth movements. ${emotionPrompt} expression. Same dog appearance maintained throughout. ${realDogEmphasis}. ${noTextEmphasis}. No subtitles. No microphone. No human hands. No people. Single dog only.`;
        } else {
          // 리액션/대기 장면
          return `8K cinematic video. ${charPrompt} sitting alone. ${bgPrompt}. ${lightingPrompt}. ${emotionPrompt} expression, natural subtle movements. ${realDogEmphasis}. ${noTextEmphasis}. No subtitles. No microphone. No human hands. No people. Single dog only.`;
        }
      };

      // 립싱크 타이밍 생성
      const generateLipSyncTiming = () => {
        if (isInterviewQuestion) return null;
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

        if (isInterviewQuestion) {
          // 인터뷰 질문: 인터뷰어 음성, 강아지는 듣기만
          timing[`0.0_to_0.5_sec`] = "Silence, dog waiting";
          timing[`0.5_to_${dur}_sec`] = "Interviewer audio, dog mouth closed, listening";
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
          interviewer: isInterviewQuestion ? (seg.narration || "") : null,
          [seg.character_name || "main"]: !isInterviewQuestion && hasNarration ? (seg.narration || "") : null,
          script: seg.narration || "",
          script_english: seg.narration_english || "",
          audio_only: true,
        },

        // ★★★ 음성 설정 (veo_script_sample 형식) ★★★
        voice_settings: isInterviewQuestion ? {
          interviewer: {
            type: "Korean female news anchor, 30s, professional friendly tone",
            consistent_across: "All videos",
          },
        } : {
          [seg.character_name || speaker]: speaker === "main" ? {
            type: "Korean baby girl, 2-3 years old toddler voice",
            tone: seg.audio_details?.voice_tone || "cute and expressive",
            emotion: seg.emotion || "neutral",
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
            mouth: isInterviewQuestion ? "Closed" : (hasNarration ? "Subtle lip sync" : "Closed"),
          },
          [`${Math.floor(sceneDuration/2)}_to_${sceneDuration}_sec`]: {
            base: "Same reference image, do not change",
            dog: `Same ${characterAppearance.fur_color || 'fur color'}, same face, same ${characterAppearance.outfit || 'appearance'}`,
            mouth: hasNarration && !isInterviewQuestion ? "Subtle open and close for lip sync only" : "Closed",
            change_only: hasNarration && !isInterviewQuestion ? "Mouth movement" : "None",
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
        } : isInterviewQuestion ? {
          // 인터뷰 질문: 강아지는 듣기만 함
          type: "Listening pose - NO lip sync",
          method: "Dog listens while interviewer speaks",
          mouth_movement: "NONE - mouth stays CLOSED",
          face: "Curious, attentive listening expression",
          body: "Subtle movements - occasional nod, ear twitch, blink",
          audio_source: "interviewer",
          dog_speaks: false,
          note: "Play interviewer TTS audio while dog shows listening animation",
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

        // 인터뷰 질문 전용 정보
        interview_question_info: isInterviewQuestion ? {
          dog_state: "listening",
          dog_lip_sync: false,
          dog_mouth: "CLOSED",
          dog_expression: "curious, attentive, head slightly tilted",
          dog_animation: "subtle nods, ear twitching, blinking",
          audio_source: "interviewer TTS",
          interviewer_text: seg.narration || "",
          note: "강아지는 말하지 않음 - 인터뷰어 음성만 재생, 강아지는 듣는 표정",
        } : null,

        // 씬 상세
        scene_details: {
          scene_type: seg.scene_type || "narration",
          speaker: speaker,
          character_name: seg.character_name,
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

        // ★★★ 립싱크 타이밍 (대사가 있을 때) ★★★
        lip_sync_timing: hasNarration && !isInterviewQuestion ? generateLipSyncTiming() : null,

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
        narration_english: seg.narration_english || "",
        has_narration: hasNarration,
        image_prompt: seg.image_prompt,
        video_prompt: seg.video_prompt,
        audio_details: seg.audio_details,
        action_cues: seg.action_cues || {},
      };
    });

    // =====================
    // 5. 캐릭터 프롬프트 추출
    // =====================
    const characterPrompts = Object.fromEntries(
      Object.entries(characters).map(([key, char]) => [key, char.image_prompt || ""])
    );

    // =====================
    // 6. 결과 반환
    // =====================
    $.export("$summary", `Video generation info prepared for ${scenes.length} scenes (Veo 3 optimized)`);

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

      // 음성 설정 (Veo 3용)
      voice_settings: {
        main: {
          type: "Korean baby girl, 2-3 years old toddler voice",
          tone: "cute, innocent, sometimes whiny or excited",
          characteristics: "slow speech, adorable pronunciation, occasional baby talk",
          laugh_style: "Adorable toddler giggling, infectious cute laughter",
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
