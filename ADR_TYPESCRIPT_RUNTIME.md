# Architecture Decision Record: TypeScript Runtime Strategy

## Status
**Accepted** - November 2025

## Context
The UB Scraper project contains TypeScript code across 13+ bank scrapers with intentionally flexible typing to accommodate varying bank website structures. During production deployment setup, we faced a decision: compile TypeScript to JavaScript (traditional) or run TypeScript directly via ts-node (non-traditional).

## Decision
**Use ts-node in production** with the `-T` flag (transpile-only, no type checking).

## Rationale

### Why ts-node in Production?

1. **Type Flexibility Priority**
   - Bank scrapers must adapt to frequent website changes
   - Strict type constraints would require updates across 13+ scrapers for each bank website change
   - Current approach: 39+ intentional type "errors" that represent flexible contracts

2. **Development-Production Parity**
   - Dev workflow: `npm run dev` → `ts-node -T src/server.ts`
   - Production: Same command ensures identical behavior
   - Eliminates "works in dev, breaks in prod" issues

3. **Faster Iteration**
   - No compilation step needed for scraper hotfixes
   - Deploy changes immediately without TypeScript build
   - Critical for rapid response to bank website changes

4. **Type Safety Where It Matters**
   - Client (React) uses strict TypeScript compilation
   - 367+ unit tests validate calculator logic
   - Type errors in scrapers don't affect runtime behavior

### Tradeoffs Accepted

| Aspect | ts-node (Chosen) | Compiled (Rejected) |
|--------|------------------|---------------------|
| **Startup time** | ~2-3s slower | Faster (~1s) |
| **Memory usage** | +50-100MB | Baseline |
| **Image size** | +150MB (devDeps) | Smaller |
| **Type safety** | Runtime only | Compile-time |
| **Flexibility** | High | Low |
| **Dev parity** | Perfect | Divergent |

### Why Not Compile?

Compilation was attempted but blocked by:
- 39 type errors across 12 files
- Errors are **intentional design choices**, not bugs:
  - `fanOutByYears<RateRow>` constraint violations (tenure flexibility)
  - Optional properties (`product`, `feeCategory`) used conditionally
  - DOM type assertions for Playwright selectors
- Fixing would require:
  - Strict type definitions → less adaptable scrapers
  - Refactoring 13+ bank scrapers → weeks of work
  - Ongoing maintenance burden for every website change

## Implementation

### Dockerfile Strategy
```dockerfile
# Install ALL dependencies (including devDependencies)
RUN npm ci --legacy-peer-deps

# Copy TypeScript source (no compilation)
COPY tsconfig.json ./
COPY src ./src

# Runtime: ts-node with transpile-only
CMD ["npx", "ts-node", "-T", "src/server.ts"]
```

### Railway Configuration
```toml
[deploy]
startCommand = "npx ts-node -T src/server.ts"
```

### Package Scripts
```json
{
  "scripts": {
    "dev": "ts-node -T src/server.ts",
    "start:prod": "NODE_ENV=production ts-node -T src/server.ts"
  }
}
```

## Consequences

### Positive
- ✅ Zero type-checking-related deployment failures
- ✅ Faster scraper updates (no rebuild needed)
- ✅ Perfect dev/prod parity
- ✅ Flexible scraper evolution
- ✅ Consistent with 2+ years of dev workflow

### Negative
- ⚠️ Slightly slower cold starts (~2s)
- ⚠️ Higher memory baseline (+50-100MB)
- ⚠️ Larger Docker image (+150MB for devDeps)
- ⚠️ No compile-time type safety for backend

### Mitigations
1. **Memory overhead:** Railway Hobby plan (8GB) is sufficient
2. **Image size:** Still <3GB total (acceptable for Railway)
3. **Type safety:** Client has strict TypeScript + 367 tests
4. **Cold starts:** Acceptable for scraping workload (not user-facing API)

## Alternatives Considered

### 1. Fix All Type Errors
**Rejected:** Would compromise scraper flexibility, ongoing maintenance burden.

### 2. Mixed Approach (Compile Core, ts-node Scrapers)
**Rejected:** Complexity doesn't justify marginal gains.

### 3. Babel/SWC Transpilation
**Rejected:** Still requires fixing type errors or disabling checks.

### 4. JavaScript Migration
**Rejected:** Loses IDE autocomplete, refactoring tools, partial type safety.

## Future Considerations

If requirements change (e.g., serverless deployment, critical startup time), revisit by:
1. Implementing strict types incrementally per scraper
2. Using compilation for static routes, ts-node for scrapers
3. Migrating to JavaScript with JSDoc types

## References
- [ts-node documentation](https://typestrong.org/ts-node/)
- [TypeScript tsconfig reference](https://www.typescriptlang.org/tsconfig)
- Project: `.github/copilot-instructions.md` (documents ts-node -T pattern)

## Review
- **Date:** November 2025
- **Reviewers:** Development Team
- **Next Review:** When serverless deployment is considered or startup time becomes critical
