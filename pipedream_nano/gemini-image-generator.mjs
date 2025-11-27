import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Gemini Image Generator",
  description: "Generate scene images using Gemini API (Imagen models) - No Vertex AI required",

  props: {
    // 입력 데이터
    script_text: {
      type: "string",
      label: "Script Text",
      description: "Full script/narration text for AI style analysis",
    },
    scenes: {
      type: "string",
      label: "Scenes JSON",
      description: "JSON array of scenes with start, end, image_prompt fields",
    },

    // Gemini API 설정
    gemini_api_key: {
      type: "string",
      label: "Gemini API Key",
      description: "Google AI Studio API Key",
      secret: true,
    },

    // 모델 설정
    gemini_model: {
      type: "string",
      label: "Gemini Model (분석용)",
      options: [
        { label: "Gemini 2.0 Flash (Fast)", value: "gemini-2.0-flash-exp" },
        { label: "Gemini 1.5 Pro", value: "gemini-1.5-pro" },
        { label: "Gemini 1.5 Flash", value: "gemini-1.5-flash" },
      ],
      default: "gemini-2.0-flash-exp",
    },
    imagen_model: {
      type: "string",
      label: "Imagen Model (이미지 생성)",
      options: [
        { label: "Imagen 4 Ultra (최고 품질)", value: "imagen-4.0-ultra-generate-001" },
        { label: "Imagen 4 Standard", value: "imagen-4.0-generate-001" },
        { label: "Imagen 4 Fast (빠른 생성)", value: "imagen-4.0-fast-generate-001" },
      ],
      default: "imagen-4.0-generate-001",
    },

    // Google Cloud 연결 (GCS 업로드용)
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
    aspect_ratio: {
      type: "string",
      label: "Aspect Ratio",
      options: [
        { label: "9:16 (Shorts/Vertical)", value: "9:16" },
        { label: "16:9 (Landscape)", value: "16:9" },
        { label: "1:1 (Square)", value: "1:1" },
        { label: "4:3 (Standard)", value: "4:3" },
        { label: "3:4 (Portrait)", value: "3:4" },
      ],
      default: "9:16",
    },
    image_style: {
      type: "string",
      label: "Image Style",
      description: "Visual style for generated images",
      options: [
        { label: "Anime (アニメ)", value: "anime" },
        { label: "Photorealistic (실사)", value: "photorealistic" },
        { label: "Digital Art (디지털 아트)", value: "digital_art" },
        { label: "Watercolor (수채화)", value: "watercolor" },
        { label: "3D Render (3D 렌더링)", value: "3d_render" },
        { label: "Oil Painting (유화)", value: "oil_painting" },
        { label: "Cinematic (시네마틱)", value: "cinematic" },
      ],
      default: "anime",
    },
    folder_name: {
      type: "string",
      label: "Folder Name",
      description: "GCS folder name (from Script Generator). Leave empty to auto-generate.",
      optional: true,
    },
  },

  async run({ steps, $ }) {
    const scenes = JSON.parse(this.scenes);
    const scriptText = this.script_text;

    // =====================
    // 1. 스타일 매핑
    // =====================
    const styleMap = {
      anime: {
        name: "anime japanese animation",
        prefix: "anime style, japanese animation, high quality anime art, detailed anime illustration",
        suffix: "anime aesthetic, vibrant colors, clean lines, studio ghibli inspired",
      },
      photorealistic: {
        name: "photorealistic cinematic",
        prefix: "photorealistic, ultra realistic, 8k uhd, high detail photograph, cinematic lighting",
        suffix: "professional photography, realistic skin texture, natural lighting, DSLR quality",
      },
      digital_art: {
        name: "digital illustration",
        prefix: "digital art, digital illustration, artstation trending, concept art",
        suffix: "highly detailed, vibrant digital painting, professional digital artwork",
      },
      watercolor: {
        name: "watercolor soft painting",
        prefix: "watercolor painting, soft watercolor art, delicate brush strokes",
        suffix: "watercolor texture, soft edges, pastel colors, traditional art style",
      },
      "3d_render": {
        name: "3D rendered pixar style",
        prefix: "3D render, pixar style, octane render, high quality 3D art",
        suffix: "smooth 3D animation style, disney pixar aesthetic, CGI quality",
      },
      oil_painting: {
        name: "oil painting classical",
        prefix: "oil painting, classical art style, renaissance inspired, masterpiece painting",
        suffix: "rich oil colors, brush texture, museum quality art, fine art painting",
      },
      cinematic: {
        name: "cinematic film still",
        prefix: "cinematic shot, movie still, film photography, dramatic lighting",
        suffix: "anamorphic lens, cinematic color grading, blockbuster movie quality, 35mm film",
      },
    };

    const selectedStyle = styleMap[this.image_style] || styleMap.anime;
    $.export("selected_style", this.image_style);
    $.export("status", "Analyzing script with Gemini API...");

    // =====================
    // 2. Gemini API로 스타일 가이드 생성
    // =====================
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${this.gemini_model}:generateContent?key=${this.gemini_api_key}`;

    const geminiResponse = await axios($, {
      method: "POST",
      url: GEMINI_API_URL,
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        contents: [
          {
            parts: [
              {
                text: `You are an expert visual director creating a seamless video sequence. Your goal is to create images that will be converted to video clips and connected smoothly.

## SCRIPT/NARRATION:
${scriptText}

## SCENE TIMING:
${scenes.map((s, i) => `Scene ${i + 1} (${s.start}s-${s.end}s): ${s.image_prompt || s.prompt}`).join('\n')}

## REQUIRED STYLE: "${selectedStyle.name}"
Style Prefix: "${selectedStyle.prefix}"
Style Suffix: "${selectedStyle.suffix}"

## CRITICAL REQUIREMENTS FOR VIDEO CONTINUITY:
1. **SAME CHARACTER(S)**: Define ONE main character/subject that appears in ALL scenes with EXACT same appearance
   - Same hair color, style, length
   - Same clothing/outfit throughout
   - Same body proportions and features
   - Same accessories if any

2. **CONSISTENT ENVIRONMENT**:
   - Same background setting or natural progression of same location
   - Same time of day/lighting conditions
   - Same weather/atmosphere

3. **COLOR PALETTE**: Use IDENTICAL color scheme across all scenes
   - Define 3-4 main colors that appear in every image
   - Keep saturation and brightness consistent

4. **COMPOSITION FOR SMOOTH TRANSITIONS**:
   - Each scene should flow naturally to the next
   - Consider camera angle progression (zoom in/out, pan)
   - Subject position should allow smooth morphing between frames

5. **MOTION HINTS**: Include subtle motion cues in descriptions
   - "character turning slightly left"
   - "wind blowing hair gently"
   - "walking forward"

Output JSON only, no markdown code blocks:
{
  "main_character": "DETAILED description of main character that MUST be included in every prompt",
  "environment": "Consistent environment/setting description",
  "color_palette": "Exact colors used: primary, secondary, accent",
  "lighting": "Consistent lighting description",
  "title": "short_title",
  "enhanced_prompts": [
    {
      "scene_index": 0,
      "enhanced": "Full prompt including character, environment, action",
      "camera_angle": "eye level / low angle / etc",
      "motion_hint": "subtle movement for video"
    }
  ]
}`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
        },
      },
    });

    let styleGuide;
    try {
      let content = geminiResponse.candidates[0].content.parts[0].text.trim();
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      styleGuide = JSON.parse(content);
    } catch (e) {
      $.export("parse_error", e.message);
      styleGuide = {
        main_character: "detailed character",
        environment: "natural setting",
        color_palette: "warm natural colors",
        lighting: "soft natural lighting",
        title: "scene_images",
        enhanced_prompts: scenes.map((s, i) => ({
          scene_index: i,
          enhanced: s.image_prompt || s.prompt,
          camera_angle: "eye level",
          motion_hint: "subtle movement"
        }))
      };
    }

    $.export("style_guide", {
      title: styleGuide.title,
      main_character: styleGuide.main_character?.substring(0, 100) + "...",
      environment: styleGuide.environment?.substring(0, 80) + "...",
      color_palette: styleGuide.color_palette,
    });

    // 일관성을 위한 공통 프롬프트 요소
    const consistencyPrefix = `${styleGuide.main_character}, ${styleGuide.environment}, ${styleGuide.color_palette}, ${styleGuide.lighting}`;

    // =====================
    // 3. Imagen API로 이미지 생성 (REST API 사용) - 병렬 처리
    // =====================
    $.export("status", `Generating images with ${this.imagen_model}...`);

    const IMAGEN_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${this.imagen_model}:predict`;

    // 병렬로 모든 이미지 생성 요청
    const imagePromises = styleGuide.enhanced_prompts.map(async (enhanced, i) => {
      const scene = scenes[i];
      const motionHint = enhanced.motion_hint || "";
      const cameraAngle = enhanced.camera_angle || "";
      const finalPrompt = `${selectedStyle.prefix}, ${consistencyPrefix}, ${enhanced.enhanced}, ${cameraAngle}, ${motionHint}, ${selectedStyle.suffix}`;

      try {
        const response = await axios($, {
          method: "POST",
          url: IMAGEN_API_URL,
          headers: {
            "x-goog-api-key": this.gemini_api_key,
            "Content-Type": "application/json",
          },
          data: {
            instances: [{ prompt: finalPrompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: this.aspect_ratio,
              personGeneration: "allow_adult",
            }
          },
          timeout: 120000,
        });

        if (response.predictions && response.predictions[0]) {
          return {
            success: true,
            index: i,
            start: scene.start,
            end: scene.end,
            base64: response.predictions[0].bytesBase64Encoded,
            filename: `scene_${String(i + 1).padStart(3, '0')}_${scene.start}-${scene.end}.png`,
            prompt: finalPrompt.substring(0, 200),
          };
        }
        return { success: false, index: i, error: "No prediction returned" };
      } catch (error) {
        console.error(`Scene ${i + 1} failed:`, error.message);
        return {
          success: false,
          index: i,
          error: error.response?.data?.error?.message || error.message
        };
      }
    });

    // 모든 이미지 생성 완료 대기
    const results = await Promise.all(imagePromises);

    // 성공한 이미지만 필터링하고 인덱스 순으로 정렬
    const generatedImages = results
      .filter(r => r.success)
      .sort((a, b) => a.index - b.index);

    // 실패한 이미지 로깅
    results.filter(r => !r.success).forEach(r => {
      $.export(`scene_${r.index + 1}_error`, r.error);
    });

    $.export("images_generated", generatedImages.length);
    $.export("images_failed", results.filter(r => !r.success).length);

    // =====================
    // 4. GCS 업로드
    // =====================
    $.export("status", "Uploading to Google Cloud Storage...");

    const { google } = await import("googleapis");
    const { v4: uuid } = await import("uuid");
    const { Readable } = await import("stream");

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
    });

    const storage = google.storage({ version: 'v1', auth });

    // folder_name: props에서 받거나 자동 생성
    let folderName = this.folder_name;
    if (!folderName) {
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
      const shortUuid = uuid().split('-')[0];
      const safeTitle = (styleGuide.title || 'scene_images').replace(/[^a-zA-Z0-9_]/g, '_');
      folderName = `${dateStr}_${shortUuid}_${safeTitle}`;
    }

    const uploadedFiles = [];

    for (const image of generatedImages) {
      const objectName = `${folderName}/${image.filename}`;
      const imageBuffer = Buffer.from(image.base64, 'base64');

      const bufferStream = new Readable();
      bufferStream.push(imageBuffer);
      bufferStream.push(null);

      await storage.objects.insert({
        bucket: this.gcs_bucket_name,
        name: objectName,
        media: {
          mimeType: 'image/png',
          body: bufferStream,
        },
        requestBody: {
          name: objectName,
          contentType: 'image/png',
          metadata: {
            sceneIndex: String(image.index),
            start: String(image.start),
            end: String(image.end),
          },
        },
      });

      const publicUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${objectName}`;

      uploadedFiles.push({
        filename: image.filename,
        url: publicUrl,
        start: image.start,
        end: image.end,
        duration: image.end - image.start,
      });
    }

    // metadata.json 생성
    const metadata = {
      generated_at: new Date().toISOString(),
      folder: folderName,
      script_text: scriptText,
      gemini_model: this.gemini_model,
      imagen_model: this.imagen_model,
      style_guide: {
        art_style: selectedStyle.name,
        title: styleGuide.title,
        main_character: styleGuide.main_character,
        environment: styleGuide.environment,
        color_palette: styleGuide.color_palette,
        lighting: styleGuide.lighting,
      },
      total_scenes: uploadedFiles.length,
      scenes: uploadedFiles,
    };

    const metadataObjectName = `${folderName}/metadata.json`;
    const metadataStream = new Readable();
    metadataStream.push(JSON.stringify(metadata, null, 2));
    metadataStream.push(null);

    await storage.objects.insert({
      bucket: this.gcs_bucket_name,
      name: metadataObjectName,
      media: {
        mimeType: 'application/json',
        body: metadataStream,
      },
      requestBody: {
        name: metadataObjectName,
        contentType: 'application/json',
      },
    });

    const metadataUrl = `https://storage.googleapis.com/${this.gcs_bucket_name}/${metadataObjectName}`;

    $.export("$summary", `Generated ${uploadedFiles.length} images with Gemini API (${this.imagen_model})`);

    return {
      success: true,
      folder_name: folderName,
      bucket: this.gcs_bucket_name,
      folder_url: `https://storage.googleapis.com/${this.gcs_bucket_name}/${folderName}/`,
      metadata_url: metadataUrl,
      gemini_model: this.gemini_model,
      imagen_model: this.imagen_model,
      style_guide: {
        art_style: selectedStyle.name,
        title: styleGuide.title,
      },
      total_scenes: uploadedFiles.length,
      scenes: uploadedFiles,
    };
  },
});
