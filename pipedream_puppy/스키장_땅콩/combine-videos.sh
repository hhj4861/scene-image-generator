#!/bin/bash
# Video Combine Script with Subtitles and BGM
# Font Style: Same as img_4.png reference

set -e

WORK_DIR="/app/ski_peanut"
OUTPUT_DIR="$WORK_DIR/output"
VIDEO_DIR="$WORK_DIR/video"
BGM_FILE="$WORK_DIR/bgm.mp3"

mkdir -p "$OUTPUT_DIR"

# Download BGM
echo "Downloading BGM..."
curl -L -o "$BGM_FILE" "https://cdn1.suno.ai/a66a5a1e-0029-48a5-b431-b96b9fe47d5e.mp3"

# Check available fonts
echo "Checking fonts..."
fc-list | grep -i "nanum\|gmarket\|noto" | head -20 || echo "Standard fonts will be used"

# Scene data (duration, korean, english, top_korean, top_english)
# Top text = title that stays for entire video
TOP_KOREAN="스키장 인싸견의 최후"
TOP_ENGLISH="The End of a Ski Resort Influencer Dog"

# Define scenes array
declare -a SCENES=(
  "1|4|사람들이 알아보고 사진찍어서 부끄럽개...|I'm embarrassed because people recognize me and take pictures..."
  "2|4|땅콩 씨, 스키장에 가게 된 계기가 무엇인가요?|Mr. TtangKong, what made you go to the ski resort?"
  "3|6|추워서 가기 싫었는데 주인이랑 할미가 가자고 조르지 모에요 ㅎㅎㅎㅎ|I didn't want to go because it was cold, but my owner and grandma kept asking me to go hehehehe"
  "4|6|그리고 예전에 할미랑 썰매도 타다가 보드도 타면서 재밌게 놀았었어요|And in the past, I had fun playing with my grandma, riding sleds and snowboards"
  "5|6||"
  "6|6|그리고 나서 혼자타는데...결국 엉덩이스키로 내려왔지 모에요|And then I rode alone... in the end, I came down with butt skiing"
  "7|4|그런데, 그게 인싸가 된 비결이라는데요?|But, that's how you became popular, isn't it?"
  "8|6|맞아요! 엉덩이 스키는 생각보다 재밌더라구요! 사람들이 막 사진 찍고...|That's right! Butt-skiing is more fun than I thought! People were taking pictures and..."
  "9|8|스노우보드는 실패했지만, 엉덩이가 시원해졌으니 괜찮아요! 히히히히~|Even though snowboarding failed, my butt is cool, so it's okay! Hehehehehe~"
)

# Font settings (matching img_4.png style)
# Korean: Bold rounded gothic with black border
# English: Serif font
FONT_KOREAN="NanumSquareRound"
FONT_ENGLISH="NotoSerif"
FONT_SIZE_TOP_KO=52
FONT_SIZE_TOP_EN=32
FONT_SIZE_SUB_KO=40
FONT_SIZE_SUB_EN=24

# Create concat list
echo "Creating video list..."
CONCAT_LIST="$WORK_DIR/concat_list.txt"
> "$CONCAT_LIST"

for scene_data in "${SCENES[@]}"; do
  IFS='|' read -r scene_num duration korean english <<< "$scene_data"
  echo "file '$VIDEO_DIR/scene${scene_num}_veo3_json.mp4'" >> "$CONCAT_LIST"
done

echo "Video list created:"
cat "$CONCAT_LIST"

# First, concatenate all videos
echo "Concatenating videos..."
ffmpeg -y -f concat -safe 0 -i "$CONCAT_LIST" -c copy "$OUTPUT_DIR/concat_raw.mp4"

# Get total duration
TOTAL_DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUTPUT_DIR/concat_raw.mp4")
echo "Total video duration: ${TOTAL_DURATION}s"

# Build filter for subtitles
# Position: top text at top, subtitles at bottom center of video area
# Video is 9:16 ratio (1080x1920)

# Calculate timing for each scene
echo "Building subtitle filter..."

# Start time tracking
declare -a START_TIMES
current_time=0
for scene_data in "${SCENES[@]}"; do
  IFS='|' read -r scene_num duration korean english <<< "$scene_data"
  START_TIMES+=($current_time)
  current_time=$((current_time + duration))
done

# Build drawtext filter
FILTER=""

# Top Korean title (stays entire video)
# Style: Bold, black border, white fill
FILTER+="drawtext=fontfile=/usr/share/fonts/truetype/nanum/NanumSquareRoundOTFEB.otf:text='${TOP_KOREAN}':fontsize=${FONT_SIZE_TOP_KO}:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=80,"

# Top English title (stays entire video)
FILTER+="drawtext=fontfile=/usr/share/fonts/truetype/noto/NotoSerif-Regular.ttf:text='${TOP_ENGLISH}':fontsize=${FONT_SIZE_TOP_EN}:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=145,"

# Add subtitles for each scene
for i in "${!SCENES[@]}"; do
  IFS='|' read -r scene_num duration korean english <<< "${SCENES[$i]}"
  start=${START_TIMES[$i]}
  end=$((start + duration))

  # Skip empty subtitles
  if [ -n "$korean" ]; then
    # Korean subtitle (center bottom of video)
    # Escape special characters
    korean_escaped=$(echo "$korean" | sed "s/'/\\\\'/g" | sed 's/:/\\:/g')
    english_escaped=$(echo "$english" | sed "s/'/\\\\'/g" | sed 's/:/\\:/g')

    # Korean text (bold, white with black border)
    FILTER+="drawtext=fontfile=/usr/share/fonts/truetype/nanum/NanumSquareRoundOTFEB.otf:text='${korean_escaped}':fontsize=${FONT_SIZE_SUB_KO}:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h-280:enable='between(t,${start},${end})',"

    # English text (serif, smaller, below Korean)
    FILTER+="drawtext=fontfile=/usr/share/fonts/truetype/noto/NotoSerif-Regular.ttf:text='${english_escaped}':fontsize=${FONT_SIZE_SUB_EN}:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y=h-220:enable='between(t,${start},${end})',"
  fi
done

# Remove trailing comma
FILTER=${FILTER%,}

echo "Applying subtitles..."
ffmpeg -y -i "$OUTPUT_DIR/concat_raw.mp4" -vf "$FILTER" -c:v libx264 -preset fast -crf 18 -c:a copy "$OUTPUT_DIR/with_subtitles.mp4"

# Add BGM (mix with original audio)
echo "Adding BGM..."
ffmpeg -y -i "$OUTPUT_DIR/with_subtitles.mp4" -i "$BGM_FILE" \
  -filter_complex "[0:a]volume=1.0[a0];[1:a]volume=0.3,afade=t=out:st=$((${TOTAL_DURATION%.*}-2)):d=2[a1];[a0][a1]amix=inputs=2:duration=shortest[aout]" \
  -map 0:v -map "[aout]" \
  -c:v copy -c:a aac -b:a 192k \
  "$OUTPUT_DIR/final_with_bgm.mp4"

echo ""
echo "=========================================="
echo "Video processing complete!"
echo "Output: $OUTPUT_DIR/final_with_bgm.mp4"
echo "=========================================="

# Show file info
ls -la "$OUTPUT_DIR/"
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUTPUT_DIR/final_with_bgm.mp4"
