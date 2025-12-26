# Deployment Verification & Troubleshooting Guide

## Pre-Deployment Checklist

### ✅ Local Development Environment
- [ ] Node.js 20.x installed
- [ ] Dependencies installed: `npm install --legacy-peer-deps`
- [ ] Client dependencies installed: `cd client && npm install`
- [ ] Playwright Chromium installed: `npm run playwright-install`
- [ ] Backend runs: `npm run dev` (port 3000)
- [ ] Client runs: `cd client && npm run dev` (port 5173)
- [ ] Client tests pass: `cd client && npm test -- --run` (367+ tests)

### ✅ Code Quality
- [ ] Client lints: `cd client && npm run lint`
- [ ] Client TypeScript compiles: `cd client && npm run build`
- [ ] Backend source verified: `src/server.ts` exists
- [ ] Environment variables documented: `.env.example` exists

### ✅ Docker Build
- [ ] Docker installed and running
- [ ] Dockerfile uses multi-stage build (builder + runtime)
- [ ] Runtime uses Playwright base image (v1.55.1-noble)
- [ ] Node.js 20 installed in runtime stage
- [ ] All dependencies included (including devDependencies for ts-node)
- [ ] Client build copied from builder stage
- [ ] Output directory created and writable

### ✅ Railway Configuration
- [ ] `railway.toml` exists with correct settings
- [ ] GitHub secret `RAILWAY_TOKEN` configured
- [ ] Environment variables defined (NODE_ENV, PORT, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD)
- [ ] Health check path configured: `/health`
- [ ] Restart policy set to ON_FAILURE

### ✅ CI/CD Pipeline
- [ ] `.github/workflows/deploy.yml` exists
- [ ] Workflow triggers on push to `main` branch
- [ ] Lockfile verification steps included
- [ ] Client build verification included
- [ ] Railway deployment step configured

---

## Deployment Verification Steps

### 1. Local Docker Build Test

```powershell
# Build the image
docker build -t ub-scraper:test .

# Expected output:
# - Builder stage installs all dependencies
# - Client build completes successfully
# - Runtime stage uses Playwright base
# - All files copied correctly
# - Image built successfully

# Run the container
docker run -p 3000:3000 -e NODE_ENV=production --name ub-test ub-scraper:test

# Verify in another terminal:
# Health check
curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"..."}

# API documentation
curl http://localhost:3000/
# Expected: HTML or text with API documentation

# Test scraper (Union Bank - fast test)
curl "http://localhost:3000/scrape/unionb?show=false"
# Expected: JSON array with rate data

# Test client (SPA)
curl -I http://localhost:3000/
# Expected: 200 OK, Content-Type: text/html

# Cleanup
docker stop ub-test && docker rm ub-test
```

### 2. Railway Deployment Verification

```powershell
# Get deployment URL
railway open

# Or get URL manually
railway status

# Verify health endpoint
curl https://your-app.railway.app/health

# Test scraper endpoint
curl "https://your-app.railway.app/scrape/unionb?show=false"

# Check logs
railway logs --tail

# Monitor resource usage
# Visit Railway dashboard → Metrics
# - Memory: Should be 500MB-1.5GB during scraping
# - CPU: Spikes during scraping, low at idle
# - Network: Outbound traffic during scraping
```

### 3. GitHub Actions Verification

After pushing to `main`:

1. **Go to Actions tab** on GitHub
2. **Find latest workflow run** 
3. **Check each step**:
   - ✅ Checkout repository
   - ✅ Setup Node.js 20
   - ✅ Verify root lockfile sync
   - ✅ Install root dependencies
   - ✅ Verify backend source
   - ✅ Verify client lockfile sync
   - ✅ Install client dependencies
   - ✅ Lint client (may have warnings)
   - ✅ Run client tests (367+ tests pass)
   - ✅ Build client
   - ✅ Verify client build output
   - ✅ Install Railway CLI
   - ✅ Deploy to Railway
   - ✅ Deployment Summary

---

## Common Issues & Solutions

### Issue: Docker build fails - "npm ci" errors

**Symptoms:**
```
npm ERR! The package-lock.json lockfile is out of sync with package.json
```

**Solution:**
```powershell
# Regenerate lockfiles locally
npm install --legacy-peer-deps
cd client && npm install && cd ..

# Commit updated lockfiles
git add package-lock.json client/package-lock.json
git commit -m "chore: sync package lockfiles"
git push
```

---

### Issue: Docker build fails - "Cannot find module"

**Symptoms:**
```
Error: Cannot find module 'ts-node'
```

**Solution:**
- Ensure Dockerfile installs ALL dependencies (not just production)
- Dockerfile should use `npm ci --legacy-peer-deps` (not `npm ci --omit=dev`)
- Verify `ts-node` and `typescript` are in root `package.json` devDependencies

---

### Issue: Container exits immediately

**Symptoms:**
```
docker ps    # Container not running
docker logs <container-id>    # Shows error
```

