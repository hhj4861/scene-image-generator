/**
 * Stock BGM Generator (Webhook Version)
 *
 * Workflow 3에서 사용 - Webhook 트리거로 데이터 수신
 *
 * 입력 경로: steps.trigger.event.body
 */

import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Stock BGM Generator (Webhook)",
  description: "Webhook 트리거용 - 주식 Shorts에 맞는 BGM 생성",

  props: {
    // =====================
    // Webhook 데이터 (자동 매핑)
    // =====================
    webhook_data: {
      type: "string",
      label: "Webhook Data (JSON)",
      description: "Webhook으로 받은 전체 데이터: {{JSON.stringify(steps.trigger.event.body)}}",
    },

    // =====================
    // API 설정
    // =====================
    musicapi_key: {
      type: "string",
      label: "MusicAPI API Key",
      secret: true,
    },

    // =====================
    // 음악 생성 모드
    // =====================
    generation_mode: {
      type: "string",
      label: "Generation Mode",
      options: [
        { label: "Auto Mode (스크립트 기반)", value: "auto" },
        { label: "Custom Mode (직접 스타일)", value: "custom" },
      ],
      default: "auto",
    },
    custom_style: {
      type: "string",
      label: "Custom Music Style",
      description: "직접 스타일 지정 (예: upbeat, news)",
      optional: true,
    },

    // =====================
    // 공통 옵션
    // =====================
    instrumental: {
      type: "boolean",
      label: "Instrumental Only",
      default: true,
    },
    model_version: {
      type: "string",
      label: "Model Version",
      options: [
        { label: "Sonic V5", value: "sonic-v5" },
        { label: "Sonic V4.5 Plus", value: "sonic-v4-5-plus" },
        { label: "Sonic V4.5", value: "sonic-v4-5" },
      ],
      default: "sonic-v4-5",
    },
    max_wait_seconds: {
      type: "integer",
      label: "Max Wait Time (seconds)",
      default: 300,
    },
  },

  async run({ $ }) {
    const MUSICAPI_BASE = "https://api.musicapi.ai/api/v1";

    console.log("🎵 Stock BGM Generator (Webhook) 시작");

    // =====================
    // Webhook 데이터 파싱
    // =====================
    let data;
    try {
      data = typeof this.webhook_data === "string"
        ? JSON.parse(this.webhook_data) : this.webhook_data;
    } catch (e) {
      throw new Error("Webhook 데이터 파싱 실패: " + e.message);
    }

    // Workflow 2에서 전송된 구조
    const shortsScript = data.shorts_script || {};
    const marketLabel = data.market_label || "글로벌";
    const totalDuration = shortsScript.total_duration || 50;
    const shortsStyle = shortsScript.style || "casual";
    const marketOutlook = data.source_summary?.market_outlook || "neutral";

    console.log(`📊 시장: ${marketLabel}, 스타일: ${shortsStyle}`);
    console.log(`⏱️ 영상 길이: ${totalDuration}초`);

    // =====================
    // Auto Mode: 스타일 결정
    // =====================
    let generatedTags = null;

    if (this.generation_mode === "auto") {
      const styleToMusic = {
        news: "professional news broadcast, corporate, confident",
        casual: "friendly upbeat, warm conversational, positive vibes",
        breaking: "urgent breaking news, dramatic tension, fast-paced",
        educational: "calm educational, clear bright, easy listening",
      };

      const outlookToMusic = {
        positive: "optimistic, hopeful, bright",
        negative: "cautious, serious, contemplative",
        neutral: "balanced, steady, professional",
      };

      const marketToMusic = {
        "미국": "modern corporate, wall street vibes",
        "한국": "dynamic asian market, k-style",
        "글로벌": "international business, global perspective",
      };

      const bgmElements = [
        styleToMusic[shortsStyle] || styleToMusic.casual,
        outlookToMusic[marketOutlook.toLowerCase()] || "",
        marketToMusic[marketLabel] || "",
        "background music, youtube shorts, stock market",
      ];

      generatedTags = [...new Set(bgmElements.join(", ").split(", ").filter(s => s))].slice(0, 15).join(", ");
    }

    // =====================
    // 음악 생성 요청
    // =====================
    console.log(`🎵 음악 생성 요청 중...`);

    const requestBody = {
      mv: this.model_version,
      make_instrumental: this.instrumental,
      custom_mode: true,
      title: `Stock_BGM_${marketLabel}`,
      tags: this.generation_mode === "auto" ? generatedTags : (this.custom_style || "upbeat, professional"),
    };

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
    // 폴링
    // =====================
    let result = null;
    const startTime = Date.now();
    const maxWaitMs = this.max_wait_seconds * 1000;

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, 5000));

      const statusResponse = await axios($, {
        method: "GET",
        url: `${MUSICAPI_BASE}/sonic/task/${taskId}`,
        headers: { "Authorization": `Bearer ${this.musicapi_key}` },
      });

      const taskStatus = statusResponse.status || statusResponse.state;
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`⏳ 상태: ${taskStatus} (${elapsed}초)`);

      if (taskStatus === "complete" || taskStatus === "completed" || taskStatus === "succeeded") {
        result = statusResponse;
        break;
      } else if (taskStatus === "failed" || taskStatus === "error") {
        throw new Error(`음악 생성 실패: ${statusResponse.error || "Unknown"}`);
      }

      const songs = statusResponse.data || [];
      if (songs.length > 0 && songs[0].audio_url && !songs[0].audio_url.includes("audiopipe")) {
        result = statusResponse;
        break;
      }
    }

    if (!result) {
      throw new Error(`음악 생성 타임아웃 (${this.max_wait_seconds}초)`);
    }

    // =====================
    // 결과 처리
    // =====================
    console.log(`✅ 음악 생성 완료!`);

    const songs = result.data || [];
    const completedSongs = songs.filter(s => s.audio_url && !s.audio_url.includes("audiopipe"));
    const primaryBgm = completedSongs[0] || songs[0];

    console.log(`🎵 BGM URL: ${primaryBgm?.audio_url}`);

    const output = {
      success: true,
      task_id: taskId,
      market_label: marketLabel,
      bgm_url: primaryBgm?.audio_url,
      bgm_duration: primaryBgm?.duration,
      bgm_volume_settings: {
        default_volume: 0.25,
        intro_volume: 0.4,
        outro_volume: 0.4,
      },
      // Workflow 2 데이터 패스스루 (VM Renderer용)
      folder_name: data.folder_name,
      analysis_date: data.analysis_date,
      shorts_script: shortsScript,
      videos: data.videos,
      images: data.images,
      generated_at: new Date().toISOString(),
    };

    $.export("bgm_result", output);
    $.export("$summary", `BGM 생성 완료: ${primaryBgm?.duration}초`);
    return output;
  },
});
