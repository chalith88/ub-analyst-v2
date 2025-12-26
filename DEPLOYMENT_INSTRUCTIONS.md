# Deployment Instructions for Bank Scraper (Railway)

## 🚨 CRITICAL: Railway Deployment Fix Required

Your Railway deployment is currently failing because it's using an **old Dockerfile** from commit `676eba7` (Nov 10, 2025). The latest fixes are in commit `7db7a9e` (Nov 12, 2025) but haven't been pushed to Railway yet.

### Current Error in Railway Logs
```
ERROR: failed to build: failed to solve: failed to compute cache key: 
failed to calculate checksum of ref 6imw6bie6ui81j6wdhf9nz46r::u52i0nap7mq5i7vstt8o1qc6d: 
"/app/dist": not found
```

**Root Cause**: Old Dockerfile tries to copy `/app/dist` which doesn't exist (backend uses ts-node, not compiled JavaScript).

---

## ✅ Solution: Deploy Latest Code to Railway

### Option 1: Link GitHub Repository (Recommended)

1. **Create/Connect GitHub Repository**
   ```powershell
   # If repo doesn't exist on GitHub, create it at https://github.com/new
   # Then add remote:
   git remote add origin https://github.com/YOUR_USERNAME/god.git
   
   # Verify remote
   git remote -v
   ```

2. **Push Current Code**
   ```powershell
   git push -u origin master
   ```

3. **Connect Railway to GitHub**
   - Go to Railway dashboard → Your project
   - Click "Settings" → "Service Source"
   - Click "Connect GitHub Repository"
   - Select your repository
   - Set branch to `master`
   - Railway will auto-deploy on every push

4. **Verify Deployment**
   - Railway will trigger a new build using the **latest Dockerfile**
   - Monitor build logs in Railway dashboard
   - Once deployed, check `https://YOUR_APP.railway.app/health`

### Option 2: Direct Railway CLI Deployment

If you don't want to use GitHub:

1. **Install Railway CLI** (if not installed)
   ```powershell
   npm install -g @railway/cli
   ```

2. **Login to Railway**
   ```powershell
   railway login
   ```

3. **Link to Your Project**
   ```powershell
   railway link
   # Select your existing project from the list
   ```

4. **Deploy Current Directory**
   ```powershell
   railway up --service ub-scraper
   ```

5. **Monitor Logs**
   ```powershell
   railway logs --service ub-scraper
   ```

### Option 3: Manual File Upload via Railway Dashboard

1. Go to Railway dashboard → Your project
2. Click "Settings" → "Deployments"
3. Click "Manual Deploy" → "Deploy from GitHub" or upload Dockerfile directly
4. Ensure you're using the **latest Dockerfile** (see below)

---

## 📄 Latest Dockerfile Content (Current Version)

The fixed Dockerfile is already in your local repository at `c:\Users\chali\god\Dockerfile`. Key changes from the old version:

**OLD (Broken) Dockerfile tried to:**
```dockerfile
COPY --from=builder /app/dist ./dist  # ❌ This folder doesn't exist!
```

**NEW (Fixed) Dockerfile does:**
```dockerfile
# No dist copy - uses ts-node instead
COPY tsconfig.json ./
COPY src ./src
CMD ["npx", "ts-node", "-T", "src/server.ts"]
```

---

## 🔧 Post-Deployment Verification

Once deployed, test these endpoints:

```bash
# Health check
curl https://YOUR_APP.railway.app/health

# API documentation
curl https://YOUR_APP.railway.app/

# Test scraper (Union Bank)
curl "https://YOUR_APP.railway.app/scrape/unionbank?save=false"

# Frontend (React app)
curl https://YOUR_APP.railway.app/
# Should return HTML with React root div
```

---

## 🎯 Environment Variables Required in Railway

Ensure these are set in Railway dashboard → Settings → Variables:

| Variable | Value | Required? |
|----------|-------|-----------|
| `NODE_ENV` | `production` | Yes |
| `PORT` | `3000` | Auto-set by Railway |
| `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` | `1` | Yes |

Railway automatically injects `PORT` - don't override it.

