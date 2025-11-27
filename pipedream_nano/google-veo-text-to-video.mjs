import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Google Veo Text-to-Video Generator",
  description: "Generate 10 connected 3-second videos using Google Veo 2 + Gemini for seamless 30-second shorts",

  props: {
    // 입력 데이터
    script_text: {
      type: "string",
      label: "Script Text",
      description: "Full narration script for the video",
    },
    script_title: {
      type: "string",
      label: "Script Title",
      description: "Title of the video content",
      optional: true,
    },

    // Google Cloud 연결
    google_cloud: {
      type: "app",
      app: "google_cloud",
    },

    // 설정
    gcs_bucket_name: {
      type: "string",
      label: "GCS Bucket Name",
      default: "scene-image-generator-storage-mcp-test-457809",
    },
    gcp_project_id: {
      type: "string",
      label: "GCP Project ID",
      description: "Google Cloud Project ID for Vertex AI",
    },
    gcp_region: {
      type: "string",
      label: "GCP Region",
      default: "us-central1",
    },
    gemini_model: {
      type: "string",
      label: "Gemini Model",
      description: "Gemini model for scene prompt generation",
      options: [
        { label: "Gemini 2.0 Flash (Fast)", value: "gemini-2.0-flash-exp" },
        { label: "Gemini 1.5 Pro", value: "gemini-1.5-pro" },
        { label: "Gemini 1.5 Flash", value: "gemini-1.5-flash" },
      ],
      default: "gemini-2.0-flash-exp",
    },
    veo_model: {
      type: "string",
      label: "Veo Model",
      options: [
        { label: "Veo 2 (Recommended)", value: "veo-2.0-generate-001" },
        { label: "Veo 2 Experimental", value: "veo-2.0-generate-exp" },
      ],
      default: "veo-2.0-generate-001",
    },
    total_duration: {
      type: "integer",
      label: "Total Duration (seconds)",
      description: "Total video duration",
      default: 30,
    },
    clip_duration: {
      type: "integer",
      label: "Clip Duration (seconds)",
      description: "Duration of each video clip (Veo supports 5-8 seconds)",
      default: 3,
    },
    video_resolution: {
      type: "string",
      label: "Video Resolution",
      options: [
        { label: "720p", value: "720p" },
        { label: "1080p", value: "1080p" },
      ],
      default: "720p",
    },
    aspect_ratio: {
      type: "string",
      label: "Aspect Ratio",
      options: [
        { label: "9:16 (Shorts/Vertical)", value: "9:16" },
        { label: "16:9 (Landscape)", value: "16:9" },
        { label: "1:1 (Square)", value: "1:1" },
      ],
      default: "9:16",
    },
    video_style: {
      type: "string",
      label: "Video Style",
      options: [
        { label: "Anime (アニメ)", value: "anime" },
        { label: "Cinematic (시네마틱)", value: "cinematic" },
        { label: "Photorealistic (실사)", value: "photorealistic" },
        { label: "3D Animation (3D 애니메이션)", value: "3d_animation" },
        { label: "Watercolor (수채화)", value: "watercolor" },
        { label: "Digital Art (디지털 아트)", value: "digital_art" },
      ],
      default: "anime",
    },
  },

  async run({ steps, $ }) {
    const { google } = await import("googleapis");
    const { v4: uuid } = await import("uuid");
    const { Readable } = await import("stream");

    const clipCount = Math.ceil(this.total_duration / this.clip_duration);
    $.export("clip_count", clipCount);
    $.export("status", "Starting video generation pipeline with Google AI...");

    // =====================
    // 1. Google Auth 설정
    // =====================
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/devstorage.read_write'
      ],
    });

    const accessToken = await auth.getAccessToken();
    const storage = google.storage({ version: 'v1', auth });

    // =====================
    // 2. 스타일 설정
    // =====================
    const styleMap = {
      anime: {
        prefix: "anime style, japanese animation, high quality anime, vibrant colors",
        suffix: "smooth animation, consistent anime aesthetic, studio quality",
        motion: "gentle camera movement, anime-style motion",
      },
      cinematic: {
        prefix: "cinematic shot, film quality, dramatic lighting, movie scene",
        suffix: "anamorphic lens, color graded, professional cinematography",
        motion: "smooth dolly shot, cinematic camera movement",
      },
      photorealistic: {
        prefix: "photorealistic, ultra realistic, 8k quality, lifelike",
        suffix: "natural lighting, realistic textures, DSLR quality",
        motion: "natural camera movement, realistic motion",
      },
      "3d_animation": {
        prefix: "3D animation, pixar style, high quality CGI, smooth render",
        suffix: "disney pixar aesthetic, professional 3D animation",
        motion: "smooth 3D camera movement, animated motion",
      },
      watercolor: {
        prefix: "watercolor animation, soft painting style, delicate brush strokes",
        suffix: "artistic watercolor effect, soft edges, pastel colors",
        motion: "gentle flowing motion, artistic transitions",
      },
      digital_art: {
        prefix: "digital art, concept art, artstation quality, vibrant illustration",
        suffix: "detailed digital painting, professional artwork",
        motion: "smooth artistic motion, creative transitions",
      },
    };

    const selectedStyle = styleMap[this.video_style] || styleMap.anime;

    // =====================
    // 3. Gemini로 연속적인 비디오 프롬프트 생성
    // =====================
    $.export("status", "Generating connected video prompts with Gemini...");

    const GEMINI_API_URL = `https://${this.gcp_region}-aiplatform.googleapis.com/v1/projects/${this.gcp_project_id}/locations/${this.gcp_region}/publishers/google/models/${this.gemini_model}:generateContent`;

    const promptGenerationRequest = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are an expert video director creating a seamless ${this.total_duration}-second short video.

