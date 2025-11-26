import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

/**
 * YouTube Shorts Upload (Local Test Version)
 * AI 메타데이터 최적화만 테스트 가능
 * 실제 업로드는 Pipedream에서 진행
 */

/**
 * AI로 YouTube 메타데이터 최적화
 */
export async function optimizeMetadata(options) {
  const {
    apiKey,
    originalTitle,
    scriptText,
    hashtags = {},
    targetLanguage = 'japanese',
    contentCategory = '24',
  } = options;

  console.log('\n[YouTube Metadata Optimizer] Starting...');
  console.log(`  - Target Language: ${targetLanguage}`);
  console.log(`  - Original Title:`, originalTitle);

  const languageConfig = {
    japanese: {
      name: "Japanese",
      instruction: "Optimize for Japanese YouTube audience. Use trending Japanese keywords and phrases.",
    },
    korean: {
      name: "Korean",
      instruction: "Optimize for Korean YouTube audience. Use trending Korean keywords and phrases.",
    },
    english: {
      name: "English",
      instruction: "Optimize for English YouTube audience. Use trending English keywords and phrases.",
    },
  };

  const lang = languageConfig[targetLanguage];

  const optimizationPrompt = `You are a YouTube SEO expert specializing in viral Shorts content. Your goal is to maximize views, engagement, and algorithm favorability.

## INPUT DATA:
- Original Title: ${JSON.stringify(originalTitle)}
- Script: ${scriptText.substring(0, 1000)}
- Existing Hashtags: ${JSON.stringify(hashtags)}
- Target Language: ${lang.name}
- Content Category: ${contentCategory}

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

  try {
    const response = await axios({
      method: 'POST',
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      data: {
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert YouTube SEO specialist. You know exactly what makes Shorts go viral. Always respond with valid JSON only.',
          },
          { role: 'user', content: optimizationPrompt },
        ],
        temperature: 0.8,
        max_tokens: 2000,
      },
    });

    let content = response.data.choices[0].message.content.trim();

    // Remove markdown code blocks
    if (content.startsWith('```json')) {
      content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (content.startsWith('```')) {
      content = content.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const optimizedMetadata = JSON.parse(content);

    console.log('\n[Optimization Result]');
    console.log(`  - Title: ${optimizedMetadata.optimized_title}`);
    console.log(`  - SEO Score: ${optimizedMetadata.seo_score}/100`);
    console.log(`  - Predicted Performance: ${optimizedMetadata.predicted_performance}`);
    console.log(`  - Tags Count: ${optimizedMetadata.tags?.length || 0}`);
    console.log(`  - Thumbnail Suggestion: ${optimizedMetadata.thumbnail_text_suggestion}`);
    console.log(`  - Best Upload Times: ${optimizedMetadata.best_upload_times?.join(', ')}`);

    return optimizedMetadata;

  } catch (error) {
    console.error('  - Error:', error.message);
    throw error;
  }
}

/**
 * 테스트 실행
 */
export async function testYouTubeMetadata(scriptPath) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not found in .env');
  }

  // 스크립트 파일 로드
  let scriptData;
  if (scriptPath) {
    const content = await fs.readFile(scriptPath, 'utf-8');
    scriptData = JSON.parse(content);
  } else {
    // 기본 output/script.json 사용
    const defaultPath = path.join(process.cwd(), 'output', 'script.json');
    const content = await fs.readFile(defaultPath, 'utf-8');
    scriptData = JSON.parse(content);
  }

  const result = await optimizeMetadata({
    apiKey,
    originalTitle: scriptData.script?.title || { japanese: 'Test Video' },
    scriptText: scriptData.script?.full_script || 'Test script',
    hashtags: scriptData.script?.hashtags || {},
    targetLanguage: 'japanese',
  });

  // 결과 저장
  const outputPath = path.join(process.cwd(), 'output', 'youtube_metadata.json');
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
  console.log(`\n  - Saved: ${outputPath}`);

  return result;
}

export default { optimizeMetadata, testYouTubeMetadata };
