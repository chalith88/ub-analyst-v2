# Copilot Instructions for Bank Scraper Project

A dual-workspace TypeScript project that scrapes Sri Lankan bank interest rates and fees using Playwright/PDF parsing, with a React client for visualization. **Not** a monorepo—two independent package.json roots with different module systems.

## Architecture & Critical Workflows

### Backend (`src/`, root package.json)
- **Module system**: CommonJS (`"type": "commonjs"`)
- **Entry point**: `src/server.ts` (Express API on port 3000)
- **Execution**: Use `ts-node -T` for all scripts (bypasses type checking due to `-T` flag)
- **Scrapers**: `src/scrapers/*.ts` — each bank has 2 files: `{bank}.ts` (rates) + `{bank}-tariff.ts` (fees)
- **Output**: All scraped data saved to `output/{bank}.json` and `output/{bank}-tariff.json`

```powershell
# Backend commands (run from root directory)
npm run dev                 # Start Express server (localhost:3000)
npm run playwright-install  # One-time: Install Chromium browser
npm run test:tariff         # Run tariff normalization harness
ts-node -T src/scrapers/hnb.ts  # Test individual scraper directly
```

### Frontend (`client/`, client/package.json)
- **Module system**: ES modules (`"type": "module"`)
- **Stack**: React 19 + Vite + TailwindCSS 4 + Framer Motion
- **Proxy**: Vite proxies `/scrape/*` and `/api/*` to `http://localhost:3000` (see `client/vite.config.ts`)
- **Main file**: `client/src/App.tsx` (~6000 lines) — bank comparisons, charts, tariff data, news feed

```powershell
# Frontend commands (run from client/ directory)
cd client
npm run dev                 # Vite dev server on localhost:5173
npm test                    # Unit tests (Vitest)
npm run test:watch          # TDD mode with watch
npm run test:e2e            # E2E tests (Playwright)
npm run test:coverage       # Coverage report
```

**Development workflow**: Run both servers concurrently:
```powershell
# Terminal 1 (root)
npm run dev

# Terminal 2 (client)
cd client
npm run dev
```

## Project-Specific Patterns

### Scraper Development
1. **Playwright scrapers** (HNB, Seylan, DFCC, etc.): 
   - Export `async function scrape{Bank}(opts?: { show?: boolean; slow?: number }): Promise<RateRow[]>`
   - Use `acceptAnyCookie(page)` from `src/utils/dom.ts` to dismiss cookie banners
   - Use `clickLeftMenu(page, "Menu Label")` for navigating bank websites with consistent nav patterns
   - Query params: `?show=true` (visible browser), `?slow=200` (slowMo delay), `?save=true` (write to output/)
   - Timeout strategy: Try `domcontentloaded` first, fallback to `load` with longer timeout

2. **PDF/OCR scrapers** (Sampath, Peoples, NTB): 
   - Extract via `pdfjs-dist` → group lines by Y-coordinate → dump to `output/{bank}-tariff-ocr-lines.txt` for debugging
   - Use external tools: `pdftoppm` (PDF to images), `tesseract` (OCR) via `spawnSync`
   - Parse line arrays with regex patterns to extract fee tables
   - **Debug tip**: Always write OCR lines to file first, inspect manually before writing parsers

3. **Text normalization** (`src/utils/text.ts`):
   - `normalizeAwpr(cell)` → standardize "AWPR + X%" format (handles AWPLR variants)
   - `expandTenureYears(label)` → parse "4-5 Years" → `[4, 5]` array
   - `decideType(rate1, rate2, heading)` → infer "Fixed" | "Floating" | "Fixed & Floating" from rate strings
   - `clean(s)` → collapse whitespace, trim

### Type System
- **Backend** (`src/types.ts`): `RateRow` with flexible product strings, multiple rate field variations
  - Generic fields: `rateWithSalary`, `rateWithoutSalary`, `rateWithSalaryCreditCardInternetBanking`
  - Seylan-specific: `rateWithSalaryAbove700k`, `rateWithSalaryBelow700k` (6 variations)
  - Education: `rateEduSecuredWithCreditCardInternetBanking`, etc.
- **Frontend** (`client/src/types.ts`): Stricter `ProductKey = "HL" | "PL" | "LAP" | "EL" | "EDU"`, `TariffRow`
- **Rate data convention**: Use legacy HNB field names (`rateWithSalary`, `rateWithoutSalary`) across all banks for consistency
- **Tenure handling**: Always provide both `tenureLabel` (original string) AND `tenureYears` (normalized number array)

### Tariff Calculator System
Multi-bank fee computation with router pattern:
- **Main router**: `client/src/tariff-calculator.ts` (Union Bank implementation + router, 700+ lines)
- **Bank-specific**: `client/src/tariff-{bank}.ts` files (HNB, Seylan, Sampath, CommercialBank, NDB, Peoples)
- Each exports `calculateXXXTariff(inputs: XXXInputs): TariffResult`
- **TDD Workflow**: 
  1. Modify constants in tariff file
  2. Update corresponding test file (`tariff-{bank}.test.ts`)
  3. Run `npm run test:watch` in `client/` directory
  4. Verify integration in `App.tsx` (search for "Enhanced Calculator" badge)