## SCRIPT/NARRATION:
${this.script_text}

## TITLE:
${this.script_title || "Untitled Video"}

## REQUIREMENTS:
- Create exactly ${clipCount} video scene descriptions
- Each scene is ${this.clip_duration} seconds long
- ALL scenes must be VISUALLY CONNECTED and CONSISTENT
- Use the SAME character(s), setting, and visual style throughout
- Each scene should flow naturally into the next
- The visual narrative should match the narration timing

## VISUAL STYLE:
${selectedStyle.prefix}

## CONSISTENCY RULES (VERY IMPORTANT):
1. Define ONE main character/subject and keep them consistent in ALL scenes
2. Keep the same color palette throughout
3. Maintain consistent lighting and atmosphere
4. Each scene should feel like a continuation, not a jump cut
5. Use smooth transitions: zoom in/out, pan, follow movement
6. Describe the SAME environment evolving, not different locations

## OUTPUT FORMAT (JSON only, no markdown):
{
  "main_subject": "Detailed description of the main character/subject that appears in ALL scenes",
  "environment": "The consistent setting/background for all scenes",
  "color_palette": "The color scheme used throughout",
  "scenes": [
    {
      "scene_number": 1,
      "start_time": 0,
      "end_time": ${this.clip_duration},
      "narration_segment": "The part of narration for this scene",
      "visual_description": "Detailed scene description maintaining consistency",
      "camera_movement": "How the camera moves (pan, zoom, follow, etc.)",
      "transition_to_next": "How this scene connects to the next"
    }
  ]
}

