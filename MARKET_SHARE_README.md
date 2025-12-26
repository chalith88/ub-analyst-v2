# Market Share Automation System

Automated market share data extraction for 12 Sri Lankan banks using OCR-based PDF scraping.

## Overview

This system automatically extracts market share data (gross loans and advances) from quarterly financial reports published by banks. It achieves **99.3% market coverage** across 12 major banks.

## Supported Banks

| Bank | Coverage | Product Breakdown | Status |
|------|----------|-------------------|--------|
| BOC | 1,705.1B | Housing, Personal | ✅ |
| People's Bank | 1,475.2B | - | ✅ |
| Commercial Bank | 1,386.4B | Housing, Personal | ✅ |
| HNB | 1,185.9B | Housing | ✅ |
| Seylan | 533.8B | - | ✅ |
| NDB | 456.2B | Housing, Personal | ✅ |
| DFCC | 459.1B | - | ✅ |
| NSB | 540.4B | - | ✅ |
| NTB | 330.9B | - | ✅ |
| Union Bank | 103.2B | - | ✅ |
| Amana Bank | 140.3B | - | ✅ |
| Cargills Bank | 59.7B | Housing, Personal, LAP | ✅ |
| **Sampath Bank** | 565.9B | - | ⚠️ API blocked |

**Total Coverage:** 8.33T LKR / 8.39T LKR = **99.3%**

## Quick Start

### 1. Test Individual Bank Scraper
```bash
# Test a single bank
npx ts-node -T src/scrapers/market-share-boc-ocr.ts
npx ts-node -T src/scrapers/market-share-seylan-ocr.ts
npx ts-node -T src/scrapers/market-share-cargills-ocr.ts
```

### 2. Run All Banks
```bash
# Scrape all 12 banks sequentially
npm run market-share:all
```

### 3. Use API Endpoint
```bash
# Start the server
npm run dev

# Trigger refresh via API (from another terminal)
curl -X POST http://localhost:3000/api/market-share/refresh

# View current data
curl http://localhost:3000/api/market-share
```

### 4. Schedule Automatic Updates
```powershell
# Windows: Set up Task Scheduler (run as Administrator)
.\setup-market-share-schedule.ps1

# Manual scheduling control
npm run market-share:enable
npm run market-share:status
npm run market-share:disable
```

## Architecture

### Scraper Flow
```
1. Download PDF
   ├─ Playwright (dynamic websites: Seylan, Cargills)
   └─ Direct fetch (static URLs: BOC, HNB, etc.)

2. Extract Text
   └─ pdfjs-dist OCR (line-by-line extraction)

3. Parse Data
   ├─ Pattern matching (flexible regex)
   ├─ Amount validation (range checks)
   └─ Product breakdown (where available)

4. Output
   ├─ Individual JSON files (output/{bank}-market-share-ocr.json)
   └─ Aggregated results (output/market-share-aggregated.json)
```

### Key Files

```
src/scrapers/
├── market-share-all.ts              # Aggregator (runs all banks)
├── market-share-scheduler.ts        # Quarterly automation
├── market-share-boc-ocr.ts          # BOC scraper
├── market-share-peoples-ocr.ts      # People's Bank scraper
├── market-share-combank-ocr.ts      # Commercial Bank scraper
├── market-share-hnb-ocr.ts          # HNB scraper
├── market-share-seylan-ocr.ts       # Seylan scraper (Playwright)
├── market-share-ndb-ocr.ts          # NDB scraper
├── market-share-dfcc-ocr.ts         # DFCC scraper
├── market-share-nsb-ocr.ts          # NSB scraper
├── market-share-ntb-ocr.ts          # NTB scraper
├── market-share-union-ocr.ts        # Union Bank scraper
├── market-share-amana-ocr.ts        # Amana Bank scraper
└── market-share-cargills-ocr.ts     # Cargills scraper (Playwright)

src/server.ts
└── POST /api/market-share/refresh   # API endpoint

output/
├── market-share-aggregated.json     # Latest aggregated data
├── history/
│   └── market-share-YYYY-MM-DD.json # Historical backups
└── {bank}-market-share-ocr.json     # Individual bank data
```

## API Endpoints

### POST `/api/market-share/refresh`
Triggers scraping of all banks and returns summary.

**Response:**
```json
{
  "success": true,
  "message": "Market share data refreshed successfully",
  "summary": {
    "totalBanks": 12,
    "successful": 12,
    "failed": 0,
    "coverage": "99.3%",
    "totalMarketSize": "LKR 8390.0B",
    "totalCoverage": "LKR 8330.5B"
  },
  "banks": [...],
  "extractedAt": "2025-12-05T03:00:00.000Z"
}
```

### GET `/api/market-share`
Returns current market share data (uses cache if available).

**Query params:**
- `refresh=true` - Force refresh from scrapers
- `static=true` - Use static data only
- `limit=10` - Limit number of banks

