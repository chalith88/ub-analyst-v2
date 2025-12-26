/**
 * Market Share Scraper Orchestrator
 * Coordinates scraping of all banks' quarterly reports
 * Falls back to static data if scraping fails
 */

import fs from "fs";
import path from "path";
import { MarketShareData } from "./market-share-base";
import { scrapeBOCMarketShare } from "./market-share-boc";
import { MARKET_SHARE_DATA } from "../data/market-share";


export interface ScraperResult {
  success: boolean;
  data: MarketShareData[];
  errors: Record<string, string>;
  usedFallback: boolean;
  scrapedCount: number;
  totalCount: number;
}

/**
 * Registry of all bank scrapers
 */
const SCRAPERS = {
  BOC: scrapeBOCMarketShare,
  // Add more as we build them:
  // "People's": scrapePeoplesMarketShare,
  // ComBank: scrapeComBankMarketShare,
  // etc.
};

/**
 * Scrape market share data from all banks
 */
export async function scrapeAllMarketShare(
  options: {
    useFallback?: boolean;      // Use static data if scraping fails
    forceRefresh?: boolean;      // Ignore cache
    parallel?: boolean;          // Run scrapers in parallel
  } = {}
): Promise<ScraperResult> {
  const { useFallback = true, parallel = false } = options;
  
  console.log("\n🚀 Starting market share scraping for all banks...\n");
  
  const scrapedData: MarketShareData[] = [];
  const errors: Record<string, string> = {};
  
  // Run scrapers
  const scraperEntries = Object.entries(SCRAPERS);
  
  if (parallel) {
    // Parallel execution
    const results = await Promise.allSettled(
      scraperEntries.map(([bank, scraper]) => 
        scraper().catch(err => {
          errors[bank] = err.message;
          return null;
        })
      )
    );
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const [bank] = scraperEntries[i];
      
      if (result.status === "fulfilled" && result.value) {
        scrapedData.push(result.value);
      } else if (result.status === "rejected") {
        errors[bank] = result.reason?.message || "Unknown error";
      }
    }
  } else {
    // Sequential execution (safer for resource-constrained environments)
    for (const [bank, scraper] of scraperEntries) {
      try {
        const data = await scraper();
        if (data) {
          scrapedData.push(data);
        } else {
          errors[bank] = "Scraper returned null";
        }
      } catch (err: any) {
        errors[bank] = err.message;
        console.error(`❌ ${bank} scraper failed:`, err.message);
      }
    }
  }
  
  console.log(`\n✅ Successfully scraped: ${scrapedData.length} banks`);
  console.log(`❌ Failed to scrape: ${Object.keys(errors).length} banks\n`);
  
  // If we have some scraped data, merge with fallback for missing banks
  let finalData: MarketShareData[] = [];
  let usedFallbackFlag = false;
  
  if (scrapedData.length > 0) {
    finalData = scrapedData;
    
    // Add fallback data for banks we couldn't scrape
    if (useFallback) {
      const scrapedBanks = new Set(scrapedData.map(d => d.shortName));
      const missingBanks = MARKET_SHARE_DATA.filter(
        staticBank => !scrapedBanks.has(staticBank.shortName)
      );
      
      if (missingBanks.length > 0) {
        console.log(`📋 Using static data for ${missingBanks.length} banks: ${
          missingBanks.map(b => b.shortName).join(", ")
        }`);
        
        // Convert static data to MarketShareData format
        for (const staticBank of missingBanks) {
          finalData.push({
            bank: staticBank.bank,
            shortName: staticBank.shortName,
            assetBookSize: staticBank.assetBookSize,
            segments: staticBank.segments,
            lastUpdated: staticBank.lastUpdated,
            source: staticBank.source + " (static fallback)",
            reportType: staticBank.reportType,
            reportUrl: staticBank.reportUrl || "",
            confidence: "high",  // Static data is verified
            extractedAt: new Date().toISOString(),
          });
        }
        
        usedFallbackFlag = true;
      }
    }
  } else if (useFallback) {
    // Complete failure - use all static data
    console.warn("⚠️  All scrapers failed, falling back to static data");
    
    finalData = MARKET_SHARE_DATA.map(staticBank => ({
      bank: staticBank.bank,
      shortName: staticBank.shortName,
      assetBookSize: staticBank.assetBookSize,
      segments: staticBank.segments,
      lastUpdated: staticBank.lastUpdated,
      source: staticBank.source + " (static fallback)",
      reportType: staticBank.reportType,
      reportUrl: staticBank.reportUrl || "",
      confidence: "high" as const,
      extractedAt: new Date().toISOString(),
    }));
    
    usedFallbackFlag = true;
  }
  
  // Calculate market shares
  const totalMarket = finalData.reduce((sum, bank) => sum + bank.assetBookSize, 0);
  finalData = finalData.map(bank => ({
    ...bank,
    marketShare: (bank.assetBookSize / totalMarket) * 100,
  }));
  
  // Sort by asset book size descending
  finalData.sort((a, b) => b.assetBookSize - a.assetBookSize);
  
  return {
    success: scrapedData.length > 0 || usedFallbackFlag,
    data: finalData,
    errors,
    usedFallback: usedFallbackFlag,
    scrapedCount: scrapedData.length,
    totalCount: finalData.length,
  };
}

