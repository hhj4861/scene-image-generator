# Pipedream Puppy - AI 강아지 Shorts 자동 생성 파이프라인

Veo 3 기반 - 실제 강아지가 말하는 것처럼 보이는 YouTube Shorts를 자동으로 생성하는 파이프라인입니다.

## 땅콩이 스타일 템플릿

```
┌─────────────────────────────┐
│                             │
│  다이어트 중인데 간식이...        │ ← 상단 타이틀 (크림색 #FFF8E7 + 갈색 외곽선)
│                             │     Topic Generator의 topic 사용
│      ┌───────────────┐      │
│      │               │      │
│      │   Veo 3 영상   │      │ ← 전체 화면 (음성+립싱크 포함)
│      │   (전체화면)    │      │
│      │               │      │
│      └───────────────┘      │
│                             │
│  오늘은 간식 먹방이에요~          │ ← 한글 자막 (플로럴 화이트 #FFFAF0 + 초콜릿 외곽선)
│  Today is snack mukbang~    │ ← 영어 자막 (연회색) - 옵션
│                             │
│       땅콩이네                │ ← 채널명 (코랄 오렌지 #FF7F50 + 갈색 외곽선)
│                             │
└─────────────────────────────┘
```

### 땅콩이 컬러 팔레트 (따뜻한 톤)

| 요소 | 폰트 | 색상 | 외곽선 |
|------|------|------|--------|
| 상단 타이틀 | Black Han Sans | 크림색 #FFF8E7 | 갈색 #8B4513 |
| 한글 자막 | Noto Sans KR Bold | 플로럴 화이트 #FFFAF0 | 초콜릿 #4A3728 |
| 영어 자막 | Noto Sans | 연회색 #E8E8E8 | 진회색 #3D3D3D |
| 하단 채널명 | Black Han Sans | 코랄 오렌지 #FF7F50 | 다크 브라운 #5D3A1A |

---

## 파이프라인 Flow (Veo 3 기반)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         STEP 1: 콘텐츠 기획                              │
├─────────────────────────────────────────────────────────────────────────┤
│   [Topic Generator] ──→ [Script Generator]                              │
│    (주제/키워드)         (대본 + 영어자막 + video_generation)             │
│      ↓                                                                   │
│    topic → 상단 타이틀                                                   │
│    keywords → YouTube 해시태그                                           │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                         STEP 2: 이미지 생성                              │
├─────────────────────────────────────────────────────────────────────────┤
│  [Gemini Image Generator]                                               │
│   - Imagen 4로 실사 강아지 이미지 생성                                    │
│   - 사람 캐릭터 실패 시 강아지만 fallback                                 │
│   - 씬별 일관된 캐릭터/스타일 유지                                        │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                         STEP 3: 영상 생성 (Veo 3)                        │
├─────────────────────────────────────────────────────────────────────────┤
│  [Veo 3 Video Generator]                                                │
│   - 이미지 기반 영상 생성                                                │
│   - 음성 + 립싱크 동시 생성 (TTS/Hedra 불필요!)                          │
│   - RPM 제한 대응: 순차 처리 + 15초 딜레이                               │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                         STEP 4: 최종 렌더링                              │
├─────────────────────────────────────────────────────────────────────────┤
│  [BGM Generator] ──→ [Creatomate Render]                                │
│   (배경음악 생성)      - 상단: Topic Generator의 topic                   │
│                       - 중앙: Veo 3 영상 (전체화면)                       │
│                       - 하단: 한글/영어 자막 + 채널명                     │
│                       - BGM 믹싱 (Veo 오디오 + BGM)                       │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                         STEP 5: 업로드                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  [YouTube Upload]                                                        │
│   - Topic Keywords + 바이럴 키워드 → 해시태그 (중복 제거)                │
│   - AI SEO 최적화 (제목, 설명, 태그)                                     │
│   - 자동 업로드                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 간단 Flow

```
[Topic Generator] → [Script Generator] → [Image Generator] → [Veo 3 Video Generator]
                                                                      ↓
                            [YouTube Upload] ← [Creatomate] ← [BGM Generator]
```

---

## 파일 구조 및 역할

