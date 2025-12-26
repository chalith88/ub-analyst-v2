# UB Analyst V2 🏦📊

**Enhanced Sri Lankan Banking Intelligence Platform with Historical Tracking**

A comprehensive banking rate scraper and analysis platform for Sri Lankan banks, featuring real-time rate tracking, tariff comparison, market share analysis, and advanced trend monitoring.

## 🆕 What's New in V2

### 1. Historical Rate Tracking
- **Daily Rate Snapshots**: Automatically saves daily snapshots of all bank rates
- **Trend Analysis**: Track rate changes over time (30/60/90 days)
- **Trend Indicators**: Visual indicators for rate movements (↑ up, ↓ down, → stable)
- **API Endpoints**:
  - `GET /api/history/banks` - List banks with historical data
  - `GET /api/history/:bank?days=30` - Get historical rates for a bank
  - `GET /api/history/:bank/:product/:tenure?days=30` - Get trend for specific rate

### 2. Enhanced Tariff Comparison Matrix
- **Side-by-Side Comparison**: Compare fees across all banks for any product
- **Smart Highlighting**: Automatically highlights lowest (green) and highest (red) fees
- **Product Filters**: Filter by HL, PL, LAP, EL, EDU
- **Fee Type Filters**: View specific fees (Processing, Documentation, Appraisal, etc.)
- **Interactive UI**: Smooth animations and responsive design

### 3. Scraper Health Monitoring
- **Success Rate Tracking**: Monitor scraper reliability (success/failure rates)
- **Performance Metrics**: Track average response times per scraper
- **Error Logging**: Detailed error messages for debugging
- **Health Dashboard**: View scraper status at `/api/health/scrapers`
- **Automatic Logging**: All scraper runs automatically logged

## 🏦 Supported Banks (14)

| Bank | Rates | Tariffs | Market Share |
|------|-------|---------|--------------|
| Bank of Ceylon (BOC) | ✅ | ✅ | ✅ |
| People's Bank | ✅ | ✅ | ✅ |
| Commercial Bank | ✅ | ✅ | ✅ |
| Hatton National Bank (HNB) | ✅ | ✅ | ✅ |
| Seylan Bank | ✅ | ✅ | ✅ |
| Sampath Bank | ✅ | ✅ | ✅ |
| National Development Bank (NDB) | ✅ | ✅ | ✅ |
| DFCC Bank | ✅ | ✅ | ✅ |
| National Savings Bank (NSB) | ✅ | ✅ | ✅ |
| Nations Trust Bank (NTB) | ✅ | ✅ | ✅ |
| Union Bank | ✅ | ✅ | ✅ |
| Amana Bank | ✅ | ✅ | ✅ |
| Cargills Bank | ✅ | ✅ | ✅ |
| Pan Asia Banking Corporation (PABC) | ✅ | — | ✅ |

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ (both backend and frontend)
- Playwright browsers: `npm run playwright-install`

### Development

**Backend** (port 3000):
```powershell
npm install
npm run dev
```

**Frontend** (port 5173):
```powershell
cd client
npm install
npm run dev
```

Visit: `http://localhost:5173`

## 📡 API Endpoints

### Historical Data (V2)
- `GET /api/history/banks` - List banks with historical data
- `GET /api/history/:bank?days=30` - Get historical rates
- `GET /api/history/:bank/:product/:tenure?days=30` - Get rate trend

### Health Monitoring (V2)
- `GET /api/health/scrapers` - Scraper health metrics
- `GET /health` - Server health check

### Rates
- `GET /scrape/:bank` - Scrape rates for specific bank
- `GET /scrape/all` - Scrape all banks (parallel)

### Tariffs
- `GET /scrape/:bank-tariff` - Scrape tariffs for specific bank
- `GET /scrape/tariffs-all` - Scrape all tariffs (sequential)

### Market Share
- `GET /api/market-share` - Get market share data (all products)
- `GET /api/market-share/by-product/:productKey` - Get by product (HL, PL, etc.)
- `GET /scrape/:bank-market-share` - Scrape specific bank

## 🚢 Deployment

### Railway (Production)
1. Push to GitHub: `git push origin main`
2. Railway auto-deploys from GitHub
3. Uses `Dockerfile` for build
4. Set `NODE_ENV=production`

## 🆚 V1 vs V2 Comparison

| Feature | V1 | V2 |
|---------|----|----|
| Real-time Rate Scraping | ✅ | ✅ |
| Tariff Calculator | ✅ | ✅ |
| Market Share Analysis | ✅ | ✅ |
| Historical Rate Tracking | ❌ | ✅ |
| Trend Analysis | ❌ | ✅ |
| Tariff Comparison Matrix | ❌ | ✅ |
| Scraper Health Monitoring | ❌ | ✅ |
| Performance Metrics | ❌ | ✅ |

## 🔗 Links

- **Production (V1)**: https://ubanalyst.up.railway.app
- **GitHub (V1)**: https://github.com/chalith88/god

---

Built with ❤️ for Sri Lankan Banking Intelligence

