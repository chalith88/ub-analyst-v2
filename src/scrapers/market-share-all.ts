/**
 * Market Share Aggregator - Runs all bank scrapers
 * Executes all 14 working bank market share scrapers in sequence
 * and aggregates results into a single output file
 */

import fs from "fs";
import path from "path";

// Import all working scrapers
import { scrapeBOCMarketShareOCR } from "./market-share-boc-ocr";
import { scrapePeoplesBankMarketShare } from "./market-share-peoples-ocr";
import { scrapeCommercialBankMarketShare } from "./market-share-combank-ocr";
import { scrapeHNBMarketShare } from "./market-share-hnb-ocr";
import { scrapeSeylanMarketShare } from "./market-share-seylan-ocr";
import { scrapeSampathMarketShare } from "./market-share-sampath-ocr";
import { scrapeNDBMarketShare } from "./market-share-ndb-ocr";
import { scrapeDFCCMarketShare } from "./market-share-dfcc-ocr";
import { scrapeNSBMarketShare } from "./market-share-nsb-ocr";
import { scrapeNTBMarketShare } from "./market-share-ntb-ocr";
import { scrapeUnionBankMarketShare } from "./market-share-union-ocr";
import { scrapeAmanaMarketShare } from "./market-share-amana-ocr";
import { scrapeCargillsMarketShare } from "./market-share-cargills-ocr";
import { scrapePABCMarketShare } from "./market-share-pabc-ocr";

interface MarketShareResult {
  bank: string;
  shortName: string;
  assetBookSize: number;
  segments: { housing: number; personal: number; lap?: number };
  reportType: string;
  lastUpdated: string;
  source: string;
  extractedAt: string;
}

interface AggregatedResult {
  totalMarketSize: number;
  totalCoverage: number;
  coveragePercentage: number;
  extractedAt: string;
  banks: MarketShareResult[];
  summary: {
    totalBanks: number;
    successfulScrapes: number;
    failedScrapes: number;
    withHousingData: number;
    withPersonalData: number;
  };
}

const scrapers = [
  { name: "BOC", fn: scrapeBOCMarketShareOCR },
  { name: "People's Bank", fn: scrapePeoplesBankMarketShare },
  { name: "Commercial Bank", fn: scrapeCommercialBankMarketShare },
  { name: "HNB", fn: scrapeHNBMarketShare },
  { name: "Seylan", fn: scrapeSeylanMarketShare },
  { name: "Sampath Bank", fn: scrapeSampathMarketShare },
  { name: "NDB", fn: scrapeNDBMarketShare },
  { name: "DFCC", fn: scrapeDFCCMarketShare },
  { name: "NSB", fn: scrapeNSBMarketShare },
  { name: "NTB", fn: scrapeNTBMarketShare },
  { name: "Union Bank", fn: scrapeUnionBankMarketShare },
  { name: "Amana Bank", fn: scrapeAmanaMarketShare },
  { name: "Cargills Bank", fn: scrapeCargillsMarketShare },
  { name: "PABC", fn: scrapePABCMarketShare },
];

async function scrapeAllBanks(): Promise<AggregatedResult> {
  console.log("🚀 Starting market share aggregation for all banks...\n");
  console.log("=" .repeat(70));
  
  const results: MarketShareResult[] = [];
  const failures: string[] = [];
  
  for (const scraper of scrapers) {
    try {
      console.log(`\n📊 Scraping ${scraper.name}...`);
      const result = await scraper.fn();
      
      if (result) {
        results.push(result);
        console.log(`✅ ${scraper.name}: ${(result.assetBookSize / 1000).toFixed(1)}M`);
      } else {
        failures.push(scraper.name);
        console.log(`❌ ${scraper.name}: No data returned`);
      }
    } catch (error) {
      failures.push(scraper.name);
      console.error(`❌ ${scraper.name} failed: ${error instanceof Error ? error.message : error}`);
    }
    
    // Small delay between requests to be nice to servers
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log("\n" + "=".repeat(70));
  
  // Calculate totals
  const totalCoverage = results.reduce((sum, r) => sum + r.assetBookSize, 0);
  const totalMarketSize = 8390000000; // 8.39T (approximate total market)
  const coveragePercentage = (totalCoverage / totalMarketSize) * 100;
  
  const withHousingData = results.filter(r => r.segments.housing > 0).length;
  const withPersonalData = results.filter(r => r.segments.personal > 0).length;
  
  const aggregated: AggregatedResult = {
    totalMarketSize,
    totalCoverage,
    coveragePercentage,
    extractedAt: new Date().toISOString(),
    banks: results,
    summary: {
      totalBanks: scrapers.length,
      successfulScrapes: results.length,
      failedScrapes: failures.length,
      withHousingData,
      withPersonalData,
    },
  };
  
  // Save aggregated results
  const outputDir = path.resolve("./output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const outputPath = path.join(outputDir, "market-share-aggregated.json");
  fs.writeFileSync(outputPath, JSON.stringify(aggregated, null, 2));
  
  console.log("\n📊 AGGREGATION SUMMARY:");
  console.log(`  Total Banks: ${scrapers.length}`);
  console.log(`  Successful: ${results.length} (${((results.length / scrapers.length) * 100).toFixed(1)}%)`);
  console.log(`  Failed: ${failures.length}`);
  if (failures.length > 0) {
    console.log(`  Failed banks: ${failures.join(", ")}`);
  }
  console.log(`\n  Total Market Size: LKR ${(totalMarketSize / 1000).toFixed(1)}M`);
  console.log(`  Coverage: LKR ${(totalCoverage / 1000).toFixed(1)}M (${coveragePercentage.toFixed(1)}%)`);
  console.log(`  Banks with Housing data: ${withHousingData}`);
  console.log(`  Banks with Personal data: ${withPersonalData}`);
  console.log(`\n✅ Results saved to: ${outputPath}`);
  
  return aggregated;
}

// Run if executed directly
if (require.main === module) {
  scrapeAllBanks()
    .then(() => {
      console.log("\n🎉 Market share aggregation complete!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Fatal error during aggregation:", error);
      process.exit(1);
    });
}

export { scrapeAllBanks, AggregatedResult };
