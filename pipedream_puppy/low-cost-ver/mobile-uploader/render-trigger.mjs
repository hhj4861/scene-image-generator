/**
 * 🎬 Puppy Render Trigger
 * 
 * 모바일에서 업로드된 영상들로 렌더링 시작
 * 
 * 워크플로우:
 * 1. HTTP Trigger (POST) - 렌더링 요청 수신
 * 2. 이 컴포넌트 - 설정 처리 및 FFmpeg VM 호출
 * 
 * 입력 형식:
 * {
 *   "project_name": "땅콩이와버터",
 *   "videos": [
 *     { "index": 1, "url": "gs://bucket/path/씬1.mp4" },
 *     { "index": 2, "url": "gs://bucket/path/씬2.mp4" }
 *   ],
 *   "config": { ... },  // config.json 내용 또는 null
 *   "options": {
 *     "bgm_url": "https://...",
 *     "subtitle_english_enabled": true,
 *     "force_vertical": true
 *   }
 * }
 */

import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Puppy Render Trigger",
  description: "모바일 업로드된 영상으로 FFmpeg VM 렌더링 시작",

  props: {
    ffmpeg_vm_url: {
      type: "string",
      label: "FFmpeg VM API URL",
      default: "http://34.64.168.173:3000",
      description: "FFmpeg 렌더링 서버 URL",
    },
    gcs_bucket: {
      type: "string",
      label: "Output GCS Bucket",
      default: "shorts-videos-storage-mcp-test-457809",
      description: "렌더링 결과물 저장 버킷",
    },
    default_bgm_volume: {
      type: "string",
      label: "Default BGM Volume (with audio)",
      default: "0.15",
      description: "오디오가 있는 씬의 기본 BGM 볼륨",
    },
    default_bgm_volume_no_audio: {
      type: "string",
      label: "Default BGM Volume (no audio)",
      default: "0.8",
      description: "오디오가 없는 씬의 기본 BGM 볼륨",
    },
    // Layout Defaults
    layout_header_y: {
      type: "integer",
      label: "Layout: Header Y",
      default: 300,
    },
    layout_video_area_y: {
      type: "integer",
      label: "Layout: Video Area Y",
      default: 250,
    },
    layout_video_area_height: {
      type: "integer",
      label: "Layout: Video Area Height",
      default: 800,
    },
    layout_subtitle_y: {
      type: "integer",
      label: "Layout: Subtitle Y",
      default: 950,
    },
    layout_footer_y: {
      type: "integer",
      label: "Layout: Footer Y",
      default: 1000,
    },
    // Font Defaults
    font_header_korean_size: {
      type: "integer",
      label: "Font: Header Korean Size",
      default: 55,
    },
    font_subtitle_korean_size: {
      type: "integer",
      label: "Font: Subtitle Korean Size",
      default: 32,
    },
    // Profile Card Defaults
    profile_card_base_y: {
      type: "integer",
      label: "Profile Card: Base Y",
      default: 580,
    },
    profile_card_line_height: {
      type: "integer",
      label: "Profile Card: Line Height",
      default: 40,
    },
    profile_card_right_margin: {
      type: "integer",
      label: "Profile Card: Right Margin",
      default: 150,
    },
  },

  async run({ steps, $ }) {
    // =====================
    // 1. 입력 데이터 파싱
    // =====================
    const requestBody = steps.trigger.event.body;
    
    const {
      project_name,
      videos = [],
      config = {},
      options = {},
    } = typeof requestBody === "string" ? JSON.parse(requestBody) : requestBody;

    if (!project_name) {
      throw new Error("project_name이 필요합니다");
    }

    if (!videos || videos.length === 0) {
      throw new Error("videos 배열이 필요합니다");
    }

    $.export("input", {
      project_name,
      video_count: videos.length,
      has_config: !!config && Object.keys(config).length > 0,
      options,
    });

    // =====================
    // 2. 설정 병합 (config + options)
    // =====================
    const mergedConfig = {
      project_name,
      scene_count: options.scene_count || config.scene_count || videos.length,
      
      // Title & Footer
      title: config.title || {
        korean: options.header_korean || "",
        english: options.header_english || "",
      },
      footer: config.footer || {
        korean: options.footer_korean || project_name,
        english: options.footer_english || "",
      },
      
      // BGM
      bgm_url: options.bgm_url || config.bgm_url || null,
      bgm_volume: parseFloat(options.bgm_volume || config.bgm_volume || this.default_bgm_volume),
      bgm_volume_no_audio: parseFloat(options.bgm_volume_no_audio || config.bgm_volume_no_audio || this.default_bgm_volume_no_audio),
      
      // Subtitles
      timed_subtitles: config.timed_subtitles || [],
      subtitle_timing_mode: config.subtitle_timing_mode || "timed",
      
      // Video Settings
      force_vertical: options.force_vertical !== undefined ? options.force_vertical : (config.force_vertical !== undefined ? config.force_vertical : true),
      video_scale_mode: options.video_scale_mode || config.video_scale_mode || "fit",
      
      // Layout
      layout: config.layout || {
        header_y: this.layout_header_y,
        header_height: 80,
        video_area_y: this.layout_video_area_y,
        video_area_height: this.layout_video_area_height,
        subtitle_y: this.layout_subtitle_y,
        footer_y: this.layout_footer_y,
        footer_height: 80,
      },
      
      // Font Settings
      font_settings: config.font_settings || {
        header_korean: { font: "NanumSquareRoundOTFEB", size: this.font_header_korean_size },
        header_english: { font: "NotoSerif-Regular", size: 20, y_offset: 90 },
        subtitle_korean: { font: "NanumSquareRoundOTFEB", size: this.font_subtitle_korean_size, max_lines: 1 },
        subtitle_english: { font: "NotoSerif-Regular", size: 24, max_lines: 1 },
        footer_korean: { size: 48 },
        footer_english: { size: 22, y_offset: 70 },
      },
      
      // Profile Card
      profile_card_config: config.profile_card_config || {
        baseY: this.profile_card_base_y,
        lineHeight: this.profile_card_line_height,
        headerFontSize: 30,
        itemFontSize: 20,
        maxChars: 30,
        rightMargin: this.profile_card_right_margin,
      },
    };

    $.export("merged_config", {
      title: mergedConfig.title,
      footer: mergedConfig.footer,
      scene_count: mergedConfig.scene_count,
      has_bgm: !!mergedConfig.bgm_url,
      subtitle_count: mergedConfig.timed_subtitles.length,
    });

    // =====================
    // 3. 영상 목록 정렬 및 처리
    // =====================
    const sortedVideos = [...videos].sort((a, b) => a.index - b.index);
    
    // 씬별 오디오 맵 생성
    const sceneDuration = 8; // 기본 씬 길이
    const sceneAudioMap = sortedVideos.map(v => ({
      scene_index: v.index,
      start_time: (v.index - 1) * sceneDuration,
      end_time: v.index * sceneDuration,
      has_audio: v.has_audio !== undefined ? v.has_audio : true,
    }));

    // =====================
    // 4. Profile Card 처리 (config.scenes 또는 별도 script에서)
    // =====================
    let mergedTimedSubtitles = [...mergedConfig.timed_subtitles];
    
    // config에 scenes가 있으면 profile_card 추출
    if (config.scenes) {
      for (const scene of config.scenes) {
        if (scene.profile_card) {
          const pc = scene.profile_card;
          const sceneStartTime = (scene.video - 1) * sceneDuration;
          
          const baseY = pc.base_y || mergedConfig.profile_card_config.baseY;
          const lineHeight = pc.line_height || mergedConfig.profile_card_config.lineHeight;
          const headerFontSize = pc.header_font_size || mergedConfig.profile_card_config.headerFontSize;
          const itemFontSize = pc.item_font_size || mergedConfig.profile_card_config.itemFontSize;
          const rightMargin = pc.right_margin || mergedConfig.profile_card_config.rightMargin;
          
          const startTime = pc.start_time || 0.5;
          const endTime = pc.end_time || 8;
          
          // Header
          if (pc.header) {
            mergedTimedSubtitles.push({
              start_time: sceneStartTime + startTime,
              end_time: sceneStartTime + endTime,
              text_ko: pc.header.startsWith("[") ? pc.header : `[${pc.header}]`,
              text_en: "",
              position: pc.position || "right",
              y_offset: pc.header_y_offset || baseY,
              font_size: headerFontSize,
              right_margin: rightMargin,
            });
          }
          
          // Items
          if (pc.items) {
            pc.items.forEach((item, idx) => {
              const itemStart = item.start_time 
                ? sceneStartTime + item.start_time 
                : sceneStartTime + startTime + ((idx + 1) * 1.5);
              const itemEnd = item.end_time 
                ? sceneStartTime + item.end_time 
                : sceneStartTime + endTime;
              const itemYOffset = item.y_offset || (baseY + 20 + (lineHeight * (idx + 1)));
              
              mergedTimedSubtitles.push({
                start_time: itemStart,
                end_time: itemEnd,
                text_ko: `${item.label}: ${item.value}`,
                text_en: "",
                position: item.position || pc.position || "right",
                y_offset: itemYOffset,
                font_size: item.font_size || itemFontSize,
                right_margin: item.right_margin || rightMargin,
              });
            });
          }
        }
      }
    }

    // 시간순 정렬
    mergedTimedSubtitles.sort((a, b) => a.start_time - b.start_time);

    $.export("subtitles", {
      total_count: mergedTimedSubtitles.length,
      sample: mergedTimedSubtitles.slice(0, 3),
    });

    // =====================
    // 5. FFmpeg VM 요청 페이로드 생성
    // =====================
    const width = mergedConfig.force_vertical ? 720 : 1280;
    const height = mergedConfig.force_vertical ? 1280 : 720;

    const layoutConfig = {
      video_area: {
        x: 0,
        y: mergedConfig.layout.video_area_y,
        width: width,
        height: mergedConfig.layout.video_area_height,
      },
      header_area: {
        y: mergedConfig.layout.header_y,
        height: mergedConfig.layout.header_height || 80,
        single_line: true,
        max_lines: 1,
      },
      subtitle_area: {
        y: mergedConfig.layout.subtitle_y,
        height: 100,
        single_line: false,
      },
      footer_area: {
        y: mergedConfig.layout.footer_y,
        height: mergedConfig.layout.footer_height || 80,
      },
      font_scale: width / 720,
      force_vertical: mergedConfig.force_vertical,
    };

    const requestPayload = {
      videos: sortedVideos.map(v => ({
        url: v.url,
        index: v.index,
        duration: v.duration || sceneDuration,
        has_audio: v.has_audio !== undefined ? v.has_audio : true,
        dialogue: v.dialogue || {},
        narration: v.narration || "",
        narration_english: v.narration_english || "",
      })),
      
      bgm_url: mergedConfig.bgm_url,
      bgm_volume: mergedConfig.bgm_volume,
      bgm_volume_no_audio: mergedConfig.bgm_volume_no_audio,
      scene_audio_map: sceneAudioMap,
      
      header_text: mergedConfig.title.korean,
      header_text_english: mergedConfig.title.english,
      footer_text: mergedConfig.footer.korean,
      footer_text_english: mergedConfig.footer.english,
      
      subtitle_enabled: true,
      subtitle_english_enabled: options.subtitle_english_enabled !== false,
      subtitle_timing_mode: mergedConfig.subtitle_timing_mode,
      timed_subtitles: mergedTimedSubtitles.length > 0 ? mergedTimedSubtitles : null,
      
      width,
      height,
      use_origin_size: true,
      force_vertical: mergedConfig.force_vertical,
      video_scale_mode: mergedConfig.video_scale_mode,
      
      origin_layout: layoutConfig,
      font_settings: mergedConfig.font_settings,
      
      output_bucket: this.gcs_bucket,
      output_path: `${project_name}/final_shorts.mp4`,
      folder_name: project_name,
    };

    $.export("request_preview", {
      endpoint: `${this.ffmpeg_vm_url}/render/puppy`,
      video_count: requestPayload.videos.length,
      has_bgm: !!requestPayload.bgm_url,
      subtitle_count: requestPayload.timed_subtitles?.length || 0,
      dimensions: `${width}x${height}`,
    });

    // =====================
    // 6. FFmpeg VM API 호출
    // =====================
    $.export("status", "FFmpeg VM에 렌더링 요청 중...");

    try {
      const response = await axios($, {
        method: "POST",
        url: `${this.ffmpeg_vm_url}/render/puppy`,
        headers: { "Content-Type": "application/json" },
        data: requestPayload,
        timeout: 600000, // 10분 타임아웃
      });

      $.export("$summary", `✅ 렌더링 완료: ${response.total_duration?.toFixed(1) || "N/A"}초 영상`);

      return {
        success: true,
        project_name,
        output_url: response.url,
        job_id: response.job_id,
        total_duration: response.total_duration,
        video_count: sortedVideos.length,
        render_time: response.render_time,
        status_url: response.status_url || null,
      };

    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message;
      throw new Error(`FFmpeg VM 렌더링 실패: ${errorMsg}`);
    }
  },
});

