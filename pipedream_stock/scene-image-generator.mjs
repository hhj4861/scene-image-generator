import { axios } from "@pipedream/platform";
import { v4 as uuid } from "uuid";
import { google } from "googleapis";
import OpenAI from "openai";
import { Readable } from "stream";

export default defineComponent({
  name: "Scene Image Generator",
  description: "Generate scene images from script using AI style analysis and Stability AI",

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

    // API 연결
    openai: {
      type: "app",
      app: "openai",
    },
    google_cloud: {
      type: "app",
      app: "google_cloud",
    },

    // 설정
    stability_api_key: {
      type: "string",
      label: "Stability AI API Key",
      secret: true,
    },
    gcs_bucket_name: {
      type: "string",
      label: "GCS Bucket Name",
      default: "scene-image-generator-storage-mcp-test-457809",
    },
    image_width: {
      type: "integer",
      label: "Image Width",
      default: 768,  // Runway 호환: 768x1344 (비율 0.571)
    },
    image_height: {
      type: "integer",
      label: "Image Height",
      default: 1344,  // Runway 호환: 768x1344 (비율 0.571)
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
  },

  async run({ steps, $ }) {
    const scenes = JSON.parse(this.scenes);
    const scriptText = this.script_text;

    // =====================
    // 1. AI 스타일 분석
    // =====================
    $.export("status", "Analyzing script with AI...");

    // 스타일 매핑
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

    const openai = new OpenAI({
      apiKey: this.openai.$auth.api_key,
    });

    const analysisPrompt = `You are an expert visual director and art director. Analyze the following script and scene descriptions to create consistent character design and enhanced prompts.

## SCRIPT (Full Text):
${scriptText}

## SCENE PROMPTS:
${scenes.map((s, i) => `Scene ${i + 1} (${s.start}s-${s.end}s): ${s.image_prompt || s.prompt}`).join('\n')}

## REQUIRED ART STYLE (DO NOT CHANGE):
"${selectedStyle.name}"

## YOUR TASK:
You MUST use the required art style above. Create:

1. **art_style**: MUST be "${selectedStyle.name}" (do not change this)

2. **character_description**: Detailed, CONSISTENT character description for ALL scenes (matching the required style)

3. **mood_keywords**: 3-5 keywords for overall mood

4. **color_palette**: Color tone description appropriate for ${selectedStyle.name}

5. **title**: Short title (2-4 words, English, underscore for spaces)

6. **style_prefix**: Use this exactly: "${selectedStyle.prefix}"

7. **style_suffix**: Use this exactly: "${selectedStyle.suffix}"

8. **enhanced_prompts**: For EACH scene, create enhanced prompt incorporating the ${selectedStyle.name} style

Respond in JSON format only:
{
  "art_style": "${selectedStyle.name}",
  "character_description": "detailed description matching ${selectedStyle.name} style",
  "mood_keywords": ["keyword1", "keyword2"],
  "color_palette": "color description",
  "title": "short_title",
  "style_prefix": "${selectedStyle.prefix}",
  "style_suffix": "${selectedStyle.suffix}",
  "enhanced_prompts": [
    {"scene_index": 0, "original": "...", "enhanced": "scene prompt in ${selectedStyle.name} style"}
  ]
}`;

    const analysisResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are an expert visual director. Respond with valid JSON only." },
        { role: "user", content: analysisPrompt }
      ],
      temperature: 0.7,
      max_tokens: 4000,
    });

    const styleGuide = JSON.parse(
      analysisResponse.choices[0].message.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()
    );

    $.export("style_guide", {
      art_style: styleGuide.art_style,
      title: styleGuide.title,
      character: styleGuide.character_description.substring(0, 100) + "...",
      mood: styleGuide.mood_keywords,
    });

    // =====================
    // 2. 이미지 생성 (Stability AI)
    // =====================
    $.export("status", "Generating images with Stability AI...");

    const generatedImages = [];
    const STABILITY_API_URL = "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image";

    for (let i = 0; i < styleGuide.enhanced_prompts.length; i++) {
      const enhanced = styleGuide.enhanced_prompts[i];
      const scene = scenes[i];
      const finalPrompt = `${styleGuide.style_prefix}, ${enhanced.enhanced}, ${styleGuide.style_suffix}`;

      try {
        const response = await axios($, {
          method: "POST",
          url: STABILITY_API_URL,
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": `Bearer ${this.stability_api_key}`,
          },
          data: {
            text_prompts: [{ text: finalPrompt, weight: 1 }],
            cfg_scale: 7,
            height: this.image_height,
            width: this.image_width,
            samples: 1,
            steps: 30,
          },
        });

        if (response.artifacts && response.artifacts[0]) {
          generatedImages.push({
            index: i,
            start: scene.start,
            end: scene.end,
            base64: response.artifacts[0].base64,
            filename: `scene_${String(i + 1).padStart(3, '0')}_${scene.start}-${scene.end}.png`,
            prompt: finalPrompt,
          });
        }

        // Rate limit delay
        if (i < styleGuide.enhanced_prompts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`Scene ${i + 1} failed:`, error.message);
      }
    }

    $.export("images_generated", generatedImages.length);

    // =====================
    // 3. GCS 업로드
    // =====================
    $.export("status", "Uploading to Google Cloud Storage...");

    // 폴더명 생성
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const shortUuid = uuid().split('-')[0];
    const safeTitle = (styleGuide.title || 'scene_images').replace(/[^a-zA-Z0-9_]/g, '_');
    const folderName = `${dateStr}_${shortUuid}_${safeTitle}`;

    // GCS 인증
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.google_cloud.$auth.key_json),
      scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
    });

    const storage = google.storage({ version: 'v1', auth });
    const uploadedFiles = [];

    // 이미지 업로드
    for (const image of generatedImages) {
      const objectName = `${folderName}/${image.filename}`;
      const imageBuffer = Buffer.from(image.base64, 'base64');

      // Buffer를 Readable Stream으로 변환
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

    // metadata.json 생성 및 업로드
    const metadata = {
      generated_at: new Date().toISOString(),
      folder: folderName,
      script_text: scriptText,  // TTS용 전체 스크립트 포함
      style_guide: {
        art_style: styleGuide.art_style,
        title: styleGuide.title,
        character_description: styleGuide.character_description,
        mood_keywords: styleGuide.mood_keywords,
        color_palette: styleGuide.color_palette,
      },
      total_scenes: uploadedFiles.length,
      scenes: uploadedFiles,
    };

    const metadataObjectName = `${folderName}/metadata.json`;

    // metadata JSON을 Stream으로 변환
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

    // =====================
    // 4. 결과 반환
    // =====================
    $.export("$summary", `Generated ${uploadedFiles.length} scene images and uploaded to GCS`);

    return {
      success: true,
      folder_name: folderName,
      bucket: this.gcs_bucket_name,
      folder_url: `https://storage.googleapis.com/${this.gcs_bucket_name}/${folderName}/`,
      metadata_url: metadataUrl,
      style_guide: {
        art_style: styleGuide.art_style,
        title: styleGuide.title,
        mood_keywords: styleGuide.mood_keywords,
      },
      total_scenes: uploadedFiles.length,
      scenes: uploadedFiles,
    };
  },
});
