// VM 서버에 font_settings 지원 추가하는 패치 스크립트
// 사용법: node add-font-settings-support.js > patch.txt && 복사해서 VM에 적용

const getMergedStyleFunction = `
// font_settings를 PEANUT_STYLE과 병합하는 함수
function getMergedStyle(fontSettings) {
    if (!fontSettings) return PEANUT_STYLE;

    // 깊은 복사
    const merged = JSON.parse(JSON.stringify(PEANUT_STYLE));

    // header_korean -> header
    if (fontSettings.header_korean) {
        if (fontSettings.header_korean.size) merged.header.font_size = fontSettings.header_korean.size;
        if (fontSettings.header_korean.max_chars_per_line) merged.header.max_chars_per_line = fontSettings.header_korean.max_chars_per_line;
    }

    // header_english
    if (fontSettings.header_english) {
        if (fontSettings.header_english.size) merged.header_english.font_size = fontSettings.header_english.size;
    }

    // subtitle_korean -> subtitle, subtitle_interviewer
    if (fontSettings.subtitle_korean) {
        if (fontSettings.subtitle_korean.size) {
            merged.subtitle.font_size = fontSettings.subtitle_korean.size;
            merged.subtitle_interviewer.font_size = fontSettings.subtitle_korean.size;
        }
        if (fontSettings.subtitle_korean.max_lines) {
            merged.subtitle.max_lines = fontSettings.subtitle_korean.max_lines;
        }
    }

    // subtitle_english -> subtitle_english, subtitle_interviewer_english
    if (fontSettings.subtitle_english) {
        if (fontSettings.subtitle_english.size) {
            merged.subtitle_english.font_size = fontSettings.subtitle_english.size;
            merged.subtitle_interviewer_english.font_size = fontSettings.subtitle_english.size;
        }
    }

    // footer_korean -> footer
    if (fontSettings.footer_korean) {
        if (fontSettings.footer_korean.size) merged.footer.font_size = fontSettings.footer_korean.size;
    }

    // footer_english
    if (fontSettings.footer_english) {
        if (fontSettings.footer_english.size) merged.footer_english.font_size = fontSettings.footer_english.size;
    }

    console.log('[FONT_SETTINGS] Applied custom font settings:', JSON.stringify({
        header: merged.header.font_size,
        header_english: merged.header_english.font_size,
        subtitle: merged.subtitle.font_size,
        subtitle_english: merged.subtitle_english.font_size
    }));

    return merged;
}
`;

console.log('=== getMergedStyle 함수 ===');
console.log(getMergedStyleFunction);
console.log('\n=== sed 명령어들 ===');

// PEANUT_STYLE.header -> currentStyle.header 등으로 변경하는 sed 명령어
const replacements = [
    // 함수 삽입 위치 찾기 (PEANUT_STYLE 정의 바로 뒤)
    'PEANUT_STYLE 뒤에 getMergedStyle 함수 추가 필요',

    // render/puppy에서 currentStyle 생성
    'const currentStyle = getMergedStyle(font_settings); 추가 필요 (변수 선언 후)',

    // PEANUT_STYLE -> currentStyle 변경
    'PEANUT_STYLE.header -> currentStyle.header',
    'PEANUT_STYLE.header_english -> currentStyle.header_english',
    'PEANUT_STYLE.subtitle -> currentStyle.subtitle',
    'PEANUT_STYLE.subtitle_english -> currentStyle.subtitle_english',
    'PEANUT_STYLE.footer -> currentStyle.footer',
    'PEANUT_STYLE.footer_english -> currentStyle.footer_english',
];

replacements.forEach(r => console.log(r));