**Solutions:**

1. **Port conflict:**
   ```powershell
   # Use different port
   docker run -p 3001:3000 -e PORT=3000 ub-scraper
   ```

2. **Missing environment variable:**
   ```powershell
   docker run -p 3000:3000 \
     -e NODE_ENV=production \
     -e PORT=3000 \
     -e PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
     ub-scraper
   ```

3. **Check logs for specific error:**
   ```powershell
   docker logs <container-id> 2>&1 | tail -50
   ```

---

### Issue: Chromium crashes in container

**Symptoms:**
```
Error: Browser closed
Target page, context or browser has been closed
```

**Solutions:**

1. **Increase Docker memory:**
   - Docker Desktop → Settings → Resources
   - Set memory to 4GB minimum

2. **Verify Playwright installation:**
   ```powershell
   docker exec -it <container-id> npx playwright --version
   # Should show: Version 1.55.1
   ```

3. **Check system dependencies:**
   - Playwright base image should include all deps
   - If custom image, ensure libgbm, libnss3, etc. installed

---

### Issue: Static files not served

**Symptoms:**
- API endpoints work: `/scrape/hnb` → 200 OK
- Client app doesn't load: `/` → 404 or blank page

**Solution:**

1. **Verify client build exists:**
   ```powershell
   docker exec -it <container-id> ls -la /app/client/dist
   # Should show: index.html, assets/, etc.
   ```

2. **Check NODE_ENV:**
   ```powershell
   docker exec -it <container-id> echo $NODE_ENV
   # Must be: production
   ```

3. **Verify Express static serving:**
   - In `src/server.ts`, check:
     ```typescript
     if (process.env.NODE_ENV === "production") {
       const clientDistPath = path.join(__dirname, "..", "client", "dist");
       app.use(express.static(clientDistPath));
       app.get("*", (_req, res) => {
         res.sendFile(path.join(clientDistPath, "index.html"));
       });
     }
     ```

---

### Issue: Railway deployment fails

**Symptoms:**
- GitHub Actions workflow fails at "Deploy to Railway" step
- Error: "railway: command not found" or "Authentication failed"

**Solutions:**

1. **Verify Railway token:**
   ```powershell
   # Get token locally
   railway whoami --token
   
   # Add to GitHub: Settings → Secrets → Actions
   # Name: RAILWAY_TOKEN
   # Value: <token-from-above>
   ```

2. **Check Railway project link:**
   ```powershell
   # Local machine
   railway status
   
   # If not linked:
   railway link
   # Select your project
   ```

3. **Manual deployment:**
   ```powershell
   railway up --service ub-scraper
   ```

---

### Issue: High memory usage on Railway

**Symptoms:**
- Service restarts frequently
- Error: "Out of memory" in logs
- Memory usage >1.5GB

**Solutions:**

1. **Upgrade Railway plan:**
   - Free tier: 512MB RAM (may be insufficient)
   - Hobby tier: 8GB RAM (recommended)

2. **Optimize scraping:**
   - Add rate limiting to prevent concurrent scrapes
   - Implement request queuing
   - Close browser contexts after each scrape

3. **Monitor memory:**
   ```typescript
   // In src/server.ts
   app.get('/metrics', (req, res) => {
     const used = process.memoryUsage();
     res.json({
       rss: Math.round(used.rss / 1024 / 1024) + ' MB',
       heapUsed: Math.round(used.heapUsed / 1024 / 1024) + ' MB',
       external: Math.round(used.external / 1024 / 1024) + ' MB',
     });
   });
   ```

---

### Issue: TypeScript build errors

**Symptoms:**
```
error TS2344: Type 'RateRow' does not satisfy the constraint...
Found 39 errors in 12 files.
```

**Expected Behavior:**
- This is **intentional** - project uses `ts-node -T` to bypass type checking
- Scrapers prioritize flexibility over strict typing
- Runtime behavior is correct despite type errors

**Why this approach:**
- Scraper code adapts to changing bank website structures
- Type constraints would require frequent updates across 13+ bank scrapers
- Development workflow uses `ts-node -T` (no type checking)
- Production uses same approach for consistency

**If you want strict typing:**
1. Fix 39+ type errors in scrapers
2. Update `tsconfig.json` to enable strict mode
3. Change Dockerfile to compile with `npm run build`
4. Update Dockerfile CMD to `node dist/server.js`
5. Update `railway.toml` startCommand to match

---

## Performance Benchmarks

### Expected Response Times (Railway deployment)

| Endpoint | First Request | Subsequent | Notes |
|----------|--------------|------------|-------|
| `/health` | <100ms | <50ms | No browser launch |
| `/scrape/unionb` | 25-35s | 20-30s | Playwright + page load |
| `/scrape/hnb` | 30-40s | 25-35s | Multiple page navigations |
| `/scrape/sampath` | 15-20s | 10-15s | PDF parsing (no browser) |
| `/scrape/all` | 4-6min | 3-5min | Parallel scraping (13 banks) |
| `/scrape/tariffs-all` | 5-8min | 4-7min | Sequential (network latency) |

