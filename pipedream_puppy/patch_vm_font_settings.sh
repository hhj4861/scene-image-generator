#!/bin/bash
# VM 서버 font_settings 패치 스크립트
# 헤더, 자막, 푸터의 폰트 크기를 요청값으로 오버라이드

# 1. 백업 생성
cp /app/server.js /app/server.js.bak_font_settings

# 2. applyFontSettings 함수 추가 (PEANUT_STYLE 정의 후에)
cat >> /tmp/font_settings_func.js << 'EOF'

// =====================
// font_settings 오버라이드 함수 - PEANUT_STYLE에 요청값 적용
// =====================
function applyFontSettings(baseStyle, fontSettings) {
    if (!fontSettings) return baseStyle;
    const result = JSON.parse(JSON.stringify(baseStyle));
    
    // 헤더 한글 폰트 크기
    if (fontSettings.header_korean?.size) result.header.font_size = fontSettings.header_korean.size;
    
    // 헤더 영문 폰트 크기
    if (fontSettings.header_english?.size) result.header_english.font_size = fontSettings.header_english.size;
    
    // 자막 한글 폰트 크기
    if (fontSettings.subtitle_korean?.size) {
        result.subtitle.font_size = fontSettings.subtitle_korean.size;
        result.subtitle_interviewer.font_size = fontSettings.subtitle_korean.size;
    }
    
    // 자막 영문 폰트 크기
    if (fontSettings.subtitle_english?.size) {
        result.subtitle_english.font_size = fontSettings.subtitle_english.size;
        result.subtitle_interviewer_english.font_size = fontSettings.subtitle_english.size;
    }
    
    // 푸터 한글 폰트 크기
    if (fontSettings.footer_korean?.size) result.footer.font_size = fontSettings.footer_korean.size;
    
    // 푸터 영문 폰트 크기
    if (fontSettings.footer_english?.size) result.footer_english.font_size = fontSettings.footer_english.size;
    
    return result;
}
EOF

echo "Font settings patch script ready"