## API Routes & Integration

**Server routes** (`src/server.ts`):
- Individual rates: `/scrape/{bank}` (e.g., `/scrape/hnb`, `/scrape/seylan`)
- Individual tariffs: `/scrape/{bank}-tariff` (e.g., `/scrape/hnb-tariff`)
- Aggregators: 
  - `/scrape/all` → parallel scraping of all banks' rates
  - `/scrape/tariffs-all` → sequential scraping, merges by `(bank, product, feeType)` key
- Market Share: `/api/market-share` (all products), `/api/market-share/by-product/:productKey` (HL, PL, etc.)
- News: `/api/news` → RSS feeds with 10min in-memory cache
- Health check: `/health`
- Root: `/` → API documentation text

**Query params**:
- `show=true|false` → headless or visible browser
- `slow=0|200|500` → slowMo milliseconds between actions
- `save=true` → write JSON to `output/` directory

**Client integration**: Use relative paths in fetch calls (`/scrape/hnb`) — Vite proxy auto-routes to backend

## Common Pitfalls
1. **Module mismatch**: Root=CommonJS, client=ES modules. **Never** mix `require()` in client or `import` without `type: module` in backend
2. **TypeScript execution**: Use `ts-node -T` (not `tsc` or plain `ts-node`) for backend scripts — `-T` bypasses type checking
3. **Playwright timeouts**: 
   - Use `timeout: 45000` for initial `page.goto()` 
   - Use `waitForTimeout(400)` after DOM changes to allow re-renders
   - Fallback pattern: try `domcontentloaded`, catch, retry with `load`
4. **Tenure parsing edge case**: 
   - `"Above 10 Years"` = 11-25 (exclusive, starts at 11)
   - `"10 years and above"` = 10-25 (inclusive, starts at 10)
   - Use `expandTenureYears()` utility for consistency
5. **Error handling**: Always wrap scraper functions in try-catch, return empty array `[]` on failure (never throw)
6. **Tariff tests**: Run `npm test` (or `npm run test:watch`) in `client/` **before** committing tariff changes
7. **OCR debugging**: If OCR output is garbled, check `output/{bank}-tariff-ocr-lines.txt` first before modifying parser

## Key Files Reference
- `src/server.ts` — API routes, news aggregation, tariff merging logic
- `src/types.ts` — Backend type definitions (`RateRow`)
- `src/utils/text.ts` — Text normalization utilities (AWPR, tenure, type detection)
- `src/utils/dom.ts` — Playwright helpers (`acceptAnyCookie`, `clickLeftMenu`)
- `client/src/App.tsx` — Main UI (6K lines), bank comparisons, charts, news
- `client/src/types.ts` — Frontend type definitions (`TariffRow`, `ProductKey`)
- `client/src/tariff-calculator.ts` — Multi-bank fee calculator with router pattern
- `client/src/TARIFF_README.md` — Detailed tariff documentation with API examples
- `client/vite.config.ts` — Proxy configuration for backend API

## FTP Uploader (Admin Tab)
Monthly Asset FTP rates uploaded via PDF/CSV in Admin tab:
- **Location**: `client/src/App.tsx` - `FtpFileUploader` component (~10100+ lines)
- **Storage**: LocalStorage key `"ub.ftp.v1"` - JSON array of `UbFtpMonth[]`
- **PDF Parsing**: Uses `pdfjs-dist` with special handling for split-header LCY tables
  - Headers may span multiple rows: `["Period", "Asset FTP"]` then `["FTP", "Premium"]`
  - Data structure: Column 0=Period, Column 1=Liability FTP, Column 2=Asset FTP, Column 3=Liquidity Premium
  - Parser detects "Period" header, looks ahead to first 3+ column data row to map columns correctly
  - Liquidity Premium (LP) only added when explicitly found in column 3 (0.05% for 12M+)
- **CSV Parsing**: Regex patterns match `"1M, 8.15"` or `"1m - 8.15%"` formats
- **Tenors**: 1M, 3M, 6M, 12M, 24M, 36M, 48M, 60M
- **Debug**: Check browser console for `[FTP Parser]` logs showing row structure and column mapping

## Deployment (Railway)
- **Method**: Auto-deploy via GitHub push to `master` branch
- **Workflow**: `git add . && git commit -m "message" && git push origin master`
- **Build**: Uses `Dockerfile` with multi-stage build (Node.js + Playwright base image)
- **Runtime**: Backend runs via `ts-node -T src/server.ts` (not compiled)
- **Environment**: Railway auto-injects `PORT`, set `NODE_ENV=production`
- **URL**: https://ubanalyst.up.railway.app
- **Health check**: `/health` endpoint
- **Verification**: Check `/api/market-share` or frontend after deploy completes (~3-5 min)

## Testing Strategy
- **Backend**: Manual test individual scrapers via `ts-node -T src/scrapers/{bank}.ts`
- **Frontend unit tests**: Vitest with 61+ tests for tariff calculations (see `client/src/tariff-calculator.test.ts`)
- **Frontend E2E**: Playwright tests in `client/tests/` (run `npm run test:e2e`)
- **Coverage**: `npm run test:coverage` in `client/`
- **TDD workflow**: Use `npm run test:watch` during tariff development for instant feedback
