# 📱 땅콩이 모바일 업로더

모바일에서 영상과 스크립트를 업로드하여 쇼츠 영상을 렌더링하는 시스템입니다.

## 📁 파일 구조

```
mobile-uploader/
├── index.html          # 모바일 업로드 UI (호스팅 필요)
├── upload-handler.mjs  # Pipedream: 파일 → GCS 업로드
├── render-trigger.mjs  # Pipedream: 렌더링 시작
└── README.md           # 이 문서
```

## 🚀 설치 및 설정

### Step 1: Pipedream 워크플로우 생성

#### 워크플로우 A: 파일 업로드 핸들러
1. [Pipedream](https://pipedream.com) 로그인
2. "New Workflow" 클릭
3. **Trigger**: "HTTP / Webhook" 선택
   - Method: `POST`
   - "Return a custom response" 활성화
4. **Step 2**: "Code" 추가
   - `upload-handler.mjs` 내용 붙여넣기
5. Props 설정:
   - `gcs_credentials`: GCS 서비스 계정 JSON (전체 복사)
   - `gcs_bucket`: `shorts-videos-storage-mcp-test-457809`
6. Deploy 후 **HTTP Trigger URL** 복사

#### 워크플로우 B: 렌더링 트리거
1. 새 워크플로우 생성
2. **Trigger**: "HTTP / Webhook" 선택
   - Method: `POST`
3. **Step 2**: "Code" 추가
   - `render-trigger.mjs` 내용 붙여넣기
4. Props 설정 (기본값 또는 필요시 수정)
5. Deploy 후 **HTTP Trigger URL** 복사

### Step 2: 웹 업로드 페이지 설정

1. `index.html` 열기
2. CONFIG 수정:
   ```javascript
   const CONFIG = {
       UPLOAD_ENDPOINT: '여기에_워크플로우_A_URL',
       RENDER_ENDPOINT: '여기에_워크플로우_B_URL',
       GCS_BUCKET: 'shorts-videos-storage-mcp-test-457809'
   };
   ```
3. GitHub Pages, Vercel, 또는 Netlify에 호스팅

### Step 3: 모바일에서 접속

1. 호스팅된 URL 접속 (모바일 브라우저)
2. 프로젝트 이름 입력
3. 영상 파일 선택 (씬1.mp4, 씬2.mp4 ...)
4. 스크립트 파일 또는 직접 입력
5. "업로드 & 렌더링 시작" 터치

## 📋 입력 형식

### 영상 파일
- 형식: MP4, MOV, WebM
- 명명규칙: `씬1.mp4`, `씬2.mp4`, ... 또는 자유 이름
- 여러 파일 동시 선택 가능

### 스크립트 파일 (선택)
```json
{
  "project_name": "땅콩이와버터",
  "title": {
    "korean": "연하남의 미친 플러팅",
    "english": "Crazy Flirting"
  },
  "footer": {
    "korean": "수줍은 땅콩 & 버터 🐶",
    "english": "Shy Peanut & Butter"
  },
  "scene_count": 8,
  "bgm_url": "https://cdn1.suno.ai/xxx.mp3",
  "timed_subtitles": [
    {
      "start_time": 0,
      "end_time": 3,
      "text_ko": "안녕하세요",
      "text_en": "Hello"
    }
  ],
  "scenes": [
    {
      "video": 2,
      "profile_card": {
        "header": "[여자 출연자]",
        "position": "right",
        "items": [
          { "label": "이름", "value": "땅콩이" }
        ]
      }
    }
  ]
}
```

### 직접 입력 (스크립트 없이)
- 헤더 타이틀 (한글/영어)
- 푸터 (채널명)
- 자막 (시간, 텍스트 형식)

## 🔧 커스터마이징

### Layout 설정 (render-trigger.mjs)
```javascript
layout_header_y: 300,        // 헤더 Y 위치
layout_video_area_y: 250,    // 영상 영역 Y 위치
layout_subtitle_y: 950,      // 자막 Y 위치
layout_footer_y: 1000,       // 푸터 Y 위치
```

### BGM 볼륨
```javascript
default_bgm_volume: "0.15",           // 음성 있는 씬
default_bgm_volume_no_audio: "0.8",   // 음성 없는 씬
```

### Profile Card
```javascript
profile_card_base_y: 580,       // 시작 Y 위치
profile_card_line_height: 40,   // 줄 간격
profile_card_right_margin: 150, // 오른쪽 여백
```

## 🌐 호스팅 옵션

### GitHub Pages (무료)
1. GitHub에 `index.html` 푸시
2. Settings → Pages → Source: main branch
3. URL: `https://username.github.io/repo-name/`

### Vercel (무료)
1. `vercel.json` 생성:
   ```json
   {
     "rewrites": [{ "source": "/", "destination": "/index.html" }]
   }
   ```
2. Vercel에 배포
3. URL: `https://project-name.vercel.app`

### Netlify (무료)
1. `index.html` 폴더를 Netlify에 드래그
2. URL: `https://random-name.netlify.app`

## 📱 iOS 단축어 (선택사항)

더 빠른 업로드를 위해 iOS 단축어를 설정할 수 있습니다:

1. 단축어 앱 → 새 단축어
2. "파일 선택" 액션 추가
3. "URL의 내용 가져오기" 액션 추가:
   - URL: Pipedream HTTP Trigger URL
   - Method: POST
   - Body: Form
4. 홈 화면에 추가

## 🐛 문제 해결

### "파일 업로드 실패"
- 파일 크기 확인 (Pipedream 무료: 5MB 제한)
- 네트워크 연결 확인

### "렌더링 요청 실패"
- FFmpeg VM 서버 상태 확인
- GCS 권한 확인

### CORS 오류
- Pipedream HTTP Trigger에서 CORS 헤더 확인
- 또는 프록시 사용

## 📞 지원

문제 발생 시 서버 로그 확인:
```bash
ssh guswhd1085@34.64.168.173
pm2 logs
```

