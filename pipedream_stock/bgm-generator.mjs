import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "BGM Generator",
  description: "Generate background music for Shorts using MusicAPI (Sonic/Suno)",

  props: {
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
        { label: "Description Mode (AI가 스타일 결정)", value: "description" },
        { label: "Custom Mode (직접 스타일 지정)", value: "custom" },
      ],
      default: "description",
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
    lyrics: {
      type: "string",
      label: "Lyrics",
      description: "Song lyrics (optional, leave empty for instrumental)",
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

    // GCS 업로드 옵션
    google_cloud: {
      type: "app",
      app: "google_cloud",
      optional: true,
    },
    gcs_bucket_name: {
      type: "string",
      label: "GCS Bucket Name",
      description: "Google Cloud Storage bucket for audio files",
      default: "shorts-audio-storage-mcp-test-457809",
      optional: true,
    },

    // 폴링 설정
    max_wait_seconds: {
      type: "integer",
      label: "Max Wait Time (seconds)",
      description: "Maximum time to wait for music generation",
      default: 180,
    },
  },

  async run({ steps, $ }) {
    const MUSICAPI_BASE = "https://api.musicapi.ai/api/v1";

    // =====================
    // 1. 음악 생성 요청
    // =====================
    $.export("status", "Requesting music generation...");

    let requestBody = {
      mv: this.model_version,
      make_instrumental: this.instrumental,
    };

    if (this.generation_mode === "description") {
      // Description Mode: AI가 스타일 결정
      requestBody.custom_mode = false;
      requestBody.gpt_description_prompt = this.music_description || "upbeat background music for short video, energetic and catchy";
    } else {
      // Custom Mode: 직접 스타일 지정
      requestBody.custom_mode = true;
      requestBody.title = this.music_title || "Shorts BGM";
      requestBody.tags = this.music_style || "upbeat, energetic, pop, background music";

      if (!this.instrumental && this.lyrics) {
        requestBody.prompt = this.lyrics;
      }
    }

    $.export("request_params", {
      mode: this.generation_mode,
      model: this.model_version,
      instrumental: this.instrumental,
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
    // 2. 생성 완료 대기 (폴링)
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

      $.export("poll_status", statusResponse.status);

      if (statusResponse.status === "complete" || statusResponse.status === "completed") {
        result = statusResponse;
        break;
      } else if (statusResponse.status === "failed" || statusResponse.status === "error") {
        throw new Error(`Music generation failed: ${statusResponse.error || "Unknown error"}`);
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
    // 3. 결과 처리
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
    // 4. GCS 업로드 (선택)
    // =====================
    let uploadedFiles = [];

    if (this.google_cloud && this.gcs_bucket_name) {
      $.export("status", "Uploading to Google Cloud Storage...");

      const { google } = await import("googleapis");
      const { Readable } = await import("stream");

      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(this.google_cloud.$auth.key_json),
        scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
      });

      const storage = google.storage({ version: "v1", auth });

      // 폴더명 생성
      const now = new Date();
      const dateStr = now.toISOString().split("T")[0].replace(/-/g, "");
      const shortUuid = crypto.randomUUID().split("-")[0];
      const folderName = `bgm_${dateStr}_${shortUuid}`;

      for (const song of generatedSongs) {
        try {
          // 오디오 파일 다운로드
          const audioResponse = await axios($, {
            method: "GET",
            url: song.audio_url,
            responseType: "arraybuffer",
          });

          const audioBuffer = Buffer.from(audioResponse);
          const filename = `${song.title.replace(/[^a-zA-Z0-9_]/g, "_")}.mp3`;
          const objectName = `${folderName}/${filename}`;

          // Buffer를 Stream으로 변환
          const bufferStream = new Readable();
          bufferStream.push(audioBuffer);
          bufferStream.push(null);

          await storage.objects.insert({
            bucket: this.gcs_bucket_name,
            name: objectName,
            media: {
              mimeType: "audio/mpeg",
              body: bufferStream,
            },
            requestBody: {
              name: objectName,
              contentType: "audio/mpeg",
              metadata: {
                songId: song.id,
                duration: String(song.duration || ""),
                style: song.style || "",
              },
            },
          });

          const publicUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${objectName}`;

          uploadedFiles.push({
            filename,
            original_url: song.audio_url,
            gcs_url: publicUrl,
            duration: song.duration,
          });
        } catch (uploadError) {
          console.error(`Failed to upload ${song.title}:`, uploadError.message);
          uploadedFiles.push({
            filename: song.title,
            original_url: song.audio_url,
            gcs_url: null,
            error: uploadError.message,
          });
        }
      }

      // metadata.json 업로드
      const metadata = {
        generated_at: new Date().toISOString(),
        folder: folderName,
        model: this.model_version,
        mode: this.generation_mode,
        instrumental: this.instrumental,
        description: this.music_description || this.music_style,
        songs: uploadedFiles,
      };

      const metadataStream = new Readable();
      metadataStream.push(JSON.stringify(metadata, null, 2));
      metadataStream.push(null);

      await storage.objects.insert({
        bucket: this.gcs_bucket_name,
        name: `${folderName}/metadata.json`,
        media: {
          mimeType: "application/json",
          body: metadataStream,
        },
      });
    }

    // =====================
    // 5. 결과 반환
    // =====================
    $.export("$summary", `Generated ${generatedSongs.length} BGM tracks`);

    return {
      success: true,
      task_id: taskId,
      model: this.model_version,
      mode: this.generation_mode,
      instrumental: this.instrumental,
      songs: generatedSongs,
      uploaded_files: uploadedFiles.length > 0 ? uploadedFiles : null,
      folder_url: uploadedFiles.length > 0
        ? `https://storage.googleapis.com/${this.gcs_bucket_name}/bgm_${new Date().toISOString().split("T")[0].replace(/-/g, "")}_*/`
        : null,
    };
  },
});
