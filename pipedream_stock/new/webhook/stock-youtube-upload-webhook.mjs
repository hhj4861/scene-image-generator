/**
 * Stock YouTube Shorts Upload (Webhook Version)
 *
 * Workflow 3에서 사용 - VM Renderer 이후 최종 영상 업로드
 * LLM 기반 바이럴 메타데이터 최적화 포함
 *
 * 입력 경로: steps.trigger.event.body (VM Renderer 출력)
 */

import { axios } from "@pipedream/platform";

export default defineComponent({
  name: "Stock YouTube Upload (Webhook)",
  description: "Webhook 트리거용 - 주식 뉴스 Shorts 영상 YouTube 업로드 (LLM 바이럴 최적화)",

  props: {
    // =====================
    // YouTube 연결
    // =====================
    youtube: {
      type: "app",
      app: "youtube_data_api",
      description: "YouTube 채널 (Pipedream에서 연결)",
    },

    // =====================
    // Gemini API (바이럴 최적화)
    // =====================
    gemini_api_key: {
      type: "string",
      label: "Gemini API Key",
      description: "Google Gemini API Key (바이럴 메타데이터 생성용)",
      secret: true,
    },

    // =====================
    // Webhook 데이터
    // =====================
    webhook_data: {
      type: "string",
      label: "Webhook Data (JSON)",
      description: "Webhook으로 받은 전체 데이터: {{JSON.stringify(steps.trigger.event.body)}}",
    },

    // =====================
    // 메타데이터 설정
    // =====================
    channel_name: {
      type: "string",
      label: "채널명",
      description: "YouTube 채널 이름 (설명에 표시)",
      default: "주식뉴스",
    },
    title_style: {
      type: "string",
      label: "제목 스타일",
      description: "LLM이 생성할 제목의 스타일",
      options: [
        { label: "속보 스타일 (긴급함 강조)", value: "breaking" },
        { label: "분석 스타일 (인사이트 강조)", value: "analysis" },
        { label: "예측 스타일 (미래 전망)", value: "prediction" },
        { label: "교육 스타일 (정보 전달)", value: "educational" },
        { label: "자극적 스타일 (클릭베이트)", value: "clickbait" },
      ],
      default: "breaking",
    },
    skip_ai_optimization: {
      type: "boolean",
      label: "AI 최적화 스킵",
      description: "AI 최적화 없이 기본 메타데이터 사용",
      default: false,
    },

    // =====================
    // 카테고리 설정
    // =====================
    content_category: {
      type: "string",
      label: "Content Category",
      options: [
        { label: "News & Politics (뉴스/정치)", value: "25" },
        { label: "Education (교육)", value: "27" },
        { label: "Science & Technology (과학/기술)", value: "28" },
        { label: "People & Blogs (인물/블로그)", value: "22" },
        { label: "Entertainment (엔터테인먼트)", value: "24" },
      ],
      default: "25",
    },

    // =====================
    // 업로드 설정
    // =====================
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
    default_language: {
      type: "string",
      label: "Default Language",
      options: [
        { label: "Korean (한국어)", value: "ko" },
        { label: "English", value: "en" },
        { label: "Japanese (日本語)", value: "ja" },
      ],
      default: "ko",
    },

    // =====================
    // 해시태그 설정
    // =====================
    extra_hashtags: {
      type: "string",
      label: "추가 해시태그",
      description: "추가할 해시태그 (쉼표로 구분). 예: 삼성전자,테슬라,애플",
      optional: true,
    },
  },

  async run({ $ }) {
    console.log("📺 Stock YouTube Upload (Webhook) 시작");

    // =====================
    // 1. Webhook 데이터 파싱
    // =====================
    let data;
    try {
      data = typeof this.webhook_data === "string"
        ? JSON.parse(this.webhook_data)
        : this.webhook_data;
    } catch (e) {
      throw new Error("Webhook 데이터 파싱 실패: " + e.message);
    }

    // VM Renderer 출력 구조
    const videoUrl = data.output_url || data.url;
    const folderName = data.folder_name || "unknown";
    const shortsScript = data.shorts_script || {};
    const marketLabel = data.market_label || shortsScript.market_label || "글로벌";
    const analysisDate = data.analysis_date || new Date().toISOString().split("T")[0];

    if (!videoUrl) {
      throw new Error("video_url이 없습니다. VM Renderer 출력을 확인하세요.");
    }

    console.log(`📂 폴더: ${folderName}`);
    console.log(`🎥 영상: ${videoUrl}`);
    console.log(`📊 시장: ${marketLabel}`);

    // =====================
    // 2. LLM 바이럴 메타데이터 생성 (Gemini)
    // =====================

    // 대본 내용 추출
    const scenes = shortsScript.scenes || [];
    const fullScript = scenes.map(s => s.narration || "").filter(n => n).join("\n");
    const originalTitle = shortsScript.title || `${marketLabel} 주식 시장 뉴스`;
    const titleEnglish = shortsScript.title_english || "Stock Market News";
    const marketOutlook = data.source_summary?.market_outlook || shortsScript.market_outlook || "neutral";

    let finalTitle, description, tags;

    // AI 최적화 스킵 여부
    if (this.skip_ai_optimization) {
      console.log("⏭️ AI 최적화 스킵 - 기본 메타데이터 사용");

      finalTitle = `${originalTitle} #Shorts`.substring(0, 100);

      const baseHashtags = ["#주식", "#투자", "#shorts", "#주식뉴스", "#경제"];
      description = `📊 ${originalTitle}\n\n${fullScript.substring(0, 300)}...\n\n${baseHashtags.join(" ")}\n\n📺 ${this.channel_name}`;

      tags = ["주식", "투자", "증시", "shorts", "경제", marketLabel];

      $.export("ai_optimization", "skipped");
    } else {
      // =====================
      // Gemini API로 바이럴 메타데이터 생성
      // =====================
      console.log("🤖 Gemini로 바이럴 메타데이터 생성 중...");

      // 제목 스타일별 프롬프트
      const stylePrompts = {
        breaking: "긴급 속보처럼 충격적이고 긴박한 느낌으로",
        analysis: "전문가 분석 인사이트를 강조하며 신뢰감 있게",
        prediction: "미래 전망과 예측을 강조하며 궁금증 유발",
        educational: "유익한 정보를 쉽게 전달하는 교육적인 느낌으로",
        clickbait: "클릭을 유도하는 자극적이고 호기심을 자극하는 스타일로",
      };

      const styleInstruction = stylePrompts[this.title_style] || stylePrompts.breaking;

      const viralPrompt = `당신은 YouTube Shorts 바이럴 전문가입니다. 주식/투자 콘텐츠의 조회수를 극대화하는 메타데이터를 생성해야 합니다.

## 대본 내용:
${fullScript.substring(0, 1500)}

## 원본 제목:
- 한글: ${originalTitle}
- 영어: ${titleEnglish}

## 시장 정보:
- 시장: ${marketLabel}
- 전망: ${marketOutlook}
- 날짜: ${analysisDate}

## 요청 스타일: ${styleInstruction}

## 생성 규칙:

### 1. 제목 (title)
- ${styleInstruction}
- 50-70자 이내 (너무 짧으면 안됨)
- 이모지 1-2개 필수 사용 (📈📉🚀💰🔥⚡️💎 등)
- 숫자/퍼센트가 있으면 강조
- 호기심/긴박감 유발하는 문구 사용
- 예시: "🔥 테슬라 20% 폭락, 개미들 멘붕..." / "💰 워런 버핏이 숨긴 종목 공개됐다"

### 2. 설명 (description)
- 첫 2줄이 가장 중요 (미리보기에 표시됨)
- 핵심 내용 요약 + 궁금증 유발
- 구독/좋아요 CTA 포함
- 관련 해시태그 15-20개 포함
- 한글/영어 섹션 구분

### 3. 해시태그 (hashtags)
- 20개 생성
- 트렌딩 키워드 포함: 주식, 투자, shorts, 경제, 증시
- 대본에서 언급된 종목/키워드 포함
- 영어 해시태그도 5개 이상 포함

### 4. 태그 (tags)
- YouTube 검색용 태그 25개
- # 없이 단어만
- 연관 검색어, 경쟁 키워드 포함

## 출력 형식 (JSON만 출력):
{
  "title": "바이럴 최적화된 제목 (이모지 포함)",
  "description": "전체 설명 텍스트",
  "hashtags": ["#해시태그1", "#해시태그2", ...],
  "tags": ["태그1", "태그2", ...],
  "hook_line": "첫 줄 훅 문장",
  "viral_score": 1-100
}`;

      try {
        const geminiResponse = await axios($, {
          method: "POST",
          url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.gemini_api_key}`,
          headers: { "Content-Type": "application/json" },
          data: {
            contents: [{ parts: [{ text: viralPrompt }] }],
            generationConfig: {
              temperature: 0.9,
              maxOutputTokens: 2000,
              responseMimeType: "application/json",
            },
          },
        });

        const responseText = geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text || "";
        let viralData;

        try {
          // JSON 파싱
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          viralData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch (parseErr) {
          console.log("⚠️ JSON 파싱 실패, 기본값 사용");
          viralData = null;
        }

        if (viralData) {
          console.log(`✅ 바이럴 메타데이터 생성 완료 (점수: ${viralData.viral_score || "N/A"})`);

          // 제목 처리
          finalTitle = viralData.title || originalTitle;
          if (!finalTitle.includes("#Shorts")) {
            finalTitle = `${finalTitle} #Shorts`;
          }
          finalTitle = finalTitle.substring(0, 100);

          // 설명 처리
          const hashtagString = (viralData.hashtags || []).slice(0, 20).join(" ");
          description = viralData.description || `📊 ${originalTitle}`;

          // 설명에 해시태그 없으면 추가
          if (!description.includes("#")) {
            description = `${description}\n\n${hashtagString}`;
          }

          // 채널명 추가
          if (!description.includes(this.channel_name)) {
            description = `${description}\n\n📺 ${this.channel_name}`;
          }

          // 태그 처리
          tags = viralData.tags || ["주식", "투자", "shorts"];

          $.export("ai_optimization", {
            success: true,
            viral_score: viralData.viral_score,
            hook_line: viralData.hook_line,
            hashtags_count: (viralData.hashtags || []).length,
            tags_count: tags.length,
          });
        } else {
          throw new Error("Gemini 응답 파싱 실패");
        }

      } catch (aiError) {
        console.log(`⚠️ AI 최적화 실패: ${aiError.message}, 기본값 사용`);

        // 폴백: 기본 메타데이터
        finalTitle = `📊 ${originalTitle} #Shorts`.substring(0, 100);

        const fallbackHashtags = [
          "#주식", "#투자", "#주식투자", "#증시", "#stockmarket",
          "#shorts", "#주식뉴스", "#경제", "#finance", "#trading",
          `#${marketLabel.replace(/\s/g, "")}`,
        ];

        description = `📊 ${originalTitle}

${fullScript.substring(0, 300)}...

━━━━━━━━━━━━━━━━━━━━━━━
📊 ${marketLabel} 시장 분석 | ${analysisDate}
━━━━━━━━━━━━━━━━━━━━━━━

🔔 구독과 좋아요 부탁드려요!
💬 댓글로 의견 남겨주세요!

${fallbackHashtags.join(" ")}

━━━━━━━━━━━━━━━━━━━━━━━
🇺🇸 ${titleEnglish}
#Shorts #StockMarket #Trading #Finance

📺 ${this.channel_name}`;

        tags = [
          "주식", "투자", "증시", "경제뉴스", "주식시장",
          "stock", "trading", "finance", "investment",
          marketLabel, this.channel_name,
        ];

        $.export("ai_optimization", {
          success: false,
          error: aiError.message,
          fallback: true,
        });
      }
    }

    // 추가 해시태그 병합
    if (this.extra_hashtags) {
      const extraTags = this.extra_hashtags.split(",").map(h => h.trim().replace("#", ""));
      tags = [...new Set([...tags, ...extraTags])];
    }

    $.export("metadata", {
      title: finalTitle,
      description_preview: description.substring(0, 200),
      tags_count: tags.length,
    });

    // =====================
    // 3. 영상 다운로드
    // =====================
    console.log("📥 영상 다운로드 중...");

    const videoResponse = await axios($, {
      method: "GET",
      url: videoUrl,
      responseType: "arraybuffer",
      timeout: 300000, // 5분
    });

    const videoBuffer = Buffer.from(videoResponse);
    const videoSizeMB = (videoBuffer.length / 1024 / 1024).toFixed(2);
    console.log(`📦 영상 크기: ${videoSizeMB} MB`);

    $.export("video_size", `${videoSizeMB} MB`);

    // =====================
    // 4. YouTube 업로드
    // =====================
    console.log("📤 YouTube 업로드 중...");

    // YouTube API 설정
    const { google } = await import("googleapis");

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: this.youtube.$auth.oauth_access_token,
    });

    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    // 태그 500자 제한 처리
    let finalTags = tags;
    let tagsString = finalTags.join(",");
    if (tagsString.length > 500) {
      const shortenedTags = [];
      let currentLength = 0;
      for (const tag of finalTags) {
        if (currentLength + tag.length + 1 <= 500) {
          shortenedTags.push(tag);
          currentLength += tag.length + 1;
        } else {
          break;
        }
      }
      finalTags = shortenedTags;
    }

    // 업로드 스트림 생성
    const { Readable } = await import("stream");
    const videoStream = new Readable();
    videoStream.push(videoBuffer);
    videoStream.push(null);

    // 업로드 실행
    const uploadResponse = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: finalTitle,
          description: description.substring(0, 5000),
          tags: finalTags,
          categoryId: this.content_category,
          defaultLanguage: this.default_language,
        },
        status: {
          privacyStatus: this.privacy_status,
          selfDeclaredMadeForKids: this.made_for_kids,
        },
      },
      media: {
        mimeType: "video/mp4",
        body: videoStream,
      },
    });

    const videoId = uploadResponse.data.id;
    const youtubeUrl = `https://www.youtube.com/shorts/${videoId}`;

    console.log(`✅ 업로드 완료!`);
    console.log(`🔗 URL: ${youtubeUrl}`);

    // =====================
    // 5. 결과 반환
    // =====================
    const result = {
      success: true,
      video_id: videoId,
      video_url: youtubeUrl,
      shorts_url: `https://www.youtube.com/shorts/${videoId}`,
      watch_url: `https://www.youtube.com/watch?v=${videoId}`,
      studio_url: `https://studio.youtube.com/video/${videoId}/edit`,

      // 메타데이터 (바이럴 최적화 결과)
      metadata: {
        title: finalTitle,
        description_preview: description.substring(0, 300),
        description_length: description.length,
        tags_count: finalTags.length,
        tags_sample: finalTags.slice(0, 10),
        category_id: this.content_category,
        privacy: this.privacy_status,
        language: this.default_language,
        ai_optimized: !this.skip_ai_optimization,
        title_style: this.title_style,
      },

      // 원본 정보
      source: {
        folder_name: folderName,
        market_label: marketLabel,
        analysis_date: analysisDate,
        video_size_mb: videoSizeMB,
        original_title: originalTitle,
      },

      uploaded_at: new Date().toISOString(),
    };

    $.export("upload_result", result);
    $.export("youtube_url", youtubeUrl);
    $.export("final_title", finalTitle);
    $.export("$summary", `YouTube 업로드 완료: ${finalTitle.substring(0, 50)}...`);

    return result;
  },
});