| 파일 | 역할 | 사용 API |
|------|------|----------|
| `topic-generator.mjs` | AI 기반 주제/키워드 생성 | Gemini API |
| `script-generator.mjs` | 대본 + 영어자막 + video_generation | Gemini API |
| `gemini-image-generator.mjs` | 실사 강아지 이미지 생성 | Imagen 4 |
| `veo3-video-generator.mjs` | 영상+음성+립싱크 생성 | Veo 3 Fast |
| `bgm-generator.mjs` | AI 배경음악 생성 | MusicAPI |
| `creatomate-render-unified.mjs` | 최종 영상 합성 (땅콩이 스타일) | Creatomate API |
| `youtube-upload.mjs` | YouTube 업로드 + 해시태그 | YouTube Data API |

### 삭제된 파일 (Veo 3로 대체)
- ~~`elevenlabs-tts.mjs`~~ - Veo 3가 음성 생성
- ~~`whisper-transcribe.mjs`~~ - Script Generator가 자막 생성
- ~~`hedra-lipsync.mjs`~~ - Veo 3가 립싱크 처리
- ~~`video-generator-unified.mjs`~~ - Veo 3 단일 사용
- ~~`runway_veo_vedio_generator.mjs`~~ - Veo 3로 통합

---

## Pipedream 워크플로우 설정

### Step 1: Topic Generator
```
출력:
  - topic: "다이어트 중인데 간식이..." (상단 타이틀용)
  - keywords: "강아지, 먹방, 귀여움, ..." (해시태그용)
```

### Step 2: Script Generator
```
입력: {{JSON.stringify(steps.Topic_Keyword_Generator.$return_value)}}
출력:
  - script.script_segments[].narration (한글)
  - script.script_segments[].narration_english (영어)
  - video_generation (Veo 3용)
```

### Step 3: Gemini Image Generator
```
입력: {{JSON.stringify(steps.Shorts_Script_Generator.$return_value)}}
출력: scenes[].url (이미지 URL)
```

### Step 4: Veo 3 Video Generator
```
입력:
  - images_data: {{JSON.stringify(steps.Gemini_Image_Generator.$return_value.scenes)}}
  - script_data: {{JSON.stringify(steps.Shorts_Script_Generator.$return_value)}}
출력: videos[].url (영상 URL, 음성 포함)
```

### Step 5: BGM Generator
```
입력: script 분위기 정보
출력: bgm_url
```

### Step 6: Creatomate Render
```
입력:
  - video_generator_output: {{JSON.stringify(steps.Veo3_Video_Generator.$return_value)}}
  - script_generator_output: {{JSON.stringify(steps.Shorts_Script_Generator.$return_value)}}
  - topic_generator_output: {{JSON.stringify(steps.Topic_Keyword_Generator.$return_value)}}
  - header_text: (자동: Topic Generator의 topic)
  - footer_text: "땅콩이네"
  - bgm_url: {{steps.BGM_Generator.$return_value.url}}
출력: 최종 영상 URL
```

### Step 7: YouTube Upload
```
입력:
  - video_url: {{steps.Creatomate_Render.$return_value.url}}
  - topic_keywords: {{steps.Topic_Keyword_Generator.$return_value.keywords}}
  - channel_name: "땅콩이네"
출력:
  - YouTube Shorts URL
  - 해시태그: Topic Keywords + 바이럴 키워드 + 채널명 (중복 제거)
```

---

## 필요한 API 키

| 서비스 | 용도 | 필수 |
|--------|------|------|
| **Gemini API** | Topic/Script + Imagen 이미지 | ✅ |
| **Gemini API (Veo 3)** | 영상+음성+립싱크 | ✅ |
| **Creatomate** | 영상 합성 | ✅ |
| **Google Cloud** | GCS 스토리지 | ✅ |
| **YouTube** | 업로드 | ✅ |
| **MusicAPI** | BGM 생성 | 선택 |
| **OpenAI** | YouTube SEO 최적화 | 선택 |

---

## 예상 비용 (1개 영상 기준)

| 서비스 | 예상 비용 |
|--------|----------|
| Gemini/Imagen | ~$0.35 |
| Veo 3 | 무료 (API 키 한도 내) |
| Creatomate | ~$0.50 |
| **총합** | **~$0.85/영상** |

※ Hedra, ElevenLabs TTS 비용 절감!

---

## 주의사항

1. **Veo 3 RPM 제한**: 분당 요청 수 제한 → 순차 처리 + 15초 딜레이
2. **Veo 3 API 한도**: 일일 요청 제한 → 백업 API 키 권장
3. **이미지 일관성**: 캐릭터 참조 이미지 제공 권장
4. **영상 길이**: Shorts는 60초 이하 권장
5. **사람 캐릭터**: Imagen이 거부할 수 있음 → 강아지만 fallback