### Resource Usage

| Metric | Idle | Single Scrape | All Banks |
|--------|------|---------------|-----------|
| **Memory** | 400-500MB | 800MB-1.2GB | 1-1.5GB |
| **CPU** | <5% | 30-60% | 50-80% |
| **Network** | Minimal | 5-20MB | 50-150MB |
| **Disk** | 2.5GB | +50MB (output/) | +200MB |

---

## Monitoring & Observability

### Health Check Endpoint

```bash
curl https://your-app.railway.app/health

# Response:
{
  "status": "ok",
  "timestamp": "2025-11-11T12:34:56.789Z"
}
```

### Metrics Endpoint (if added)

```bash
curl https://your-app.railway.app/metrics

# Response:
{
  "rss": "523 MB",
  "heapUsed": "234 MB",
  "external": "45 MB"
}
```

### Railway Dashboard

**Navigate to:** [railway.app/dashboard](https://railway.app/dashboard)

**Monitor:**
- **Deployments:** Build logs, deployment history
- **Metrics:** CPU, memory, network graphs (last 24h)
- **Logs:** Real-time application logs with filters
- **Settings:** Environment variables, domains, webhooks

### Log Monitoring

```powershell
# Tail logs (real-time)
railway logs --tail

# Filter logs
railway logs --tail | grep "Error"

# Export logs
railway logs > logs.txt
```

---

## Security Considerations

### Environment Variables

**Never commit:**
- `.env` files with real credentials
- `RAILWAY_TOKEN` in code
- Any API keys or secrets

**Always use:**
- Railway dashboard for production secrets
- GitHub Secrets for CI/CD tokens
- `.env.example` for documentation

### CORS Configuration

Current config (in `src/server.ts`):
```typescript
app.use(cors({
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
```

**For production:**
```typescript
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ["https://your-domain.com"],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
```

### Rate Limiting (Recommended)

Add to `src/server.ts`:
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/scrape/', limiter);
```

---

## Rollback Procedures

### Railway Rollback

```powershell
# View deployments
railway deployments

# Rollback to previous deployment
railway rollback <deployment-id>

# Verify
railway logs --tail
```

### Git Rollback

```powershell
# View recent commits
git log --oneline -10

# Rollback to previous commit
git revert <commit-hash>
git push origin main

# Force rollback (use with caution)
git reset --hard <commit-hash>
git push --force origin main
```

---

## Success Criteria

### ✅ Deployment is successful when:

1. **Health check passes**
   ```bash
   curl https://your-app.railway.app/health
   # Returns: {"status":"ok",...}
   ```

2. **API endpoints respond**
   ```bash
   curl https://your-app.railway.app/scrape/unionb
   # Returns: JSON array with bank rates
   ```

3. **Client application loads**
   - Visit: `https://your-app.railway.app/`
   - See: React application UI
   - Verify: Bank comparison charts load

4. **Tests pass**
   - GitHub Actions workflow completes successfully
   - All 367+ client tests pass
   - No critical errors in logs

5. **Performance acceptable**
   - Single scrape: <40s
   - Memory usage: <1.5GB
   - No frequent restarts

6. **Monitoring active**
   - Railway metrics showing data
   - Health checks passing
   - Logs streaming correctly

---

## Support & Debugging

### Debug Mode

Enable verbose logging:
```powershell
# Railway
railway variables set LOG_LEVEL=debug

# Docker
docker run -p 3000:3000 -e LOG_LEVEL=debug ub-scraper
```

### Interactive Shell

```powershell
# Docker
docker exec -it <container-id> /bin/bash

# Verify files
ls -la /app/client/dist
cat /app/package.json
which node    # Should be: /usr/bin/node

# Railway
railway shell
```

### Common Debug Commands

```bash
# Check Node version
node --version    # Should be: v20.x.x

# Check npm packages
npm list --depth=0

# Test Playwright
npx playwright --version

# Check environment
env | grep NODE
env | grep PORT

# Test server directly
npx ts-node -T src/server.ts
```

---

## Deployment Checklist Summary

- [x] Dependencies synced and installed
- [x] Client tests pass (367+ tests)
- [x] Client builds successfully
- [x] Backend source verified
- [x] Dockerfile optimized (multi-stage, ts-node runtime)
- [x] Railway config updated (startCommand, env vars)
- [x] GitHub Actions configured (lockfile checks, tests, deployment)
- [x] Documentation updated (README, this guide)
- [x] Environment variables documented (.env.example)
- [ ] Docker image built and tested locally
- [ ] Changes committed and pushed to main
- [ ] Railway deployment verified
- [ ] Health check endpoint responding
- [ ] API endpoints tested
- [ ] Client application accessible
- [ ] Monitoring configured
- [ ] Performance acceptable

---

**Last Updated:** 2025-11-11  
**Version:** 1.0  
**Maintained by:** Development Team
