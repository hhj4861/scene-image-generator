import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Stock VM Renderer (Webhook V2)",
  description: "Webhook 트리거용 - FFmpeg VM을 이용한 주식 뉴스 영상 합성 (비디오 + BGM)",

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
    // BGM 설정
    // =====================
    bgm_url: {
      type: "string",
      label: "BGM URL",
      description: "배경음악 URL (Suno AI 등)",
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
        { label: "0.5 (절반)", value: "0.5" },
        { label: "0.6", value: "0.6" },
        { label: "0.7", value: "0.7" },
        { label: "0.8 (기본)", value: "0.8" },
        { label: "0.9", value: "0.9" },
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
      description: "16:9 영상을 9:16으로 변환",
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
    // ==========================================
    // 1. 데이터 파싱 (웹훅 데이터)
    // ==========================================
    let data;
    try {
      data = typeof this.webhook_data === "string"
        ? JSON.parse(this.webhook_data)
        : this.webhook_data;
    } catch (e) {
      throw new Error("Webhook 데이터 파싱 실패: " + e.message);
    }

    const shortsScript = data.shorts_script || {};
    const scenes = shortsScript.scenes || [];
    const folderName = data.folder_name || "unknown";
    const videoResults = data.videos?.results || [];

    if (!scenes.length) throw new Error("씬이 없습니다.");

    console.log(`🎬 Stock VM Renderer (Webhook V2) 시작`);
    console.log(`📂 폴더: ${folderName}`);
    console.log(`🎥 씬 수: ${scenes.length}`);

    // 디버그: 스크립트 데이터 확인
    console.log(`\n📝 === 스크립트 데이터 확인 ===`);
    console.log(`📌 title: ${shortsScript.title || "없음"}`);
    console.log(`📌 title_english: ${shortsScript.title_english || "없음"}`);
    if (scenes.length > 0) {
      const firstScene = scenes[0];
      console.log(`📌 첫 번째 씬 narration: ${firstScene.narration?.substring(0, 50) || "없음"}...`);
      console.log(`📌 첫 번째 씬 narration_english: ${firstScene.narration_english?.substring(0, 50) || "없음"}...`);
      console.log(`📌 첫 번째 씬 timed_subtitles: ${firstScene.timed_subtitles ? firstScene.timed_subtitles.length + "개" : "없음"}`);
      if (firstScene.timed_subtitles && firstScene.timed_subtitles[0]) {
        const sub = firstScene.timed_subtitles[0];
        console.log(`   └─ 첫 자막: ${sub.text_ko?.substring(0, 30)}... (${sub.start_time}s~${sub.end_time}s)`);
      }
    }

    // ==========================================
    // 1.5. GCS 폴더에서 실제 존재하는 비디오 확인
    // ==========================================
    console.log(`\n🔍 GCS 폴더에서 비디오 존재 여부 확인 중...`);

    // 각 씬에 대해 비디오 URL 생성 및 존재 여부 확인
    const videoExistsMap = new Map();
    const videoUrlMap = new Map();

    for (const scene of scenes) {
      const sceneNum = scene.scene_number;
      const expectedUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${folderName}/scene_${String(sceneNum).padStart(2, "0")}.mp4`;

      // Video Generator 결과에서 URL 확인
      const videoResult = videoResults.find(r => r.scene_number === sceneNum);
      const videoUrl = videoResult?.video_url || expectedUrl;
      videoUrlMap.set(sceneNum, videoUrl);

      // HEAD 요청으로 비디오 존재 여부 확인
      try {
        await axios($, {
          url: videoUrl,
          method: "HEAD",
          timeout: 5000,
        });
        videoExistsMap.set(sceneNum, true);
        console.log(`   ✅ Scene ${sceneNum}: 존재함`);
      } catch (e) {
        videoExistsMap.set(sceneNum, false);
        console.log(`   ❌ Scene ${sceneNum}: 없음 (${e.response?.status || e.message})`);
      }
    }

    const existingVideoCount = [...videoExistsMap.values()].filter(v => v).length;
    console.log(`\n📹 GCS에 존재하는 비디오: ${existingVideoCount}/${scenes.length}개`);

    // ==========================================
    // 2. 비디오 목록 구성 (GCS에 존재하는 비디오만)
    // ==========================================
    const videos = [];
    const skippedScenes = [];

    for (const scene of scenes) {
      const sceneNum = scene.scene_number;
      const narration = scene.narration || "";
      const narrationEn = scene.narration_english || "";

      // GCS에 비디오가 없으면 스킵
      if (!videoExistsMap.get(sceneNum)) {
        console.log(`⏭️ Scene ${sceneNum} 스킵 (비디오 없음)`);
        skippedScenes.push(sceneNum);
        continue;
      }

      const videoUrl = videoUrlMap.get(sceneNum);

      // 비디오에 오디오가 있는지 (Veo 3.0 음성 생성 여부)
      const hasAudio = scene.has_audio !== false; // 기본값 true

      // timed_subtitles 변환 (씬별 자막)
      // 없으면 narration 기반으로 자동 생성
      let timedSubtitles = null;
      const sceneDuration = scene.duration || 8;

      if (scene.timed_subtitles && scene.timed_subtitles.length > 0) {
        timedSubtitles = scene.timed_subtitles;
      } else if (narration) {
        // narration 기반으로 timed_subtitles 자동 생성
        timedSubtitles = [{
          start_time: 0,
          end_time: sceneDuration,
          text_ko: narration,
          text_en: narrationEn,
          position: "center",
        }];
        console.log(`   📝 자막 자동 생성: ${narration.substring(0, 30)}...`);
      }

      videos.push({
        url: videoUrl,
        index: sceneNum,
        original_index: sceneNum, // 원본 씬 번호 보관
        narration: narration,
        narration_english: narrationEn,
        timed_subtitles: timedSubtitles,
        has_audio: hasAudio,
        is_performance: false,
        scene_type: scene.scene_type || "news",
        duration: sceneDuration,
      });

      console.log(`📹 Scene ${sceneNum}: ${hasAudio ? "🔊 오디오 있음" : "🔇 무음"}`);
    }

    // 순차 인덱스 재할당 (타이밍 계산용)
    videos.forEach((v, idx) => {
      v.index = idx + 1;
    });

    console.log(`\n📊 비디오 목록 구성 완료: ${videos.length}개`);
    if (skippedScenes.length > 0) {
      console.log(`⚠️ 제외된 씬: ${skippedScenes.join(", ")} (자막에서도 제외됨)`);
    }

    // ==========================================
    // 3. 레이아웃 및 폰트 설정 (stock-amr-W51/config.json 기준)
    // ==========================================
    // VM 서버가 기대하는 origin_layout 형식으로 변환
    const fontScale = this.output_width / 720;

    // 사용자 설정값 (config.json 기준)
    const headerY = 220;           // 헤더 Y 위치
    const headerHeight = 120;
    const videoAreaY = 160;        // 비디오 영역 Y 위치
    const videoAreaHeight = 850;
    const subtitleY = 860;         // 자막 Y 위치
    const footerY = 950;           // 푸터 Y 위치
    const footerHeight = 100;

    // VM 서버가 기대하는 구조로 변환 (combine-ffmpeg-vm.cjs 참고)
    const layoutConfig = {
      video_area: {
        x: 0,
        y: videoAreaY,
        width: this.output_width,
        height: videoAreaHeight,
      },
      header_area: {
        y: headerY,
        height: headerHeight,
        single_line: true,
        max_lines: 1,
      },
      subtitle_area: {
        y: subtitleY,
        height: 100,
        single_line: false,
      },
      footer_area: {
        y: footerY,
        height: footerHeight,
      },
      font_scale: fontScale,
      force_vertical: this.force_vertical,
    };

    const fontSettings = {
      header_korean: {
        font: "NanumSquareRoundOTFEB",
        size: 58,
      },
      header_english: {
        font: "NotoSerif-Regular",
        size: 30,
        y_offset: 75,
      },
      subtitle_korean: {
        font: "NanumSquareRoundOTFEB",
        size: 34,
        max_lines: 1,
      },
      subtitle_english: {
        font: "NotoSerif-Regular",
        size: 27,
        max_lines: 1,
      },
      footer_korean: {
        font: "NanumSquareRoundOTFEB",
        size: 48,
      },
      footer_english: {
        font: "NotoSerif-Regular",
        size: 30,
        y_offset: 55,
      },
    };

    // ==========================================
    // 4. 씬별 오디오 맵 (BGM 볼륨 조절용) - 순차 인덱스 기반
    // ==========================================
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
        duration: duration,
      };
    });

    console.log(`⏱️ 총 영상 길이: ${cumulativeTime}초 (${videos.length}개 씬)`);

    // ==========================================
    // 5. 전체 timed_subtitles 병합 (순차 타이밍 기준)
    // ==========================================
    let mergedTimedSubtitles = [];
    let subtitleCumulativeTime = 0;

    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const sceneStartTime = subtitleCumulativeTime;
      const sceneDuration = video.duration || 8;
      subtitleCumulativeTime += sceneDuration;

      if (video.timed_subtitles) {
        for (const sub of video.timed_subtitles) {
          mergedTimedSubtitles.push({
            start_time: sceneStartTime + (sub.start_time || sub.start || 0),
            end_time: sceneStartTime + (sub.end_time || sub.end || sceneDuration),
            text_ko: sub.text_ko || sub.korean || "",
            text_en: sub.text_en || sub.english || "",
            position: sub.position || "center",
            y_offset: sub.y_offset,
            font_size: sub.font_size,
            original_scene: video.original_index,
          });
        }
      }
    }

    // 시간순 정렬
    mergedTimedSubtitles.sort((a, b) => a.start_time - b.start_time);
    console.log(`📝 병합된 자막: ${mergedTimedSubtitles.length}개`);

    // 디버그: 자막 내용 출력
    if (mergedTimedSubtitles.length > 0) {
      console.log(`\n📝 자막 목록:`);
      for (const sub of mergedTimedSubtitles.slice(0, 5)) {
        console.log(`   ${sub.start_time}s~${sub.end_time}s: ${sub.text_ko?.substring(0, 30)}...`);
      }
      if (mergedTimedSubtitles.length > 5) {
        console.log(`   ... 외 ${mergedTimedSubtitles.length - 5}개`);
      }
    } else {
      console.log(`⚠️ 자막이 없습니다! videos에 timed_subtitles가 있는지 확인:`);
      for (const v of videos.slice(0, 3)) {
        console.log(`   Scene ${v.original_index}: timed_subtitles=${v.timed_subtitles ? v.timed_subtitles.length + '개' : 'null'}, narration=${v.narration?.substring(0, 20)}...`);
      }
    }

    // ==========================================
    // 6. 헤더/푸터 텍스트 결정
    // ==========================================
    const headerTextKo = this.header_text_ko || shortsScript.title || "주식 시장 뉴스";
    const headerTextEn = this.header_text_en || shortsScript.title_english || "Stock Market News";
    const footerTextKo = this.footer_text_ko || shortsScript.channel_name || "";
    const footerTextEn = this.footer_text_en || "";

    // 영문 자막이 있는지 확인
    const hasEnglishSubtitles = mergedTimedSubtitles.some(sub => sub.text_en && sub.text_en.trim() !== "");
    const hasEnglishHeader = headerTextEn && headerTextEn.trim() !== "" && headerTextEn !== "Stock Market News";

    console.log(`\n📝 헤더: ${headerTextKo} / ${headerTextEn}`);
    console.log(`📝 자막 수: ${mergedTimedSubtitles.length}개`);
    console.log(`📝 영문 자막: ${hasEnglishSubtitles ? "있음" : "없음"}`);
    if (mergedTimedSubtitles.length > 0) {
      console.log(`📝 첫 번째 자막: ${mergedTimedSubtitles[0].text_ko} (${mergedTimedSubtitles[0].start_time}s ~ ${mergedTimedSubtitles[0].end_time}s)`);
    }

    // ==========================================
    // 7. FFmpeg VM API 요청 페이로드 구성
    // ==========================================
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
      bgm_url: this.bgm_url || "",
      bgm_volume: parseFloat(this.bgm_volume),
      bgm_volume_no_audio: parseFloat(this.bgm_volume_no_audio),
      scene_audio_map: sceneAudioMap,
      width: this.output_width,
      height: this.output_height,
      use_origin_size: true,
      force_vertical: this.force_vertical,
      video_scale_mode: this.video_scale_mode,
      origin_layout: layoutConfig,  // VM 서버가 기대하는 키 이름
      output_bucket: this.gcs_bucket_name,
      output_path: `${folderName}/final_stock.mp4`,
      folder_name: folderName,
      font_settings: fontSettings,
    };

    console.log("\n📤 FFmpeg VM API 요청 중...");
    console.log(`🌐 URL: ${this.ffmpeg_vm_url}${this.render_endpoint}`);
    console.log(`📦 Payload size: ${JSON.stringify(requestPayload).length} bytes`);

    // ==========================================
    // 8. FFmpeg VM API 호출
    // ==========================================
    const startTime = Date.now();

    try {
      const response = await axios($, {
        url: `${this.ffmpeg_vm_url}${this.render_endpoint}`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        data: requestPayload,
        timeout: 600000, // 10분
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log("\n" + "=".repeat(50));
      console.log("✅ SUCCESS!");
      console.log("=".repeat(50));
      console.log(`⏱️ Time elapsed: ${elapsed}s`);
      console.log(`🆔 Job ID: ${response.job_id || "N/A"}`);
      console.log(`📹 Total duration: ${response.total_duration?.toFixed(1) || "N/A"}s`);
      console.log(`🔗 Output URL: ${response.url}`);

      if (response.stats) {
        console.log(`\n📊 Stats:`, JSON.stringify(response.stats, null, 2));
      }

      // ==========================================
      // 9. 결과 반환
      // ==========================================
      const result = {
        success: true,
        folder_name: folderName,
        output_url: response.url,
        job_id: response.job_id,
        total_duration: response.total_duration,
        elapsed_time: elapsed,
        stats: response.stats,
        shorts_script: shortsScript,
        render_settings: {
          width: this.output_width,
          height: this.output_height,
          bgm_volume: this.bgm_volume,
          subtitle_timing_mode: this.subtitle_timing_mode,
        },
        scene_count: videos.length,
        scenes_with_audio: videos.filter(v => v.has_audio).length,
        generated_at: new Date().toISOString(),
      };

      $.export("vm_render", result);
      $.export("output_url", response.url);
      $.export("$summary", `렌더링 완료: ${response.url}`);

      return result;

    } catch (error) {
      console.error("\n" + "=".repeat(50));
      console.error("❌ ERROR!");
      console.error("=".repeat(50));
      console.error("Message:", error.message);

      if (error.response?.data) {
        console.error("Response:", JSON.stringify(error.response.data, null, 2));
      }

      const errorResult = {
        success: false,
        folder_name: folderName,
        error: error.message,
        error_response: error.response?.data,
        elapsed_time: ((Date.now() - startTime) / 1000).toFixed(1),
        generated_at: new Date().toISOString(),
      };

      $.export("vm_render", errorResult);
      $.export("$summary", `렌더링 실패: ${error.message}`);

      throw new Error(`FFmpeg VM 렌더링 실패: ${error.message}`);
    }
  },
});
