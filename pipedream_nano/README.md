# Pipedream Nano - YouTube Shorts Video Pipeline

Pipedream에서 사용할 수 있는 AI 기반 YouTube Shorts 자동 생성 파이프라인입니다.

## 파이프라인 구조

```
[Script Generator] → [ElevenLabs TTS] → [Whisper Transcribe]
        ↓                                         ↓
[Google Imagen Generator] ──────────────────────────→ [Stability Video Generator]
        ↓                                                        ↓
[Creatomate Render] ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ←
        ↓
[YouTube Upload]
```

---

## 컴포넌트 목록

### 1. **Script Generator** (`script-generator.mjs`)
- 키워드 기반 일본어 대본 생성
- 중복 방지 시스템 (GCS 히스토리)
- 고유한 정보 기반 콘텐츠 생성

### 2. **ElevenLabs TTS** (`elevenlabs-tts.mjs`)
- 대본을 일본어 음성으로 변환
- 다양한 음성 선택 가능

### 3. **Whisper Transcribe** (`whisper-transcribe.mjs`)
- 음성을 자막(타임스탬프 포함)으로 변환
- 씬 타이밍 추출

### 4. **Gemini Image Generator** (`gemini-image-generator.mjs`)
- **Gemini API**로 프롬프트 강화 및 일관성 분석
- **Imagen 4** (Gemini API)로 고품질 이미지 생성
- **Vertex AI 불필요** - API Key만 있으면 됨!
- 캐릭터/환경/색상 일관성 유지
- 비디오 전환을 위한 모션 힌트 포함

### 5. **Stability Video Generator** (`stability-video-generator.mjs`) ⭐ NEW
- **Stability AI Image-to-Video** API 사용
- 각 이미지를 ~4초 비디오로 변환
- 매끄러운 연결을 위한 모션 설정

### 6. **Creatomate Render** (`creatomate-render.mjs`)
- 비디오 + 오디오 + 자막 합성
- 최종 Shorts 영상 생성

### 7. **YouTube Upload** (`youtube-upload.mjs`)
- 자동 업로드
- 트렌딩 해시태그 추가

---

## 필요한 연결 및 API 키

| 서비스 | 용도 | 비고 |
|--------|------|------|
| **Gemini API** | 프롬프트 분석 + Imagen 이미지 생성 | API Key (Google AI Studio) |
| **Stability AI** | Image-to-Video | API Key |
| **Google Cloud** | GCS 스토리지 | Service Account JSON |
| **ElevenLabs** | TTS | API Key |
| **OpenAI** | Whisper | API Key |
| **Creatomate** | 영상 합성 | API Key |
| **YouTube** | 업로드 | OAuth |

---

## 워크플로우 예시

### 전체 파이프라인

```
1. Script Generator
   - 입력: 키워드 ("자기계발,아침,도전"), 스타일 ("motivational")
   - 출력: 일본어 대본, 씬 정보

2. ElevenLabs TTS
   - 입력: 대본 텍스트
   - 출력: 음성 파일 (MP3)

3. Whisper Transcribe
   - 입력: 음성 파일
   - 출력: 타임스탬프 자막, 씬 배열

4. Gemini + Stability Image Generator
   - 입력: 대본, 씬 배열
   - 출력: 씬별 이미지 (일관된 스타일)

5. Stability Video Generator
   - 입력: 이미지 배열
   - 출력: 씬별 비디오 (~4초 each)

6. Creatomate Render
   - 입력: 비디오 배열, 오디오, 자막
   - 출력: 최종 Shorts 영상

7. YouTube Upload
   - 입력: 최종 영상, 제목, 설명
   - 출력: YouTube URL
```

---

## 일관성 보장 시스템

### Imagen Generator의 일관성 기능
- **main_character**: 모든 씬에서 동일한 캐릭터 묘사
- **environment**: 일관된 배경/환경
- **color_palette**: 통일된 색상 스키마
- **lighting**: 동일한 조명 조건
- **motion_hint**: 비디오 전환을 위한 움직임 힌트

### Stability Video의 연속성 설정
- **cfg_scale**: 이미지 충실도 (1.8 권장)
- **motion_bucket_id**: 움직임 강도 (40 권장, 낮을수록 안정적)

---

## GCS 폴더 구조

```
gs://scene-image-generator-storage-mcp-test-457809/
  └── 20251128_abc123_Morning_Rise/
      ├── scene_001_0-5.png       # 이미지
      ├── scene_002_5-10.png
      ├── video_001_0-5.mp4       # 비디오
      ├── video_002_5-10.mp4
      ├── metadata.json           # 이미지 메타데이터
      ├── video_metadata.json     # 비디오 메타데이터
      └── final_shorts.mp4        # 최종 영상
```

---

## 비용 참고

| API | 예상 비용 (8장면 기준) |
|-----|----------------------|
| Gemini API (분석) | ~$0.01 |
| Imagen 4 (이미지) | ~$0.31 (8 images @ $0.039/image) |
| Stability AI (비디오) | ~$0.80 (8 videos) |
| ElevenLabs | ~$0.10 |
| Whisper | ~$0.02 |
| Creatomate | ~$0.50 |
| **총합** | **~$1.74/영상** |
