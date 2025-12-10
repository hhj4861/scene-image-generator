# Puppy Video Generator

Veo3 API를 이용한 영상 생성 및 FFmpeg VM을 통한 영상 합성 파이프라인

## 프로젝트 구조

```
pipedream_puppy/
├── test-veo3-ski-json-int.mjs    # Veo3 영상 생성 스크립트
├── combine-ffmpeg-vm.cjs          # FFmpeg VM 영상 합성 스크립트
├── README.md
└── [프로젝트폴더]/
    ├── config.json                # 프로젝트 설정
    ├── script/
    │   └── vedio_script.json      # 씬별 스크립트
    ├── image/
    │   └── segment_number{N}.png  # 참조 이미지
    ├── video/
    │   └── scene{N}_veo3_json.mp4 # 생성된 영상
    └── output_url.txt             # 최종 합성 영상 URL
```

## 1. Veo3 영상 생성 (test-veo3-ski-json-int.mjs)

### 사용법

```bash
# 씬 목록 출력
GEMINI_API_KEY=xxx node test-veo3-ski-json-int.mjs [프로젝트경로]

# 특정 씬 생성
GEMINI_API_KEY=xxx node test-veo3-ski-json-int.mjs [프로젝트경로] [씬번호]

# 프롬프트 미리보기 (영상 생성 없이)
GEMINI_API_KEY=xxx node test-veo3-ski-json-int.mjs [프로젝트경로] [씬번호] --preview
```

### 예시

```bash
# 조선-땅콩 프로젝트 씬 목록 확인
GEMINI_API_KEY=AIzaSyXXX node test-veo3-ski-json-int.mjs 조선-땅콩

# 조선-땅콩 프로젝트 씬 1 생성
GEMINI_API_KEY=AIzaSyXXX node test-veo3-ski-json-int.mjs 조선-땅콩 1

# 병렬 생성 (다른 API 키 사용)
GEMINI_API_KEY=AIzaSyXXX node test-veo3-ski-json-int.mjs 조선-땅콩 2 &
GEMINI_API_KEY=AIzaSyYYY node test-veo3-ski-json-int.mjs 조선-땅콩 3 &
```

### 비율 옵션

```bash
# 세로(9:16) 강제
node test-veo3-ski-json-int.mjs 조선-땅콩 1 --portrait

# 가로(16:9) 강제
node test-veo3-ski-json-int.mjs 조선-땅콩 1 --landscape
```

### 필수 파일

#### config.json (Veo3용)
```json
{
  "project_name": "조선-땅콩",
  "default_character": {
    "name": "땅콩",
    "breed": "Pomeranian",
    "fur_color": "golden cream",
    "accessories": ["silver hair clip", "Hanbok"]
  },
  "default_background": "Traditional Korean Hanok",
  "default_voice": {
    "type": "Korean baby infant voice, 2-3 years old, low-pitched adorable tone",
    "characteristics": "very slow speech, babbling pronunciation, cute baby talk"
  },
  "interviewer_voice": {
    "type": "Korean female news anchor, 30s, professional friendly tone"
  }
}
```

---

## 2. FFmpeg VM 영상 합성 (combine-ffmpeg-vm.cjs)

### 사용법

```bash
# 프로젝트 폴더 지정
node combine-ffmpeg-vm.cjs [프로젝트경로]

# 현재 폴더
node combine-ffmpeg-vm.cjs
```

### 예시

```bash
# 조선-땅콩 프로젝트 합성
node combine-ffmpeg-vm.cjs 조선-땅콩

# 절대 경로
node combine-ffmpeg-vm.cjs /path/to/project
```

### 필수 파일

#### config.json (FFmpeg VM용)
```json
{
  "project_name": "조선-땅콩",
  "project_id": "joseon_peanut",
  "title": {
    "korean": "조선 힙스터 댕댕이: 반전 일상 대공개!",
    "english": "Joseon Hipster Dog: A Day in the Life!"
  },
  "footer": {
    "korean": "땅콩이의 귀여운 하루",
    "english": "Pomeranian TtangKong Cute Day"
  },
  "bgm_url": "https://cdn1.suno.ai/xxx.mp3",
  "bgm_volume": 0.25,
  "scene_count": 7
}
```

### 영상 파일 규칙

video/ 폴더에 다음 형식의 파일이 있어야 합니다:
- `scene1_veo3_json.mp4`
- `scene2_veo3_json.mp4`
- ... 또는 ...
- `scene1.mp4`
- `scene2.mp4`

---

## 3. 전체 워크플로우

### Step 1: 프로젝트 폴더 생성
```bash
mkdir -p 프로젝트명/{script,image,video}
```

### Step 2: 설정 파일 작성
- `config.json` 생성
- `script/vedio_script.json` 생성
- `image/segment_number{N}.png` 이미지 준비

### Step 3: Veo3 영상 생성
```bash
# 모든 씬 병렬 생성
for i in {1..7}; do
  GEMINI_API_KEY=xxx node test-veo3-ski-json-int.mjs 프로젝트명 $i &
done
wait
```

### Step 4: FFmpeg VM 합성
```bash
node combine-ffmpeg-vm.cjs 프로젝트명
```

### Step 5: 결과 확인
```bash
cat 프로젝트명/output_url.txt
```

---

## 4. 액션 키워드 매핑

대사에 포함된 키워드에 따라 자동으로 동작이 추가됩니다:

| 키워드 | 동작 |
|--------|------|
| 흑흑, 엉엉 | 울음 (어깨 떨림, 눈물) |
| 하하하, 호호호 | 웃음 (입 벌림, 몸 흔들림) |
| 폴짝폴짝, 깡충 | 점프 (뛰어오름) |
| 빙글빙글 | 회전 (제자리 돌기) |
| 신나, 야호 | 기쁨 (앞발 들기) |
| 부끄럽 | 부끄러움 (얼굴 가리기) |
| 꼬리 흔 | 꼬리 흔들기 |
| 콰당 | 넘어짐 (코믹하게 쓰러짐) |

---

## 5. 환경 변수

```bash
# Gemini API 키 (Veo3 영상 생성에 필요)
export GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXX

# Google Cloud 인증 (GCS 업로드에 필요)
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
```

---

## 6. 트러블슈팅

### 영상에 자막이 나오는 경우
- Veo3 모델 한계로 가끔 자막이 생성됨
- 프롬프트에 `ABSOLUTE RULE #0 - NO TEXT` 규칙이 적용되어 있음
- 재생성으로 해결 가능

### 음성이 아기 목소리가 아닌 경우
- Veo3 모델 한계로 가끔 기본 음성 사용
- 프롬프트에 음성 타입이 강조되어 있음
- 재생성으로 해결 가능
