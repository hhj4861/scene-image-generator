import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "ElevenLabs TTS",
  description: "Generate speech audio from text using ElevenLabs API",

  props: {
    // 입력 데이터
    script_text: {
      type: "string",
      label: "Script Text",
      description: "The text to convert to speech",
    },

    // ElevenLabs 설정
    elevenlabs_api_key: {
      type: "string",
      label: "ElevenLabs API Key",
      secret: true,
    },
    voice_id: {
      type: "string",
      label: "Voice ID",
      description: "ElevenLabs voice ID",
      default: "21m00Tcm4TlvDq8ikWAM", // Rachel (default)
    },
    model_id: {
      type: "string",
      label: "Model ID",
      default: "eleven_multilingual_v2",
      options: [
        { label: "Multilingual v2 (Best quality)", value: "eleven_multilingual_v2" },
        { label: "Turbo v2.5 (Fast, English)", value: "eleven_turbo_v2_5" },
        { label: "Monolingual v1 (English only)", value: "eleven_monolingual_v1" },
      ],
    },
    stability: {
      type: "string",
      label: "Stability",
      description: "Voice stability (0.0 to 1.0)",
      default: "0.5",
    },
    similarity_boost: {
      type: "string",
      label: "Similarity Boost",
      description: "Voice similarity boost (0.0 to 1.0)",
      default: "0.75",
    },

    // GCS 설정
    google_cloud: {
      type: "app",
      app: "google_cloud",
    },
    gcs_bucket_name: {
      type: "string",
      label: "GCS Bucket Name",
      default: "shorts-audio-storage-mcp-test-457809",
    },
    folder_name: {
      type: "string",
      label: "Folder Name",
      description: "GCS folder name for storing audio",
    },
  },

  async run({ steps, $ }) {
    $.export("status", "Generating speech with ElevenLabs...");

    // 1. ElevenLabs TTS API 호출
    const response = await axios($, {
      method: "POST",
      url: `https://api.elevenlabs.io/v1/text-to-speech/${this.voice_id}`,
      headers: {
        "xi-api-key": this.elevenlabs_api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      data: {
        text: this.script_text,
        model_id: this.model_id,
        voice_settings: {
          stability: parseFloat(this.stability),
          similarity_boost: parseFloat(this.similarity_boost),
        },
      },
      responseType: "arraybuffer",
    });

    const audioBuffer = Buffer.from(response);
    const filename = "narration.mp3";

    $.export("audio_size", `${(audioBuffer.length / 1024).toFixed(2)} KB`);

    // 2. GCS 업로드
    const { google } = await import("googleapis");
    const { Readable } = await import("stream");

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
    });

    const storage = google.storage({ version: 'v1', auth });
    const objectName = `${this.folder_name}/${filename}`;

    const bufferStream = new Readable();
    bufferStream.push(audioBuffer);
    bufferStream.push(null);

    await storage.objects.insert({
      bucket: this.gcs_bucket_name,
      name: objectName,
      media: {
        mimeType: 'audio/mpeg',
        body: bufferStream,
      },
      requestBody: {
        name: objectName,
        contentType: 'audio/mpeg',
      },
    });

    const audioUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${objectName}`;

    $.export("$summary", `Generated narration audio: ${filename}`);

    return {
      success: true,
      filename: filename,
      url: audioUrl,
      bucket: this.gcs_bucket_name,
      folder_name: this.folder_name,
      voice_id: this.voice_id,
      model_id: this.model_id,
      script_length: this.script_text.length,
    };
  },
});
