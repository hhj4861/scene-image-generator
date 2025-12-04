import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "YouTube Shorts Upload",
  description: "Upload video to YouTube with AI-optimized title, description, and tags for maximum exposure",

  props: {
    // YouTube 연결
    youtube: {
      type: "app",
      app: "youtube_data_api",
      description: "기본 YouTube 채널 (Pipedream에서 연결 시 채널 선택)",
    },

    // 두 번째 채널 (선택)
    youtube_channel_2: {
      type: "app",
      app: "youtube_data_api",
      label: "YouTube Channel 2 (Optional)",
      description: "두 번째 YouTube 채널 (다른 채널에 업로드하려면 여기 연결)",
      optional: true,
    },

    // 채널 선택
    use_channel: {
      type: "string",
      label: "Upload to Channel",
      description: "어느 채널에 업로드할지 선택",
      options: [
        { label: "Channel 1 (기본)", value: "channel_1" },
        { label: "Channel 2", value: "channel_2" },
      ],
      default: "channel_1",
    },

    // OpenAI 연결 (메타데이터 최적화용)
    openai: {
      type: "app",
      app: "openai",
      optional: true,
    },

    // ★★★ FFmpeg 출력 (youtube_metadata 포함) ★★★
    ffmpeg_output: {
      type: "string",
      label: "FFmpeg Output (JSON)",
      description: "{{JSON.stringify(steps.Puppy_FFmpeg.$return_value)}}",
      optional: true,
    },

    // 입력 데이터 (레거시 - FFmpeg 출력이 없을 때 사용)
    video_url: {
      type: "string",
      label: "Video URL",
      description: "GCS URL of the final video to upload (FFmpeg output이 없을 때 사용)",
      optional: true,
    },
    original_title: {
      type: "string",
      label: "Original Title",
      description: "Original title from script generator (JSON with japanese/korean/english)",
      optional: true,
    },
    script_text: {
      type: "string",
      label: "Script Text",
      description: "Full script text for AI analysis",
      optional: true,
    },
    hashtags: {
      type: "string",
      label: "Hashtags JSON",
      description: "Hashtags from script generator",
      optional: true,
    },
    topic_keywords: {
      type: "string",
      label: "Topic Keywords",
      description: "{{steps.Topic_Keyword_Generator.$return_value.keywords}}",
      optional: true,
    },
    // ★ 풍자 모드 정보 (Script Generator에서 가져옴)
    is_satire: {
      type: "boolean",
      label: "Is Satire Content",
      description: "{{steps.Shorts_Script_Generator.$return_value.topic_info.is_satire}}",
      default: false,
      optional: true,
    },
    channel_name: {
      type: "string",
      label: "Channel Name (하단 표시용)",
      description: "예: 땅콩이네",
      default: "땅콩이네",
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
    skip_ai_optimization: {
      type: "boolean",
      label: "Skip AI Optimization",
      description: "Skip OpenAI SEO optimization and use Script Generator's title/hashtags directly",
      default: false,
    },
  },

  async run({ steps, $ }) {
    // =====================
    // 0. 입력값 검증 및 FFmpeg 출력 파싱
    // =====================

    // ★★★ FFmpeg 출력에서 youtube_metadata 추출 ★★★
    let ffmpegData = null;
    let youtubeMetadata = null;
    let generatedTitles = null;

    if (this.ffmpeg_output && this.ffmpeg_output !== 'undefined' && this.ffmpeg_output !== 'null') {
      try {
        ffmpegData = typeof this.ffmpeg_output === 'string'
          ? JSON.parse(this.ffmpeg_output) : this.ffmpeg_output;
        youtubeMetadata = ffmpegData.youtube_metadata || null;
        generatedTitles = ffmpegData.generated_titles || null;
        $.export("ffmpeg_data_source", "Parsed from FFmpeg output");
      } catch (e) {
        $.export("ffmpeg_parse_error", e.message);
      }
    }

    $.export("has_youtube_metadata", !!youtubeMetadata);

    // video_url: FFmpeg 출력 우선, 그 다음 직접 입력
    let videoUrl = ffmpegData?.url || this.video_url;
    if (!videoUrl || videoUrl === 'undefined' || videoUrl === 'null') {
      throw new Error(`video_url is required. Received: ${videoUrl}. Connect FFmpeg output: {{JSON.stringify(steps.Puppy_FFmpeg.$return_value)}}`);
    }

    // URL 형식 검증
    if (!videoUrl.startsWith('http://') && !videoUrl.startsWith('https://')) {
      throw new Error(`Invalid video_url format: ${videoUrl}. Must be a valid HTTP(S) URL.`);
    }

    $.export("input_video_url", videoUrl);

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

    // original_title 검증 및 파싱
    let originalTitleObj = {};
    const rawTitle = this.original_title;

    if (!rawTitle || rawTitle === 'undefined' || rawTitle === 'null') {
      // title이 없으면 script에서 추출 시도
      const scriptPreview = (this.script_text || '').substring(0, 50);
      originalTitleObj = {
        japanese: scriptPreview || "Video",
        korean: scriptPreview || "Video",
        english: scriptPreview || "Video",
      };
      $.export("title_source", "Generated from script (original_title was empty)");
    } else {
      try {
        originalTitleObj = typeof rawTitle === 'string'
          ? JSON.parse(rawTitle)
          : rawTitle;
        $.export("title_source", "Parsed from original_title");
      } catch (e) {
        // JSON 파싱 실패 시 문자열 그대로 사용
        originalTitleObj = {
          japanese: rawTitle,
          korean: rawTitle,
          english: rawTitle,
          title: rawTitle,
        };
        $.export("title_source", "Used original_title as string (JSON parse failed)");
      }
    }

    $.export("parsed_title", JSON.stringify(originalTitleObj).substring(0, 200));

    // hashtags 검증 및 파싱
    let hashtagsObj = {};
    const rawHashtags = this.hashtags;

    if (rawHashtags && rawHashtags !== 'undefined' && rawHashtags !== 'null') {
      try {
        hashtagsObj = typeof rawHashtags === 'string' ? JSON.parse(rawHashtags) : rawHashtags;
      } catch (e) {
        // 파싱 실패 시 빈 객체
        hashtagsObj = {};
      }
    }

    // Topic Keywords 파싱 (콤마로 구분된 문자열)
    const topicKeywords = this.topic_keywords
      ? this.topic_keywords.split(',').map(k => k.trim()).filter(k => k)
      : [];

    $.export("topic_keywords", topicKeywords);

    // 바이럴 핫키워드 (고정)
    const viralKeywords = [
      "강아지", "반려견", "puppy", "dog", "귀여움", "cute", "애견", "펫",
      "힐링", "일상", "브이로그", "vlog", "shorts", "쇼츠", "viral"
    ];

    // 채널명 해시태그
    const channelHashtag = this.channel_name ? this.channel_name.replace(/\s+/g, '') : "땅콩이네";

    let optimizedMetadata;

    // =====================
    // ★★★ AI 생성 youtube_metadata 우선 사용 ★★★
    // =====================
    if (youtubeMetadata && youtubeMetadata.title) {
      $.export("status", "Using AI-generated youtube_metadata from Viral Title Generator...");

      // youtube_metadata에서 직접 사용
      const metaTitle = youtubeMetadata.title || generatedTitles?.header_korean || "Video";
      const metaDescription = youtubeMetadata.description || "";
      const metaHashtags = youtubeMetadata.hashtags || [];
      const metaHashtagsString = youtubeMetadata.hashtags_string || metaHashtags.join(' ');

      // #Shorts 해시태그 추가
      const titleWithShorts = metaTitle.includes("#Shorts") ? metaTitle : `${metaTitle} #Shorts`;

      // ★ 풍자 콘텐츠일 때 면책 문구 추가
      const satireDisclaimer = this.is_satire
        ? "\n\n⚠️ 본 영상은 실제 사건을 바탕으로 한 풍자/패러디 콘텐츠입니다."
        : "";

      // 설명 조합: AI 생성 설명 + 해시태그 + 채널명 + 면책문구
      const fullDescription = `${metaDescription}\n\n${metaHashtagsString}\n\n🐕 ${channelHashtag}${satireDisclaimer}`;

      // 태그 추출 (# 제거)
      const tagsFromHashtags = metaHashtags.map(h => h.replace('#', ''));

      optimizedMetadata = {
        optimized_title: titleWithShorts.substring(0, 100),
        optimized_description: fullDescription.substring(0, 5000),
        tags: [...new Set([
          ...tagsFromHashtags,
          ...viralKeywords.slice(0, 5),
          channelHashtag,
          'shorts', 'viral',
          ...(this.is_satire ? ['풍자', '패러디', 'satire', 'parody'] : [])
        ])],
        seo_score: "AI Generated",
        predicted_performance: "AI Generated",
        source: "youtube_metadata",
      };

      $.export("optimization_mode", "AI Generated (Viral Title)");
      $.export("youtube_metadata_used", {
        title: metaTitle,
        hashtags_count: metaHashtags.length,
      });
    }
    // =====================
    // AI 최적화 스킵 옵션 (레거시)
    // =====================
    else if (this.skip_ai_optimization) {
      $.export("status", "Using Script Generator metadata directly (AI optimization skipped)...");

      // Script Generator의 title/hashtags 직접 사용
      const directTitle = originalTitleObj[this.target_language] || originalTitleObj.japanese || originalTitleObj.korean || originalTitleObj.english || "Video";
      const directHashtags = hashtagsObj[this.target_language] || hashtagsObj.japanese || hashtagsObj.english || [];

      // ★ 해시태그 조합: Topic Keywords + 바이럴 키워드 + 채널명 (중복 제거)
      const allHashtags = [
        ...topicKeywords.map(k => `#${k.replace('#', '')}`),
        ...viralKeywords.slice(0, 5).map(k => `#${k}`),
        `#${channelHashtag}`,
        '#Shorts',
      ];
      const uniqueHashtags = [...new Set(allHashtags)];

      // #Shorts 해시태그 추가
      const titleWithShorts = directTitle.includes("#Shorts") ? directTitle : `${directTitle} #Shorts`;

      // ★ 풍자 콘텐츠일 때 면책 문구 추가
      const satireDisclaimer = this.is_satire
        ? "\n\n⚠️ 본 영상은 실제 사건을 바탕으로 한 풍자/패러디 콘텐츠입니다."
        : "";

      optimizedMetadata = {
        optimized_title: titleWithShorts.substring(0, 100),
        optimized_description: `${this.script_text?.substring(0, 300) || ''}\n\n${uniqueHashtags.join(' ')}\n\n🐕 ${channelHashtag}${satireDisclaimer}`,
        tags: [...new Set([
          ...topicKeywords.map(h => h.replace('#', '')),
          ...viralKeywords,
          channelHashtag,
          'shorts', 'viral',
          ...(this.is_satire ? ['풍자', '패러디', 'satire', 'parody'] : [])
        ])],
        seo_score: "N/A (skipped)",
        predicted_performance: "N/A (skipped)",
      };

      $.export("optimization_mode", "Direct (AI skipped)");
      $.export("generated_hashtags", uniqueHashtags);
    } else if (this.openai) {
      // =====================
      // AI로 메타데이터 최적화
      // =====================
      $.export("status", "Optimizing metadata with AI...");

      const optimizationPrompt = `You are a YouTube SEO expert specializing in viral Shorts content. Your goal is to maximize views, engagement, and algorithm favorability.

## INPUT DATA:
- Original Title: ${JSON.stringify(originalTitleObj)}
- Script: ${(this.script_text || '').substring(0, 1000)}
- Existing Hashtags: ${JSON.stringify(hashtagsObj)}
- Topic Keywords (MUST include): ${topicKeywords.join(', ')}
- Viral Keywords (reference): ${viralKeywords.slice(0, 8).join(', ')}
- Channel Name: ${channelHashtag}
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
          optimized_description: (this.script_text || '').substring(0, 500) + "\n\n#Shorts",
          tags: ["shorts", "viral", "trending"],
        };
      }

      $.export("optimization_mode", "AI Optimized");
    } else {
      // =====================
      // OpenAI 없고 youtube_metadata도 없는 경우 기본 폴백
      // =====================
      $.export("status", "Using basic fallback metadata (no OpenAI, no youtube_metadata)...");

      const fallbackTitle = originalTitleObj[this.target_language] || originalTitleObj.korean || originalTitleObj.japanese || "Video";
      const titleWithShorts = fallbackTitle.includes("#Shorts") ? fallbackTitle : `${fallbackTitle} #Shorts`;

      optimizedMetadata = {
        optimized_title: titleWithShorts.substring(0, 100),
        optimized_description: `${this.script_text?.substring(0, 300) || ''}\n\n#Shorts #강아지 #puppy\n\n🐕 ${channelHashtag}`,
        tags: [...viralKeywords.slice(0, 10), channelHashtag, 'shorts', 'viral'],
        seo_score: "N/A (basic fallback)",
        predicted_performance: "N/A (basic fallback)",
      };

      $.export("optimization_mode", "Basic Fallback");
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
      url: videoUrl,
      responseType: "arraybuffer",
    });

    const videoBuffer = Buffer.from(videoResponse);
    $.export("video_size", `${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);

    // =====================
    // 3. YouTube 업로드
    // =====================
    $.export("status", "Uploading to YouTube...");

    // 채널 선택 로직
    let selectedChannel = this.youtube;
    let channelName = "Channel 1 (기본)";

    if (this.use_channel === "channel_2" && this.youtube_channel_2) {
      selectedChannel = this.youtube_channel_2;
      channelName = "Channel 2";
    } else if (this.use_channel === "channel_2" && !this.youtube_channel_2) {
      $.export("channel_warning", "Channel 2 선택되었지만 연결되지 않음. Channel 1로 업로드합니다.");
    }

    $.export("upload_channel", channelName);

    // YouTube Data API를 사용한 resumable upload
    const { google } = await import("googleapis");

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: selectedChannel.$auth.oauth_access_token,
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
    const youtubeUrl = `https://www.youtube.com/shorts/${videoId}`;

    $.export("$summary", `Uploaded to YouTube (${channelName}): ${youtubeUrl}`);

    // =====================
    // 4. 결과 반환
    // =====================
    return {
      success: true,
      video_id: videoId,
      video_url: youtubeUrl,
      shorts_url: `https://www.youtube.com/shorts/${videoId}`,
      watch_url: `https://www.youtube.com/watch?v=${videoId}`,
      studio_url: `https://studio.youtube.com/video/${videoId}/edit`,
      uploaded_channel: channelName,
      metadata: {
        title: optimizedMetadata.optimized_title,
        description_preview: optimizedMetadata.optimized_description.substring(0, 200) + "...",
        tags_count: tags.length,
        category_id: this.content_category,
        privacy: this.privacy_status,
        source: optimizedMetadata.source || "openai_or_fallback",
      },
      ai_insights: {
        seo_score: optimizedMetadata.seo_score,
        predicted_performance: optimizedMetadata.predicted_performance,
        thumbnail_suggestion: optimizedMetadata.thumbnail_text_suggestion,
        best_upload_times: optimizedMetadata.best_upload_times,
        optimization_notes: optimizedMetadata.optimization_notes,
      },
      // ★★★ FFmpeg 데이터 포함 (재사용 가능) ★★★
      ffmpeg_info: ffmpegData ? {
        folder_name: ffmpegData.folder_name,
        total_duration: ffmpegData.total_duration,
        render_engine: ffmpegData.render_engine,
      } : null,
      uploaded_at: new Date().toISOString(),
    };
  },
});
