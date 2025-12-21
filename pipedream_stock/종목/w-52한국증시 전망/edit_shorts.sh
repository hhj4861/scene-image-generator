#!/bin/bash
# W52 한국증시 전망 쇼츠 편집 스크립트 (v4 - 인트로, 예상밴드 제외)

VIDEO="./w52-한국증시.mp4"
TEMP_DIR="./video/temp_segments"

mkdir -p "$TEMP_DIR"
mkdir -p "./video"

echo "영상 구간 추출 중... (v4 - 인트로, 예상밴드 제외)"

# Scene 1: 산타랠리 질문 - 인트로 제외 (20.20s - 28.90s) ~9초
ffmpeg -y -ss 20.20 -to 28.90 -i "$VIDEO" -c copy "$TEMP_DIR/seg01.mp4" 2>/dev/null

# Scene 2: 지난주 증시 정리 (42.40s - 61.90s) ~20초
ffmpeg -y -ss 42.40 -to 61.90 -i "$VIDEO" -c copy "$TEMP_DIR/seg02.mp4" 2>/dev/null

# Scene 3: 두 가지 관문 소개 (88.60s - 109.60s) ~21초 [기존 Scene 4]
ffmpeg -y -ss 88.60 -to 109.60 -i "$VIDEO" -c copy "$TEMP_DIR/seg03.mp4" 2>/dev/null

# Scene 4: PCE 중요성 (118.60s - 133.60s) ~15초 [기존 Scene 5]
ffmpeg -y -ss 118.60 -to 133.60 -i "$VIDEO" -c copy "$TEMP_DIR/seg04.mp4" 2>/dev/null

# Scene 5: 세금 영향 (139.60s - 151.60s) ~12초 [기존 Scene 6]
ffmpeg -y -ss 139.60 -to 151.60 -i "$VIDEO" -c copy "$TEMP_DIR/seg05.mp4" 2>/dev/null

# Scene 6: 보물 지도 전환 (157.60s - 168.10s) ~10초 [기존 Scene 7]
ffmpeg -y -ss 157.60 -to 168.10 -i "$VIDEO" -c copy "$TEMP_DIR/seg06.mp4" 2>/dev/null

# Scene 7: 투자 기회 1 - 성장주/HBM/로봇/ESS (168.10s - 190.10s) ~22초 [기존 Scene 8]
ffmpeg -y -ss 168.10 -to 190.10 -i "$VIDEO" -c copy "$TEMP_DIR/seg07.mp4" 2>/dev/null

# Scene 8: 투자 기회 2 - 고배당/바이오 (194.10s - 210.10s) ~16초 [기존 Scene 9]
ffmpeg -y -ss 194.10 -to 210.10 -i "$VIDEO" -c copy "$TEMP_DIR/seg08.mp4" 2>/dev/null

# Scene 9: 마무리 비유 (편집 - 4개 자막/영상 제거)
# 9a: 이번 주 시장을 관통하는... + 바로 이겁니다... (217.10s - 225.10s) ~8초
ffmpeg -y -ss 217.10 -to 225.10 -i "$VIDEO" -c copy "$TEMP_DIR/seg09a.mp4" 2>/dev/null
# 9b: 산타랠리에 대한 기대감과 설렘... (232.10s - 239.10s) ~7초
ffmpeg -y -ss 232.10 -to 239.10 -i "$VIDEO" -c copy "$TEMP_DIR/seg09b.mp4" 2>/dev/null
# 9c: 희망과 정리가... + 여러분의 포트폴리오는... (250.10s - 265.10s) ~15초
ffmpeg -y -ss 250.10 -to 265.10 -i "$VIDEO" -c copy "$TEMP_DIR/seg09c.mp4" 2>/dev/null

# Scene 9 파트 병합
echo "Scene 9 파트 병합 중..."
echo "file 'seg09a.mp4'" > "$TEMP_DIR/seg09_list.txt"
echo "file 'seg09b.mp4'" >> "$TEMP_DIR/seg09_list.txt"
echo "file 'seg09c.mp4'" >> "$TEMP_DIR/seg09_list.txt"
ffmpeg -y -f concat -safe 0 -i "$TEMP_DIR/seg09_list.txt" -c copy "$TEMP_DIR/seg09.mp4" 2>/dev/null

echo "구간 추출 완료!"
echo ""

# 각 세그먼트 길이 확인
echo "=== 세그먼트 길이 확인 ==="
for f in "$TEMP_DIR"/seg0*.mp4; do
  duration=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$f" 2>/dev/null)
  echo "$(basename $f): ${duration}초"
done

# 총 길이 계산
total=0
for f in "$TEMP_DIR"/seg0*.mp4; do
  duration=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$f" 2>/dev/null)
  total=$(echo "$total + $duration" | bc)
done
echo ""
echo "총 길이: ${total}초"
