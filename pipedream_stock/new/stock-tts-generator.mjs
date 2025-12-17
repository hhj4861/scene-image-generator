import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Stock TTS Generator",
  description: "OpenAI TTS로 씬별 나레이션 음성 생성",

  props: {
    // =====================
    // 이전 단계 데이터
    // =====================
    video_generation_output: {
      type: "string",
      label: "Video Generation Output (JSON)",
      description: "Stock Video Generator 결과: {{JSON.stringify(steps.Stock_Video_Generator.$return_value)}}",
    },

    // =====================
    // 씬 필터
    // =====================
    scene_filter: {
      type: "string",
      label: "씬 필터 (예: 1,3,5 또는 1-3)",
      description: "비어있으면 전체 씬 생성",
      optional: true,
    },

    // =====================
    // OpenAI 설정
    // =====================
    openai_api_key: {
      type: "string",
      label: "OpenAI API Key",
      secret: true,
    },
    tts_model: {
      type: "string",
      label: "TTS Model",
      options: [
        { label: "TTS-1 (빠름)", value: "tts-1" },
        { label: "TTS-1-HD (고품질)", value: "tts-1-hd" },
        { label: "GPT-4o Mini TTS (최신)", value: "gpt-4o-mini-tts" },
      ],
      default: "tts-1-hd",
    },
    voice: {
      type: "string",
      label: "Voice",
      options: [
        { label: "Alloy (중성)", value: "alloy" },
        { label: "Echo (남성)", value: "echo" },
        { label: "Fable (남성, 영국)", value: "fable" },
        { label: "Onyx (남성, 깊은)", value: "onyx" },
        { label: "Nova (여성)", value: "nova" },
        { label: "Shimmer (여성)", value: "shimmer" },
        { label: "Ash (남성, 자연스러운)", value: "ash" },
        { label: "Coral (여성, 따뜻한)", value: "coral" },
        { label: "Sage (여성, 차분한)", value: "sage" },
      ],
      default: "nova",
    },
    speed: {
      type: "string",
      label: "Speaking Speed",
      options: [
        { label: "느림 (0.8x)", value: "0.8" },
        { label: "보통 (1.0x)", value: "1.0" },
        { label: "빠름 (1.15x)", value: "1.15" },
        { label: "매우 빠름 (1.25x)", value: "1.25" },
      ],
      default: "1.0",
    },
    output_format: {
      type: "string",
      label: "Output Format",
      options: [
        { label: "MP3", value: "mp3" },
        { label: "WAV", value: "wav" },
        { label: "AAC", value: "aac" },
        { label: "FLAC", value: "flac" },
        { label: "Opus", value: "opus" },
      ],
      default: "mp3",
    },

    // =====================
    // 생성 모드
    // =====================
    generate_full_script: {
      type: "boolean",
      label: "전체 스크립트 음성도 생성",
      description: "씬별 음성 외에 전체 나레이션 음성도 생성",
      default: false,
    },

    // =====================
    // GCS 설정
    // =====================
    google_cloud: {
      type: "app",
      app: "google_cloud",
    },
    gcs_bucket_name: {
      type: "string",
      label: "GCS Bucket (Audio)",
      default: "shorts-videos-storage-mcp-test-457809",
    },
  },

  async run({ $ }) {
    // 데이터 파싱
    let data;
    try {
      data = typeof this.video_generation_output === "string"
        ? JSON.parse(this.video_generation_output) : this.video_generation_output;
    } catch (e) {
      throw new Error("Video Generation Output 파싱 실패: " + e.message);
    }

    const shortsScript = data.shorts_script || {};
    const scenes = shortsScript.scenes || [];
    const folderName = data.folder_name || "unknown";

    if (!scenes.length) throw new Error("씬이 없습니다.");

    // GCS 설정
    const { google } = await import("googleapis");
    const { Readable } = await import("stream");
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
    });
    const storage = google.storage({ version: "v1", auth });

    // 씬 필터링
    const parseFilter = (filter) => {
      if (!filter?.trim()) return null;
      const indexes = new Set();
      for (const part of filter.split(",").map(p => p.trim())) {
        if (part.includes("-")) {
          const [s, e] = part.split("-").map(n => parseInt(n, 10));
          for (let i = s; i <= e; i++) indexes.add(i);
        } else {
          indexes.add(parseInt(part, 10));
        }
      }
      return indexes;
    };

    let targetScenes = scenes;
    if (this.scene_filter) {
      const filter = parseFilter(this.scene_filter);
      targetScenes = scenes.filter(s => filter.has(s.scene_number));
    }

    if (!targetScenes.length) throw new Error("필터링된 씬이 없습니다.");

    console.log(`🎙️ ${targetScenes.length}개 씬 TTS 생성`);
    console.log(`📂 폴더: ${folderName}`);
    console.log(`🗣️ 모델: ${this.tts_model}, 음성: ${this.voice}, 속도: ${this.speed}x`);

    const results = [];
    const mimeTypes = {
      mp3: "audio/mpeg",
      wav: "audio/wav",
      aac: "audio/aac",
      flac: "audio/flac",
      opus: "audio/opus",
    };
    const mimeType = mimeTypes[this.output_format] || "audio/mpeg";

    // ==========================================
    // 씬별 TTS 생성
    // ==========================================
    for (const scene of targetScenes) {
      const sceneNum = scene.scene_number;
      const narration = scene.narration || "";

      if (!narration.trim()) {
        console.warn(`⚠️ Scene ${sceneNum} 나레이션 없음, 스킵`);
        results.push({ scene_number: sceneNum, success: false, error: "No narration" });
        continue;
      }

      console.log(`🎙️ Scene ${sceneNum} TTS 생성 중...`);
      console.log(`   텍스트: ${narration.substring(0, 50)}...`);

      try {
        // OpenAI TTS API 호출
        const ttsResponse = await axios($, {
          method: "POST",
          url: "https://api.openai.com/v1/audio/speech",
          headers: {
            "Authorization": `Bearer ${this.openai_api_key}`,
            "Content-Type": "application/json",
          },
          data: {
            model: this.tts_model,
            input: narration,
            voice: this.voice,
            speed: parseFloat(this.speed),
            response_format: this.output_format,
          },
          responseType: "arraybuffer",
        });

        const audioBuffer = Buffer.from(ttsResponse);
        const audioSizeKB = (audioBuffer.length / 1024).toFixed(1);
        console.log(`✅ Scene ${sceneNum} TTS 생성 완료 (${audioSizeKB}KB)`);

        // GCS 업로드
        let audioUrl = null;
        try {
          const fileName = `${folderName}/audio/scene_${String(sceneNum).padStart(2, "0")}.${this.output_format}`;
          await storage.objects.insert({
            bucket: this.gcs_bucket_name,
            name: fileName,
            media: { mimeType, body: Readable.from(audioBuffer) },
          });
          audioUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${fileName}`;
          console.log(`📤 Scene ${sceneNum} 업로드 완료`);
        } catch (gcsError) {
          console.warn(`⚠️ Scene ${sceneNum} GCS 업로드 실패: ${gcsError.message}`);
        }

        results.push({
          scene_number: sceneNum,
          success: true,
          audio_url: audioUrl,
          audio_size_kb: audioSizeKB,
          narration_length: narration.length,
        });

      } catch (e) {
        console.error(`❌ Scene ${sceneNum} TTS 실패:`, e.message);
        if (e.response?.data) {
          const errorData = Buffer.isBuffer(e.response.data)
            ? e.response.data.toString()
            : JSON.stringify(e.response.data);
          console.error(`   응답:`, errorData.substring(0, 500));
        }
        results.push({ scene_number: sceneNum, success: false, error: e.message });
      }
    }

    // ==========================================
    // 전체 스크립트 TTS 생성 (옵션)
    // ==========================================
    let fullScriptResult = null;
    if (this.generate_full_script) {
      // 전체 나레이션 합치기
      const fullScript = targetScenes
        .filter(s => s.narration?.trim())
        .map(s => s.narration.trim())
        .join(" ");

      if (fullScript) {
        console.log(`\n🎙️ 전체 스크립트 TTS 생성 중... (${fullScript.length}자)`);

        try {
          const ttsResponse = await axios($, {
            method: "POST",
            url: "https://api.openai.com/v1/audio/speech",
            headers: {
              "Authorization": `Bearer ${this.openai_api_key}`,
              "Content-Type": "application/json",
            },
            data: {
              model: this.tts_model,
              input: fullScript,
              voice: this.voice,
              speed: parseFloat(this.speed),
              response_format: this.output_format,
            },
            responseType: "arraybuffer",
          });

          const audioBuffer = Buffer.from(ttsResponse);
          const audioSizeKB = (audioBuffer.length / 1024).toFixed(1);

          // GCS 업로드
          let audioUrl = null;
          try {
            const fileName = `${folderName}/audio/full_narration.${this.output_format}`;
            await storage.objects.insert({
              bucket: this.gcs_bucket_name,
              name: fileName,
              media: { mimeType, body: Readable.from(audioBuffer) },
            });
            audioUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${fileName}`;
          } catch (gcsError) {
            console.warn(`⚠️ 전체 스크립트 GCS 업로드 실패: ${gcsError.message}`);
          }

          fullScriptResult = {
            success: true,
            audio_url: audioUrl,
            audio_size_kb: audioSizeKB,
            script_length: fullScript.length,
          };
          console.log(`✅ 전체 스크립트 TTS 완료 (${audioSizeKB}KB)`);

        } catch (e) {
          console.error(`❌ 전체 스크립트 TTS 실패:`, e.message);
          fullScriptResult = { success: false, error: e.message };
        }
      }
    }

    // ==========================================
    // 결과 반환
    // ==========================================
    const successCount = results.filter(r => r.success).length;
    console.log(`\n📊 TTS 생성 완료: ${successCount}/${targetScenes.length}`);

    const result = {
      folder_name: folderName,
      shorts_script: shortsScript,
      tts_settings: {
        model: this.tts_model,
        voice: this.voice,
        speed: this.speed,
        format: this.output_format,
      },
      scene_audio: {
        generated: successCount,
        failed: results.filter(r => !r.success).length,
        results,
      },
      full_script_audio: fullScriptResult,
      generated_at: new Date().toISOString(),
    };

    $.export("tts_generation", result);
    $.export("$summary", `TTS 생성: ${successCount}/${targetScenes.length}개 씬`);
    return result;
  },
});
