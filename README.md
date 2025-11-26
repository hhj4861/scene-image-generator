# Scene Image Generator - AI Shorts Pipeline

AI 기반 쇼츠 영상 자동 생성 파이프라인입니다. 대본에서 이미지, 영상, 음성, 자막을 생성하고 최종 쇼츠 영상을 만듭니다.

## 파이프라인 개요

```
[대본] → [이미지 생성] → [영상 변환] → [음성 생성] → [자막 추출] → [합성] → [쇼츠 영상]
```

| 단계 | 서비스 | 설명 |
|------|--------|------|
| 1. 이미지 생성 | Stability AI + OpenAI GPT-4o | 대본 분석 후 씬별 이미지 생성 |
| 2. 영상 변환 | Runway Gen-3 | 이미지 → 5초 영상 클립 |
| 3. 음성 생성 | ElevenLabs | 대본 → 나레이션 음성 |
| 4. 자막 추출 | OpenAI Whisper | 음성 → 타임스탬프 자막 |
| 5. 합성 | Creatomate | 영상 + 음성 + 자막 → 최종 쇼츠 |

---

## 프로젝트 구조

```
scene-image-generator/
├── src/                              # 로컬 테스트용 모듈
│   ├── index.js                      # 모듈 export
│   ├── runway-video-generator.js     # Runway 이미지→영상
│   ├── elevenlabs-tts.js             # ElevenLabs TTS
│   ├── whisper-transcribe.js         # Whisper 자막 생성
│   └── creatomate-render.js          # Creatomate 합성
│
├── pipedream/                        # Pipedream 컴포넌트
│   ├── README.md                     # Pipedream 사용 가이드
│   ├── scene-image-generator.mjs     # 이미지 생성
│   ├── runway-video-generator.mjs    # 이미지→영상
│   ├── elevenlabs-tts.mjs            # ElevenLabs TTS
│   ├── whisper-transcribe.mjs        # Whisper 자막
│   └── creatomate-render.mjs         # 최종 합성
│
├── index.js                          # 이미지 생성 (로컬 실행)
├── test-pipeline.js                  # 파이프라인 테스트 스크립트
├── package.json
├── .env.example
└── README.md
```

---

## 설치

```bash
# 1. 의존성 설치
npm install

# 2. 환경 변수 설정
cp .env.example .env
```

### 필요한 API 키

| 서비스 | 환경 변수 | 발급 링크 |
|--------|----------|-----------|
| Stability AI | `STABILITY_API_KEY` | https://platform.stability.ai/account/keys |
| OpenAI | `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| ElevenLabs | `ELEVENLABS_API_KEY` | https://elevenlabs.io/ |
| Runway | `RUNWAY_API_KEY` | https://runway.ml/ |
| Creatomate | `CREATOMATE_API_KEY` | https://creatomate.com/ |

### Google Cloud Storage 설정

1. GCP 콘솔에서 서비스 계정 생성
2. Storage Object Admin 권한 부여
3. JSON 키 다운로드 → `google-credentials.json`으로 저장
4. `.env`에 설정:
   ```
   GOOGLE_CREDENTIALS_PATH=./google-credentials.json
   GCS_BUCKET_NAME=your-bucket-name
   ```

---

## 로컬 테스트

### 1. 이미지 생성 테스트

```bash
# scenes.json 파일 준비 후 실행
npm run generate
```

**scenes.json 예시:**
```json
{
  "script_text": "朝、目が覚めた瞬間から始まる小さな挑戦...",
  "scenes": [
    { "start": 0, "end": 5, "image_prompt": "A person waking up in bed" },
    { "start": 5, "end": 10, "image_prompt": "Looking out the window" }
  ]
}
```

### 2. 파이프라인 단계별 테스트

```bash
# ElevenLabs TTS 테스트
npm run test:tts

# Whisper 자막 생성 테스트 (TTS 실행 후)
npm run test:whisper

# Runway 영상 생성 테스트 (이미지 URL 필요)
npm run test:runway

# Creatomate 합성 테스트 (영상/음성 URL 필요)
npm run test:creatomate

