// src/server.ts
import express from "express";
import fs from "fs/promises";
import path from "path";
import cors from "cors";

/**
 * Smart number formatter for market share values
 * @param value - Value in thousands (LKR '000)
 * @returns Formatted string like "1.2T", "456.7B", or "89.3M"
 */
function formatMarketShareValue(valueInThousands: number): string {
  const trillions = valueInThousands / 1000000000;
  const billions = valueInThousands / 1000000;
  const millions = valueInThousands / 1000;
  
  if (trillions >= 1) {
    return `${trillions.toFixed(1)}T`;
  } else if (billions >= 1) {
    return `${billions.toFixed(1)}B`;
  } else {
    return `${millions.toFixed(1)}M`;
  }
}

import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import { XMLParser } from "fast-xml-parser";

import { scrapeHNB } from "./scrapers/hnb";
import { scrapeSeylan } from "./scrapers/seylan";
import { scrapeSampath } from "./scrapers/sampath";    // PDF parser
import { scrapeCombank } from "./scrapers/combank";
import { scrapeNDB } from "./scrapers/ndb";
import { scrapeUnionBank } from "./scrapers/unionb";
import { scrapePeoples, scrapePeoplesPensionerLoan } from "./scrapers/peoples";
import { scrapeDFCC, scrapeDFCCSolarLoan } from "./scrapers/dfcc";
import { scrapeNSB } from "./scrapers/nsb";
import { scrapeBOC } from "./scrapers/boc";
import { scrapeCargills, scrapeCargillsPensionerLoan } from "./scrapers/cargills";
import { scrapeNTB } from "./scrapers/ntb";
import { scrapeAmana } from "./scrapers/amana";
import { scrapeCBSL } from "./scrapers/cbsl";
import { scrapeHnbTariff } from "./scrapers/hnb-tariff";
import { scrapeSeylanTariff } from "./scrapers/seylan-tariff";
import { scrapeSampathTariff } from "./scrapers/sampath-tariff";
import { scrapeCombankTariff } from "./scrapers/combank_tariff";
import { scrapeNdbTariff } from "./scrapers/ndb-tariff";
import { scrapeUnionbTariff } from "./scrapers/unionb-tariff";
import { scrapeDfccTariff } from "./scrapers/dfcc-tariff";
import { scrapeNSBTariff } from "./scrapers/nsb-tariff";
import { scrapeBocTariff } from "./scrapers/boc-tariff";
import { scrapeCargillsTariff } from "./scrapers/cargills-tariff";
import { scrapeNtbTariff } from "./scrapers/ntb-tariff";
import { scrapeAmanaTariff } from "./scrapers/amana-tariff";
import { scrapePeoplesTariff } from "./scrapers/peoples-tariff";

// Rate change tracking
import { 
  saveRateSnapshot, 
  detectRateChanges, 
  getRecentRateChanges, 
  getRateHistory,
  RateSnapshot,
  RateChange
} from "./db/database";

// Market share data (static fallback)
import { calculateMarketShare, getTopBanks, getTotalMarketSize, getMarketConcentration } from "./data/market-share";

// Product market share calculator
import { calculateProductMarketShare } from "./utils/product-market-share";

// Market share scrapers (dynamic extraction)
import { getMarketShareData, clearMarketShareCache } from "./scrapers/market-share-orchestrator";
import { scrapeBOCMarketShareOCR } from "./scrapers/market-share-boc-ocr";
import { scrapePeoplesBankMarketShare } from "./scrapers/market-share-peoples-ocr";
import { scrapeCommercialBankMarketShare } from "./scrapers/market-share-combank-ocr";
import { scrapeHNBMarketShare } from "./scrapers/market-share-hnb-ocr";
import { scrapeSeylanMarketShare } from "./scrapers/market-share-seylan-ocr";
import { scrapeSampathMarketShare } from "./scrapers/market-share-sampath-ocr";
import { scrapeNDBMarketShare } from "./scrapers/market-share-ndb-ocr";
import { scrapeDFCCMarketShare } from "./scrapers/market-share-dfcc-ocr";
import { scrapeNSBMarketShare } from "./scrapers/market-share-nsb-ocr";
import { scrapeNTBMarketShare } from "./scrapers/market-share-ntb-ocr";
import { scrapeUnionBankMarketShare } from "./scrapers/market-share-union-ocr";
import { scrapeAmanaMarketShare } from "./scrapers/market-share-amana-ocr";
import { scrapeCargillsMarketShare } from "./scrapers/market-share-cargills-ocr";
import { scrapePABCMarketShare } from "./scrapers/market-share-pabc-ocr";
import { scrapeAllBanks } from "./scrapers/market-share-all";


