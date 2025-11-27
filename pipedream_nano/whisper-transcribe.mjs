import { axios } from "@pipedream/platform";
import FormData from "form-data";

export default defineComponent({
  name: "Whisper Transcribe",
  description: "Transcribe audio and generate subtitles with timestamps using OpenAI Whisper",

  props: {
    // 입력 데이터
    audio_url: {
      type: "string",
      label: "Audio URL",
      description: "URL of the audio file to transcribe",
    },

    // OpenAI 연결
    openai: {
      type: "app",
      app: "openai",
    },

    // Whisper 설정
    language: {
      type: "string",
      label: "Language",
      description: "Language of the audio (ISO 639-1 code)",
      default: "ja",
      options: [
        { label: "Japanese", value: "ja" },
        { label: "English", value: "en" },
        { label: "Korean", value: "ko" },
        { label: "Chinese", value: "zh" },
      ],
    },

    // GCS 설정
    google_cloud: {
      type: "app",
      app: "google_cloud",
    },
    gcs_bucket_name: {
      type: "string",
      label: "GCS Bucket Name",
      default: "scene-image-generator-storage-mcp-test-457809",
    },
    folder_name: {
      type: "string",
      label: "Folder Name",
      description: "GCS folder name for storing subtitles",
    },
  },

  async run({ steps, $ }) {
    $.export("status", "Transcribing audio with Whisper...");

    // 1. 오디오 파일 다운로드
    const audioResponse = await axios($, {
      method: "GET",
      url: this.audio_url,
      responseType: "arraybuffer",
    });

    const audioBuffer = Buffer.from(audioResponse);

    // 2. Whisper API 호출 (verbose_json으로 타임스탬프 포함)
    const formData = new FormData();
    formData.append("file", audioBuffer, {
      filename: "audio.mp3",
      contentType: "audio/mpeg",
    });
    formData.append("model", "whisper-1");
    formData.append("language", this.language);
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "word");
    formData.append("timestamp_granularities[]", "segment");

    const transcription = await axios($, {
      method: "POST",
      url: "https://api.openai.com/v1/audio/transcriptions",
      headers: {
        "Authorization": `Bearer ${this.openai.$auth.api_key}`,
        ...formData.getHeaders(),
      },
      data: formData,
    });

    $.export("transcription_text", transcription.text.substring(0, 200) + "...");

    // 3. 자막 데이터 가공 (Creatomate 형식)
    const subtitles = transcription.segments.map((segment, index) => ({
      index: index,
      start: segment.start,
      end: segment.end,
      text: segment.text.trim(),
      words: segment.words || [],
    }));

    // 4. SRT 형식 생성
    const srtContent = subtitles.map((sub, i) => {
      const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.round((seconds % 1) * 1000);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
      };
      return `${i + 1}\n${formatTime(sub.start)} --> ${formatTime(sub.end)}\n${sub.text}\n`;
    }).join('\n');

    // 5. GCS 업로드
    const { google } = await import("googleapis");
    const { Readable } = await import("stream");

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
    });

    const storage = google.storage({ version: 'v1', auth });

    // JSON 자막 업로드
    const jsonObjectName = `${this.folder_name}/subtitles.json`;
    const jsonStream = new Readable();
    jsonStream.push(JSON.stringify({ subtitles, full_text: transcription.text }, null, 2));
    jsonStream.push(null);

    await storage.objects.insert({
      bucket: this.gcs_bucket_name,
      name: jsonObjectName,
      media: {
        mimeType: 'application/json',
        body: jsonStream,
      },
      requestBody: {
        name: jsonObjectName,
        contentType: 'application/json',
      },
    });

    // SRT 자막 업로드
    const srtObjectName = `${this.folder_name}/subtitles.srt`;
    const srtStream = new Readable();
    srtStream.push(srtContent);
    srtStream.push(null);

    await storage.objects.insert({
      bucket: this.gcs_bucket_name,
      name: srtObjectName,
      media: {
        mimeType: 'text/plain',
        body: srtStream,
      },
      requestBody: {
        name: srtObjectName,
        contentType: 'text/plain',
      },
    });

    const jsonUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${jsonObjectName}`;
    const srtUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${srtObjectName}`;

    $.export("$summary", `Generated ${subtitles.length} subtitle segments`);

    return {
      success: true,
      full_text: transcription.text,
      duration: transcription.duration,
      language: transcription.language,
      total_segments: subtitles.length,
      subtitles: subtitles,
      json_url: jsonUrl,
      srt_url: srtUrl,
      bucket: this.gcs_bucket_name,
      folder_name: this.folder_name,
    };
  },
});
