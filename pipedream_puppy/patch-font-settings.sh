#!/bin/bash
# VM 서버에 font_settings 지원 추가 패치

# 1. 백업
sudo cp /app/server.js /app/server.js.bak_font_settings

# 2. font_settings를 destructuring에 추가 (folder_name, 다음에 추가)
sudo sed -i 's/folder_name,$/folder_name,\n            font_settings = null, \/\/ 커스텀 폰트 설정 {header_korean, header_english, subtitle_korean, subtitle_english}/' /app/server.js

# 3. getMergedStyle 함수 추가 (PEANUT_STYLE 정의 직후에 추가)
# PEANUT_STYLE 끝나는 위치 찾기
PEANUT_END=$(grep -n "^};" /app/server.js | head -1 | cut -d: -f1)

# 함수 삽입
sudo sed -i "${PEANUT_END}a\\
\\
// font_settings를 PEANUT_STYLE과 병합하는 함수\\
function getMergedStyle(fontSettings) {\\
    if (!fontSettings) return PEANUT_STYLE;\\
    \\
    // 깊은 복사\\
    const merged = JSON.parse(JSON.stringify(PEANUT_STYLE));\\
    \\
    // header_korean -> header\\
    if (fontSettings.header_korean) {\\
        if (fontSettings.header_korean.size) merged.header.font_size = fontSettings.header_korean.size;\\
        if (fontSettings.header_korean.max_chars_per_line) merged.header.max_chars_per_line = fontSettings.header_korean.max_chars_per_line;\\
        if (fontSettings.header_korean.font) merged.header.custom_font = fontSettings.header_korean.font;\\
    }\\
    \\
    // header_english\\
    if (fontSettings.header_english) {\\
        if (fontSettings.header_english.size) merged.header_english.font_size = fontSettings.header_english.size;\\
        if (fontSettings.header_english.font) merged.header_english.custom_font = fontSettings.header_english.font;\\
    }\\
    \\
    // subtitle_korean -> subtitle\\
    if (fontSettings.subtitle_korean) {\\
        if (fontSettings.subtitle_korean.size) merged.subtitle.font_size = fontSettings.subtitle_korean.size;\\
        if (fontSettings.subtitle_korean.max_lines) merged.subtitle.max_lines = fontSettings.subtitle_korean.max_lines;\\
        if (fontSettings.subtitle_korean.font) merged.subtitle.custom_font = fontSettings.subtitle_korean.font;\\
        // interviewer도 동일하게 적용\\
        if (fontSettings.subtitle_korean.size) merged.subtitle_interviewer.font_size = fontSettings.subtitle_korean.size;\\
        if (fontSettings.subtitle_korean.font) merged.subtitle_interviewer.custom_font = fontSettings.subtitle_korean.font;\\
    }\\
    \\
    // subtitle_english\\
    if (fontSettings.subtitle_english) {\\
        if (fontSettings.subtitle_english.size) merged.subtitle_english.font_size = fontSettings.subtitle_english.size;\\
        if (fontSettings.subtitle_english.font) merged.subtitle_english.custom_font = fontSettings.subtitle_english.font;\\
        // interviewer english도 동일하게\\
        if (fontSettings.subtitle_english.size) merged.subtitle_interviewer_english.font_size = fontSettings.subtitle_english.size;\\
        if (fontSettings.subtitle_english.font) merged.subtitle_interviewer_english.custom_font = fontSettings.subtitle_english.font;\\
    }\\
    \\
    // footer_korean -> footer\\
    if (fontSettings.footer_korean) {\\
        if (fontSettings.footer_korean.size) merged.footer.font_size = fontSettings.footer_korean.size;\\
        if (fontSettings.footer_korean.font) merged.footer.custom_font = fontSettings.footer_korean.font;\\
    }\\
    \\
    // footer_english\\
    if (fontSettings.footer_english) {\\
        if (fontSettings.footer_english.size) merged.footer_english.font_size = fontSettings.footer_english.size;\\
        if (fontSettings.footer_english.font) merged.footer_english.custom_font = fontSettings.footer_english.font;\\
    }\\
    \\
    console.log('[FONT_SETTINGS] Merged style:', JSON.stringify({\\
        header_font_size: merged.header.font_size,\\
        header_english_font_size: merged.header_english.font_size,\\
        subtitle_font_size: merged.subtitle.font_size,\\
        subtitle_english_font_size: merged.subtitle_english.font_size\\
    }));\\
    \\
    return merged;\\
}" /app/server.js

echo "Patch script - getMergedStyle function added"
