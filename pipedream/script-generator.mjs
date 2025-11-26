import { axios } from "@pipedream/platform"

export default defineComponent({
  name: "Shorts Script Generator",
  description: "추출된 키워드를 기반으로 일본 YouTube 쇼츠용 대본 생성 (OpenAI GPT)",
  type: "action",
  props: {
    openai: {
      type: "app",
      app: "openai",
    },
    keywords: {
      type: "string",
      label: "Keywords",
      description: "콘텐츠 키워드 (콤마로 구분) - 예: 힐링, 애니메이션, 자기계발",
    },
    content_style: {
      type: "string",
      label: "Content Style",
      description: "콘텐츠 스타일",
      options: [
        { label: "Motivational (동기부여/자기계발)", value: "motivational" },
        { label: "Healing (힐링/감성)", value: "healing" },
        { label: "Story (스토리/서사)", value: "story" },
        { label: "Comedy (코미디/유머)", value: "comedy" },
        { label: "Educational (교육/정보)", value: "educational" },
        { label: "ASMR/Relaxing (ASMR/릴렉싱)", value: "asmr" },
        { label: "Daily Life (일상/Vlog)", value: "daily" },
        { label: "Cute (귀여운/사랑스러운)", value: "cute" },
        { label: "Pet (반려동물/강아지/고양이)", value: "pet" },
      ],
      default: "motivational",
    },
    target_emotion: {
      type: "string",
      label: "Target Emotion",
      description: "타겟 감정",
      options: [
        { label: "감동 (Touching)", value: "touching" },
        { label: "힐링 (Healing)", value: "healing" },
        { label: "웃음 (Funny)", value: "funny" },
        { label: "공감 (Empathy)", value: "empathy" },
        { label: "열정 (Passion)", value: "passion" },
        { label: "평온 (Calm)", value: "calm" },
        { label: "귀여움 (Cute)", value: "cute" },
        { label: "따뜻함 (Warm)", value: "warm" },
      ],
      default: "passion",
    },
    duration_seconds: {
      type: "integer",
      label: "Duration (seconds)",
      description: "영상 길이 (초)",
      default: 40,
      min: 15,
      max: 60,
    },
    language: {
      type: "string",
      label: "Script Language",
      description: "대본 언어",
      options: [
        { label: "Japanese (일본어)", value: "japanese" },
        { label: "Korean (한국어)", value: "korean" },
        { label: "English (영어)", value: "english" },
      ],
      default: "japanese",
    },
    voice_style: {
      type: "string",
      label: "Voice Style",
      description: "나레이션 스타일",
      options: [
        { label: "Calm & Warm (차분하고 따뜻한)", value: "calm_warm" },
        { label: "Energetic (활기찬)", value: "energetic" },
        { label: "Emotional (감성적인)", value: "emotional" },
        { label: "Professional (전문적인)", value: "professional" },
        { label: "Friendly (친근한)", value: "friendly" },
        { label: "Soft (부드럽고 나긋나긋한)", value: "soft" },
        { label: "Cheerful (밝고 경쾌한)", value: "cheerful" },
      ],
      default: "calm_warm",
    },
    include_scenes: {
      type: "boolean",
      label: "Include Scene Descriptions",
      description: "장면 설명 포함 여부 (이미지 생성용)",
      default: true,
    },
    // 중복 방지 설정
    google_cloud: {
      type: "app",
      app: "google_cloud",
      description: "히스토리 저장용 GCS 연결 (중복 방지 기능 사용시 필요)",
    },
    gcs_bucket_name: {
      type: "string",
      label: "GCS Bucket Name",
      description: "히스토리 저장용 버킷 (중복 방지)",
      default: "scene-image-generator-storage-mcp-test-457809",
    },
    prevent_duplicate: {
      type: "boolean",
      label: "Prevent Duplicate Scripts",
      description: "이전에 사용한 대본/키워드 중복 방지 (false로 설정하면 GCS 연결 없이도 동작)",
      default: true,
    },
  },
  async run({ $ }) {
    const styleGuides = {
      motivational: {
        structure: "도입(공감) → 문제제기 → 해결/깨달음 → 행동촉구",
        tone: "희망적이고 격려하는",
        keywords_jp: ["頑張る", "夢", "挑戦", "成長", "自分を信じる"],
      },
      healing: {
        structure: "평온한 시작 → 감성적 전개 → 위로의 메시지 → 따뜻한 마무리",
        tone: "부드럽고 위로하는",
        keywords_jp: ["癒し", "大丈夫", "ゆっくり", "心", "優しい"],
      },
      story: {
        structure: "상황설정 → 갈등/전환점 → 클라이맥스 → 여운있는 결말",
        tone: "서사적이고 몰입감있는",
        keywords_jp: ["物語", "出会い", "運命", "変化", "始まり"],
      },
      comedy: {
        structure: "기대설정 → 반전 → 펀치라인 → 웃음포인트",
        tone: "유머러스하고 가벼운",
        keywords_jp: ["面白い", "笑", "まさか", "なんで", "草"],
      },
      educational: {
        structure: "흥미유발 질문 → 핵심정보 → 실용적 팁 → 요약",
        tone: "친절하고 명확한",
        keywords_jp: ["知ってた", "実は", "コツ", "方法", "ポイント"],
      },
      asmr: {
        structure: "조용한 도입 → 감각적 묘사 → 편안한 전개 → 평화로운 마무리",
        tone: "속삭이듯 부드러운",
        keywords_jp: ["静か", "音", "リラックス", "眠り", "穏やか"],
      },
      daily: {
        structure: "일상 시작 → 에피소드 → 느낀점/공감 → 마무리",
        tone: "자연스럽고 친근한",
        keywords_jp: ["今日", "日常", "ふと", "思った", "みんな"],
      },
      cute: {
        structure: "귀여운 등장 → 사랑스러운 행동 → 감탄 포인트 → 힐링 마무리",
        tone: "사랑스럽고 귀여운",
        keywords_jp: ["かわいい", "癒し", "ふわふわ", "もふもふ", "キュン"],
      },
      pet: {
        structure: "반려동물 소개 → 귀여운 일상 → 교감 순간 → 따뜻한 마무리",
        tone: "따뜻하고 애정어린",
        keywords_jp: ["犬", "猫", "ペット", "家族", "癒し", "かわいい"],
      },
    };

    const emotionGuides = {
      touching: "감동을 주는, 눈물이 날 것 같은",
      healing: "마음이 편안해지는, 위로받는",
      funny: "웃음이 나는, 유쾌한",
      empathy: "공감되는, 나도 그래",
      passion: "열정이 불타오르는, 도전하고 싶은",
      calm: "평온한, 차분해지는",
      cute: "귀엽고 사랑스러운, 심쿵하는",
      warm: "따뜻하고 포근한, 마음이 녹는",
    };

    const voiceGuides = {
      calm_warm: "차분하고 따뜻한 톤, 천천히 말하듯",
      energetic: "활기차고 빠른 톤, 열정적으로",
      emotional: "감성적이고 깊은 톤, 감정을 담아",
      professional: "명확하고 신뢰감있는 톤",
      friendly: "친근하고 편안한 톤, 친구에게 말하듯",
      soft: "부드럽고 나긋나긋한 톤, 속삭이듯",
      cheerful: "밝고 경쾌한 톤, 즐거운 느낌으로",
    };

    const languageConfig = {
      japanese: {
        name: "일본어",
        instruction: "日本語で書いてください。自然な日本語表現を使用してください。",
        chars_per_second: 4, // 일본어는 초당 약 4자
      },
      korean: {
        name: "한국어",
        instruction: "한국어로 작성해주세요. 자연스러운 한국어 표현을 사용해주세요.",
        chars_per_second: 5,
      },
      english: {
        name: "영어",
        instruction: "Write in English. Use natural, conversational English.",
        chars_per_second: 12, // 영어는 초당 약 12자 (words 기준으로는 2-3)
      },
    };

    const style = styleGuides[this.content_style];
    const emotion = emotionGuides[this.target_emotion];
    const voice = voiceGuides[this.voice_style];
    const lang = languageConfig[this.language];

    // =====================
    // 중복 체크 로직
    // =====================
    const HISTORY_FILE = "_script_history.json";
    let scriptHistory = { scripts: [], keywords_used: [] };
    let isDuplicate = false;

    if (this.prevent_duplicate && this.google_cloud) {
      try {
        const { google } = await import("googleapis");
        const auth = new google.auth.GoogleAuth({
          credentials: JSON.parse(this.google_cloud.$auth.key_json),
          scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
        });
        const storage = google.storage({ version: 'v1', auth });

        // 히스토리 파일 로드 시도
        try {
          const response = await storage.objects.get({
            bucket: this.gcs_bucket_name,
            object: HISTORY_FILE,
            alt: 'media',
          });
          scriptHistory = response.data;
          $.export("history_loaded", `Loaded ${scriptHistory.scripts?.length || 0} previous scripts`);
        } catch (e) {
          // 히스토리 파일이 없으면 새로 생성
          $.export("history_status", "No history file found, will create new one");
        }

        // 키워드 중복 체크
        const currentKeywords = this.keywords.toLowerCase().split(',').map(k => k.trim()).sort().join(',');
        const keywordKey = `${currentKeywords}|${this.content_style}|${this.language}`;

        // 같은 키워드 조합이 몇 번 사용되었는지 카운트
        const usageCount = scriptHistory.keywords_used?.filter(k => k === keywordKey).length || 0;
        if (usageCount > 0) {
          isDuplicate = true;
          $.export("duplicate_info", `ℹ️ Keywords "${this.keywords}" used ${usageCount} time(s) before. Generating variation #${usageCount + 1}`);
        }
      } catch (e) {
        $.export("history_error", e.message);
      }
    }

    // 예상 글자수 계산
    const estimatedChars = this.duration_seconds * lang.chars_per_second;
    const sceneCount = Math.ceil(this.duration_seconds / 5); // 5초당 1장면

    // 중복인 경우 이전 대본들의 제목을 가져와서 AI에게 전달
    let previousScripts = [];
    if (isDuplicate && scriptHistory.scripts) {
      const currentKeywords = this.keywords.toLowerCase().split(',').map(k => k.trim()).sort().join(',');
      previousScripts = scriptHistory.scripts
        .filter(s => {
          const sKeywords = s.keywords.toLowerCase().split(',').map(k => k.trim()).sort().join(',');
          return sKeywords === currentKeywords && s.content_style === this.content_style;
        })
        .map(s => s.title?.japanese || s.title?.korean || 'Unknown');
    }

    const prompt = `You are an expert scriptwriter for viral YouTube Shorts targeting the Japanese market.

## Input Information:
- Keywords: ${this.keywords}
- Content Style: ${this.content_style} (${style.tone})
- Structure: ${style.structure}
- Target Emotion: ${emotion}
- Voice Style: ${voice}
- Duration: ${this.duration_seconds} seconds
- Language: ${lang.name}
- Estimated characters: ~${estimatedChars} characters
- Number of scenes: ${sceneCount}
${isDuplicate ? `
## ⚠️ IMPORTANT - CREATE A DIFFERENT VERSION:
This keyword combination has been used ${previousScripts.length} time(s) before.
Previous scripts with these keywords: ${previousScripts.join(', ')}

You MUST create a COMPLETELY DIFFERENT script:
- Different story/scenario
- Different characters or situations
- Different emotional arc
- Different visual scenes
- DO NOT repeat similar content
` : ''}
## Japanese Market Keywords Reference:
${style.keywords_jp.join(", ")}

## CRITICAL LENGTH REQUIREMENTS:
- **MINIMUM ${estimatedChars} characters** for full_script (this is NON-NEGOTIABLE)
- Duration: ${this.duration_seconds} seconds
- Speaking rate: ${lang.chars_per_second} characters per second
- You MUST write enough content to fill the ENTIRE ${this.duration_seconds} seconds
- Each 5-second segment needs approximately ${lang.chars_per_second * 5} characters of narration
- DO NOT write short, choppy scripts. Write FULL, DETAILED narration.

## CONTENT UNIQUENESS REQUIREMENTS (VERY IMPORTANT):
- DO NOT use generic, commonly known information
- DO NOT write obvious advice that everyone already knows
- INCLUDE surprising facts, lesser-known research, or unique perspectives
- Use specific numbers, statistics, or research findings when possible
- Share insights that make viewers think "I didn't know that!"
- Avoid clichés and overused phrases
- Examples of what to AVOID:
  * "早起きは体にいい" (too generic)
  * "分散投資が大事" (everyone knows this)
  * "感謝の気持ちを持とう" (too common)
- Examples of what to INCLUDE:
  * Specific research findings with numbers
  * Counter-intuitive facts
  * Little-known historical stories
  * Expert insights not widely shared
  * Unusual connections between concepts

## Requirements:
1. ${lang.instruction}
2. Write a script that is AT LEAST ${estimatedChars} characters long (MANDATORY)
3. Follow the structure: ${style.structure}
4. Evoke the emotion: ${emotion}
5. Voice style should be: ${voice}
6. Include natural pauses marked with "..." for emotional effect
7. The script should hook viewers in the first 2 seconds
8. Each segment must have substantial narration (not just a few words)
9. Content must be UNIQUE and SURPRISING - avoid generic information

${this.include_scenes ? `
## Scene Descriptions:
For each scene (approximately every 5 seconds), provide:
- Detailed visual description for AI image generation
- Include anime/illustration style specifications
- Describe character expressions, poses, background, lighting, mood
` : ""}

## Output Format (JSON):
{
  "title": {
    "japanese": "Japanese title for YouTube",
    "korean": "한국어 제목",
    "english": "English title"
  },
  "hook": "First 2 seconds - attention grabber",
  "full_script": "Complete narration script in ${lang.name}",
  "script_segments": [
    {
      "segment_number": 1,
      "start_time": 0,
      "end_time": 5,
      "narration": "Narration text for this segment",
      "emotion_note": "How to deliver this part",
      ${this.include_scenes ? '"scene_description": "Detailed visual description for image generation - anime style, character details, background, mood, lighting",' : ""}
      "visual_keywords": ["keyword1", "keyword2"]
    }
  ],
  "hashtags": {
    "japanese": ["#shorts", "#日本語ハッシュタグ"],
    "english": ["#shorts", "#EnglishHashtags"]
  },
  "thumbnail_idea": "Thumbnail concept description",
  "music_suggestion": "Background music style recommendation",
  "total_duration": ${this.duration_seconds},
  "character_count": "actual character count",
  "target_audience": "Target audience description",
  "viral_elements": ["Element 1", "Element 2"]
}

Create an emotionally engaging script that will resonate with Japanese YouTube Shorts viewers. Make it memorable and shareable.

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
            content: `You are an expert viral content scriptwriter specializing in Japanese YouTube Shorts. You understand Japanese culture, emotions, and what makes content go viral in Japan. You write scripts that are emotionally resonant, culturally appropriate, and optimized for short-form video. Always respond with valid JSON only.`,
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      },
    });

    let script;
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

      script = JSON.parse(responseContent);
    } catch (error) {
      $.export("$summary", `Error parsing response: ${error.message}`);
      throw new Error(`Failed to parse OpenAI response: ${error.message}`);
    }

    // 결과 정리 및 추가 정보 포함
    const result = {
      // 입력 파라미터
      input: {
        keywords: this.keywords,
        content_style: this.content_style,
        target_emotion: this.target_emotion,
        duration: this.duration_seconds,
        language: this.language,
        voice_style: this.voice_style,
      },

      // 생성된 스크립트
      script: script,

      // 파이프라인 연동용 데이터
      pipeline_data: {
        // scene-image-generator 연동용
        image_generation: {
          scenes: script.script_segments?.map((seg, idx) => ({
            index: idx + 1,
            start: seg.start_time,
            end: seg.end_time,
            prompt: seg.scene_description || `Scene ${idx + 1}: ${seg.visual_keywords?.join(", ")}`,
            style: "anime illustration, high quality, detailed",
          })) || [],
        },

        // elevenlabs-tts 연동용
        tts: {
          text: script.full_script,
          language: this.language,
          voice_style: this.voice_style,
        },

        // 메타데이터
        metadata: {
          title: script.title,
          hashtags: script.hashtags,
          thumbnail: script.thumbnail_idea,
          music: script.music_suggestion,
        },
      },

      // 타임스탬프
      generated_at: new Date().toISOString(),
    };

    $.export("$summary",
      `스크립트 생성 완료: "${script.title?.korean || script.title?.japanese}" - ${script.script_segments?.length || 0}개 장면, ${this.duration_seconds}초`
    );

    // =====================
    // 히스토리 저장
    // =====================
    if (this.prevent_duplicate && this.google_cloud) {
      try {
        const { google } = await import("googleapis");
        const { Readable } = await import("stream");

        const auth = new google.auth.GoogleAuth({
          credentials: JSON.parse(this.google_cloud.$auth.key_json),
          scopes: ['https://www.googleapis.com/auth/devstorage.read_write'],
        });
        const storage = google.storage({ version: 'v1', auth });

        // 현재 키워드 키 생성
        const currentKeywords = this.keywords.toLowerCase().split(',').map(k => k.trim()).sort().join(',');
        const keywordKey = `${currentKeywords}|${this.content_style}|${this.language}`;

        // 히스토리 업데이트
        if (!scriptHistory.scripts) scriptHistory.scripts = [];
        if (!scriptHistory.keywords_used) scriptHistory.keywords_used = [];

        scriptHistory.scripts.push({
          keywords: this.keywords,
          content_style: this.content_style,
          language: this.language,
          title: script.title,
          generated_at: new Date().toISOString(),
        });
        scriptHistory.keywords_used.push(keywordKey);
        scriptHistory.last_updated = new Date().toISOString();
        scriptHistory.total_count = scriptHistory.scripts.length;

        // GCS에 저장
        const historyStream = new Readable();
        historyStream.push(JSON.stringify(scriptHistory, null, 2));
        historyStream.push(null);

        await storage.objects.insert({
          bucket: this.gcs_bucket_name,
          name: HISTORY_FILE,
          media: {
            mimeType: 'application/json',
            body: historyStream,
          },
          requestBody: {
            name: HISTORY_FILE,
            contentType: 'application/json',
          },
        });

        $.export("history_saved", `Saved to history. Total scripts: ${scriptHistory.total_count}`);
      } catch (e) {
        $.export("history_save_error", e.message);
      }
    }

    return result;
  },
});
