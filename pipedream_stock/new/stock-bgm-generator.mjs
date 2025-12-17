import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Stock BGM Generator",
  description: "주식 Shorts 대본에 맞는 BGM 생성 (MusicAPI Sonic)",

  props: {
    // =====================
    // 이전 단계 데이터
    // =====================
    shorts_script_output: {
      type: "string",
      label: "Shorts Script Output (JSON)",
      description: "Stock Shorts Generator 결과: {{JSON.stringify(steps.Stock_Shorts_Generator.$return_value)}}",
    },

    // =====================
    // API 설정
    // =====================
    musicapi_key: {
      type: "string",
      label: "MusicAPI API Key",
      description: "Get your API key from https://musicapi.ai/dashboard/apikey",
      secret: true,
    },

    // =====================
    // 음악 생성 모드
    // =====================
    generation_mode: {
      type: "string",
      label: "Generation Mode",
      options: [
        { label: "Auto Mode (스크립트 기반 - 권장)", value: "auto" },
        { label: "Custom Mode (직접 스타일 지정)", value: "custom" },
      ],
      default: "auto",
    },

    // Custom Mode 옵션
    custom_style: {
      type: "string",
      label: "Custom Music Style",
      description: "직접 스타일 지정 (예: upbeat, news, dramatic)",
      optional: true,
    },

    // =====================
    // 공통 옵션
    // =====================
    instrumental: {
      type: "boolean",
      label: "Instrumental Only",
      description: "보컬 없는 배경음악 생성",
      default: true,
    },
    model_version: {
      type: "string",
      label: "Model Version",
      options: [
        { label: "Sonic V5 (Latest)", value: "sonic-v5" },
        { label: "Sonic V4.5 Plus", value: "sonic-v4-5-plus" },
        { label: "Sonic V4.5", value: "sonic-v4-5" },
        { label: "Sonic V4", value: "sonic-v4" },
      ],
      default: "sonic-v4-5",
    },

    // =====================
    // 폴링 설정
    // =====================
    max_wait_seconds: {
      type: "integer",
      label: "Max Wait Time (seconds)",
      description: "음악 생성 최대 대기 시간",
      default: 300,
    },
  },

  async run({ $ }) {
    const MUSICAPI_BASE = "https://api.musicapi.ai/api/v1";

    // =====================
    // 0. Script Generator 출력 파싱
    // =====================
    let scriptData;
    try {
      scriptData = typeof this.shorts_script_output === "string"
        ? JSON.parse(this.shorts_script_output)
        : this.shorts_script_output;
    } catch (e) {
      throw new Error("Shorts Script 파싱 실패: " + e.message);
    }

    const shortsScript = scriptData.shorts_script || scriptData;
    const marketLabel = scriptData.market_label || "글로벌";
    const totalDuration = shortsScript.total_duration || 50;
    const shortsStyle = shortsScript.style || scriptData.source_summary?.shorts_style || "casual";

    // 시장 전망 추출
    const marketOutlook = scriptData.source_summary?.market_outlook || "neutral";

    console.log(`📊 시장: ${marketLabel}, 스타일: ${shortsStyle}, 전망: ${marketOutlook}`);
    console.log(`⏱️ 영상 길이: ${totalDuration}초`);

    // =====================
    // 1. Auto Mode: 스크립트 기반 스타일 결정
    // =====================
    let generatedTags = null;

    if (this.generation_mode === "auto") {
      // 콘텐츠 스타일별 BGM 매핑
      const styleToMusic = {
        news: "professional news broadcast, corporate, confident, trustworthy, light tension, modern journalism",
        casual: "friendly upbeat, warm conversational, approachable pop, light energetic, positive vibes",
        breaking: "urgent breaking news, dramatic tension, suspenseful, fast-paced, high energy, alert",
        educational: "calm educational, clear bright, informative friendly, soft focus, easy listening",
      };

      // 시장 전망별 BGM 매핑
      const outlookToMusic = {
        positive: "optimistic, hopeful, bright, uplifting",
        negative: "cautious, serious, contemplative, thoughtful",
        neutral: "balanced, steady, measured, professional",
        bullish: "energetic, confident, powerful, triumphant",
        bearish: "careful, warning, subdued, reflective",
      };

      // 시장별 BGM 느낌
      const marketToMusic = {
        "미국": "modern corporate, wall street vibes, american business",
        "한국": "dynamic asian market, k-style professional",
        "글로벌": "international business, world economy, global perspective",
      };

      // BGM 요소 수집
      const bgmElements = [];

      // 1. 스타일 기반
      if (styleToMusic[shortsStyle]) {
        bgmElements.push(styleToMusic[shortsStyle]);
      } else {
        bgmElements.push(styleToMusic.casual);
      }

      // 2. 시장 전망 기반
      const outlookLower = marketOutlook.toLowerCase();
      if (outlookToMusic[outlookLower]) {
        bgmElements.push(outlookToMusic[outlookLower]);
      }

      // 3. 시장 지역 기반
      if (marketToMusic[marketLabel]) {
        bgmElements.push(marketToMusic[marketLabel]);
      }

      // 4. 공통 요소
      bgmElements.push("background music, youtube shorts, stock market analysis, financial news");

      // 중복 제거 및 태그 생성
      const uniqueElements = [...new Set(bgmElements.join(", ").split(", ").map(s => s.trim()).filter(s => s))];
      generatedTags = uniqueElements.slice(0, 15).join(", ");

      $.export("auto_analysis", {
        shorts_style: shortsStyle,
        market_outlook: marketOutlook,
        market_label: marketLabel,
        generated_tags: generatedTags,
        target_duration: totalDuration,
      });
    }

    // =====================
    // 2. 음악 생성 요청
    // =====================
    console.log(`🎵 음악 생성 요청 중...`);

    const requestBody = {
      mv: this.model_version,
      make_instrumental: this.instrumental,
      custom_mode: true,
      title: `Stock_BGM_${marketLabel}`,
      tags: this.generation_mode === "auto"
        ? generatedTags
        : (this.custom_style || "upbeat, professional, stock market, news background"),
    };

    $.export("request_params", {
      mode: this.generation_mode,
      model: this.model_version,
      instrumental: this.instrumental,
      tags: requestBody.tags,
    });

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
      throw new Error(`음악 생성 실패: ${JSON.stringify(createResponse)}`);
    }

    const taskId = createResponse.task_id;
    console.log(`📋 Task ID: ${taskId}`);

    // =====================
    // 3. 생성 완료 대기 (폴링)
    // =====================
    console.log(`⏳ 음악 생성 대기 중...`);

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
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`⏳ 상태: ${taskStatus} (${elapsed}초 경과)`);

      if (taskStatus === "complete" || taskStatus === "completed" || taskStatus === "succeeded") {
        result = statusResponse;
        break;
      } else if (taskStatus === "failed" || taskStatus === "error") {
        throw new Error(`음악 생성 실패: ${statusResponse.error || "Unknown error"}`);
      }

      // data 배열에서 개별 곡 상태 확인
      const songs = statusResponse.data || statusResponse.clips || [];
      if (Array.isArray(songs) && songs.length > 0) {
        const firstSong = songs[0];
        const songComplete = firstSong.state === "succeeded" ||
                            firstSong.state === "complete" ||
                            (firstSong.duration && firstSong.duration > 0 &&
                             firstSong.audio_url && !firstSong.audio_url.includes("audiopipe"));
        if (songComplete) {
          result = statusResponse;
          break;
        }
      }
    }

    if (!result) {
      throw new Error(`음악 생성 타임아웃 (${this.max_wait_seconds}초)`);
    }

    // =====================
    // 4. 결과 처리
    // =====================
    console.log(`✅ 음악 생성 완료!`);

    const songs = result.data || result.songs || result.clips || [];

    if (songs.length === 0) {
      throw new Error("생성된 곡이 없습니다.");
    }

    const generatedSongs = songs.map((song, index) => ({
      index,
      id: song.id || song.clip_id,
      title: song.title || `BGM_${index + 1}`,
      audio_url: song.audio_url || song.song_url || song.url,
      duration: song.duration,
      style: song.tags || song.style,
    }));

    // 완료된 곡만 필터링 (audiopipe URL 제외)
    const completedSongs = generatedSongs.filter(
      song => song.audio_url && !song.audio_url.includes("audiopipe.suno.ai")
    );

    const primaryBgm = completedSongs[0] || generatedSongs[0];

    console.log(`🎵 BGM URL: ${primaryBgm?.audio_url}`);
    console.log(`⏱️ BGM 길이: ${primaryBgm?.duration}초`);

    // =====================
    // 5. 결과 반환
    // =====================
    const output = {
      success: true,
      task_id: taskId,
      model: this.model_version,
      mode: this.generation_mode,
      instrumental: this.instrumental,

      // 분석 정보
      market_label: marketLabel,
      shorts_style: shortsStyle,
      market_outlook: marketOutlook,
      target_duration: totalDuration,

      // Auto Mode 분석 결과
      auto_analysis: this.generation_mode === "auto" ? {
        shorts_style: shortsStyle,
        market_outlook: marketOutlook,
        generated_tags: generatedTags,
      } : null,

      // 생성된 곡들
      songs: generatedSongs,
      songs_count: completedSongs.length,

      // 메인 BGM (첫 번째 곡)
      bgm_url: primaryBgm?.audio_url,
      bgm_duration: primaryBgm?.duration,

      // 볼륨 설정 (Creatomate/렌더러용)
      bgm_volume_settings: {
        default_volume: 0.25,      // 기본 볼륨 (나레이션과 함께)
        intro_volume: 0.4,         // 인트로 볼륨
        outro_volume: 0.4,         // 아웃트로 볼륨
        fade_in_duration: 1,       // 페이드 인 (초)
        fade_out_duration: 2,      // 페이드 아웃 (초)
      },

      generated_at: new Date().toISOString(),
    };

    $.export("bgm_result", output);
    $.export("$summary", `BGM 생성 완료: ${completedSongs.length}곡 (${primaryBgm?.duration}초)`);

    return output;
  },
});