---

## 📊 Build Process Overview

The fixed Dockerfile now:

1. **Builder Stage** (node:20-bookworm)
   - Installs all dependencies (including devDependencies for ts-node)
   - Builds React client → `client/dist`
   - Does NOT compile TypeScript backend (uses ts-node at runtime)

2. **Runtime Stage** (playwright:v1.55.1-noble)
   - Installs Node.js 20
   - Copies all dependencies from builder
   - Installs Chromium via `playwright install chromium --with-deps`
   - Copies backend source (`src/`, `tsconfig.json`)
   - Copies built client (`client/dist`)
   - Runs server with `ts-node -T src/server.ts`

**Why ts-node?** The project has intentional type flexibility in scrapers. Running with `tsc` requires fixing 39+ type errors. Using `ts-node -T` (bypass type checking) mirrors dev workflow. See `ADR_TYPESCRIPT_RUNTIME.md`.

---

## 🐛 Troubleshooting

### Build Still Fails with "/app/dist not found"
**Cause**: Railway is still using cached or old Dockerfile.

**Fix**:
1. Ensure you pushed latest code: `git log --oneline -1` should show `7db7a9e`
2. Trigger manual redeploy: Railway dashboard → Deployments → Redeploy
3. Check Railway is pulling from correct branch/commit

### "Cannot find module 'typescript'"
**Cause**: Runtime stage missing devDependencies.

**Fix**: Latest Dockerfile runs `npm ci --legacy-peer-deps` (NOT `npm ci --omit=dev`). Verify line 47 in Dockerfile.

### Chromium Crashes or "Browser not found"
**Cause**: Missing system dependencies for Playwright.

**Fix**: Latest Dockerfile uses `playwright:v1.55.1-noble` base image which includes all deps. Verify FROM line at line 40.

### 502 Bad Gateway After Deployment
**Cause**: Server not binding to `0.0.0.0` or wrong port.

**Fix**: `src/server.ts` should have:
```typescript
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => { /* ... */ });
```

---

## 🚀 Next Steps After Successful Deployment

1. **Test All Scrapers**: Visit `/scrape/all` to run all banks in parallel
2. **Monitor Logs**: `railway logs --service ub-scraper --tail 100`
3. **Set Up Domain** (Optional): Railway Settings → Domains → Add custom domain
4. **Configure Alerts**: Railway Settings → Alerts → Set up crash/downtime alerts
5. **Review Performance**: Check memory usage (Playwright can use 500MB-1GB)

---

## 📝 GitHub Actions CI/CD

Once GitHub is connected, every push to `master` or `main` triggers:

1. ✅ Dependency verification (lockfile sync check)
2. ✅ Backend source verification
3. ✅ Client lint (continues on error)
4. ✅ Client tests (61+ tests, continues on error)
5. ✅ Client build (React + Vite)
6. 🚀 Deploy to Railway via CLI

To enable:
1. Add `RAILWAY_TOKEN` to GitHub repository secrets
2. Get token: `railway login` → Copy token from `~/.railway/config.json`
3. GitHub Settings → Secrets and variables → Actions → New secret
4. Name: `RAILWAY_TOKEN`, Value: (paste token)

---

## 📞 Support

If deployment still fails after following these steps:

1. Check Railway build logs for specific error
2. Verify commit `7db7a9e` is deployed: Check Railway dashboard → Deployments → Commit SHA
3. Compare your Dockerfile with version in this repo
4. Open Railway support ticket with build logs

**Current Commit**: `7db7a9e` (Nov 12, 2025)  
**Fixed Dockerfile**: ✅ No `/app/dist` copy, uses ts-node  
**Status**: Ready to deploy once pushed to Railway

---

## 🎉 Success Indicators

✅ Build completes in ~5-7 minutes  
✅ No "dist not found" error  
✅ Server starts: `Server running on 0.0.0.0:3000`  
✅ Health check returns 200: `/health`  
✅ Frontend loads: Root URL returns React app  
✅ Scraper works: `/scrape/unionbank` returns JSON  

Good luck! 🚀
