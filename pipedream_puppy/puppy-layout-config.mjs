/**
 * Puppy Video Layout Configuration
 *
 * 이 파일은 FFmpeg VM 렌더링에 사용되는 레이아웃 설정을 정의합니다.
 * combine-ffmpeg-vm.cjs와 파이프라인들에서 공용으로 사용됩니다.
 */

// 기본 해상도
export const DEFAULT_WIDTH = 1080;
export const DEFAULT_HEIGHT = 1920;

/**
 * 레이아웃 설정 생성
 * @param {Object} options - 레이아웃 옵션
 * @param {number} options.width - 출력 너비 (기본값: 1080)
 * @param {number} options.height - 출력 높이 (기본값: 1920)
 * @param {number} options.headerY - 헤더 Y 위치 (기본값: 110)
 * @param {number} options.headerHeight - 헤더 영역 높이 (기본값: 120)
 * @param {number} options.headerGap - 헤더-영상 간격 (기본값: 30)
 * @param {number} options.footerY - 푸터 Y 위치 (기본값: 1550)
 * @param {number} options.footerHeight - 푸터 영역 높이 (기본값: 80)
 * @param {number} options.subtitleY - 자막 Y 위치 (기본값: 1350)
 * @param {number} options.subtitleHeight - 자막 영역 높이 (기본값: 150)
 * @param {number} options.subtitleMaxLines - 자막 최대 줄 수 (기본값: 2)
 * @returns {Object} origin_layout 설정 객체
 */
export function createLayoutConfig(options = {}) {
  const width = options.width || DEFAULT_WIDTH;
  const height = options.height || DEFAULT_HEIGHT;

  // 레이아웃 계산
  const headerY = options.headerY ?? 110;
  const headerHeight = options.headerHeight ?? 120;
  const headerGap = options.headerGap ?? 30;
  const videoAreaY = headerY + headerHeight + headerGap;

  const footerY = options.footerY ?? 1550;
  const footerHeight = options.footerHeight ?? 80;
  const videoEndY = footerY - 50;
  const videoAreaHeight = videoEndY - videoAreaY;

  const subtitleY = options.subtitleY ?? 1350;
  const subtitleHeight = options.subtitleHeight ?? 150;
  const subtitleMaxLines = options.subtitleMaxLines ?? 2;

  const fontScale = width / DEFAULT_WIDTH;

  return {
    video_area: {
      x: 0,
      y: videoAreaY,
      width: width,
      height: videoAreaHeight
    },
    header_area: {
      y: headerY,
      height: headerHeight
    },
    subtitle_area: {
      y: subtitleY,
      height: subtitleHeight,
      single_line: false,
      max_lines: subtitleMaxLines
    },
    footer_area: {
      y: footerY,
      height: footerHeight
    },
    font_scale: fontScale
  };
}

/**
 * 폰트 설정 생성
 * @param {Object} options - 폰트 옵션
 * @param {number} options.fontScale - 폰트 스케일 (기본값: 1)
 * @param {number} options.headerKoreanSize - 헤더 한글 폰트 크기 (기본값: 36)
 * @param {number} options.headerEnglishSize - 헤더 영문 폰트 크기 (기본값: 16)
 * @param {number} options.subtitleKoreanSize - 자막 한글 폰트 크기 (기본값: 50)
 * @param {number} options.subtitleEnglishSize - 자막 영문 폰트 크기 (기본값: 30)
 * @returns {Object} font_settings 설정 객체
 */
export function createFontSettings(options = {}) {
  const fontScale = options.fontScale ?? 1;

  return {
    header_korean: {
      font: options.headerKoreanFont || "NanumSquareRoundOTFEB",
      size: Math.round((options.headerKoreanSize ?? 36) * fontScale),
      color: "white",
      border_width: Math.round(2 * fontScale),
      border_color: "black"
    },
    header_english: {
      font: options.headerEnglishFont || "NotoSerif-Regular",
      size: Math.round((options.headerEnglishSize ?? 16) * fontScale),
      color: "white",
      border_width: Math.round(1 * fontScale),
      border_color: "black"
    },
    subtitle_korean: {
      font: options.subtitleKoreanFont || "NanumSquareRoundOTFEB",
      size: Math.round((options.subtitleKoreanSize ?? 50) * fontScale),
      color: "white",
      border_width: Math.round(4 * fontScale),
      border_color: "black"
    },
    subtitle_english: {
      font: options.subtitleEnglishFont || "NotoSerif-Regular",
      size: Math.round((options.subtitleEnglishSize ?? 30) * fontScale),
      color: "white",
      border_width: Math.round(3 * fontScale),
      border_color: "black"
    }
  };
}

/**
 * 전체 렌더링 설정 생성 (레이아웃 + 폰트)
 * @param {Object} options - 전체 옵션
 * @returns {Object} { origin_layout, font_settings, width, height }
 */
export function createRenderConfig(options = {}) {
  const width = options.width || DEFAULT_WIDTH;
  const height = options.height || DEFAULT_HEIGHT;
  const fontScale = width / DEFAULT_WIDTH;

  const layoutConfig = createLayoutConfig({ ...options, width, height });
  const fontSettings = createFontSettings({ ...options, fontScale });

  return {
    width,
    height,
    use_origin_size: true,
    origin_layout: layoutConfig,
    font_settings: fontSettings
  };
}

/**
 * 기본 프리셋 설정들
 */
export const PRESETS = {
  // 기본 설정 (1080x1920, 자막 50/30pt)
  default: {
    width: 1080,
    height: 1920,
    subtitleKoreanSize: 50,
    subtitleEnglishSize: 30,
    subtitleMaxLines: 2
  },

  // 큰 자막 설정
  large_subtitle: {
    width: 1080,
    height: 1920,
    subtitleKoreanSize: 60,
    subtitleEnglishSize: 40,
    subtitleMaxLines: 2
  },

  // 작은 자막 설정
  small_subtitle: {
    width: 1080,
    height: 1920,
    subtitleKoreanSize: 45,
    subtitleEnglishSize: 28,
    subtitleMaxLines: 2
  },

  // 3줄 자막 설정
  three_lines: {
    width: 1080,
    height: 1920,
    subtitleKoreanSize: 45,
    subtitleEnglishSize: 28,
    subtitleMaxLines: 3
  }
};

/**
 * 프리셋 기반 설정 생성
 * @param {string} presetName - 프리셋 이름 (default, large_subtitle, small_subtitle, three_lines)
 * @param {Object} overrides - 프리셋 값을 덮어쓸 옵션
 * @returns {Object} 렌더링 설정
 */
export function createFromPreset(presetName = 'default', overrides = {}) {
  const preset = PRESETS[presetName] || PRESETS.default;
  return createRenderConfig({ ...preset, ...overrides });
}

// CommonJS 호환성을 위한 기본 내보내기
export default {
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  createLayoutConfig,
  createFontSettings,
  createRenderConfig,
  createFromPreset,
  PRESETS
};