# TTS → Whisper 연결 테스트
npm run test:pipeline
```

---

## Pipedream 워크플로우

### 워크플로우 구조

```
[Trigger (Webhook)]
       ↓
[Scene Image Generator]
       ↓ scenes, folder_name, bucket
[Runway Video Generator]
       ↓ videos
[ElevenLabs TTS] ← script_text
       ↓ audio_url
[Whisper Transcribe]
       ↓ subtitles
[Creatomate Render]
       ↓
[완료 (최종 영상 URL)]
```

### 각 컴포넌트 연결 (Props 설정)

#### Scene Image Generator
| Prop | 값 |
|------|-----|
| Script Text | `{{ JSON.parse(steps.trigger.$return_value.message).script_text }}` |
| Scenes JSON | `{{ JSON.stringify(JSON.parse(steps.trigger.$return_value.message).scenes) }}` |

#### Runway Video Generator
| Prop | 값 |
|------|-----|
| Images JSON | `{{ JSON.stringify(steps.scene_image_generator.$return_value.scenes) }}` |
| Folder Name | `{{ steps.scene_image_generator.$return_value.folder_name }}` |
| GCS Bucket Name | `{{ steps.scene_image_generator.$return_value.bucket }}` |

#### ElevenLabs TTS
| Prop | 값 |
|------|-----|
| Script Text | `{{ JSON.parse(steps.trigger.$return_value.message).script_text }}` |
| Folder Name | `{{ steps.scene_image_generator.$return_value.folder_name }}` |

#### Whisper Transcribe
| Prop | 값 |
|------|-----|
| Audio URL | `{{ steps.elevenlabs_tts.$return_value.url }}` |
| Folder Name | `{{ steps.scene_image_generator.$return_value.folder_name }}` |

#### Creatomate Render
| Prop | 값 |
|------|-----|
| Videos JSON | `{{ JSON.stringify(steps.runway_video_generator.$return_value.videos) }}` |
| Audio URL | `{{ steps.elevenlabs_tts.$return_value.url }}` |
| Subtitles JSON | `{{ JSON.stringify(steps.whisper_transcribe.$return_value.subtitles) }}` |
| Folder Name | `{{ steps.scene_image_generator.$return_value.folder_name }}` |

---

## GCS 폴더 구조

최종 생성되는 GCS 폴더 구조:

```
gs://your-bucket/
  └── 20251126_abc123_Title/
      ├── scene_001_0-5.png        # 원본 이미지
      ├── scene_002_5-10.png
      ├── ...
      ├── video_001_0-5.mp4        # 영상 클립
      ├── video_002_5-10.mp4
      ├── ...
      ├── narration.mp3            # 나레이션 음성
      ├── subtitles.json           # 자막 (JSON)
      ├── subtitles.srt            # 자막 (SRT)
      ├── final_shorts.mp4         # 최종 쇼츠 영상
      └── metadata.json            # 메타데이터
```

---

## 출력 예시

### 최종 Creatomate 출력

```json
{
  "success": true,
  "filename": "final_shorts.mp4",
  "url": "https://storage.googleapis.com/bucket/folder/final_shorts.mp4",
  "total_duration": 40,
  "video_count": 8,
  "subtitle_count": 12
}
```

---

## 비용 참고

| 서비스 | 대략적 비용 (40초 쇼츠 기준) |
|--------|------------------------------|
| Stability AI | ~$0.03 (8장 이미지) |
| OpenAI GPT-4o | ~$0.02 (스타일 분석) |
| Runway Gen-3 | ~$2.00 (8개 × 5초 클립) |
| ElevenLabs | ~$0.30 (40초 음성) |
| Whisper | ~$0.01 (40초 트랜스크립션) |
| Creatomate | ~$0.50 (1개 렌더) |
| **합계** | **~$2.86** |

---

## 트러블슈팅

### GCS 업로드 오류: `part.body.pipe is not a function`
→ `Readable` 스트림으로 변환 필요 (이미 수정됨)

### Pipedream JSON 파싱 오류: `[object Object]`
→ `JSON.stringify()`로 감싸서 전달

### Runway 타임아웃
→ 영상 생성에 2-5분 소요, polling 대기 시간 확인

---

## 라이선스

MIT
