import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "News YouTube Upload",
  description: "Upload news shorts to YouTube with optimized metadata",

  props: {
    // YouTube 연결
    youtube: {
      type: "app",
      app: "youtube_data_api",
    },

    // OpenAI (메타데이터 최적화용)
    openai: {
      type: "app",
      app: "openai",
      optional: true,
    },

    // 입력 데이터
    video_url: {
      type: "string",
      label: "Video URL",
      description: "Use: {{steps.News_Creatomate_Render.$return_value.url}}",
    },
    title: {
      type: "string",
      label: "Title",
      description: "Use: {{steps.News_Script_Generator.$return_value.title}}",
      optional: true,
    },
    hashtags_json: {
      type: "string",
      label: "Hashtags JSON",
      description: "Use: {{JSON.stringify(steps.News_Script_Generator.$return_value.hashtags)}}",
      optional: true,
    },
    full_script: {
      type: "string",
      label: "Full Script",
      description: "Use: {{steps.News_Script_Generator.$return_value.full_script}}",
      optional: true,
    },
    news_category: {
      type: "string",
      label: "News Category",
      description: "Use: {{steps.News_Fetcher.$return_value.news_category}}",
      optional: true,
    },

    // 업로드 설정
    target_language: {
      type: "string",
      label: "Target Language",
      options: [
        { label: "English", value: "en" },
        { label: "Korean (한국어)", value: "ko" },
        { label: "Japanese (日本語)", value: "ja" },
      ],
      default: "en",
    },
    privacy_status: {
      type: "string",
      label: "Privacy Status",
      options: [
        { label: "Public", value: "public" },
        { label: "Unlisted", value: "unlisted" },
        { label: "Private", value: "private" },
      ],
      default: "public",
    },
    content_category: {
      type: "string",
      label: "YouTube Category",
      options: [
        { label: "News & Politics", value: "25" },
        { label: "Education", value: "27" },
        { label: "Science & Technology", value: "28" },
        { label: "Entertainment", value: "24" },
      ],
      default: "25", // News & Politics
    },
    skip_ai_optimization: {
      type: "boolean",
      label: "Skip AI Optimization",
      description: "Use script generator title directly without AI enhancement",
      default: false,
    },
  },

  async run({ $ }) {
    // 입력 검증
    if (!this.video_url || this.video_url === 'undefined') {
      throw new Error("video_url is required");
    }

    $.export("status", "Preparing YouTube upload...");

    // 해시태그 파싱
    let hashtags = [];
    if (this.hashtags_json && this.hashtags_json !== 'undefined') {
      try {
        hashtags = JSON.parse(this.hashtags_json);
      } catch (e) {
        hashtags = [];
      }
    }

    let finalTitle = this.title || "Breaking News #Shorts";
    let finalDescription = "";
    let finalTags = [];

    // AI 최적화 또는 직접 사용
    if (!this.skip_ai_optimization && this.openai) {
      $.export("status", "Optimizing metadata with AI...");

      const langConfig = {
        en: "English-speaking",
        ko: "Korean",
        ja: "Japanese",
      };

      const optimizePrompt = `Create viral YouTube Shorts metadata for this news video.

CONTENT:
- Title: ${this.title || 'US Economic News'}
- Category: ${this.news_category || 'business'}
- Script preview: ${(this.full_script || '').substring(0, 500)}
- Existing hashtags: ${hashtags.join(', ')}

TARGET: ${langConfig[this.target_language] || 'English-speaking'} YouTube audience

REQUIREMENTS:
1. Title (max 100 chars):
   - Breaking news feel
   - Include 2-3 relevant hashtags
   - Create urgency
   - End with #Shorts

2. Description (max 500 chars):
   - Hook in first line
   - Key points summary
   - Call to action
   - Related hashtags

3. Tags (15-20 tags):
   - Mix of broad and specific
   - Include trending financial keywords
   - News-related tags

Return JSON only:
{
  "title": "Optimized title with hashtags",
  "description": "Full description",
  "tags": ["tag1", "tag2", ...]
}`;

      try {
        const aiResponse = await axios($, {
          url: "https://api.openai.com/v1/chat/completions",
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.openai.$auth.api_key}`,
            "Content-Type": "application/json",
          },
          data: {
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "You are a YouTube SEO expert for news content. Return valid JSON only." },
              { role: "user", content: optimizePrompt },
            ],
            temperature: 0.7,
            max_tokens: 1000,
          },
        });

        let content = aiResponse.choices[0].message.content.trim();
        if (content.startsWith("```")) {
          content = content.replace(/^```json?\s*/, "").replace(/\s*```$/, "");
        }
        const optimized = JSON.parse(content);

        finalTitle = optimized.title;
        finalDescription = optimized.description;
        finalTags = optimized.tags || [];

      } catch (e) {
        $.export("ai_error", e.message);
        // 폴백
        finalTitle = this.title || "Breaking: US Market News #Shorts";
        finalDescription = (this.full_script || '').substring(0, 300) + "\n\n#Shorts #News #Markets";
        finalTags = ["shorts", "news", "markets", "stocks", "economy", ...hashtags.map(h => h.replace('#', ''))];
      }
    } else {
      // 직접 사용
      finalTitle = (this.title || "Breaking News").includes("#Shorts")
        ? this.title
        : `${this.title || "Breaking News"} #Shorts`;
      finalDescription = `${(this.full_script || '').substring(0, 300)}\n\n${hashtags.join(' ')}\n\n#Shorts #News`;
      finalTags = ["shorts", "news", "breaking", ...hashtags.map(h => h.replace('#', ''))];
    }

    // 제목 길이 제한
    finalTitle = finalTitle.substring(0, 100);

    $.export("final_title", finalTitle);

    // 영상 다운로드
    $.export("status", "Downloading video...");

    const videoResponse = await axios($, {
      method: "GET",
      url: this.video_url,
      responseType: "arraybuffer",
    });

    const videoBuffer = Buffer.from(videoResponse);
    $.export("video_size", `${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    // YouTube 업로드
    $.export("status", "Uploading to YouTube...");

    const { google } = await import("googleapis");

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: this.youtube.$auth.oauth_access_token,
    });

    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    // 태그 처리 (최대 500자)
    let tags = finalTags;
    let tagsString = tags.join(",");
    if (tagsString.length > 500) {
      const shortenedTags = [];
      let currentLength = 0;
      for (const tag of tags) {
        if (currentLength + tag.length + 1 <= 500) {
          shortenedTags.push(tag);
          currentLength += tag.length + 1;
        } else break;
      }
      tags = shortenedTags;
    }

    // 업로드
    const { Readable } = await import("stream");
    const videoStream = new Readable();
    videoStream.push(videoBuffer);
    videoStream.push(null);

    const langCode = this.target_language === "ko" ? "ko" : this.target_language === "ja" ? "ja" : "en";

    const uploadResponse = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: finalTitle,
          description: finalDescription.substring(0, 5000),
          tags: tags,
          categoryId: this.content_category,
          defaultLanguage: langCode,
        },
        status: {
          privacyStatus: this.privacy_status,
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        mimeType: "video/mp4",
        body: videoStream,
      },
    });

    const videoId = uploadResponse.data.id;
    const youtubeUrl = `https://www.youtube.com/shorts/${videoId}`;

    $.export("$summary", `Uploaded to YouTube: ${youtubeUrl}`);

    return {
      success: true,
      video_id: videoId,
      video_url: youtubeUrl,
      shorts_url: `https://www.youtube.com/shorts/${videoId}`,
      watch_url: `https://www.youtube.com/watch?v=${videoId}`,
      studio_url: `https://studio.youtube.com/video/${videoId}/edit`,
      metadata: {
        title: finalTitle,
        description_preview: finalDescription.substring(0, 150) + "...",
        tags_count: tags.length,
        category_id: this.content_category,
        privacy: this.privacy_status,
        language: langCode,
      },
      uploaded_at: new Date().toISOString(),
    };
  },
});