const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(cors({
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

const ensureOutputDir = async () => {
  const outDir = path.join(process.cwd(), "output");
  await fs.mkdir(outDir, { recursive: true });
  return outDir;
};

// Helper function to convert RateRow to RateSnapshot
function convertToSnapshot(row: any): RateSnapshot {
  const rate = row.rate || row.rateWithSalary || row.rateWithoutSalary || 0;
  return {
    bank: row.bank,
    product: row.product,
    type: row.type,
    tenureYears: row.tenureYears,
    rate: rate,
    rateWithSalary: row.rateWithSalary,
    rateWithoutSalary: row.rateWithoutSalary,
    notes: row.notes,
    scrapedAt: new Date().toISOString()
  };
}

// Helper function to save rates and detect changes
async function trackRateChanges(bankName: string, rates: any[]): Promise<RateChange[]> {
  const snapshots = rates
    .filter(r => r.rate || r.rateWithSalary || r.rateWithoutSalary)
    .map(convertToSnapshot);
  
  const changes = detectRateChanges(snapshots);
  
  // Save all snapshots after detecting changes
  for (const snapshot of snapshots) {
    saveRateSnapshot(snapshot);
  }
  
  return changes;
}

/** -------- Tariff All: types, list, helpers -------- */
type TariffBasis = "flat" | "percent" | "actuals";
type ProductKey = "HL" | "LAP" | "PL" | "EDU";
type TariffFeeType =
  | "processing"
  | "legal"
  | "valuation"
  | "early_settlement"
  | "stamp_duty"
  | "penalty"
  | "other";

interface TariffRow {
  bank: string;
  product: ProductKey;
  feeType: TariffFeeType;
  basis: TariffBasis;
  value?: number;
  min?: number;
  max?: number;
  notes?: string;
  effectiveDate?: string;
  updatedAt: string;
  source?: string;
  description?: string;
}

/** The same keys you used for individual tariff endpoints */
const TARIFF_SCRAPER_KEYS = [
  "hnb-tariff", "seylan-tariff", "sampath-tariff", "combank-tariff",
  "ndb-tariff", "unionb-tariff", "dfcc-tariff", "nsb-tariff",
  "boc-tariff", "cargills-tariff", "ntb-tariff", "amana-tariff", "peoples-tariff",
] as const;

/** Safe array coerce */
function arr<T = any>(x: any): T[] {
  if (Array.isArray(x)) return x as T[];
  if (x?.rows && Array.isArray(x.rows)) return x.rows as T[];
  if (x?.data && Array.isArray(x.data)) return x.data as T[];
  return [];
}

/** Merge tariffs: replace by (bank, product, feeType) — latest row wins */
function mergeTariffsByKey(existing: TariffRow[], incoming: TariffRow[]): TariffRow[] {
  const map = new Map<string, TariffRow>();
  for (const r of existing) {
    const k = `${r.bank}||${r.product}||${r.feeType}`.toLowerCase();
    map.set(k, r);
  }
  for (const r of incoming) {
    const k = `${r.bank}||${r.product}||${r.feeType}`.toLowerCase();
    map.set(k, r);
  }
  return [...map.values()];
}

app.get("/api", (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.type("text/plain").send(
    [
      "UB Scraper API",
      "",
      `HNB                : ${baseUrl}/scrape/hnb`,
      `Seylan             : ${baseUrl}/scrape/seylan`,
      `Sampath            : ${baseUrl}/scrape/sampath`,
      `ComBank            : ${baseUrl}/scrape/combank`,
      `NDB                : ${baseUrl}/scrape/ndb`,
      `UnionBank          : ${baseUrl}/scrape/unionb`,
      `Peoples            : ${baseUrl}/scrape/peoples`,
      `DFCC               : ${baseUrl}/scrape/dfcc`,
      `NSB                : ${baseUrl}/scrape/nsb`,
      `BOC                : ${baseUrl}/scrape/boc`,
      `Cargills           : ${baseUrl}/scrape/cargills`,
      `NTB                : ${baseUrl}/scrape/ntb`,
      `Amana              : ${baseUrl}/scrape/amana`,
      `CBSL               : ${baseUrl}/scrape/cbsl`,
      `HNB Tariff         : ${baseUrl}/scrape/hnb-tariff`,
      `Seylan Tariff      : ${baseUrl}/scrape/seylan-tariff`,
      `Sampath Tariff     : ${baseUrl}/scrape/sampath-tariff`,
      `ComBank Tariff     : ${baseUrl}/scrape/combank_tariff`,
      `NDB Tariff         : ${baseUrl}/scrape/ndb-tariff`,
      `UnionBank Tariff   : ${baseUrl}/scrape/unionb-tariff`,
      `DFCC Tariff        : ${baseUrl}/scrape/dfcc-tariff`,
      `NSB Tariff         : ${baseUrl}/scrape/nsb-tariff`,
      `BOC Tariff         : ${baseUrl}/scrape/boc-tariff`,
      `Cargills Tariff    : ${baseUrl}/scrape/cargills-tariff`,
      `NTB Tariff         : ${baseUrl}/scrape/ntb-tariff`,
      `Amana Tariff       : ${baseUrl}/scrape/amana-tariff`,
      `Peoples Tariff     : ${baseUrl}/scrape/peoples-tariff`,
      `ALL                : ${baseUrl}/scrape/all`,
      `Tariff ALL         : ${baseUrl}/scrape/tariffs-all`,
      "",
      "Query params:",
      "  show=true|false   -> inline JSON / open Chromium (Playwright) [local dev only]",
      "  slow=0|200|500    -> slowMo ms between actions [local dev only]",
      "  save=true         -> also write JSON to /output/<bank>.json",
    ].join("\n")
  );
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// NEW ENDPOINT: Get recent rate changes
app.get("/api/rate-changes", async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const changes = getRecentRateChanges(limit);
    
    res.json({
      count: changes.length,
      changes: changes.map(c => ({
        ...c,
        direction: c.changeAmount > 0 ? "increased" : "decreased",
        formattedChange: `${c.changeAmount > 0 ? '+' : ''}${c.changeAmount.toFixed(2)}%`,
        badge: c.changeAmount > 0 ? "🔴 INCREASED" : "🟢 DECREASED"
      }))
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// NEW ENDPOINT: Get rate history for a specific bank/product
app.get("/api/rate-history/:bank/:product", async (req, res) => {
  try {
    const { bank, product } = req.params;
    const tenureYears = req.query.tenure ? Number(req.query.tenure) : undefined;
    const days = Number(req.query.days) || 30;
    
    const history = getRateHistory(bank, product, tenureYears, days);
    
    res.json({
      bank,
      product,
      tenureYears,
      period: `${days} days`,
      count: history.length,
      history
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// Market share endpoint (with dynamic scraping)
app.get("/api/market-share", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    const useStatic = req.query.static === "true";
    const limit = Number(req.query.limit) || 14;
    
    let banksData;
    let dataSource = "dynamic";
    
    if (useStatic) {
      // Use static data only
      console.log("📋 Using static market share data (forced)");
      banksData = getTopBanks(limit);
      dataSource = "static";
    } else {
      // Try dynamic scraping with fallback
      console.log(`📊 Fetching market share data (refresh: ${forceRefresh})...`);
      const scrapedData = await getMarketShareData(forceRefresh);
      
      // Check if data is empty (after cache clear)
      if (!scrapedData || scrapedData.length === 0) {
        return res.status(404).json({ 
          error: "No market share data available",
          message: "Please run market share scrapers to extract data",
          banks: []
        });
      }
      
      banksData = scrapedData.slice(0, limit);
      
      // Check if we used any fallback
      const hasFallback = banksData.some(b => b.source?.includes("fallback"));
      if (hasFallback) {
        dataSource = "hybrid";
      }
    }
    
    const totalMarket = banksData.reduce((sum: number, b: any) => sum + b.assetBookSize, 0);
    
    // Calculate concentration metrics
    const sortedByShare = [...banksData].sort((a: any, b: any) => b.assetBookSize - a.assetBookSize);
    const shares = sortedByShare.map((b: any) => (b.assetBookSize / totalMarket) * 100);
    const hhi = shares.reduce((sum, share) => sum + Math.pow(share, 2), 0);
    const cr3 = shares.slice(0, 3).reduce((sum, share) => sum + share, 0);
    const cr5 = shares.slice(0, 5).reduce((sum, share) => sum + share, 0);

    res.json({
      banks: banksData.map((b: any, index: number) => {
        // Detect unit: scraped data is in thousands, static fallback is in millions
        const isScrapedData = b.source && !b.source.includes('static fallback');
        const valueInThousands = isScrapedData ? b.assetBookSize : b.assetBookSize * 1000;
        
        // Calculate YoY growth if previousYear data exists
        let prevValueInThousands: number | undefined;
        let growth: number | undefined;
        let growthPercentage: number | undefined;
        let previousYearFormatted: string | undefined;
        let growthFormatted: string | undefined;
        let growthPercentageFormatted: string | undefined;
        
        if (b.previousYear?.assetBookSize) {
          prevValueInThousands = isScrapedData ? b.previousYear.assetBookSize : b.previousYear.assetBookSize * 1000;
          growth = valueInThousands - prevValueInThousands;
          growthPercentage = (growth / prevValueInThousands) * 100;
          previousYearFormatted = `LKR ${formatMarketShareValue(prevValueInThousands)}`;
          growthFormatted = `${growth > 0 ? '+' : ''}${formatMarketShareValue(Math.abs(growth))}`;
          growthPercentageFormatted = `${growth > 0 ? '+' : ''}${growthPercentage.toFixed(2)}%`;
        }
        
        return {
          bank: b.shortName,
          fullName: b.bank,
          assetBookSize: b.assetBookSize,
          assetBookSizeFormatted: `LKR ${formatMarketShareValue(valueInThousands)}`,
          marketShare: b.marketShare || ((b.assetBookSize / totalMarket) * 100),
          previousYear: b.previousYear,
          previousYearFormatted,
          growth,
          growthFormatted,
          growthPercentage,
          growthPercentageFormatted,
          segments: b.segments,
          detailedBreakdown: b.detailedBreakdown,
          lastUpdated: b.lastUpdated,
          source: b.source,
          reportType: b.reportType,
          reportUrl: b.reportUrl,
          confidence: b.confidence || "high",
          extractedAt: b.extractedAt,
        };
      }),
      totalMarket,
      totalMarketFormatted: `LKR ${formatMarketShareValue(banksData[0]?.source?.includes('static fallback') ? totalMarket * 1000 : totalMarket)}`,
      concentration: {
        hhi: Math.round(hhi),
        hhiInterpretation: hhi < 1500 ? "Competitive" : hhi < 2500 ? "Moderately Concentrated" : "Highly Concentrated",
        cr3: parseFloat(cr3.toFixed(1)),
        cr3Banks: sortedByShare.slice(0, 3).map((b: any) => b.shortName),
        cr5: parseFloat(cr5.toFixed(1)),
        cr5Banks: sortedByShare.slice(0, 5).map((b: any) => b.shortName),
      },
      meta: {
        dataSource,  // "dynamic", "static", or "hybrid"
        lastUpdated: new Date().toISOString(),
        cacheAge: "varies by bank",
      }
    });
  } catch (err: any) {
    console.error("Market share error:", err);
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// Clear market share cache endpoint (admin)
app.post("/api/market-share/clear-cache", (req, res) => {
  try {
    clearMarketShareCache();
    res.json({ success: true, message: "Market share cache cleared" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// Product-specific market share endpoint
app.get("/api/market-share/by-product/:productKey", async (req, res) => {
  try {
    const productKey = req.params.productKey?.toUpperCase();
    const limit = Number(req.query.limit) || 14;
    
    // Validate product key
    const validProducts = ['HL', 'PL', 'LAP', 'EL', 'EDU'];
    if (!validProducts.includes(productKey)) {
      return res.status(400).json({ 
        error: `Invalid product key. Must be one of: ${validProducts.join(', ')}` 
      });
    }

    // Calculate product market share
    const productData = await calculateProductMarketShare(productKey as any);
    
    // Apply limit
    const limitedData = {
      ...productData,
      banks: productData.banks.slice(0, limit),
    };

    // Calculate concentration for this product
    const shares = limitedData.banks.map(b => b.marketShare);
    const hhi = shares.reduce((sum, share) => sum + Math.pow(share, 2), 0);
    const cr3 = shares.slice(0, 3).reduce((sum, share) => sum + share, 0);
    const cr5 = shares.slice(0, 5).reduce((sum, share) => sum + share, 0);

    res.json({
      product: productData.product,
      productName: productData.productName,
      totalMarketSize: productData.totalMarketSize,
      totalMarketSizeFormatted: `LKR ${formatMarketShareValue(productData.totalMarketSize * 1000)}`,
      banks: limitedData.banks.map(b => ({
        ...b,
        amountFormatted: `LKR ${formatMarketShareValue(b.amount * 1000)}`,
        previousAmountFormatted: b.previousAmount ? `LKR ${formatMarketShareValue(b.previousAmount * 1000)}` : undefined,
        growthFormatted: b.growth !== undefined ? `${b.growth > 0 ? '+' : ''}${formatMarketShareValue(Math.abs(b.growth) * 1000)}` : undefined,
        growthPercentageFormatted: b.growthPercentage !== undefined ? `${b.growthPercentage > 0 ? '+' : ''}${b.growthPercentage.toFixed(2)}%` : undefined,
      })),
      concentration: {
        hhi: Math.round(hhi),
        hhiInterpretation: hhi < 1500 ? "Competitive" : hhi < 2500 ? "Moderately Concentrated" : "Highly Concentrated",
        cr3: parseFloat(cr3.toFixed(1)),
        cr3Banks: limitedData.banks.slice(0, 3).map(b => b.shortName),
        cr5: parseFloat(cr5.toFixed(1)),
        cr5Banks: limitedData.banks.slice(0, 5).map(b => b.shortName),
      },
      meta: {
        lastCalculated: productData.lastCalculated,
        dataSource: "dynamic",  // Based on scraped quarterly reports with product breakdowns
      }
    });
  } catch (err: any) {
    console.error("Product market share error:", err);
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// Market share refresh endpoint - runs all scrapers
app.post("/api/market-share/refresh", async (req, res) => {
  try {
    console.log("🔄 Starting market share refresh for all banks...");
    
    // Import the aggregator dynamically
    const { scrapeAllBanks } = await import("./scrapers/market-share-all");
    
    // Run all scrapers
    const result = await scrapeAllBanks();
    
    // Clear the cache so next GET will use fresh data
    clearMarketShareCache();
    
    res.json({
      success: true,
      message: "Market share data refreshed successfully",
      summary: {
        totalBanks: result.summary.totalBanks,
        successful: result.summary.successfulScrapes,
        failed: result.summary.failedScrapes,
        coverage: `${result.coveragePercentage.toFixed(1)}%`,
        totalMarketSize: `LKR ${(result.totalMarketSize / 1000000).toFixed(1)}B`,
        totalCoverage: `LKR ${(result.totalCoverage / 1000000).toFixed(1)}B`,
      },
      banks: result.banks.map(b => ({
        bank: b.shortName,
        assetBookSize: `LKR ${(b.assetBookSize / 1000000).toFixed(1)}B`,
        reportType: b.reportType,
        lastUpdated: b.lastUpdated,
      })),
      extractedAt: result.extractedAt,
    });
  } catch (err: any) {
    console.error("Market share refresh error:", err);
    res.status(500).json({ 
      success: false,
      error: err?.message || String(err) 
    });
  }
});

// Market share cache clear endpoint - clears cache without scraping
app.post("/api/market-share/clear-cache", (req, res) => {
  try {
    clearMarketShareCache();
    res.json({
      success: true,
      message: "Market share cache cleared. Next request will load fresh data.",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || "Failed to clear cache",
    });
  }
});

async function maybeSave(bank: string, data: unknown, save?: boolean) {
  if (!save) return;
  const outDir = await ensureOutputDir();
  const file = path.join(outDir, `${bank.toLowerCase().replace(/\s+/g, "-")}.json`);
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

/* ---------------- Industry news aggregator ---------------- */
const NEWS_TTL_MS = 10 * 60 * 1000;
const NEWS_USER_AGENT = "Mozilla/5.0 (compatible; UBAnalyst/1.0; +https://www.unionb.com/)";
const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

type NewsArticle = {
  id: string;
  title: string;
  summary: string;
  link: string;
  source: string;
  publishedAt: string;
  topics: string[];
  origin: string;
  image?: string;
};

type NewsCache = {
  items: NewsArticle[];
  fetchedAt: string;
  expires: number;
  sources: string[];
};

const GOOGLE_NEWS_QUERIES = [
  {
    source: "Google News – Banking",
    topics: ["Banking & Finance"],
    url: "https://news.google.com/rss/search?q=Sri%20Lanka%20banking&hl=en-US&gl=US&ceid=US:en",
  },
  {
    source: "Google News – Real Estate",
    topics: ["Real Estate"],
    url: "https://news.google.com/rss/search?q=Sri%20Lanka%20real%20estate&hl=en-US&gl=US&ceid=US:en",
  },
];

const RSS_FEEDS: Array<{ source: string; url: string; topics?: string[] }> = [
  {
    source: "EconomyNext",
    url: "https://economynext.com/feed/",
  },
  {
    source: "Lanka Business Online",
    url: "https://www.lankabusinessonline.com/feed/",
  },
  {
    source: "Daily FT - Front Page",
    url: "https://www.ft.lk/rss/top-story/26",
  },
  {
    source: "Daily FT - News",
    url: "https://www.ft.lk/rss/news/3",
  },
];

const CBSL_PRESS_URL = "https://www.cbsl.gov.lk/en/press/press-releases";

const TOPIC_MATCHERS: Array<{ label: string; patterns: RegExp[] }> = [
  {
    label: "Banking & Finance",
    patterns: [/bank/i, /finance/i, /financial/i, /loan/i, /lending/i, /credit/i, /deposit/i, /interest rate/i, /branch/i],
  },
  {
    label: "Real Estate",
    patterns: [/real estate/i, /property/i, /housing/i, /condominium/i, /apartment/i, /land/i, /construction/i],
  },
  {
    label: "Policy & Regulation",
    patterns: [/central bank/i, /cbsl/i, /monetary policy/i, /directive/i, /regulation/i, /policy/i, /governor/i],
  },
  {
    label: "Economy & Markets",
    patterns: [/economy/i, /economic/i, /market/i, /inflation/i, /growth/i, /investment/i, /gdp/i],
  },
];

let newsCache: NewsCache | null = null;

function decodeHtmlEntities(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/&#(\d+);/g, (_match, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lsquo;/gi, "‘")
    .replace(/&rsquo;/gi, "’")
    .replace(/&ldquo;/gi, "“")
    .replace(/&rdquo;/gi, "”")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&hellip;/gi, "…");
}

function stripHtml(html: string | null | undefined) {
  if (!html) return "";
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return decodeHtmlEntities(text);
}

function summarise(text: string, max = 260) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

function resolveUrl(candidate?: string, base?: string) {
  if (!candidate) return undefined;
  try {
    if (candidate.startsWith("http://") || candidate.startsWith("https://")) return candidate;
    if (base) return new URL(candidate, base).href;
  } catch {
    // ignore resolution errors
  }
  return candidate;
}

function deriveTopics(text: string, hints: string[] = []) {
  const lowered = text.toLowerCase();
  const topics = new Set<string>();
  for (const matcher of TOPIC_MATCHERS) {
    if (matcher.patterns.some((re) => re.test(lowered))) {
      topics.add(matcher.label);
    }
  }
  for (const hint of hints) {
    if (hint) topics.add(hint);
  }
  return Array.from(topics);
}

function toIsoDate(value?: string | null) {
  if (!value) return "";
  const ts = Date.parse(value);
  if (!Number.isNaN(ts)) return new Date(ts).toISOString();
  return "";
}

function dedupeByTitle(items: NewsArticle[]) {
  const seen = new Map<string, NewsArticle>();
  for (const item of items) {
    const key = item.title.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }
  return Array.from(seen.values());
}

async function fetchRssFeed(source: string, url: string, hints: string[] = [], maxItems = 25): Promise<NewsArticle[]> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": NEWS_USER_AGENT,
        Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const parsed = xmlParser.parse(xml);
    const rawItems = parsed?.rss?.channel?.item;
    const list = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
    const articles: NewsArticle[] = [];
    for (const raw of list.slice(0, maxItems)) {
      const title: string = decodeHtmlEntities(raw?.title?.trim?.() || "");
      const link: string = raw?.link || "";
      if (!title || !link) continue;
      const html: string =
        (typeof raw["content:encoded"] === "string" ? raw["content:encoded"] : "") ||
        (typeof raw.description === "string" ? raw.description : "");
      const summary = summarise(stripHtml(html));
      const combined = `${title} ${summary}`;
      const topics = deriveTopics(combined, hints);
      if (!topics.length) continue;
      const publishedAt =
        toIsoDate(typeof raw.pubDate === "string" ? raw.pubDate : undefined) || new Date().toISOString();
      const image = (() => {
        const match = typeof html === "string" ? html.match(/<img[^>]+src=["']([^"']+)["']/i) : null;
        if (match?.[1]) return resolveUrl(match[1], link);

        const findMediaUrl = (value: any): string | undefined => {
          if (!value) return undefined;
          if (typeof value === "string") return value;
          if (Array.isArray(value)) {
            for (const v of value) {
              const found = findMediaUrl(v);
              if (found) return found;
            }
            return undefined;
          }
          if (typeof value === "object") {
            if (typeof value.url === "string") return value.url;
            if (typeof value.href === "string") return value.href;
            if (value.$ && typeof value.$.url === "string") return value.$.url;
          }
          return undefined;
        };

        const mediaUrl =
          findMediaUrl(raw?.["media:content"]) ||
          findMediaUrl(raw?.["media:group"]?.["media:content"]) ||
          findMediaUrl(raw?.["media:thumbnail"]) ||
          findMediaUrl(raw?.enclosure);

        return resolveUrl(mediaUrl, link);
      })();
      const id = Buffer.from(`${source}:${link}`).toString("base64").replace(/=+$/, "");
      articles.push({
        id,
        title,
        summary: summary || title,
        link,
        source,
        publishedAt,
        topics,
        origin: source,
        image,
      });
    }
    return articles;
  } catch (err) {
    console.error(`[news] Failed RSS for ${source}:`, err);
    return [];
  }
}

async function fetchGoogleNewsFeed(entry: { source: string; url: string; topics: string[] }): Promise<NewsArticle[]> {
  return fetchRssFeed(entry.source, entry.url, entry.topics, 40);
}

async function fetchCbslPressReleases(): Promise<NewsArticle[]> {
  try {
    const res = await fetch(CBSL_PRESS_URL, {
      headers: {
        "User-Agent": NEWS_USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const rows = Array.from(doc.querySelectorAll(".item-list li.views-row")).slice(0, 8);
    const items: NewsArticle[] = [];
    for (const row of rows) {
      const anchor = row.querySelector<HTMLAnchorElement>(".views-field-field-file-title a");
      if (!anchor) continue;
      const href = anchor.href.startsWith("http") ? anchor.href : new URL(anchor.href, CBSL_PRESS_URL).href;
      const title = anchor.textContent?.trim() || "CBSL Press Release";
      const dateMatch = href.match(/press_(\d{4})(\d{2})(\d{2})/i);
      const publishedAt = dateMatch
        ? new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T06:00:00Z`).toISOString()
        : new Date().toISOString();
      const summary = `Central Bank update: ${title}`;
      const id = Buffer.from(`CBSL:${href}`).toString("base64").replace(/=+$/, "");
      items.push({
        id,
        title,
        summary,
        link: href,
        source: "CBSL Press Releases",
        publishedAt,
        topics: ["Policy & Regulation", "Banking & Finance"],
        origin: "CBSL",
      });
    }
    return items;
  } catch (err) {
    console.error("[news] Failed to fetch CBSL press releases:", err);
    return [];
  }
}

async function loadNews(force = false) {
  const now = Date.now();
  if (!force && newsCache && newsCache.expires > now) {
    return newsCache;
  }

  const results = await Promise.all([
    fetchCbslPressReleases(),
    ...RSS_FEEDS.map((feed) => fetchRssFeed(feed.source, feed.url, feed.topics ?? [])),
    ...GOOGLE_NEWS_QUERIES.map((entry) => fetchGoogleNewsFeed(entry)),
  ]) as NewsArticle[][];

  const [cbsl, ...others] = results;
  const combined = dedupeByTitle([
    ...(cbsl ?? []),
    ...others.flat(),
  ]);

  combined.sort((a, b) => {
    const at = Date.parse(a.publishedAt || "") || 0;
    const bt = Date.parse(b.publishedAt || "") || 0;
    return bt - at;
  });

  const sources = Array.from(new Set(combined.map((item) => item.source))).sort();

  newsCache = {
    items: combined,
    fetchedAt: new Date().toISOString(),
    expires: now + NEWS_TTL_MS,
    sources,
  };
  return newsCache;
}

app.get("/api/news", async (req, res) => {
  try {
    const force = req.query.refresh === "true";
    const limit = Number(req.query.limit ?? 0) || 0;
    const cache = await loadNews(force);
    const items = limit > 0 ? cache.items.slice(0, limit) : cache.items;
    res.json({
      updatedAt: cache.fetchedAt,
      count: items.length,
      sources: cache.sources,
      items,
    });
  } catch (err: any) {
    console.error("[news] failed to respond:", err);
    res.status(500).json({
      error: "Failed to load news feed",
      detail: err?.message ?? String(err),
    });
  }
});

/* ---------------- Sampath PDF helper ---------------- */
async function handlePdfScrape(
  req: express.Request,
  res: express.Response,
  scraper: (url: string, outPath: string) => Promise<any>,
  pdfUrl: string,
  outFile: string,
  bankName: string
) {
  try {
    const outDir = await ensureOutputDir();
    const outPath = path.join(outDir, outFile);
    const rows = await scraper(pdfUrl, outPath);
    
    // Track rate changes
    const changes = await trackRateChanges(bankName, rows);
    
    if (req.query.show === "true") {
      res.json({
        bank: bankName,
        count: rows.length,
        rows: rows,
        changes: changes.length > 0 ? changes : undefined,
        hasChanges: changes.length > 0,
        changesCount: changes.length
      });
    } else {
      res.type("json").send(await fs.readFile(outPath, "utf8"));
    }
  } catch (err) {
    console.error(`Error scraping ${bankName}:`, err);
    res.status(500).send({ error: String(err) });
  }
}

/* ---------------- Individual routes (unchanged) ---------------- */
// HNB, Seylan, Sampath, ComBank, NDB, UnionBank, Peoples, DFCC, NSB, BOC, Cargills, NTB, Amana
// ... (same as in previous merged file)

app.get("/scrape/hnb", async (req, res) => {
  try {
    const data = await scrapeHNB({ show: req.query.show === "true", slow: Number(req.query.slow || 0) });
    
    // Track rate changes
    const changes = await trackRateChanges("HNB", data);
    
    await maybeSave("HNB", data, req.query.save === "true");
    
    res.json({
      bank: "HNB",
      count: data.length,
      rows: data,
      changes: changes.length > 0 ? changes : undefined,
      hasChanges: changes.length > 0,
      changesCount: changes.length
    });
  } catch (e: any) { res.status(500).json({ error: String(e?.message || e) }); }
});

app.get("/scrape/seylan", async (req, res) => {
  try {
    const data = await scrapeSeylan({ show: req.query.show === "true", slow: Number(req.query.slow || 0) });
    const changes = await trackRateChanges("Seylan", data);
    await maybeSave("Seylan", data, req.query.save === "true");
    res.json({
      bank: "Seylan",
      count: data.length,
      rows: data,
      changes: changes.length > 0 ? changes : undefined,
      hasChanges: changes.length > 0,
      changesCount: changes.length
    });
  } catch (e: any) { res.status(500).json({ error: String(e?.message || e) }); }
});

app.get("/scrape/sampath", (req, res) =>
  handlePdfScrape(req, res, scrapeSampath,
    "https://www.sampath.lk/common/loan/interest-rates-loan-and-advances.pdf",
    "sampath.json", "Sampath")
);

app.get("/scrape/combank", async (req, res) => {
  try {
    const data = await scrapeCombank({ show: req.query.show === "true", slow: Number(req.query.slow || 0) });
    const changes = await trackRateChanges("ComBank", data);
    await maybeSave("ComBank", data, req.query.save === "true");
    res.json({
      bank: "ComBank",
      count: data.length,
      rows: data,
      changes: changes.length > 0 ? changes : undefined,
      hasChanges: changes.length > 0,
      changesCount: changes.length
    });
  } catch (e: any) { res.status(500).json({ error: String(e?.message || e) }); }
});

app.get("/scrape/ndb", async (req, res) => {
  try {
    const data = await scrapeNDB({ show: req.query.show === "true", slow: Number(req.query.slow || 0) });
    const changes = await trackRateChanges("NDB", data);
    await maybeSave("NDB", data, req.query.save === "true");
    res.json({
      bank: "NDB",
      count: data.length,
      rows: data,
      changes: changes.length > 0 ? changes : undefined,
      hasChanges: changes.length > 0,
      changesCount: changes.length
    });
  } catch (e: any) { res.status(500).json({ error: String(e?.message || e) }); }
});

app.get("/scrape/unionb", async (req, res) => {
  try {
    const data = await scrapeUnionBank({ show: req.query.show === "true", slow: Number(req.query.slow || 0) });
    const changes = await trackRateChanges("UnionBank", data);
    await maybeSave("UnionBank", data, req.query.save === "true");
    res.json({
      bank: "UnionBank",
      count: data.length,
      rows: data,
      changes: changes.length > 0 ? changes : undefined,
      hasChanges: changes.length > 0,
      changesCount: changes.length
    });
  } catch (e: any) { res.status(500).json({ error: String(e?.message || e) }); }
});

app.get("/scrape/peoples", async (req, res) => {
  try {
    const show = "show" in req.query;
    const slow = req.query.slow ? Number(req.query.slow) : 0;
    
    // Combine regular rates + Pensioner Loan rates
    const [regular, pensioner] = await Promise.all([
      scrapePeoples(show, slow),
      scrapePeoplesPensionerLoan()
    ]);
    
    const data = [...regular, ...pensioner];
    const changes = await trackRateChanges("People's Bank", data);
    res.json({
      bank: "People's Bank",
      count: data.length,
      rows: data,
      changes: changes.length > 0 ? changes : undefined,
      hasChanges: changes.length > 0,
      changesCount: changes.length
    });
  } catch (err: any) {
    console.error("Error scraping People's Bank:", err);
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.get("/scrape/dfcc", async (req, res) => {
  try {
    const [data, solarData] = await Promise.all([
      scrapeDFCC({ show: req.query.show === "true", slow: Number(req.query.slow || 0) }),
      scrapeDFCCSolarLoan({ show: req.query.show === "true", slow: Number(req.query.slow || 0) })
    ]);
    const combined = [...data, ...solarData];
    await maybeSave("DFCC", combined, req.query.save === "true");
    res.json({
      bank: "DFCC",
      count: combined.length,
      rows: combined
    });
  } catch (err) { res.status(500).send({ error: String(err) }); }
});

app.get("/scrape/nsb", async (req, res) => {
  try {
    const data = await scrapeNSB({ show: req.query.show === "true", slow: Number(req.query.slow || 0) });
    const changes = await trackRateChanges("NSB", data);
    await maybeSave("NSB", data, req.query.save === "true");
    res.json({
      bank: "NSB",
      count: data.length,
      rows: data,
      changes: changes.length > 0 ? changes : undefined,
      hasChanges: changes.length > 0,
      changesCount: changes.length
    });
  } catch (err: any) { res.status(500).json({ error: err?.message || String(err) }); }
});

app.get("/scrape/boc", async (req, res) => {
  try {
    const data = await scrapeBOC(req.query as any);
    const changes = await trackRateChanges("BOC", data);
    await maybeSave("BOC", data, req.query.save === "true");
    res.json({
      bank: "BOC",
      count: data.length,
      rows: data,
      changes: changes.length > 0 ? changes : undefined,
      hasChanges: changes.length > 0,
      changesCount: changes.length
    });
  } catch (err: any) { res.status(500).json({ error: String(err?.message || err) }); }
});

app.get("/scrape/cargills", async (req, res) => {
  try {
    const opts = {
      show: (req.query.show as string) || "false",
      slow: (req.query.slow as string) || "0",
      save: (req.query.save as string) || "false",
    };
    
    // Combine regular Cargills rates + Pensioner Loan rates
    const [regular, pensioner] = await Promise.all([
      scrapeCargills(opts),
      scrapeCargillsPensionerLoan(opts)
    ]);
    
    const data = [...regular, ...pensioner];
    const changes = await trackRateChanges("Cargills", data);
    res.json({
      bank: "Cargills",
      count: data.length,
      rows: data,
      changes: changes.length > 0 ? changes : undefined,
      hasChanges: changes.length > 0,
      changesCount: changes.length
    });
  } catch (e: any) { res.status(500).json({ error: e?.message || String(e) }); }
});

app.get("/scrape/ntb", async (req, res) => {
  try {
    const data = await scrapeNTB();
    const changes = await trackRateChanges("NTB", data);
    res.json({
      bank: "NTB",
      count: data.length,
      rows: data,
      changes: changes.length > 0 ? changes : undefined,
      hasChanges: changes.length > 0,
      changesCount: changes.length
    });
  } catch (e: any) { res.status(500).json({ error: String(e?.message || e) }); }
});

app.get("/scrape/amana", async (req, res) => {
  try {
    const data = await scrapeAmana();
    const changes = await trackRateChanges("Amana", data);
    res.json({
      bank: "Amana",
      count: data.length,
      rows: data,
      changes: changes.length > 0 ? changes : undefined,
      hasChanges: changes.length > 0,
      changesCount: changes.length
    });
  } catch (e: any) { res.status(500).json({ error: String(e?.message || e) }); }
});

/** CBSL AWPR monthly series */
app.get("/scrape/cbsl", async (req, res) => {
  try {
    const rows = await scrapeCBSL({
      show: String(req.query.show),
      slow: String(req.query.slow),
      save: String(req.query.save),
    });
    res.json(rows);
  } catch (err: any) {
    console.error("CBSL scrape failed", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

/** HNB-Tariff */
app.get("/scrape/hnb-tariff", async (req, res) => {
  try {
    const data = await scrapeHnbTariff({ show: req.query.show === "true", slow: Number(req.query.slow || 0) });
    res.json(data);
  } catch (e: any) { res.status(500).json({ error: String(e?.message || e) }); }
});

/** Seylan-Tariff */
app.get("/scrape/seylan-tariff", async (req, res) => {
  try {
    const data = await scrapeSeylanTariff({
      show: req.query.show === "true",
      slow: Number(req.query.slow || 0)
    });
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

/** Sampath-Tariff */
app.get("/scrape/sampath-tariff", async (req, res) => {
  try {
    const data = await scrapeSampathTariff();
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

/** NDB-Tariff */
app.get("/scrape/ndb-tariff", async (req, res) => {
  try {
    const data = await scrapeNdbTariff({
      show: req.query.show === "true",
      slow: Number(req.query.slow || 0),
    });
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

/** ComBank-Tariff */
app.get("/scrape/combank-tariff", async (req, res) => {
  try {
    const data = await scrapeCombankTariff();
    res.json(data);
  } catch (e) {
    console.error("Combank Tariff Scraper Error:", e);
    res.status(500).json({ error: "Failed to scrape Combank tariffs" });
  }
});

/** UnionBank-Tariff */
app.get("/scrape/unionb-tariff", async (_req, res) => {
  try {
    const data = await scrapeUnionbTariff();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to scrape Union Bank tariff", detail: err.message || String(err) });
  }
});

/** DFCC-Tariff */
app.get("/scrape/dfcc-tariff", async (req, res) => {
  try {
    const data = await scrapeDfccTariff();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** NSB-Tariff */
app.get("/scrape/nsb-tariff", async (req, res) => {
  try {
    const result = await scrapeNSBTariff();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e + "" });
  }
});

/** BOC-Tariff */
app.get("/scrape/boc-tariff", async (req, res) => {
  try {
    const data = await scrapeBocTariff({
      show: String(req.query.show || ""),
      slow: String(req.query.slow || ""),
      save: String(req.query.save || "true"),
    });
    // optional: reuse your maybeSave helper if desired
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// Cargills Tariff (fees/charges)
app.get("/scrape/cargills-tariff", async (req, res) => {
  try {
    const rows = await scrapeCargillsTariff({ show: String(req.query.show||""), slow: String(req.query.slow||""), save: String(req.query.save||"") });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// NTB Tariff (fees/charges)
app.get("/scrape/ntb-tariff", async (req, res) => {
  try {
    const rows = await scrapeNtbTariff({
      show: String(req.query.show || ""),
      slow: String(req.query.slow || ""),
      save: String(req.query.save || "")
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

/** Amana-Tariff (OCR lines first pass) */
app.get("/scrape/amana-tariff", async (req, res) => {
  try {
    const rows = await scrapeAmanaTariff({
      show: String(req.query.show || ""),
      slow: String(req.query.slow || ""),
      save: String(req.query.save || "")
    });
    res.json(rows);
  } catch (err: any) {
    console.error("Amana Tariff scrape failed:", err);
    res.status(500).json({ error: err?.message || String(err) });
  }
});

/** Peoples-Tariff (OCR lines first pass) */
app.get("/scrape/peoples-tariff", async (req, res) => {
  try {
    const rows = await scrapePeoplesTariff({
      show: String(req.query.show || ""),
      slow: String(req.query.slow || ""),
      save: String(req.query.save || ""),
    });
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

/* ===============================================
   MARKET SHARE SCRAPER ENDPOINTS
   Individual endpoints for each bank's market share data
   =============================================== */

/** BOC Market Share */
app.get("/scrape/boc-market-share", async (req, res) => {
  try {
    const result = await scrapeBOCMarketShareOCR();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

/** People's Bank Market Share */
app.get("/scrape/peoples-market-share", async (req, res) => {
  try {
    const result = await scrapePeoplesBankMarketShare();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

/** Commercial Bank Market Share */
app.get("/scrape/combank-market-share", async (req, res) => {
  try {
    const result = await scrapeCommercialBankMarketShare();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

/** HNB Market Share */
app.get("/scrape/hnb-market-share", async (req, res) => {
  try {
    const result = await scrapeHNBMarketShare();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

/** Seylan Market Share */
app.get("/scrape/seylan-market-share", async (req, res) => {
  try {
    const result = await scrapeSeylanMarketShare();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

/** Sampath Market Share */
app.get("/scrape/sampath-market-share", async (req, res) => {
  try {
    const result = await scrapeSampathMarketShare();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

/** NDB Market Share */
app.get("/scrape/ndb-market-share", async (req, res) => {
  try {
    const result = await scrapeNDBMarketShare();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

/** DFCC Market Share */
app.get("/scrape/dfcc-market-share", async (req, res) => {
  try {
    const result = await scrapeDFCCMarketShare();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

/** NSB Market Share */
app.get("/scrape/nsb-market-share", async (req, res) => {
  try {
    const result = await scrapeNSBMarketShare();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

/** NTB Market Share */
app.get("/scrape/ntb-market-share", async (req, res) => {
  try {
    const result = await scrapeNTBMarketShare();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

/** Union Bank Market Share */
app.get("/scrape/unionb-market-share", async (req, res) => {
  try {
    const result = await scrapeUnionBankMarketShare();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

/** Amana Bank Market Share */
app.get("/scrape/amana-market-share", async (req, res) => {
  try {
    const result = await scrapeAmanaMarketShare();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

/** Cargills Bank Market Share */
app.get("/scrape/cargills-market-share", async (req, res) => {
  try {
    const result = await scrapeCargillsMarketShare();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

/** PABC Market Share */
app.get("/scrape/pabc-market-share", async (req, res) => {
  try {
    const result = await scrapePABCMarketShare();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

/** Market Share All Banks - Aggregated */
app.get("/scrape/market-share-all", async (req, res) => {
  try {
    const result = await scrapeAllBanks();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

/* ---------------- ALL route ---------------- */
app.get("/scrape/all", async (req, res) => {
  const show = req.query.show === "true";
  const slow = Number(req.query.slow || 0) || (show ? 200 : 0);
  const save = req.query.save === "true";
  const startedAt = new Date().toISOString();

  const jobs = {
    HNB: () => scrapeHNB({ show, slow }),
    Seylan: () => scrapeSeylan({ show, slow }),
    Sampath: async () => {
      const outDir = await ensureOutputDir();
      const outPath = path.join(outDir, "sampath.json");
      return scrapeSampath("https://www.sampath.lk/common/loan/interest-rates-loan-and-advances.pdf", outPath);
    },
    ComBank: () => scrapeCombank({ show, slow }),
    NDB: () => scrapeNDB({ show, slow }),
    UnionBank: () => scrapeUnionBank({ show, slow }),
    Peoples: async () => {
      const [regular, pensioner] = await Promise.all([
        scrapePeoples(show, slow),
        scrapePeoplesPensionerLoan()
      ]);
      return [...regular, ...pensioner];
    },
    DFCC: async () => {
      const [regular, solar] = await Promise.all([
        scrapeDFCC({ show, slow }),
        scrapeDFCCSolarLoan({ show, slow })
      ]);
      return [...regular, ...solar];
    },
    NSB: () => scrapeNSB({ show, slow }),
    BOC: () => scrapeBOC({ show: String(show), slow: String(slow), save: "false" } as any),
    Cargills: async () => {
      const [regular, pensioner] = await Promise.all([
        scrapeCargills({ show: String(show), slow: String(slow), save: "false" }),
        scrapeCargillsPensionerLoan({ show: String(show), slow: String(slow), save: "false" })
      ]);
      return [...regular, ...pensioner];
    },
    NTB: () => scrapeNTB(),
    Amana: () => scrapeAmana(),
  } as const;

  const results: any[] = [];
  const status: Record<string, { ok: boolean; count?: number; error?: string }> = {};

  const entries = Object.entries(jobs);
  const settled = await Promise.allSettled(entries.map(([_, fn]) => fn()));

  for (let i = 0; i < settled.length; i++) {
    const bank = entries[i][0];
    const r = settled[i];
    if (r.status === "fulfilled") {
      const rows = r.value ?? [];
      status[bank] = { ok: true, count: rows.length };
      results.push(...rows);
      if (save) await maybeSave(bank, rows, true);
    } else {
      status[bank] = { ok: false, error: String(r.reason) };
    }
  }

  const payload = {
    startedAt,
    finishedAt: new Date().toISOString(),
    status,
    total: results.length,
    rows: results,
  };

  if (save) {
    const outDir = await ensureOutputDir();
    await fs.writeFile(path.join(outDir, "all.json"), JSON.stringify(payload, null, 2), "utf8");
  }

  res.json(payload);
});

/**
 * GET /scrape/tariffs-all
 * Runs all *-tariff endpoints sequentially and returns a single JSON object:
 * { rows: TariffRow[], stats: { [bankKey]: { count: number, error?: string } } }
 *
 * Optional passthrough query params:
 *   - show=true    (kept so your individual endpoints don't persist)
 *   - slow=###     (forwarded to scrapers that support throttling)
 */
app.get("/scrape/tariffs-all", async (req, res) => {
  try {
    const show = req.query.show === "true" ? "true" : "true"; // default to show=true
    const slow = typeof req.query.slow === "string" ? req.query.slow : undefined;

    // Build base pointing to THIS server (so we reuse existing *-tariff endpoints)
    const base = `${req.protocol}://${req.get("host")}`;
    const qs = (key: string) => {
      const params = new URLSearchParams({ show });
      if (slow) params.set("slow", slow);
      return `${base}/scrape/${key}?${params.toString()}`;
    };

    const allRows: TariffRow[] = [];
    const stats: Record<string, { count: number; error?: string }> = {};

    for (const key of TARIFF_SCRAPER_KEYS) {
      let error: string | undefined;
      let rows: TariffRow[] = [];

      try {
        const url = qs(key);
        const rsp = await fetch(url, { cache: "no-store" });
        if (!rsp.ok) throw new Error(`${rsp.status} ${rsp.statusText}`);
        const data = await rsp.json();
        rows = arr<TariffRow>(data);
      } catch (e: any) {
        error = e?.message || String(e);
      }

      stats[key] = { count: rows.length, ...(error ? { error } : {}) };
      if (rows.length) {
        // normalize minimal fields just in case, then merge
        const normalized = rows.map((r) => ({
          bank: r.bank,
          product: r.product,
          feeType: r.feeType,
          feeCategory: r.feeCategory || r.feeType,          // ← add readable category
          basis: r.basis,
          value: typeof r.value === "number" ? r.value : undefined,
          min: typeof r.min === "number" ? r.min : undefined,
          max: typeof r.max === "number" ? r.max : undefined,
          amount: r.amount || r.value || null,              // ← add computed / text amount
          notes: r.notes || r.note || "",                   // ← ensure notes always exist
          effectiveDate: r.effectiveDate || null,
          updatedAt: r.updatedAt || new Date().toISOString(),
          source: r.source,
          description: r.description || "",
        })) as TariffRow[];

        const merged = mergeTariffsByKey(allRows, normalized);
        allRows.length = 0;
        allRows.push(...merged);
      }
    }

    res.json({ rows: allRows, stats, updatedAt: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

/* ---------------- Production: serve client static files ---------------- */
if (process.env.NODE_ENV === "production") {
  const clientDistPath = path.join(__dirname, "..", "client", "dist");
  app.use(express.static(clientDistPath));
  
  // Catch-all route to serve index.html for client-side routing
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

/* ---------------- Start server ---------------- */
app.listen(PORT, () => {
  console.log(`🚀 UB Scraper API running at http://localhost:${PORT}`);
});




