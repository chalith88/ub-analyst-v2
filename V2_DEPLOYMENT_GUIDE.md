# UB Analyst V2 - Deployment Guide 🚀

This document outlines the steps to deploy UB Analyst V2 to a **NEW** GitHub repository and Railway project, keeping the production V1 system untouched.

## Prerequisites ✅

- [x] V2 code committed locally at `c:\Users\chali\ub-analyst-v2`
- [ ] GitHub account access (chalith88)
- [ ] Railway account access

## Step 1: Create New GitHub Repository

1. Go to https://github.com/new
2. Fill in repository details:
   - **Repository name**: `ub-analyst-v2`
   - **Description**: `Enhanced Sri Lankan Banking Intelligence Platform with Historical Tracking`
   - **Visibility**: Public (or Private if preferred)
   - **DO NOT** initialize with README, .gitignore, or license (we're pushing existing code)
3. Click **Create repository**

## Step 2: Push Code to GitHub

Open PowerShell in `c:\Users\chali\ub-analyst-v2`:

```powershell
cd c:\Users\chali\ub-analyst-v2

# Add GitHub remote (replace with your actual repo URL if different)
git remote add origin https://github.com/chalith88/ub-analyst-v2.git

# Push to GitHub
git push -u origin main
```

**Expected Output**:
```
Enumerating objects: 250, done.
Counting objects: 100% (250/250), done.
...
To https://github.com/chalith88/ub-analyst-v2.git
 * [new branch]      main -> main
Branch 'main' set up to track remote branch 'main' from 'origin'.
```

## Step 3: Verify GitHub Repository

1. Visit https://github.com/chalith88/ub-analyst-v2
2. Confirm files are visible:
   - ✅ `README.md` showing V2 features
   - ✅ `Dockerfile` present
   - ✅ `src/scrapers/rate-history.ts` (new file)
   - ✅ `src/scrapers/scraper-monitor.ts` (new file)
   - ✅ `client/src/components/TariffComparisonMatrix.tsx` (new file)

## Step 4: Create New Railway Project

1. Go to https://railway.app/new
2. Click **Deploy from GitHub repo**
3. Select `ub-analyst-v2` repository
4. Railway will auto-detect the `Dockerfile`

### Railway Configuration

Railway should automatically:
- ✅ Detect Dockerfile build
- ✅ Install Playwright browsers during build
- ✅ Set PORT environment variable

**Manual Environment Variables** (if needed):
- `NODE_ENV=production` (add via Railway dashboard → Variables)

### Build Process

Railway will:
1. Run multi-stage Docker build (~3-5 minutes)
2. Install Node.js dependencies
3. Install Playwright Chromium browser
4. Start server with `ts-node -T src/server.ts`

## Step 5: Verify Deployment

Once deployed, Railway will provide a URL like: `https://ub-analyst-v2.up.railway.app`

### Health Check Endpoints

Test these endpoints to verify deployment:

```powershell
# Server health
curl https://ub-analyst-v2.up.railway.app/health

# Market share data
curl https://ub-analyst-v2.up.railway.app/api/market-share

# V2 Feature: Scraper health monitoring
curl https://ub-analyst-v2.up.railway.app/api/health/scrapers

# V2 Feature: Historical data (will be empty initially)
curl https://ub-analyst-v2.up.railway.app/api/history/banks
```

### Expected Responses

**Health Check** (`/health`):
```json
{ "status": "ok", "timestamp": "2025-12-26T..." }
```

**Market Share** (`/api/market-share`):
```json
{
  "banks": [
    { "name": "Bank of Ceylon", "totalLoans": 1708.4, ... },
    ...
  ],
  "totalMarket": 9599.1,
  "coverage": 113.8
}
```

**Scraper Health** (`/api/health/scrapers`):
```json
{
  "scrapers": []  // Empty initially, will populate after first scrapes
}
```

## Step 6: Test V2 Features

### 1. Historical Rate Tracking

The system will start saving daily snapshots automatically. To test:

```powershell
# Trigger a scrape to generate first snapshot
curl https://ub-analyst-v2.up.railway.app/scrape/hnb?save=true

# Check if history was saved
curl https://ub-analyst-v2.up.railway.app/api/history/banks

# Get historical data for HNB
curl https://ub-analyst-v2.up.railway.app/api/history/hnb?days=7

# Get trend for specific rate
curl "https://ub-analyst-v2.up.railway.app/api/history/hnb/HL/5-10%20Years?days=7"
```

### 2. Scraper Health Monitoring

After running a few scrapes:

```powershell
curl https://ub-analyst-v2.up.railway.app/api/health/scrapers
```

Should return:
```json
{
  "scrapers": [
    {
      "bank": "hnb",
      "type": "rates",
      "totalRuns": 1,
      "successCount": 1,
      "failureCount": 0,
      "successRate": 100,
      "avgDuration": 4523,
      "lastSuccess": "2025-12-26T...",
      "recentErrors": []
    }
  ]
}
```

### 3. Tariff Comparison Matrix

Visit frontend: `https://ub-analyst-v2.up.railway.app`

Navigate to **Tariff Comparison** section (look for "V2 Feature" badge):
- ✅ Select product (HL, PL, LAP, etc.)
- ✅ Select fee type (Processing Fee, Documentation, etc.)
- ✅ View side-by-side comparison with lowest/highest highlighting

## Troubleshooting 🔧

### Build Fails

**Symptom**: Railway build fails with "Cannot find module..."

**Solution**: Check that all imports in `server.ts` are correct:
```typescript
import { saveRateSnapshot, getHistoricalRates, getRateTrend, getBanksWithHistory } from './scrapers/rate-history';
import { getScraperHealth, monitoredScrape } from './scrapers/scraper-monitor';
```

### Playwright Browser Not Found

**Symptom**: Scrapers fail with "Executable doesn't exist at..."

**Solution**: Verify Dockerfile includes Playwright installation:
```dockerfile
RUN npx playwright install --with-deps chromium
```

### Historical Data Not Saving

**Symptom**: `/api/history/banks` returns empty array

**Solution**: Check that `output/history/` directory exists:
```dockerfile
RUN mkdir -p output output/history
```

### API Returns 404

**Symptom**: New endpoints return 404

**Solution**: Verify server.ts has V2 routes appended (see deployment summary below)

## Rollback Plan 🔄

If V2 deployment fails or has critical issues:

1. **V1 remains unaffected** at https://ubanalyst.up.railway.app (no changes made)
2. Delete V2 Railway project from dashboard
3. Keep V2 code in GitHub for future fixes
4. Retry deployment after fixes

## Post-Deployment Checklist ✅

- [ ] GitHub repository created at `chalith88/ub-analyst-v2`
- [ ] Code pushed successfully to GitHub
- [ ] Railway project created and linked to GitHub repo
- [ ] Deployment completed without errors
- [ ] `/health` endpoint responds with 200 OK
- [ ] `/api/market-share` returns bank data
- [ ] `/api/health/scrapers` endpoint accessible (may be empty)
- [ ] `/api/history/banks` endpoint accessible (may be empty)
- [ ] Frontend loads at Railway URL
- [ ] V1 production system still running at https://ubanalyst.up.railway.app

## URLs Summary

| Environment | URL | Status |
|-------------|-----|--------|
| **V1 Production** | https://ubanalyst.up.railway.app | ✅ Unchanged |
| **V2 Production** | https://ub-analyst-v2.up.railway.app | 🆕 To be deployed |
| **V1 GitHub** | https://github.com/chalith88/god | ✅ Unchanged |
| **V2 GitHub** | https://github.com/chalith88/ub-analyst-v2 | 🆕 To be created |

## V2 Features Quick Reference

### New API Endpoints

```
# Historical Tracking
GET /api/history/banks
GET /api/history/:bank?days=30
GET /api/history/:bank/:product/:tenure?days=30

# Health Monitoring
GET /api/health/scrapers
```

### New Frontend Components

- `TariffComparisonMatrix.tsx` - Side-by-side fee comparison with highlighting

### New Backend Modules

- `src/scrapers/rate-history.ts` - Historical rate storage and trend analysis
- `src/scrapers/scraper-monitor.ts` - Scraper execution logging and health metrics

## Next Steps After Deployment

1. **Monitor First 24 Hours**:
   - Check Railway logs for errors
   - Verify scrapers run successfully
   - Monitor scraper health metrics

2. **Populate Historical Data**:
   - Run daily scrapes to build 30-day history
   - After 30 days, trend analysis will be meaningful

3. **User Testing**:
   - Test tariff comparison matrix with various products
   - Verify rate trend indicators work correctly
   - Check mobile responsiveness

4. **Documentation**:
   - Update any external documentation with V2 URL
   - Add V2 features to user guides (if applicable)

---

🎉 **Ready to Deploy!** Follow steps 1-6 above to deploy UB Analyst V2.