Create scenes that tell a cohesive visual story matching the narration. Return ONLY valid JSON, no markdown code blocks.`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
    };

    const geminiResponse = await axios($, {
      method: "POST",
      url: GEMINI_API_URL,
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      data: promptGenerationRequest,
    });

    let sceneGuide;
    try {
      let content = geminiResponse.candidates[0].content.parts[0].text.trim();
      // JSON 코드 블록 제거
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      sceneGuide = JSON.parse(content);
    } catch (e) {
      $.export("parse_error", e.message);
      $.export("raw_response", JSON.stringify(geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text || "").substring(0, 500));
      throw new Error(`Failed to parse Gemini response: ${e.message}`);
    }

    $.export("scene_guide", {
      main_subject: sceneGuide.main_subject?.substring(0, 100) + "...",
      environment: sceneGuide.environment?.substring(0, 100) + "...",
      scene_count: sceneGuide.scenes?.length || 0,
    });

    // =====================
    // 4. Veo 2로 Text-to-Video 생성
    // =====================
    $.export("status", "Generating videos with Google Veo 2...");

    const VEO_API_URL = `https://${this.gcp_region}-aiplatform.googleapis.com/v1/projects/${this.gcp_project_id}/locations/${this.gcp_region}/publishers/google/models/${this.veo_model}:predictLongRunning`;

    const generatedVideos = [];

    // 일관성을 위한 공통 프롬프트 요소
    const consistencyPrefix = `${selectedStyle.prefix}, ${sceneGuide.main_subject}, ${sceneGuide.environment}, ${sceneGuide.color_palette}`;

    for (let i = 0; i < sceneGuide.scenes.length; i++) {
      const scene = sceneGuide.scenes[i];
      $.export(`scene_${i + 1}_status`, "Generating...");

      // 연속성을 위한 프롬프트 구성
      const videoPrompt = `${consistencyPrefix}, ${scene.visual_description}, ${scene.camera_movement}, ${selectedStyle.motion}, ${selectedStyle.suffix}`;

      try {
        // Veo API 호출 (Long Running Operation)
        const response = await axios($, {
          method: "POST",
          url: VEO_API_URL,
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          data: {
            instances: [
              {
                prompt: videoPrompt,
              }
            ],
            parameters: {
              aspectRatio: this.aspect_ratio,
              durationSeconds: this.clip_duration,
              resolution: this.video_resolution,
              sampleCount: 1,
            }
          },
          timeout: 30000,
        });

        // Long Running Operation 처리
        if (response.name) {
          const operationName = response.name;
          let videoResult = null;
          let attempts = 0;
          const maxAttempts = 120; // 최대 10분 대기

          while (!videoResult && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 5000));

            try {
              const opResponse = await axios($, {
                method: "GET",
                url: `https://${this.gcp_region}-aiplatform.googleapis.com/v1/${operationName}`,
                headers: {
                  "Authorization": `Bearer ${accessToken}`,
                },
              });

              if (opResponse.done) {
                if (opResponse.error) {
                  throw new Error(opResponse.error.message || JSON.stringify(opResponse.error));
                }
                videoResult = opResponse.response || opResponse;
              }

              attempts++;
              $.export(`scene_${i + 1}_status`, `Processing... (${attempts * 5}s)`);
            } catch (pollError) {
              attempts++;
              $.export(`scene_${i + 1}_poll_error`, pollError.message);
            }
          }

          if (!videoResult) {
            throw new Error("Timeout waiting for video generation");
          }

          // 비디오 결과 추출
          if (videoResult.predictions && videoResult.predictions[0]) {
            const prediction = videoResult.predictions[0];
            const videoData = prediction.bytesBase64Encoded || prediction.video?.bytesBase64Encoded;

            if (videoData) {
              generatedVideos.push({
                index: i,
                start: scene.start_time,
                end: scene.end_time,
                duration: this.clip_duration,
                base64: videoData,
                filename: `video_${String(i + 1).padStart(3, '0')}_${scene.start_time}-${scene.end_time}.mp4`,
                prompt: videoPrompt.substring(0, 200),
                narration: scene.narration_segment,
              });
            }
          }
        }

        $.export(`scene_${i + 1}_status`, "Complete");

        // Rate limiting
        if (i < sceneGuide.scenes.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }

      } catch (error) {
        console.error(`Scene ${i + 1} failed:`, error.message);
        $.export(`scene_${i + 1}_error`, error.message);
      }
    }

    $.export("videos_generated", generatedVideos.length);

    // =====================
    // 5. GCS에 업로드
    // =====================
    $.export("status", "Uploading to GCS...");

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const shortUuid = uuid().split('-')[0];
    const safeTitle = (this.script_title || 'video').replace(/[^a-zA-Z0-9_]/g, '_').substring(0, 20);
    const folderName = `${dateStr}_${shortUuid}_${safeTitle}`;

    const uploadedVideos = [];

    for (const video of generatedVideos) {
      const objectName = `${folderName}/${video.filename}`;
      const videoBuffer = Buffer.from(video.base64, 'base64');

      const bufferStream = new Readable();
      bufferStream.push(videoBuffer);
      bufferStream.push(null);

      await storage.objects.insert({
        bucket: this.gcs_bucket_name,
        name: objectName,
        media: {
          mimeType: 'video/mp4',
          body: bufferStream,
        },
        requestBody: {
          name: objectName,
          contentType: 'video/mp4',
        },
      });

      const publicUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${objectName}`;

      uploadedVideos.push({
        filename: video.filename,
        url: publicUrl,
        start: video.start,
        end: video.end,
        duration: video.duration,
        narration: video.narration,
      });
    }

    // =====================
    // 6. 메타데이터 저장
    // =====================
    const metadata = {
      generated_at: new Date().toISOString(),
      folder: folderName,
      script_text: this.script_text,
      title: this.script_title,
      gemini_model: this.gemini_model,
      veo_model: this.veo_model,
      style: this.video_style,
      total_duration: this.total_duration,
      clip_duration: this.clip_duration,
      scene_guide: {
        main_subject: sceneGuide.main_subject,
        environment: sceneGuide.environment,
        color_palette: sceneGuide.color_palette,
      },
      total_videos: uploadedVideos.length,
      videos: uploadedVideos,
    };

    const metadataStream = new Readable();
    metadataStream.push(JSON.stringify(metadata, null, 2));
    metadataStream.push(null);

    await storage.objects.insert({
      bucket: this.gcs_bucket_name,
      name: `${folderName}/metadata.json`,
      media: {
        mimeType: 'application/json',
        body: metadataStream,
      },
      requestBody: {
        name: `${folderName}/metadata.json`,
        contentType: 'application/json',
      },
    });

    $.export("$summary", `Generated ${uploadedVideos.length} connected videos (${this.clip_duration}s each) with Gemini + Veo 2`);

    return {
      success: true,
      folder_name: folderName,
      bucket: this.gcs_bucket_name,
      folder_url: `https://storage.googleapis.com/${this.gcs_bucket_name}/${folderName}/`,
      metadata_url: `https://storage.googleapis.com/${this.gcs_bucket_name}/${folderName}/metadata.json`,
      gemini_model: this.gemini_model,
      veo_model: this.veo_model,
      style: this.video_style,
      total_duration: this.total_duration,
      clip_count: clipCount,
      clip_duration: this.clip_duration,
      videos_generated: uploadedVideos.length,
      videos: uploadedVideos,
      scene_guide: {
        main_subject: sceneGuide.main_subject,
        environment: sceneGuide.environment,
      },
    };
  },
});
