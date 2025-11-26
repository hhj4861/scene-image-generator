# Pipedream Scene Image Generator

Pipedream에서 사용할 수 있는 씬 이미지 생성 컴포넌트입니다.

## 기능

1. **AI 스타일 분석** (OpenAI GPT-4o)
   - 대본 분석 후 아트 스타일 자동 결정
   - 일관된 캐릭터 설명 생성
   - 각 씬별 프롬프트 강화

2. **이미지 생성** (Stability AI)
   - Stable Diffusion XL 사용
   - 씬별 이미지 생성
   - 캐릭터/스타일 일관성 유지

3. **GCS 업로드**
   - 폴더별 이미지 원본 저장
   - metadata.json 포함

---

## 사용법

### 필요한 연결
- **OpenAI** - GPT-4o API
- **Google Cloud** - Service Account JSON
- **Stability AI API Key**

### Props 설정

| Prop | 설명 | 예시 |
|------|------|------|
| `script_text` | 전체 대본 텍스트 | "朝、目が覚めた瞬間から..." |
| `scenes` | 씬 배열 (JSON 문자열) | `[{"start": 0, "end": 5, "image_prompt": "..."}]` |
| `stability_api_key` | Stability AI API 키 | sk-xxx |
| `gcs_bucket_name` | GCS 버킷명 | scene-image-generator-storage-mcp-test-457809 |
| `image_width` | 이미지 너비 | 640 |
| `image_height` | 이미지 높이 | 1536 |

### 입력 예시

```json
{
  "script_text": "朝、目が覚めた瞬間から始まる小さな挑戦...",
  "scenes": "[{\"start\":0,\"end\":5,\"image_prompt\":\"A person waking up in bed\"},{\"start\":5,\"end\":10,\"image_prompt\":\"Rubbing tired eyes\"}]"
}
```

### 출력 예시

```json
{
  "success": true,
  "folder_name": "20251126_abc123_Dawn_of_Resolve",
  "bucket": "scene-image-generator-storage-mcp-test-457809",
  "folder_url": "https://storage.googleapis.com/bucket/folder/",
  "metadata_url": "https://storage.googleapis.com/bucket/folder/metadata.json",
  "style_guide": {
    "art_style": "anime japanese animation",
    "title": "Dawn_of_Resolve",
    "mood_keywords": ["determination", "hope"]
  },
  "total_scenes": 8,
  "scenes": [
    {
      "filename": "scene_001_0-5.png",
      "url": "https://storage.googleapis.com/...",
      "start": 0,
      "end": 5,
      "duration": 5
    }
  ]
}
```

---

## GCS 폴더 구조

```
gs://scene-image-generator-storage-mcp-test-457809/
  └── 20251126_abc123_Dawn_of_Resolve/
      ├── scene_001_0-5.png
      ├── scene_002_5-10.png
      ├── ...
      └── metadata.json
```

---

## metadata.json 구조

영상 제작 시 활용할 수 있는 메타데이터:

```json
{
  "generated_at": "2025-11-26T07:54:49.614Z",
  "folder": "20251126_abc123_Dawn_of_Resolve",
  "style_guide": {
    "art_style": "anime japanese animation",
    "title": "Dawn_of_Resolve",
    "character_description": "18-year-old Japanese male...",
    "mood_keywords": ["determination", "hope"],
    "color_palette": "warm, saturated tones"
  },
  "total_scenes": 8,
  "scenes": [
    {
      "index": 0,
      "filename": "scene_001_0-5.png",
      "url": "https://storage.googleapis.com/...",
      "start": 0,
      "end": 5,
      "duration": 5
    }
  ]
}
```

---

## 워크플로우 예시

```
[Trigger] → [Scene Image Generator] → [Video Creator] → [Notify]
```

1. **Trigger**: 새 대본 입력 (Webhook, Spreadsheet 등)
2. **Scene Image Generator**: 이미지 생성 및 GCS 업로드
3. **Video Creator**: metadata.json URL로 영상 제작
4. **Notify**: 완료 알림 (Slack, Email 등)
