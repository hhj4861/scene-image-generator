# Pipedream Stock Analyzer

주식 시장 자동 분석 파이프라인입니다.

## 파이프라인 구조

```
┌─────────────────────────────────┐
│  1. Stock Market Analyzer       │
│  (현황정리 및 전망)              │
│  - YouTube 영상 분석 OR         │
│  - 최신 뉴스 종합 분석           │
└───────────────┬─────────────────┘
                │ (선택적)
                ▼
┌─────────────────────────────────┐
│  2. Stock Sector Analyzer       │
│  (섹터 전망)                    │
│  - 유망 섹터 추천                │
│  - 섹터 로테이션 분석            │
└───────────────┬─────────────────┘
                │ (선택적)
                ▼
┌─────────────────────────────────┐
│  3. Stock Ticker Analyzer       │
│  (종목 분석)                    │
│  - 수급 동향 분석                │
│  - 유망 종목 3-5개 추천          │
└─────────────────────────────────┘
```

## 파일 구조

```
pipedream_stock/
├── stock-market-analyzer.mjs   # Step 1: 시장 현황 분석
├── stock-sector-analyzer.mjs   # Step 2: 섹터 전망 (선택)
├── stock-ticker-analyzer.mjs   # Step 3: 종목 분석 (선택)
└── README.md
```

## 사용법

### Pipedream에서 설정

1. **새 Workflow 생성**
2. **각 단계별 Action 추가** (순서대로):
   - `Stock Market Analyzer`
   - `Stock Sector Analyzer` (선택)
   - `Stock Ticker Analyzer` (선택)

### Step 1: Stock Market Analyzer (필수)

현황 정리 및 전망 단계입니다.

**입력 옵션:**
- `youtube_url`: YouTube 영상 URL (입력 시 해당 영상 분석)
- `youtube_url` 미입력 시: Serper API로 최신 뉴스 검색 후 종합 분석

**주요 설정:**
| 파라미터 | 설명 | 기본값 |
|---------|------|--------|
| `youtube_url` | 분석할 YouTube 영상 URL | (비워두면 뉴스 기반) |
| `market_type` | us / kr / global | us |
| `analysis_focus` | 분석 초점 (복수 선택) | macro, tech, ai_semi |

**필수 API Keys:**
- `gemini_api_key`: Google Gemini API
- `serper_api_key`: 뉴스 검색용 (YouTube URL 없을 때 필수)

### Step 2: Stock Sector Analyzer (선택)

유망 섹터 추천 단계입니다.

**입력:**
```
{{JSON.stringify(steps.Stock_Market_Analyzer.$return_value)}}
```

**주요 설정:**
| 파라미터 | 설명 | 기본값 |
|---------|------|--------|
| `num_sectors` | 추천 섹터 수 | 5 |
| `investment_horizon` | short / medium / long | medium |
| `risk_tolerance` | conservative / moderate / aggressive | moderate |

### Step 3: Stock Ticker Analyzer (선택)

종목 분석 및 추천 단계입니다.

**입력:**
```
Sector: {{JSON.stringify(steps.Stock_Sector_Analyzer.$return_value)}}
Market: {{JSON.stringify(steps.Stock_Market_Analyzer.$return_value)}}
```

**주요 설정:**
| 파라미터 | 설명 | 기본값 |
|---------|------|--------|
| `num_tickers` | 섹터당 추천 종목 수 | 3 |
| `analysis_criteria` | 분석 기준 | flow, earnings, growth |
| `market_cap_preference` | 시가총액 선호 | large |

**선택적 API Keys:**
- `fmp_api_key`: Financial Modeling Prep (실시간 주가 데이터)

## 출력 예시

### Step 1 출력 (Market Analysis)
```json
{
  "analysis_date": "2024-12-15",
  "market_type": "us",
  "source": "news",
  "analysis": {
    "summary": "연준의 금리 인하 기대감으로...",
    "market_outlook": {
      "sentiment": "bullish",
      "confidence": 75
    },
    "recommended_focus_sectors": ["AI/반도체", "금융"]
  }
}
```

### Step 2 출력 (Sector Analysis)
```json
{
  "sector_analysis": {
    "recommended_sectors": [
      {
        "rank": 1,
        "sector_name": "AI/반도체",
        "outlook_score": 85,
        "thesis": "AI 수요 급증으로...",
        "representative_etfs": ["SMH", "SOXX"]
      }
    ]
  }
}
```

### Step 3 출력 (Ticker Analysis)
```json
{
  "top_picks": [
    {
      "ticker": "NVDA",
      "company_name": "NVIDIA",
      "recommendation": "Strong Buy",
      "score": 90,
      "flow_analysis": {
        "institutional": "대규모 순매수 지속"
      }
    }
  ]
}
```

## API Keys 필요 목록

| API | 용도 | 필수 여부 | 링크 |
|-----|------|----------|------|
| Gemini | LLM 분석 | 필수 | https://aistudio.google.com |
| Serper | 뉴스 검색 | Step1 (뉴스 모드) | https://serper.dev |
| FMP | 주가/재무 데이터 | 선택 | https://financialmodelingprep.com |

## 사용 시나리오

### 시나리오 1: YouTube 영상 기반 분석
1. 유명 애널리스트 YouTube 영상 URL 입력
2. 영상 내용 자동 분석
3. 섹터/종목 추천

### 시나리오 2: 최신 뉴스 기반 분석
1. YouTube URL 비워두기
2. 당일 최신 뉴스 자동 수집
3. 종합 분석 후 섹터/종목 추천

### 시나리오 3: 현황 정리만
1. Stock Market Analyzer만 실행
2. 시장 현황 요약만 확인

## 주의사항

- 이 분석은 참고용이며 투자 조언이 아닙니다
- 실제 투자 결정은 본인의 판단에 따라 진행하세요
- API 호출 비용이 발생할 수 있습니다
