import { axios } from "@pipedream/platform"

export default defineComponent({
  name: "Japan YouTube Shorts Content Analyzer",
  description: "일본 YouTube 쇼츠 시장 분석 및 콘텐츠 추천 - 트렌드, 키워드, 콘텐츠 아이디어 생성",
  type: "action",
  props: {
    youtube_data_api: {
      type: "app",
      app: "youtube_data_api",
    },
    openai: {
      type: "app",
      app: "openai",
    },
    category: {
      type: "string",
      label: "Content Category",
      description: "분석할 콘텐츠 카테고리",
      options: [
        { label: "All (전체)", value: "0" },
        { label: "Entertainment (엔터테인먼트)", value: "24" },
        { label: "Gaming (게임)", value: "20" },
        { label: "Music (음악)", value: "10" },
        { label: "Comedy (코미디)", value: "23" },
        { label: "People & Blogs (사람/블로그)", value: "22" },
        { label: "Howto & Style (하우투/스타일)", value: "26" },
        { label: "Science & Tech (과학/기술)", value: "28" },
      ],
      default: "0",
    },
  },
  async run({ $ }) {
    // 1. 일본 인기 영상 가져오기
    const popularVideosParams = {
      part: "snippet,statistics,contentDetails",
      chart: "mostPopular",
      regionCode: "JP",
      maxResults: 10,
    };

    if (this.category !== "0") {
      popularVideosParams.videoCategoryId = this.category;
    }

    const popularResponse = await axios($, {
      url: "https://www.googleapis.com/youtube/v3/videos",
      headers: {
        Authorization: `Bearer ${this.youtube_data_api.$auth.oauth_access_token}`,
      },
      params: popularVideosParams,
    });

    // 2. 일본 쇼츠 트렌드 검색 (shorts 키워드로 검색)
    const shortsSearchResponse = await axios($, {
      url: "https://www.googleapis.com/youtube/v3/search",
      headers: {
        Authorization: `Bearer ${this.youtube_data_api.$auth.oauth_access_token}`,
      },
      params: {
        part: "snippet",
        q: "#shorts 人気",
        type: "video",
        regionCode: "JP",
        relevanceLanguage: "ja",
        maxResults: 10,
        order: "viewCount",
        publishedAfter: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 최근 7일
        videoDuration: "short", // 4분 미만 영상
      },
    });

    // 3. 일본 트렌드 키워드 검색
    const trendingKeywords = [
      "アニメ shorts", // 애니메이션
      "面白い shorts", // 재미있는
      "癒し shorts", // 힐링
      "vlog 日本",
      "ゲーム実況 shorts",
    ];

    const trendingSearches = await Promise.all(
      trendingKeywords.slice(0, 3).map(async (keyword) => {
        try {
          const response = await axios($, {
            url: "https://www.googleapis.com/youtube/v3/search",
            headers: {
              Authorization: `Bearer ${this.youtube_data_api.$auth.oauth_access_token}`,
            },
            params: {
              part: "snippet",
              q: keyword,
              type: "video",
              regionCode: "JP",
              maxResults: 5,
              order: "viewCount",
              publishedAfter: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            },
          });
          return { keyword, videos: response.items || [] };
        } catch (e) {
          return { keyword, videos: [] };
        }
      })
    );

    // 데이터 정리
    const popularVideos = popularResponse.items || [];
    const shortsVideos = shortsSearchResponse.items || [];

    // OpenAI 분석을 위한 데이터 준비
    const analysisData = {
      popularVideos: popularVideos.map((v) => ({
        title: v.snippet.title,
        description: v.snippet.description?.substring(0, 300),
        tags: v.snippet.tags?.slice(0, 10) || [],
        viewCount: v.statistics?.viewCount,
        likeCount: v.statistics?.likeCount,
        channelTitle: v.snippet.channelTitle,
      })),
      shortsVideos: shortsVideos.map((v) => ({
        title: v.snippet.title,
        description: v.snippet.description?.substring(0, 200),
        channelTitle: v.snippet.channelTitle,
      })),
      trendingByKeyword: trendingSearches.map((t) => ({
        keyword: t.keyword,
        topVideos: t.videos.slice(0, 3).map((v) => v.snippet?.title),
      })),
    };

    // 4. OpenAI GPT로 심층 분석 및 콘텐츠 추천
    const prompt = `You are a Japanese YouTube Shorts content strategist. Analyze the following data from the Japanese YouTube market and provide actionable content recommendations.

## Current Market Data:
${JSON.stringify(analysisData, null, 2)}

## Task:
Provide a comprehensive analysis in the following JSON format. ALL text content must be in Korean (한국어) for the user, but keywords should include both Japanese and English versions.

{
  "market_analysis": {
    "current_trends": ["현재 일본에서 인기있는 트렌드 3-5개"],
    "audience_preferences": ["일본 시청자 선호도 특징 3개"],
    "peak_content_types": ["가장 인기있는 콘텐츠 유형 3개"]
  },
  "recommended_keywords": [
    {
      "keyword_jp": "일본어 키워드",
      "keyword_en": "English keyword",
      "keyword_kr": "한국어 설명",
      "search_volume": "high/medium/low",
      "competition": "high/medium/low",
      "recommendation_score": 1-10,
      "reason": "추천 이유 (한국어)"
    }
  ],
  "content_ideas": [
    {
      "title_jp": "일본어 제목 예시",
      "title_kr": "한국어 제목 설명",
      "concept": "콘텐츠 컨셉 설명 (한국어)",
      "target_emotion": "타겟 감정 (예: 힐링, 웃음, 감동)",
      "visual_style": "영상 스타일 추천",
      "hashtags": ["#shorts", "#추천해시태그"],
      "estimated_appeal": "high/medium/low"
    }
  ],
  "shorts_specific_tips": [
    "쇼츠 제작 팁 (한국어) - 일본 시장 특화"
  ],
  "best_posting_times": {
    "weekday": "평일 최적 시간 (JST)",
    "weekend": "주말 최적 시간 (JST)",
    "reason": "이유"
  },
  "avoid_topics": ["피해야 할 주제들"],
  "anime_style_recommendations": {
    "popular_genres": ["인기 애니메이션 장르"],
    "visual_elements": ["추천 비주얼 요소"],
    "storytelling_tips": ["스토리텔링 팁"]
  }
}

Focus on:
1. 일본 시청자들이 좋아하는 감성적 요소 (癒し/힐링, 可愛い/귀여움, 面白い/재미)
2. 애니메이션 스타일 콘텐츠의 잠재력
3. 쇼츠 특화 전략 (첫 1초의 중요성, 세로 화면 최적화)
4. 일본 특유의 문화적 요소 반영

Return ONLY valid JSON, no markdown formatting.`;

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
            content: "You are an expert Japanese YouTube market analyst and content strategist. Provide detailed, actionable insights. Always respond with valid JSON only. All explanations should be in Korean (한국어).",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 3000,
      },
    });

    let analysis;
    try {
      let responseContent = aiResponse.choices[0].message.content.trim();

      // Remove markdown code blocks if present
      if (responseContent.startsWith("```json")) {
        responseContent = responseContent.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (responseContent.startsWith("```")) {
        responseContent = responseContent.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        responseContent = jsonMatch[0];
      }

      analysis = JSON.parse(responseContent);
    } catch (error) {
      console.error("Parse error:", error.message);
      // Fallback analysis
      analysis = {
        market_analysis: {
          current_trends: ["애니메이션 콘텐츠", "힐링/ASMR", "게임 클립"],
          audience_preferences: ["짧고 임팩트 있는 콘텐츠", "귀여운 캐릭터", "감성적 스토리"],
          peak_content_types: ["애니메이션", "Vlog", "게임"],
        },
        recommended_keywords: [
          {
            keyword_jp: "癒し",
            keyword_en: "healing",
            keyword_kr: "힐링",
            search_volume: "high",
            competition: "medium",
            recommendation_score: 8,
            reason: "일본 시청자들이 가장 선호하는 감성",
          },
        ],
        content_ideas: [
          {
            title_jp: "心が落ち着くアニメーション",
            title_kr: "마음이 편안해지는 애니메이션",
            concept: "로파이 음악과 함께하는 힐링 애니메이션",
            target_emotion: "힐링",
            visual_style: "파스텔톤 애니메이션",
            hashtags: ["#shorts", "#癒し", "#アニメ"],
            estimated_appeal: "high",
          },
        ],
        shorts_specific_tips: [
          "첫 1초에 시선을 사로잡는 장면 배치",
          "자막은 크고 읽기 쉽게",
          "BGM은 저작권 프리 J-POP 스타일 추천",
        ],
        error: `Analysis parsing failed: ${error.message}`,
      };
    }

    // 5. 결과 정리
    const result = {
      timestamp: new Date().toISOString(),
      region: "JP (Japan)",
      category: this.category === "0" ? "All" : this.category,

      // 원본 데이터 요약
      raw_data_summary: {
        popular_videos_count: popularVideos.length,
        shorts_videos_count: shortsVideos.length,
        top_popular_titles: popularVideos.slice(0, 5).map((v) => v.snippet.title),
        top_shorts_titles: shortsVideos.slice(0, 5).map((v) => v.snippet?.title),
      },

      // AI 분석 결과
      analysis: analysis,

      // 즉시 사용 가능한 추천
      quick_recommendations: {
        top_3_keywords: analysis.recommended_keywords?.slice(0, 3) || [],
        best_content_idea: analysis.content_ideas?.[0] || null,
        must_use_hashtags: ["#shorts", "#日本", "#おすすめ", "#fyp"],
      },
    };

    $.export("$summary",
      `일본 YouTube 분석 완료: ${popularVideos.length}개 인기영상, ${shortsVideos.length}개 쇼츠 분석, ${analysis.recommended_keywords?.length || 0}개 키워드 추천`
    );

    return result;
  },
});