## Scheduling

### Recommended Schedule
Banks publish quarterly reports ~2 weeks after quarter end:

| Quarter End | Reports Available | Scrape Date |
|-------------|------------------|-------------|
| Dec 31 | ~Jan 15 | **January 15** |
| Mar 31 | ~Apr 15 | **April 15** |
| Jun 30 | ~Jul 15 | **July 15** |
| Sep 30 | ~Oct 15 | **October 15** |

### Windows Task Scheduler Setup
```powershell
# Run as Administrator
.\setup-market-share-schedule.ps1
```

This creates a task that runs quarterly at 2:00 AM on:
- January 15 (Q4 results)
- April 15 (Q1 results)
- July 15 (Q2 results)
- October 15 (Q3 results)

### Manual Control
```bash
# Check schedule status
npm run market-share:status

# Run immediately
npm run market-share:refresh

# Enable/disable scheduling
npm run market-share:enable
npm run market-share:disable
```

### Linux/Cron Setup
```bash
# Add to crontab (runs at 2 AM on 15th of Jan/Apr/Jul/Oct)
0 2 15 1,4,7,10 * cd /path/to/project && npm run market-share:refresh
```

## Data Output

### Individual Bank Files
Each scraper saves to `output/{bank}-market-share-ocr.json`:

```json
{
  "bank": "Bank of Ceylon",
  "shortName": "BOC",
  "assetBookSize": 1705124513,
  "segments": {
    "housing": 66148013,
    "personal": 363605514
  },
  "reportType": "Q3-2025",
  "lastUpdated": "2025-09-30",
  "source": "BOC Q3-2025 Interim Financial Statements",
  "extractedAt": "2025-12-05T02:00:00.000Z"
}
```

### Aggregated Output
`output/market-share-aggregated.json`:

```json
{
  "totalMarketSize": 8390000000,
  "totalCoverage": 8330500000,
  "coveragePercentage": 99.3,
  "extractedAt": "2025-12-05T02:00:00.000Z",
  "banks": [...],
  "summary": {
    "totalBanks": 12,
    "successfulScrapes": 12,
    "failedScrapes": 0,
    "withHousingData": 5,
    "withPersonalData": 4
  }
}
```

### Historical Backups
Timestamped copies saved to `output/history/market-share-YYYY-MM-DD.json`

## Troubleshooting

### PDF Download Failures
```bash
# Install/update Playwright browsers
npm run playwright-install
```

### Individual Bank Issues
Test individual scrapers to isolate problems:
```bash
npx ts-node -T src/scrapers/market-share-{bank}-ocr.ts
```

### OCR Debugging
Each scraper outputs OCR lines to:
```
output/{bank}-market-share-ocr-lines.txt
```

Search these files to verify data extraction:
```bash
Get-Content output/boc-market-share-ocr-lines.txt | Select-String "total"
```

### API Blocks (Sampath)
Sampath Bank's API returns 503. Workarounds:
1. Use static fallback data
2. Manual update when accessible
3. Contact bank IT for API access

## Maintenance

### Quarterly Updates Checklist
1. ✅ Wait for bank reports (2 weeks after quarter end)
2. ✅ Automatic scraper runs via Task Scheduler
3. ✅ Review logs for failures: `logs/market-share-errors.log`
4. ✅ Verify aggregated data: `output/market-share-aggregated.json`
5. ✅ Check coverage percentage (should be >95%)
6. ✅ Update static data if scrapers fail

### Adding New Banks
1. Create `src/scrapers/market-share-{bank}-ocr.ts`
2. Follow existing patterns (BOC/Seylan/Cargills templates)
3. Add export to `market-share-all.ts`
4. Test individual scraper
5. Test aggregator

### Updating Parsing Logic
Banks may change PDF formats. To fix:

1. Download latest PDF manually
2. Check OCR output: `output/{bank}-market-share-ocr-lines.txt`
3. Update regex patterns in scraper
4. Update amount validation ranges
5. Test and verify

## Performance

- **Single bank:** 5-15 seconds
- **All 12 banks:** 2-3 minutes
- **Network dependent:** PDF downloads vary by bank
- **Sequential execution:** Prevents server overload

## Security & Ethics

- ✅ Public data only (published financial reports)
- ✅ Respects robots.txt
- ✅ Rate limiting (1s delay between banks)
- ✅ User agent identification
- ✅ No credentials/authentication bypass
- ⚠️ Be respectful of bank servers

## Future Enhancements

- [ ] Add Sampath Bank (when API accessible)
- [ ] Email notifications on completion
- [ ] Slack/Discord webhooks
- [ ] Historical trend analysis
- [ ] Automated anomaly detection
- [ ] Product-level breakdown for all banks
- [ ] Integration with frontend dashboard
- [ ] Real-time change detection
- [ ] Multi-language report support

## License

Internal use only. Do not redistribute scraped data without proper attribution to source banks.
