import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "BGM Generator",
  description: "Generate background music for Shorts using MusicAPI (Sonic/Suno) - Script Generator 연동",

  props: {
    // Script Generator 출력 (통합 입력)
    script_generator_output: {
      type: "string",
      label: "Script Generator Output (JSON)",
      description: "Script Generator의 전체 출력. 사용: {{JSON.stringify(steps.Shorts_Script_Generator.$return_value)}}",
    },

    // API 설정
    musicapi_key: {
      type: "string",
      label: "MusicAPI API Key",
      description: "Get your API key from https://musicapi.ai/dashboard/apikey",
      secret: true,
    },

    // 음악 생성 모드
    generation_mode: {
      type: "string",
      label: "Generation Mode",
      description: "How to generate the music",
      options: [
        { label: "Auto Mode (Script Generator 기반 - 권장)", value: "auto" },
        { label: "Description Mode (직접 설명 입력)", value: "description" },
        { label: "Custom Mode (직접 스타일 지정)", value: "custom" },
      ],
      default: "auto",
    },

    // Description Mode 옵션
    music_description: {
      type: "string",
      label: "Music Description",
      description: "Describe the music you want (for Description Mode). Max 400 chars.",
      optional: true,
    },

    // Custom Mode 옵션
    music_title: {
      type: "string",
      label: "Music Title",
      description: "Title for the music (for Custom Mode). Max 120 chars.",
      optional: true,
    },
    music_style: {
      type: "string",
      label: "Music Style/Tags",
      description: "Style tags like 'upbeat pop, energetic, happy'. Max 200 chars for v4, 1000 for v4.5+",
      optional: true,
    },

    // 공통 옵션
    instrumental: {
      type: "boolean",
      label: "Instrumental Only",
      description: "Generate instrumental music without vocals",
      default: true,
    },
    model_version: {
      type: "string",
      label: "Model Version",
      description: "Sonic model version to use",
      options: [
        { label: "Sonic V5 (Latest)", value: "sonic-v5" },
        { label: "Sonic V4.5 Plus", value: "sonic-v4-5-plus" },
        { label: "Sonic V4.5", value: "sonic-v4-5" },
        { label: "Sonic V4", value: "sonic-v4" },
        { label: "Sonic V3.5", value: "sonic-v3-5" },
      ],
      default: "sonic-v4-5",
    },

    // 폴링 설정
    max_wait_seconds: {
      type: "integer",
      label: "Max Wait Time (seconds)",
      description: "Maximum time to wait for music generation",
      default: 300,
    },
  },

  async run({ steps, $ }) {
    const MUSICAPI_BASE = "https://api.musicapi.ai/api/v1";

    // =====================
    // 0. Script Generator 출력 파싱
    // =====================
    const scriptOutput = typeof this.script_generator_output === 'string'
      ? JSON.parse(this.script_generator_output)
      : this.script_generator_output;

    // BGM 관련 정보 추출 (다양한 경로 지원)
    const bgmConfig = scriptOutput.bgm || scriptOutput.pipeline_data?.bgm || {};
    const topicInfo = scriptOutput.topic_info || {};

    // ★★★ 콘텐츠 타입 정보 추출 (NEW!) ★★★
    const contentType = scriptOutput.content_type ||
                       topicInfo.content_type ||
                       "satire";
    const contentTypeConfig = scriptOutput.content_type_config ||
                             topicInfo.content_type_config ||
                             {};

    // ★★★ 퍼포먼스 정보 추출 (Script Generator에서 전달) ★★★
    const isPerformanceContent = bgmConfig.is_performance || false;
    const performanceTypes = bgmConfig.performance_types || [];
    const primaryPerformanceType = bgmConfig.primary_performance_type || null;
    const bgmStyleFromScript = bgmConfig.bgm_style || null;

    // ★★★ 일관성 정보에서 퍼포먼스 타입 추출 (신규) ★★★
    const consistencyInfo = scriptOutput.consistency || {};
    const consistencyPerformanceType = consistencyInfo.performance_type || null;
    const hasPerformanceFromConsistency = consistencyInfo.has_performance || false;

    // 퍼포먼스 타입 우선순위: bgmConfig > consistency > script_segments
    const effectivePerformanceType = primaryPerformanceType
      || consistencyPerformanceType
      || scriptOutput.script?.script_segments?.find(seg => seg.performance_type)?.performance_type
      || "beatbox";

    const effectiveIsPerformance = isPerformanceContent || hasPerformanceFromConsistency;

    $.export("performance_info", {
      is_performance: effectiveIsPerformance,
      performance_types: performanceTypes,
      primary_type: effectivePerformanceType,
      bgm_style_from_script: bgmStyleFromScript,
      from_consistency: hasPerformanceFromConsistency,
    });

    // mood 추출 (우선순위: content_type_config > bgm.mood > topic_info.story_context > 기본값)
    const mood = contentTypeConfig.mood ||
                bgmConfig.mood ||
                topicInfo.story_context?.music_mood ||
                scriptOutput.mood ||
                scriptOutput.input?.target_emotion ||
                "calm";

    // content_style 추출 (content_type을 우선 사용)
    const contentStyle = contentType ||
                        bgmConfig.content_style ||
                        topicInfo.category ||
                        scriptOutput.input?.content_style ||
                        "pet";

    // music_suggestion 추출
    const musicSuggestion = bgmConfig.music_suggestion ||
                           scriptOutput.pipeline_data?.metadata?.music ||
                           topicInfo.story_context?.viral_elements?.join(", ") ||
                           "";

    // ★★★ 효과적인 토픽 추출 ★★★
    const effectiveTopic = topicInfo.topic ||
                          scriptOutput.topic_info?.topic ||
                          scriptOutput.title?.korean ||
                          "";

    // ★ 총 영상 길이 (스크립트 길이 기반 동적 duration)
    const targetDuration = scriptOutput.total_duration_seconds ||
                          scriptOutput.pipeline_data?.total_duration_seconds ||
                          scriptOutput.duration_info?.final_duration ||
                          40;

    // ★ 풍자 모드인지 확인 (인터뷰 형식 등)
    const isSatire = contentType === "satire" || topicInfo.is_satire || false;
    const scriptFormat = topicInfo.script_format || "monologue";

    $.export("input_parsed", {
      content_type: contentType,
      mood,
      content_style: contentStyle,
      music_suggestion: musicSuggestion?.substring(0, 100),
      target_duration: targetDuration,
      is_satire: isSatire,
      script_format: scriptFormat,
      is_performance: isPerformanceContent,
      primary_performance_type: primaryPerformanceType,
    });

    // =====================
    // 1. Auto Mode: Script Generator 기반 스타일 결정
    // =====================
    let autoGeneratedDescription = null;
    let autoGeneratedTags = null;

    if (this.generation_mode === "auto") {
      $.export("status", "Analyzing script for BGM style...");

      // ★★★ 콘텐츠 타입별 BGM 스타일 매핑 (NEW! - 최우선) ★★★
      const contentTypeToBgm = {
        satire: "news-like background, dramatic tension, quirky ironic undertones, satirical mood, professional interview ambience",
        comic: "funny quirky upbeat, playful bouncy, comedic timing, cartoon-like sounds, humorous mood",
        emotional: "emotional heartfelt sentimental, touching cinematic, piano strings, tearful moments, warm moving",
        daily: "casual cozy lo-fi, warm friendly vlog music, comfortable everyday ambience, relaxed natural",
        mukbang: "happy cheerful eating music, appetizing upbeat, food commercial style, satisfying rhythm",
        healing: "peaceful ambient relaxing, gentle nature sounds, soft piano, meditation calming, spa-like tranquil",
        drama: "cinematic dramatic orchestral, story-driven narrative, tension and release, emotional peaks",
        performance: "beatbox rhythmic percussive, acapella vocal beats, hip-hop instrumental, energetic dynamic, drop bass heavy",
        random: "gentle warm background music, versatile mood",
      };

      // ★★★ 퍼포먼스 타입별 세부 스타일 (강화!) ★★★
      const performanceSubTypes = {
        beatbox: "beatbox rhythmic percussive, human beatbox style, mouth percussion, vocal drums and bass, kick snare hi-hat patterns, dubstep wobble bass, trap beat drops, energetic dynamic tempo 120-140bpm",
        singing: "vocal melody acapella, cute kawaii singing voice, sweet melodic tune, pop ballad instrumental, emotional chorus, harmonious background vocals, 80-100bpm",
        dance: "electronic dance music EDM, high energy club beat, trap rhythm, heavy bass drops, synth leads, build-up and drop structure, festival anthem style, 128-150bpm",
        rap: "hip-hop trap beat, 808 bass heavy, crisp snare rolls, dark melody, boom bap drums, freestyle rap instrumental, swagger beat, 85-95bpm",
        hiphop: "old school hip-hop, funky drum break, sample-based beat, groovy bassline, scratching sounds, boom bap style, 90-100bpm",
        rock: "electric guitar riff, powerful drums, bass guitar groove, rock anthem style, energetic tempo, stadium rock feel, 120-140bpm",
        instrument: "instrumental solo performance, piano melody, acoustic guitar fingerpicking, orchestral arrangement, musical virtuoso showcase",
        kpop: "K-pop dance track, catchy hook, synthesizer melody, polished production, addictive chorus, 120-130bpm",
      };

      // 무드 → BGM 스타일 매핑
      const moodToBgmStyle = {
        // target_emotion 값들
        touching: "emotional, heartfelt, sentimental, moving, cinematic",
        healing: "peaceful, calming, ambient, relaxing, gentle",
        funny: "playful, quirky, upbeat, fun, lighthearted",
        empathy: "warm, emotional, soft, touching, relatable",
        passion: "energetic, inspiring, powerful, motivational, uplifting",
        calm: "peaceful, serene, gentle, soothing, ambient",
        cute: "playful, sweet, bright, cheerful, adorable",
        warm: "cozy, gentle, heartwarming, soft, comforting",
      };

      // content_style → BGM 스타일 매핑 (레거시 지원)
      const contentStyleToBgm = {
        pet: "cute, heartwarming, playful, gentle, warm",
        motivational: "inspiring, uplifting, powerful, energetic, hopeful",
        healing: "calming, ambient, peaceful, relaxing, soft",
        story: "cinematic, emotional, narrative, dramatic, moving",
        comedy: "funny, quirky, upbeat, playful, bouncy",
        educational: "bright, clear, friendly, informative, engaging",
        asmr: "soft, ambient, whisper, gentle, relaxing",
        daily: "casual, friendly, warm, cozy, natural",
        cute: "adorable, sweet, playful, bright, cheerful",
        satire: "news-like, dramatic, tension, quirky, ironic",
        interview: "news, professional, light tension, serious yet playful",
      };

      // BGM 스타일 요소 수집
      let bgmElements = [];

      // ★★★ 퍼포먼스 콘텐츠인 경우: 퍼포먼스 타입별 스타일 최우선 적용! ★★★
      if (effectiveIsPerformance) {
        // 1. Script Generator에서 전달받은 bgm_style 사용
        if (bgmStyleFromScript) {
          bgmElements.push(bgmStyleFromScript);
          $.export("performance_style_source", "from_script_bgm_style");
        }

        // 2. 퍼포먼스 타입별 세부 스타일 추가 (가장 중요!)
        if (performanceSubTypes[effectivePerformanceType]) {
          bgmElements.push(performanceSubTypes[effectivePerformanceType]);
          $.export("performance_type_applied", effectivePerformanceType);
          $.export("performance_bgm_style", performanceSubTypes[effectivePerformanceType]);
        } else {
          // fallback: 토픽에서 퍼포먼스 타입 감지
          const topicLower = (topicInfo.topic || musicSuggestion || effectiveTopic || "").toLowerCase();

          if (topicLower.includes("비트박스") || topicLower.includes("beatbox")) {
            bgmElements.push(performanceSubTypes.beatbox);
            $.export("performance_detected", "beatbox");
          } else if (topicLower.includes("노래") || topicLower.includes("singing") || topicLower.includes("song") || topicLower.includes("보컬")) {
            bgmElements.push(performanceSubTypes.singing);
            $.export("performance_detected", "singing");
          } else if (topicLower.includes("댄스") || topicLower.includes("dance") || topicLower.includes("춤") || topicLower.includes("디제이")) {
            bgmElements.push(performanceSubTypes.dance);
            $.export("performance_detected", "dance");
          } else if (topicLower.includes("랩") || topicLower.includes("rap")) {
            bgmElements.push(performanceSubTypes.rap);
            $.export("performance_detected", "rap");
          } else if (topicLower.includes("힙합") || topicLower.includes("hiphop") || topicLower.includes("hip-hop")) {
            bgmElements.push(performanceSubTypes.hiphop);
            $.export("performance_detected", "hiphop");
          } else if (topicLower.includes("락") || topicLower.includes("rock") || topicLower.includes("기타") || topicLower.includes("밴드")) {
            bgmElements.push(performanceSubTypes.rock);
            $.export("performance_detected", "rock");
          } else if (topicLower.includes("악기") || topicLower.includes("피아노") || topicLower.includes("드럼") || topicLower.includes("바이올린")) {
            bgmElements.push(performanceSubTypes.instrument);
            $.export("performance_detected", "instrument");
          } else if (topicLower.includes("케이팝") || topicLower.includes("kpop") || topicLower.includes("아이돌")) {
            bgmElements.push(performanceSubTypes.kpop);
            $.export("performance_detected", "kpop");
          } else {
            // 기본값: 비트박스 (가장 일반적인 퍼포먼스)
            bgmElements.push(performanceSubTypes.beatbox);
            $.export("performance_detected", "beatbox (default)");
          }
        }

        // 퍼포먼스 기본 스타일 추가
        bgmElements.push("energetic, dynamic, performance vibe, stage presence");
      }
      // ★★★ 일반 콘텐츠: 콘텐츠 타입 기반 스타일 ★★★
      else if (contentTypeToBgm[contentType]) {
        bgmElements.push(contentTypeToBgm[contentType]);
      }

      // ★ 풍자/인터뷰 형식이면 해당 스타일 추가 (보조)
      if (isSatire && contentType !== "satire") {
        bgmElements.push(contentStyleToBgm.satire);
      }
      if (scriptFormat === "interview") {
        bgmElements.push(contentStyleToBgm.interview);
      }

      // mood 기반 스타일 추가 (보조)
      if (moodToBgmStyle[mood]) {
        bgmElements.push(moodToBgmStyle[mood]);
      }

      // content_style 기반 스타일 추가 (레거시 지원)
      if (contentStyleToBgm[contentStyle] && contentStyle !== contentType) {
        bgmElements.push(contentStyleToBgm[contentStyle]);
      }

      // music_suggestion에서 키워드 추출 (AI가 제안한 음악 스타일)
      if (musicSuggestion) {
        // 일반적인 음악 관련 키워드 추출
        const musicKeywords = musicSuggestion.toLowerCase()
          .replace(/[^\w\s,]/g, '')
          .split(/[\s,]+/)
          .filter(word => word.length > 3)
          .slice(0, 5);
        if (musicKeywords.length > 0) {
          bgmElements.push(musicKeywords.join(", "));
        }
      }

      // 기본값 (분석 결과가 없을 경우)
      if (bgmElements.length === 0) {
        bgmElements.push("gentle, warm, background music");
      }

      // 최종 태그 생성 (중복 제거)
      const uniqueElements = [...new Set(bgmElements.join(", ").split(", ").map(s => s.trim()).filter(s => s))];
      autoGeneratedTags = uniqueElements.slice(0, 12).join(", ");
      autoGeneratedDescription = `${autoGeneratedTags}, background music for ${targetDuration} second short video`;

      $.export("auto_analysis", {
        content_type: contentType,
        mood,
        content_style: contentStyle,
        music_suggestion: musicSuggestion?.substring(0, 100),
        generated_tags: autoGeneratedTags,
        target_duration: targetDuration,
      });
    }

    // =====================
    // 2. 음악 생성 요청
    // =====================
    $.export("status", "Requesting music generation...");

    let requestBody = {
      mv: this.model_version,
      make_instrumental: this.instrumental,
    };

    if (this.generation_mode === "auto") {
      // Auto Mode: Script Generator 기반
      requestBody.custom_mode = true;
      requestBody.title = "Shorts_BGM";
      requestBody.tags = autoGeneratedTags || "gentle, warm, background music";
    } else if (this.generation_mode === "description") {
      // Description Mode: 사용자 설명 입력
      requestBody.custom_mode = false;
      requestBody.gpt_description_prompt = this.music_description || "upbeat background music for short video, energetic and catchy";
    } else {
      // Custom Mode: 직접 스타일 지정
      requestBody.custom_mode = true;
      requestBody.title = this.music_title || "Shorts BGM";
      requestBody.tags = this.music_style || "upbeat, energetic, pop, background music";
    }

    $.export("request_params", {
      mode: this.generation_mode,
      model: this.model_version,
      instrumental: this.instrumental,
      tags: requestBody.tags || requestBody.gpt_description_prompt,
    });

    // 생성 요청
    const createResponse = await axios($, {
      method: "POST",
      url: `${MUSICAPI_BASE}/sonic/create`,
      headers: {
        "Authorization": `Bearer ${this.musicapi_key}`,
        "Content-Type": "application/json",
      },
      data: requestBody,
    });

    if (!createResponse.task_id) {
      throw new Error(`Failed to create music task: ${JSON.stringify(createResponse)}`);
    }

    const taskId = createResponse.task_id;
    $.export("task_id", taskId);

    // =====================
    // 3. 생성 완료 대기 (폴링)
    // =====================
    $.export("status", "Waiting for music generation...");

    let result = null;
    const startTime = Date.now();
    const maxWaitMs = this.max_wait_seconds * 1000;
    const pollInterval = 5000; // 5초마다 확인

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      const statusResponse = await axios($, {
        method: "GET",
        url: `${MUSICAPI_BASE}/sonic/task/${taskId}`,
        headers: {
          "Authorization": `Bearer ${this.musicapi_key}`,
        },
      });

      const taskStatus = statusResponse.status || statusResponse.state;
      $.export("poll_status", taskStatus);

      if (taskStatus === "complete" || taskStatus === "completed" || taskStatus === "succeeded") {
        result = statusResponse;
        break;
      } else if (taskStatus === "failed" || taskStatus === "error") {
        throw new Error(`Music generation failed: ${statusResponse.error || "Unknown error"}`);
      }

      // data 배열에서 개별 곡 상태 확인
      const songs = statusResponse.data || statusResponse.clips || [];
      if (Array.isArray(songs) && songs.length > 0) {
        const firstSong = songs[0];
        const songComplete = firstSong.state === "succeeded" ||
                            firstSong.state === "complete" ||
                            (firstSong.duration && firstSong.duration > 0 &&
                             firstSong.audio_url && !firstSong.audio_url.includes('audiopipe'));
        if (songComplete) {
          result = statusResponse;
          break;
        }
      }

      // 진행 상황 업데이트
      if (statusResponse.progress) {
        $.export("progress", `${statusResponse.progress}%`);
      }
    }

    if (!result) {
      throw new Error(`Music generation timed out after ${this.max_wait_seconds} seconds`);
    }

    // =====================
    // 4. 결과 처리
    // =====================
    $.export("status", "Processing generated music...");

    // MusicAPI는 보통 2곡을 생성
    const songs = result.data || result.songs || result.clips || [];

    if (songs.length === 0) {
      throw new Error("No songs were generated");
    }

    const generatedSongs = songs.map((song, index) => ({
      index,
      id: song.id || song.clip_id,
      title: song.title || `BGM_${index + 1}`,
      audio_url: song.audio_url || song.song_url || song.url,
      duration: song.duration,
      style: song.tags || song.style,
    }));

    $.export("songs_generated", generatedSongs.length);

    // =====================
    // 5. 결과 반환
    // =====================
    // 완료된 곡만 필터링 (audiopipe URL 제외)
    const completedSongs = generatedSongs.filter(
      song => song.audio_url && !song.audio_url.includes('audiopipe.suno.ai')
    );

    // 첫 번째 완료된 곡의 URL을 bgm_url로 사용
    const primaryBgm = completedSongs[0] || generatedSongs[0];

    $.export("$summary", `Generated ${completedSongs.length} BGM tracks (target: ${targetDuration}s)${effectiveIsPerformance ? ` [Performance: ${effectivePerformanceType}]` : ''}`);

    return {
      success: true,
      task_id: taskId,
      model: this.model_version,
      mode: this.generation_mode,
      instrumental: this.instrumental,

      // ★★★ 콘텐츠 타입 정보 ★★★
      content_type: contentType,
      content_type_config: contentTypeConfig,

      // ★★★ 퍼포먼스 정보 (강화!) ★★★
      is_performance: effectiveIsPerformance,
      performance_info: effectiveIsPerformance ? {
        performance_types: performanceTypes.length > 0 ? performanceTypes : [effectivePerformanceType],
        primary_type: effectivePerformanceType,
        bgm_style: bgmStyleFromScript || autoGeneratedTags,
        from_consistency: hasPerformanceFromConsistency,
      } : null,

      // Script Generator 기반 분석 결과
      auto_analysis: this.generation_mode === "auto" ? {
        content_type: contentType,
        mood,
        content_style: contentStyle,
        music_suggestion: musicSuggestion,
        generated_tags: autoGeneratedTags,
        is_performance: effectiveIsPerformance,
        performance_type: effectivePerformanceType,
      } : null,

      // 타겟 duration (스크립트 길이 기반)
      target_duration_seconds: targetDuration,

      // 생성된 곡들
      songs: generatedSongs,

      // Creatomate 연동용 - Suno CDN URL 직접 사용
      bgm_url: primaryBgm?.audio_url,
      bgm_duration: primaryBgm?.duration,

      // ★★★ 퍼포먼스 장면에서 BGM 볼륨 조절 정보 (Creatomate용) ★★★
      bgm_volume_settings: effectiveIsPerformance ? {
        // 퍼포먼스 장면: BGM 80% 볼륨 (performance_start, performance_resume)
        // 퍼포먼스 브레이크: BGM 0% (TTS 기계음)
        // 일반 장면: BGM 30% 볼륨 (TTS가 메인)
        default_volume: 0.3,
        performance_volume: 0.8,
        performance_break_volume: 0,
        performance_type: effectivePerformanceType,
      } : {
        default_volume: 0.3,
        performance_volume: 0.3,
        performance_break_volume: 0.3,
      },
    };
  },
});
