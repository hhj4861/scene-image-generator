/**
 * Stock VM Renderer (Webhook Version)
 *
 * Workflow 3에서 사용 - Webhook 트리거로 데이터 수신
 *
 * 입력 경로: steps.trigger.event.body (Video Generator 또는 BGM Generator 출력)
 */

import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Stock VM Renderer (Webhook)",
  description: "Webhook 트리거용 - FFmpeg VM으로 주식 뉴스 영상 합성",

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
    // BGM 설정 (BGM Generator 없을 경우)
    // =====================
    bgm_url_override: {
      type: "string",
      label: "BGM URL (Override)",
      description: "BGM URL 수동 지정. 비어있으면 webhook 데이터의 bgm_url 사용",
      optional: true,
    },
    bgm_volume: {
      type: "string",
      label: "BGM 볼륨 (나레이션 있을 때)",
      options: [
        { label: "0.1 (아주 작게)", value: "0.1" },
        { label: "0.15 (작게)", value: "0.15" },
        { label: "0.2 (기본)", value: "0.2" },
        { label: "0.25 (조금 크게)", value: "0.25" },
        { label: "0.3 (크게)", value: "0.3" },
      ],
      default: "0.2",
    },
    bgm_volume_no_audio: {
      type: "string",
      label: "BGM 볼륨 (나레이션 없을 때)",
      options: [
        { label: "0.5", value: "0.5" },
        { label: "0.7", value: "0.7" },
        { label: "0.8 (기본)", value: "0.8" },
        { label: "1.0 (최대)", value: "1.0" },
      ],
      default: "0.8",
    },

    // =====================
    // 레이아웃 설정
    // =====================
    header_text_ko: {
      type: "string",
      label: "헤더 텍스트 (한글)",
      description: "비어있으면 shorts_script.title 사용",
      optional: true,
    },
    header_text_en: {
      type: "string",
      label: "헤더 텍스트 (영문)",
      optional: true,
    },
    footer_text_ko: {
      type: "string",
      label: "푸터 텍스트 (한글)",
      optional: true,
    },
    footer_text_en: {
      type: "string",
      label: "푸터 텍스트 (영문)",
      optional: true,
    },
    subtitle_timing_mode: {
      type: "string",
      label: "자막 타이밍 모드",
      options: [
        { label: "Timed (씬별 자막)", value: "timed" },
        { label: "Always (항상 표시)", value: "always" },
      ],
      default: "timed",
    },

    // =====================
    // 출력 설정
    // =====================
    output_width: {
      type: "integer",
      label: "출력 너비",
      default: 720,
    },
    output_height: {
      type: "integer",
      label: "출력 높이",
      default: 1280,
    },
    force_vertical: {
      type: "boolean",
      label: "세로 영상 강제 변환",
      default: true,
    },
    video_scale_mode: {
      type: "string",
      label: "비디오 스케일 모드",
      options: [
        { label: "Fit (맞춤)", value: "fit" },
        { label: "Fill (채움)", value: "fill" },
        { label: "Crop (잘라내기)", value: "crop" },
      ],
      default: "fit",
    },

    // =====================
    // FFmpeg VM 설정
    // =====================
    ffmpeg_vm_url: {
      type: "string",
      label: "FFmpeg VM URL",
      default: "http://34.64.168.173:3000",
    },
    render_endpoint: {
      type: "string",
      label: "렌더 엔드포인트",
      options: [
        { label: "/render/puppy (범용)", value: "/render/puppy" },
        { label: "/render/stock (주식 전용)", value: "/render/stock" },
      ],
      default: "/render/puppy",
    },

    // =====================
    // GCS 설정
    // =====================
    gcs_bucket_name: {
      type: "string",
      label: "GCS Bucket (Output)",
      default: "shorts-videos-storage-mcp-test-457809",
    },
  },

  async run({ $ }) {
    console.log("🎬 Stock VM Renderer (Webhook) 시작");

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

    // Workflow 2에서 전송된 구조 (또는 BGM Generator 경유)
    const shortsScript = data.shorts_script || {};
    const scenes = shortsScript.scenes || [];
    const folderName = data.folder_name || "unknown";
    const videoResults = data.videos?.results || [];
    const bgmUrl = this.bgm_url_override || data.bgm_url || "";

    if (!scenes.length) throw new Error("씬이 없습니다.");

    console.log(`📂 폴더: ${folderName}`);
    console.log(`🎥 씬 수: ${scenes.length}`);
    console.log(`🎵 BGM: ${bgmUrl ? "있음" : "없음"}`);

    // =====================
    // GCS 비디오 존재 여부 확인
    // =====================
    console.log(`\n🔍 GCS에서 비디오 확인 중...`);

    const videoExistsMap = new Map();
    const videoUrlMap = new Map();

    for (const scene of scenes) {
      const sceneNum = scene.scene_number;
      const expectedUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${folderName}/scene_${String(sceneNum).padStart(2, "0")}.mp4`;
      const videoResult = videoResults.find(r => r.scene_number === sceneNum);
      const videoUrl = videoResult?.video_url || expectedUrl;
      videoUrlMap.set(sceneNum, videoUrl);

      try {
        await axios($, { url: videoUrl, method: "HEAD", timeout: 5000 });
        videoExistsMap.set(sceneNum, true);
        console.log(`   ✅ Scene ${sceneNum}: 존재함`);
      } catch (e) {
        videoExistsMap.set(sceneNum, false);
        console.log(`   ❌ Scene ${sceneNum}: 없음`);
      }
    }

    // =====================
    // 비디오 목록 구성
    // =====================
    const videos = [];
    const skippedScenes = [];

    for (const scene of scenes) {
      const sceneNum = scene.scene_number;
      if (!videoExistsMap.get(sceneNum)) {
        skippedScenes.push(sceneNum);
        continue;
      }

      const videoUrl = videoUrlMap.get(sceneNum);
      const narration = scene.narration || "";
      const narrationEn = scene.narration_english || "";
      const hasAudio = scene.has_audio !== false;
      const sceneDuration = scene.duration || 8;

      let timedSubtitles = scene.timed_subtitles;
      if (!timedSubtitles && narration) {
        timedSubtitles = [{
          start_time: 0,
          end_time: sceneDuration,
          text_ko: narration,
          text_en: narrationEn,
          position: "center",
        }];
      }

      videos.push({
        url: videoUrl,
        index: sceneNum,
        original_index: sceneNum,
        narration,
        narration_english: narrationEn,
        timed_subtitles: timedSubtitles,
        has_audio: hasAudio,
        is_performance: false,
        scene_type: scene.scene_type || "news",
        duration: sceneDuration,
      });
    }

    videos.forEach((v, idx) => { v.index = idx + 1; });

    console.log(`\n📊 비디오 목록: ${videos.length}개`);
    if (skippedScenes.length > 0) {
      console.log(`⚠️ 제외된 씬: ${skippedScenes.join(", ")}`);
    }

    // =====================
    // 레이아웃 설정
    // =====================
    const fontScale = this.output_width / 720;

    const layoutConfig = {
      video_area: { x: 0, y: 160, width: this.output_width, height: 850 },
      header_area: { y: 220, height: 120, single_line: true },
      subtitle_area: { y: 860, height: 100 },
      footer_area: { y: 950, height: 100 },
      font_scale: fontScale,
      force_vertical: this.force_vertical,
    };

    const fontSettings = {
      header_korean: { font: "NanumSquareRoundOTFEB", size: 58 },
      header_english: { font: "NotoSerif-Regular", size: 30, y_offset: 75 },
      subtitle_korean: { font: "NanumSquareRoundOTFEB", size: 34, max_lines: 1 },
      subtitle_english: { font: "NotoSerif-Regular", size: 27, max_lines: 1 },
      footer_korean: { font: "NanumSquareRoundOTFEB", size: 48 },
      footer_english: { font: "NotoSerif-Regular", size: 30, y_offset: 55 },
    };

    // =====================
    // 씬별 오디오 맵
    // =====================
    let cumulativeTime = 0;
    const sceneAudioMap = videos.map((v, idx) => {
      const duration = v.duration || 8;
      const startTime = cumulativeTime;
      cumulativeTime += duration;
      return {
        scene_index: idx + 1,
        original_scene: v.original_index,
        start_time: startTime,
        end_time: cumulativeTime,
        has_audio: v.has_audio,
        duration,
      };
    });

    // =====================
    // 자막 병합
    // =====================
    let mergedTimedSubtitles = [];
    let subtitleTime = 0;

    for (const video of videos) {
      const sceneStart = subtitleTime;
      const sceneDuration = video.duration || 8;
      subtitleTime += sceneDuration;

      if (video.timed_subtitles) {
        for (const sub of video.timed_subtitles) {
          mergedTimedSubtitles.push({
            start_time: sceneStart + (sub.start_time || 0),
            end_time: sceneStart + (sub.end_time || sceneDuration),
            text_ko: sub.text_ko || "",
            text_en: sub.text_en || "",
            position: sub.position || "center",
            original_scene: video.original_index,
          });
        }
      }
    }

    mergedTimedSubtitles.sort((a, b) => a.start_time - b.start_time);
    console.log(`📝 자막: ${mergedTimedSubtitles.length}개`);

    // =====================
    // 헤더/푸터
    // =====================
    const headerTextKo = this.header_text_ko || shortsScript.title || "주식 시장 뉴스";
    const headerTextEn = this.header_text_en || shortsScript.title_english || "Stock Market News";
    const footerTextKo = this.footer_text_ko || "";
    const footerTextEn = this.footer_text_en || "";

    const hasEnglishSubtitles = mergedTimedSubtitles.some(sub => sub.text_en?.trim());

    // =====================
    // FFmpeg VM 요청
    // =====================
    const requestPayload = {
      videos: videos.sort((a, b) => a.index - b.index),
      header_text: headerTextKo,
      header_text_english: headerTextEn,
      footer_text: footerTextKo,
      footer_text_english: footerTextEn,
      subtitle_enabled: true,
      subtitle_english_enabled: hasEnglishSubtitles,
      subtitle_timing_mode: this.subtitle_timing_mode,
      timed_subtitles: mergedTimedSubtitles.length > 0 ? mergedTimedSubtitles : null,
      bgm_url: bgmUrl,
      bgm_volume: parseFloat(this.bgm_volume),
      bgm_volume_no_audio: parseFloat(this.bgm_volume_no_audio),
      scene_audio_map: sceneAudioMap,
      width: this.output_width,
      height: this.output_height,
      use_origin_size: true,
      force_vertical: this.force_vertical,
      video_scale_mode: this.video_scale_mode,
      origin_layout: layoutConfig,
      output_bucket: this.gcs_bucket_name,
      output_path: `${folderName}/final_stock.mp4`,
      folder_name: folderName,
      font_settings: fontSettings,
    };

    console.log(`\n📤 FFmpeg VM API 요청 중...`);
    console.log(`🌐 URL: ${this.ffmpeg_vm_url}${this.render_endpoint}`);

    const startTime = Date.now();

    try {
      const response = await axios($, {
        url: `${this.ffmpeg_vm_url}${this.render_endpoint}`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        data: requestPayload,
        timeout: 600000,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(`\n✅ 렌더링 완료!`);
      console.log(`⏱️ 소요: ${elapsed}s`);
      console.log(`🔗 URL: ${response.url}`);

      const result = {
        success: true,
        folder_name: folderName,
        output_url: response.url,
        job_id: response.job_id,
        total_duration: response.total_duration,
        elapsed_time: elapsed,
        shorts_script: shortsScript,
        scene_count: videos.length,
        generated_at: new Date().toISOString(),
      };

      $.export("vm_render", result);
      $.export("output_url", response.url);
      $.export("$summary", `렌더링 완료: ${response.url}`);

      return result;

    } catch (error) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`\n❌ 렌더링 실패: ${error.message}`);

      const errorResult = {
        success: false,
        folder_name: folderName,
        error: error.message,
        elapsed_time: elapsed,
        generated_at: new Date().toISOString(),
      };

      $.export("vm_render", errorResult);
      $.export("$summary", `렌더링 실패: ${error.message}`);

      throw new Error(`FFmpeg VM 실패: ${error.message}`);
    }
  },
});