/**
 * Load pre-scraped data from output files (for Railway deployment)
 */
function loadPreScrapedData(): MarketShareData[] | null {
  try {
    // Primary path: runtime volume or copied output file
    const aggregatedPath = path.join(process.cwd(), "output", "market-share-aggregated.json");
    if (fs.existsSync(aggregatedPath)) {
      const fileContent = fs.readFileSync(aggregatedPath, "utf-8");
      const parsed = JSON.parse(fileContent);
      if (parsed.banks && Array.isArray(parsed.banks)) {
        console.log(`📁 Loaded ${parsed.banks.length} banks from pre-scraped data (runtime output)`);
        return parsed.banks;
      }
    }

    // Fallback: try bundled JSON (when fs path fails in certain deploys)
    const bundledPath = path.join(__dirname, "..", "..", "output", "market-share-aggregated.json");
    if (fs.existsSync(bundledPath)) {
      const fileContent = fs.readFileSync(bundledPath, "utf-8");
      const parsed = JSON.parse(fileContent);
      if (parsed.banks && Array.isArray(parsed.banks)) {
        console.log(`📁 Loaded ${parsed.banks.length} banks from bundled pre-scraped data`);
        return parsed.banks;
      }
    }

    console.warn("⚠️  No pre-scraped market-share data found (runtime or bundled)");
    return null;
  } catch (error) {
    console.warn("⚠️  Failed to load pre-scraped data:", error);
    return null;
  }
}

/**
 * Get cached market share data (for quick API responses)
 */
let cachedData: { data: MarketShareData[]; timestamp: number } | null = null;
let skipPreScrapedData = false; // Flag to skip pre-scraped data after manual reset
const CACHE_TTL = 1 * 60 * 1000; // 1 minute (temporary for testing)

export async function getMarketShareData(forceRefresh = false): Promise<MarketShareData[]> {
  const now = Date.now();
  
  // Return cached data if valid
  if (!forceRefresh && cachedData && (now - cachedData.timestamp) < CACHE_TTL) {
    console.log("📦 Using cached market share data");
    return cachedData.data;
  }
  
  // Try loading pre-scraped data first (for Railway deployment)
  // Skip if cache was manually cleared
  if (!forceRefresh && !skipPreScrapedData) {
    const preScrapedData = loadPreScrapedData();
    if (preScrapedData && preScrapedData.length > 0) {
      cachedData = {
        data: preScrapedData,
        timestamp: now,
      };
      return preScrapedData;
    }
  }
  
  // Scrape fresh data
  const result = await scrapeAllMarketShare({ useFallback: true });
  
  if (result.success) {
    skipPreScrapedData = false; // Re-enable pre-scraped data after successful scrape
    cachedData = {
      data: result.data,
      timestamp: now,
    };
    
    return result.data;
  }
  
  // If scraping failed and we have old cache, use it
  if (cachedData) {
    console.warn("⚠️  Scraping failed, using stale cache");
    return cachedData.data;
  }
  
  // Last resort: static data
  console.error("❌ All scraping failed, using static data");
  return MARKET_SHARE_DATA.map(staticBank => ({
    bank: staticBank.bank,
    shortName: staticBank.shortName,
    assetBookSize: staticBank.assetBookSize,
    segments: staticBank.segments,
    lastUpdated: staticBank.lastUpdated,
    source: staticBank.source + " (static fallback)",
    reportType: staticBank.reportType,
    reportUrl: staticBank.reportUrl || "",
    confidence: "high" as const,
    extractedAt: new Date().toISOString(),
    marketShare: staticBank.marketShare,
  }));
}

/**
 * Clear cache (useful for testing)
 */
export function clearMarketShareCache(): void {
  cachedData = null;
  skipPreScrapedData = true; // Prevent loading pre-scraped data until scrapers run again
  console.log("🗑️  Market share cache cleared (pre-scraped data disabled)");
}

// Allow running standalone
if (require.main === module) {
  scrapeAllMarketShare({ parallel: false }).then(result => {
    console.log("\n" + "=".repeat(60));
    console.log("📊 MARKET SHARE SCRAPING SUMMARY");
    console.log("=".repeat(60));
    console.log(`✅ Scraped: ${result.scrapedCount}/${result.totalCount} banks`);
    console.log(`📋 Used fallback: ${result.usedFallback ? "Yes" : "No"}`);
    
    if (Object.keys(result.errors).length > 0) {
      console.log(`\n❌ Errors:`);
      for (const [bank, error] of Object.entries(result.errors)) {
        console.log(`   ${bank}: ${error}`);
      }
    }
    
    console.log(`\n📈 Top 5 Banks:`);
    result.data.slice(0, 5).forEach((bank, i) => {
      console.log(`   ${i + 1}. ${bank.shortName}: LKR ${(bank.assetBookSize / 1000).toFixed(1)}B (${bank.confidence} confidence)`);
    });
    
    console.log("\n" + "=".repeat(60) + "\n");
  });
}
