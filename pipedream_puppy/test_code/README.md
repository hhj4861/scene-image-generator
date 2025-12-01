# Test Code 폴더 구조

테스트 코드들을 기능별로 그룹핑한 구조입니다.

## 📁 폴더 구조

```
test_code/
├── topic/          # 토픽 생성 테스트
│   └── test-topic-generator.mjs
├── script/         # 스크립트 생성 테스트
│   └── test-script-generator.mjs
├── image/          # 이미지 생성 테스트
│   └── test-image-generator.mjs
├── hedra/          # Hedra 립싱크 테스트
│   ├── test-hedra-only.mjs
│   ├── test-hedra-with-tts.mjs
│   ├── test-hedra-pipeline.mjs
│   ├── test-hedra-owner-scene.mjs
│   ├── test-hedra-prompts.mjs
│   ├── test-hedra-nodding.mjs
│   ├── test-hedra-minimal-prompt.mjs
│   ├── test-hedra-empty-prompt.mjs
│   └── test-lipsync-studio.mjs
├── veo/            # VEO 비디오 생성 테스트
│   ├── test-veo-only.mjs
│   ├── test-veo-single.mjs
│   ├── test-veo-pipeline.mjs
│   ├── test-veo-owner-scene.mjs
│   ├── test-veo-tts-combine.mjs
│   ├── test-veo-vs-hedra.mjs
│   └── test-veo3-generator.mjs
├── bgm/            # BGM 생성 테스트
│   └── test-bgm-only.mjs
├── creatomate/     # Creatomate 렌더링 테스트
│   ├── test-creatomate-only.mjs
│   ├── test-creatomate-combine-videos.mjs
│   ├── test-creatomate-from-video.mjs
│   └── test-ffmpeg-combine-videos.mjs
├── youtube/        # YouTube 업로드 테스트
│   └── test-youtube-upload.mjs
└── pipeline/       # 전체 파이프라인 테스트
    ├── local-test-pipeline.mjs
    └── test-steps-2-to-6.mjs
```

## 🚀 실행 방법

### Topic Generator 테스트
```bash
GEMINI_API_KEY="your-key" node pipedream_puppy/test_code/topic/test-topic-generator.mjs
```

### Script Generator 테스트
```bash
GEMINI_API_KEY="your-key" node pipedream_puppy/test_code/script/test-script-generator.mjs
```

### Image Generator 테스트
```bash
GEMINI_API_KEY="your-key" node pipedream_puppy/test_code/image/test-image-generator.mjs
```

### Hedra 립싱크 테스트
```bash
HEDRA_API_KEY="your-key" ELEVENLABS_API_KEY="your-key" node pipedream_puppy/test_code/hedra/test-hedra-only.mjs
```

### VEO 비디오 테스트
```bash
GEMINI_API_KEY="your-key" node pipedream_puppy/test_code/veo/test-veo-only.mjs
```

### BGM 테스트
```bash
MUSICAPI_KEY="your-key" node pipedream_puppy/test_code/bgm/test-bgm-only.mjs
```

### Creatomate 테스트
```bash
CREATOMATE_API_KEY="your-key" node pipedream_puppy/test_code/creatomate/test-creatomate-only.mjs
```

### 전체 파이프라인 테스트
```bash
GEMINI_API_KEY="your-key" node pipedream_puppy/test_code/pipeline/local-test-pipeline.mjs
```

## 📝 카테고리 설명

| 폴더 | 설명 | 주요 API |
|------|------|----------|
| `topic/` | 토픽/키워드 생성 | Gemini |
| `script/` | 스크립트/대본 생성 | Gemini |
| `image/` | 이미지 생성 | Gemini Imagen |
| `hedra/` | 립싱크 비디오 생성 | Hedra, ElevenLabs |
| `veo/` | VEO 비디오 생성 | Gemini VEO |
| `bgm/` | 배경음악 생성 | MusicAPI |
| `creatomate/` | 비디오 렌더링/합성 | Creatomate, FFmpeg |
| `youtube/` | YouTube 업로드 | YouTube Data API |
| `pipeline/` | 전체 파이프라인 통합 | All |
