import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "YouTube Shorts Upload",
  description: "Upload video to YouTube with AI-optimized title, description, and tags for maximum exposure",

  props: {
    // YouTube 연결
    youtube: {
      type: "app",
      app: "youtube_data_api",
    },

    // OpenAI 연결 (메타데이터 최적화용)
    openai: {
      type: "app",
      app: "openai",
    },

    // 입력 데이터
    video_url: {
      type: "string",
      label: "Video URL",
      description: "GCS URL of the final video to upload",
    },
    original_title: {
      type: "string",
      label: "Original Title",
      description: "Original title from script generator (JSON with japanese/korean/english)",
    },
    script_text: {
      type: "string",
      label: "Script Text",
      description: "Full script text for AI analysis",
    },
    hashtags: {
      type: "string",
      label: "Hashtags JSON",
      description: "Hashtags from script generator",
      optional: true,
    },

    // 타겟 설정
    target_language: {
      type: "string",
      label: "Target Language",
      description: "Primary target language for optimization",
      options: [
        { label: "Japanese (日本語)", value: "japanese" },
        { label: "Korean (한국어)", value: "korean" },
        { label: "English", value: "english" },
      ],
      default: "japanese",
    },
    content_category: {
      type: "string",
      label: "Content Category",
      options: [
        { label: "Entertainment (엔터테인먼트)", value: "24" },
        { label: "People & Blogs (인물/블로그)", value: "22" },
        { label: "Education (교육)", value: "27" },
        { label: "Howto & Style (노하우/스타일)", value: "26" },
        { label: "Film & Animation (영화/애니메이션)", value: "1" },
        { label: "Pets & Animals (반려동물)", value: "15" },
      ],
      default: "24",
    },

    // 업로드 설정
    privacy_status: {
      type: "string",
      label: "Privacy Status",
      options: [
        { label: "Public (공개)", value: "public" },
        { label: "Unlisted (미등록)", value: "unlisted" },
        { label: "Private (비공개)", value: "private" },
      ],
      default: "public",
    },
    made_for_kids: {
      type: "boolean",
      label: "Made for Kids",
      default: false,
    },
  },

  async run({ steps, $ }) {
    // =====================
    // 1. AI로 메타데이터 최적화
    // =====================
    $.export("status", "Optimizing metadata with AI...");

    const languageConfig = {
      japanese: {
        name: "Japanese",
        instruction: "Optimize for Japanese YouTube audience. Use trending Japanese keywords and phrases.",
        maxTitleLength: 100,
        maxDescriptionLength: 5000,
      },
      korean: {
        name: "Korean",
        instruction: "Optimize for Korean YouTube audience. Use trending Korean keywords and phrases.",
        maxTitleLength: 100,
        maxDescriptionLength: 5000,
      },
      english: {
        name: "English",
        instruction: "Optimize for English YouTube audience. Use trending English keywords and phrases.",
        maxTitleLength: 100,
        maxDescriptionLength: 5000,
      },
    };

    const lang = languageConfig[this.target_language];
    let originalTitleObj = {};
    try {
      originalTitleObj = typeof this.original_title === 'string'
        ? JSON.parse(this.original_title)
        : this.original_title;
    } catch (e) {
      originalTitleObj = { title: this.original_title };
    }

    let hashtagsObj = {};
    try {
      hashtagsObj = this.hashtags
        ? (typeof this.hashtags === 'string' ? JSON.parse(this.hashtags) : this.hashtags)
        : {};
    } catch (e) {
      hashtagsObj = {};
    }

    const optimizationPrompt = `You are a YouTube SEO expert specializing in viral Shorts content. Your goal is to maximize views, engagement, and algorithm favorability.

## INPUT DATA:
- Original Title: ${JSON.stringify(originalTitleObj)}
- Script: ${this.script_text.substring(0, 1000)}
- Existing Hashtags: ${JSON.stringify(hashtagsObj)}
- Target Language: ${lang.name}
- Content Category: ${this.content_category}

## YOUR TASK:
Create AGGRESSIVE, CLICK-WORTHY metadata optimized for ${lang.name} YouTube Shorts algorithm.

## OPTIMIZATION RULES:
1. **Title**:
   - Use emotional triggers (驚き, 感動, 衝撃, etc.)
   - Include numbers if applicable (3つの理由, 10秒で, etc.)
   - Add curiosity gaps
   - Use trending keywords
   - Keep under 100 characters total
   - MUST include 3-5 trending hashtags in title (e.g., #癒し #感動 #アニメ #Shorts)
   - Hashtags should be relevant, viral, and high-search-volume
   - Example format: "心が癒される瞬間...✨ #癒し #感動 #リラックス #Shorts"

2. **Description**:
   - Start with a hook in first 2 lines (visible before "show more")
   - Include ALL relevant keywords naturally
   - Add timestamps if applicable
   - Include call-to-action (チャンネル登録, いいね, コメント)
   - Add related hashtags at the bottom

3. **Tags**:
   - Mix high-volume and niche keywords
   - Include trending topics
   - Add competitor channel keywords
   - Include common misspellings
   - Maximum 500 characters total

4. **Aggressive SEO Tactics**:
   - Use power words: 必見, 神回, やばい, 驚愕, 感動
   - Add time pressure: 今すぐ, 限定, 見逃すな
   - Include emotional triggers
   - Reference trending topics/memes if relevant

## OUTPUT FORMAT (JSON only):
{
  "optimized_title": "Optimized title under 100 chars with #Shorts",
  "optimized_description": "Full description with hooks, keywords, CTA, and hashtags",
  "tags": ["tag1", "tag2", "tag3", ...],
  "thumbnail_text_suggestion": "2-4 words for thumbnail overlay",
  "best_upload_times": ["suggested time 1", "suggested time 2"],
  "predicted_performance": "low/medium/high/viral",
  "seo_score": 0-100,
  "optimization_notes": "Brief explanation of optimizations"
}

${lang.instruction}

Return ONLY valid JSON.`;

    const aiResponse = await axios($, {
      url: "https://api.openai.com/v1/chat/completions",
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.openai.$auth.api_key}`,
        "Content-Type": "application/json",
      },
      data: {
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert YouTube SEO specialist. You know exactly what makes Shorts go viral. Always respond with valid JSON only.",
          },
          { role: "user", content: optimizationPrompt },
        ],
        temperature: 0.8,
        max_tokens: 2000,
      },
    });

    let optimizedMetadata;
    try {
      let content = aiResponse.choices[0].message.content.trim();
      if (content.startsWith("```json")) {
        content = content.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (content.startsWith("```")) {
        content = content.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }
      optimizedMetadata = JSON.parse(content);
    } catch (e) {
      $.export("ai_error", e.message);
      // Fallback to basic metadata
      optimizedMetadata = {
        optimized_title: originalTitleObj[this.target_language] || originalTitleObj.japanese || "Video #Shorts",
        optimized_description: this.script_text.substring(0, 500) + "\n\n#Shorts",
        tags: ["shorts", "viral", "trending"],
      };
    }

    $.export("ai_optimization", {
      title: optimizedMetadata.optimized_title,
      seo_score: optimizedMetadata.seo_score,
      predicted_performance: optimizedMetadata.predicted_performance,
    });

    // =====================
    // 2. 영상 다운로드
    // =====================
    $.export("status", "Downloading video...");

    const videoResponse = await axios($, {
      method: "GET",
      url: this.video_url,
      responseType: "arraybuffer",
    });

    const videoBuffer = Buffer.from(videoResponse);
    $.export("video_size", `${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    // =====================
    // 3. YouTube 업로드
    // =====================
    $.export("status", "Uploading to YouTube...");

    // YouTube Data API를 사용한 resumable upload
    const { google } = await import("googleapis");

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: this.youtube.$auth.oauth_access_token,
    });

    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    // Tags 처리 (최대 500자)
    let tags = optimizedMetadata.tags || [];
    let tagsString = tags.join(",");
    if (tagsString.length > 500) {
      // 500자 이내로 줄이기
      const shortenedTags = [];
      let currentLength = 0;
      for (const tag of tags) {
        if (currentLength + tag.length + 1 <= 500) {
          shortenedTags.push(tag);
          currentLength += tag.length + 1;
        } else {
          break;
        }
      }
      tags = shortenedTags;
    }

    // 영상 업로드
    const { Readable } = await import("stream");
    const videoStream = new Readable();
    videoStream.push(videoBuffer);
    videoStream.push(null);

    const uploadResponse = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: optimizedMetadata.optimized_title.substring(0, 100),
          description: optimizedMetadata.optimized_description.substring(0, 5000),
          tags: tags,
          categoryId: this.content_category,
          defaultLanguage: this.target_language === "japanese" ? "ja" : this.target_language === "korean" ? "ko" : "en",
        },
        status: {
          privacyStatus: this.privacy_status,
          selfDeclaredMadeForKids: this.made_for_kids,
          // Shorts는 자동으로 인식됨 (세로 영상 + #Shorts 태그)
        },
      },
      media: {
        mimeType: "video/mp4",
        body: videoStream,
      },
    });

    const videoId = uploadResponse.data.id;
    const videoUrl = `https://www.youtube.com/shorts/${videoId}`;

    $.export("$summary", `Uploaded to YouTube: ${videoUrl}`);

    // =====================
    // 4. 결과 반환
    // =====================
    return {
      success: true,
      video_id: videoId,
      video_url: videoUrl,
      shorts_url: `https://www.youtube.com/shorts/${videoId}`,
      watch_url: `https://www.youtube.com/watch?v=${videoId}`,
      studio_url: `https://studio.youtube.com/video/${videoId}/edit`,
      metadata: {
        title: optimizedMetadata.optimized_title,
        description_preview: optimizedMetadata.optimized_description.substring(0, 200) + "...",
        tags_count: tags.length,
        category_id: this.content_category,
        privacy: this.privacy_status,
      },
      ai_insights: {
        seo_score: optimizedMetadata.seo_score,
        predicted_performance: optimizedMetadata.predicted_performance,
        thumbnail_suggestion: optimizedMetadata.thumbnail_text_suggestion,
        best_upload_times: optimizedMetadata.best_upload_times,
        optimization_notes: optimizedMetadata.optimization_notes,
      },
      uploaded_at: new Date().toISOString(),
    };
  },
});
