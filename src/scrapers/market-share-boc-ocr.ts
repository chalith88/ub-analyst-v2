/**
 * BOC Market Share Scraper using OCR approach
 * Extracts product-wise gross loans from Q3-2025 PDF
 */

import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const PDF_URL = "https://www.boc.lk/financial/document/99/download";

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function normSpaces(s: string) {
  return s.replace(/\u00A0/g, " ").replace(/[ \t]+/g, " ").trim();
}

async function downloadPDF(url: string, outputPath: string): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    // For direct download URLs, just fetch with fetch API
    if (url.includes('/download') || url.includes('/get')) {
      console.log("  Using direct fetch for download URL...");
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      ensureDir(path.dirname(outputPath));
      fs.writeFileSync(outputPath, buffer);
      console.log(`✅ Downloaded PDF: ${path.basename(outputPath)}`);
      await browser.close();
      return;
    }

    // For regular pages with download links
    const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    const download = await downloadPromise;
    await download.saveAs(outputPath);
    console.log(`✅ Downloaded PDF: ${path.basename(outputPath)}`);
  } finally {
    await browser.close();
  }
}

async function extractPdfText(pdfBuffer: Buffer): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfData = new Uint8Array(pdfBuffer);

  const loadingTask = pdfjsLib.getDocument({ data: pdfData });
  const pdf = await loadingTask.promise;

  const allLines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Group text items by Y coordinate to form lines
    const lineMap = new Map<number, { texts: string[], x: number }[]>();
    
    for (const item of textContent.items) {
      if ("str" in item && item.str.trim()) {
        const y = Math.round(item.transform[5]);
        const x = Math.round(item.transform[4]);
        
        if (!lineMap.has(y)) lineMap.set(y, []);
        lineMap.get(y)!.push({ texts: [item.str], x });
      }
    }

    // Sort by Y coordinate (top to bottom)
    const sortedLines = Array.from(lineMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([_, items]) => {
        // Sort items by X coordinate (left to right) within same line
        const sorted = items.sort((a, b) => a.x - b.x);
        return sorted.map(item => item.texts.join("")).join(" ");
      });

    allLines.push(...sortedLines);
  }

  return allLines.map(normSpaces).filter(Boolean);
}

interface MarketShareResult {
  bank: string;
  shortName: string;
  assetBookSize: number; // Total in thousands
  segments: {
    housing: number;
    personal: number;
  };
  previousYear?: {
    assetBookSize: number;
    segments: {
      housing: number;
      personal: number;
    };
    date: string; // e.g., "2024-12-31"
  };
  reportType: string;
  lastUpdated: string;
  source: string;
  extractedAt: string;
  confidence: "high" | "medium" | "low";
}

function parseBOCLines(lines: string[]): MarketShareResult | null {
  // Dump for debugging
  try {
    ensureDir("./output");
    fs.writeFileSync(
      "./output/boc-market-share-ocr-lines.txt",
      lines.map((l, idx) => `[${idx}] ${l}`).join("\n"),
      "utf8"
    );
    console.log("✅ Dumped OCR lines to output/boc-market-share-ocr-lines.txt");
  } catch {}

  let totalLocalCurrency = 0;
  let housing = 0;
  let personal = 0;
  
  let prevTotalLocalCurrency = 0;
  let prevHousing = 0;
  let prevPersonal = 0;

  console.log("\n🔍 Parsing BOC product-wise loans...");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // Look for "Total local currency loans and advances"
    // Format: "Total local currency loans and advances 1,705,124,546 1,607,455,600 ..."
    if (lower.includes("total local currency loans") && lower.includes("advances")) {
      const numbers = line.match(/(\d{1,3}(?:,\d{3}){3,})/g);
      if (numbers && numbers.length >= 2) {
        totalLocalCurrency = parseFloat(numbers[0].replace(/,/g, ""));
        prevTotalLocalCurrency = parseFloat(numbers[1].replace(/,/g, ""));
        console.log(`  ✓ Total local currency: ${(totalLocalCurrency/1000).toFixed(1)}M (prev: ${(prevTotalLocalCurrency/1000).toFixed(1)}M)`);
      }
    }

    // Look for "Housing loans" with 2+ numbers (current and previous)
    if (lower.includes("housing loans") && !lower.includes("foreign") && !lower.includes("total")) {
      const numbers = line.match(/(\d{1,3}(?:,\d{3})+)/g);
      if (numbers && numbers.length >= 2) {
        const amount = parseFloat(numbers[0].replace(/,/g, ""));
        const prevAmount = parseFloat(numbers[1].replace(/,/g, ""));
        // Range: 50M-100M thousands (50B-100B)
        if (amount > 50000000 && amount < 100000000) {
          housing = amount;
          prevHousing = prevAmount;
          console.log(`  ✓ Housing loans: ${(housing/1000).toFixed(1)}M (prev: ${(prevHousing/1000).toFixed(1)}M)`);
        }
      }
    }

    // Look for "Personal loans" with 2+ numbers
    if (lower.includes("personal loans")) {
      const numbers = line.match(/(\d{1,3}(?:,\d{3})+)/g);
      if (numbers && numbers.length >= 2) {
        const amount = parseFloat(numbers[0].replace(/,/g, ""));
        const prevAmount = parseFloat(numbers[1].replace(/,/g, ""));
        // Range: 300M-500M thousands (300B-500B)
        if (amount > 300000000 && amount < 500000000) {
          personal = amount;
          prevPersonal = prevAmount;
          console.log(`  ✓ Personal loans: ${(personal/1000).toFixed(1)}M (prev: ${(prevPersonal/1000).toFixed(1)}M)`);
        }
      }
    }
  }

  if (totalLocalCurrency === 0) {
    console.log("❌ Could not find total local currency loans");
    return null;
  }

  const result: MarketShareResult = {
    bank: "Bank of Ceylon",
    shortName: "BOC",
    assetBookSize: totalLocalCurrency,
    segments: {
      housing: housing,
      personal: personal,
    },
    previousYear: prevTotalLocalCurrency > 0 ? {
      assetBookSize: prevTotalLocalCurrency,
      segments: {
        housing: prevHousing,
        personal: prevPersonal,
      },
      date: "2024-12-31",
    } : undefined,
    reportType: "Q3-2025",
    lastUpdated: "2025-09-30",
    source: "Bank of Ceylon Q3 2025 Interim Financial Statements - Product-wise Gross Loans",
    extractedAt: new Date().toISOString(),
    confidence: "high",
  };

  console.log("\n📊 Extraction Summary:");
  console.log(`  Bank: ${result.bank}`);
  console.log(`  Total Asset Book: LKR ${(result.assetBookSize/1000).toFixed(1)}M`);
  console.log(`  Housing Loans: LKR ${(result.segments.housing/1000).toFixed(1)}M`);
  console.log(`  Personal Loans: LKR ${(result.segments.personal/1000).toFixed(1)}M`);
  
  if (result.previousYear) {
    console.log(`\n📊 Previous Year (Dec 2024):`);
    console.log(`  Total Asset Book: LKR ${(result.previousYear.assetBookSize/1000).toFixed(1)}M`);
    console.log(`  Housing Loans: LKR ${(result.previousYear.segments.housing/1000).toFixed(1)}M`);
    console.log(`  Personal Loans: LKR ${(result.previousYear.segments.personal/1000).toFixed(1)}M`);
    
    // Calculate growth
    const totalGrowth = ((result.assetBookSize - result.previousYear.assetBookSize) / result.previousYear.assetBookSize) * 100;
    const housingGrowth = result.segments.housing && result.previousYear.segments.housing
      ? ((result.segments.housing - result.previousYear.segments.housing) / result.previousYear.segments.housing) * 100
      : 0;
    const personalGrowth = result.segments.personal && result.previousYear.segments.personal
      ? ((result.segments.personal - result.previousYear.segments.personal) / result.previousYear.segments.personal) * 100
      : 0;
    
    console.log(`\n📈 Year-over-Year Growth:`);
    console.log(`  Total: ${totalGrowth > 0 ? '+' : ''}${totalGrowth.toFixed(1)}%`);
    console.log(`  Housing: ${housingGrowth > 0 ? '+' : ''}${housingGrowth.toFixed(1)}%`);
    console.log(`  Personal: ${personalGrowth > 0 ? '+' : ''}${personalGrowth.toFixed(1)}%`);
  }

  return result;
}

export async function scrapeBOCMarketShareOCR(): Promise<MarketShareResult | null> {
  try {
    console.log("\n📊 Scraping BOC Market Share (OCR method)...");

    const tmpDir = path.join(process.cwd(), "tmp");
    ensureDir(tmpDir);
    const pdfPath = path.join(tmpDir, "boc-q3-2025.pdf");

    // Download PDF
    console.log("📥 Downloading BOC Q3-2025 PDF...");
    await downloadPDF(PDF_URL, pdfPath);

    // Extract text
    console.log("📖 Extracting text from PDF...");
    const pdfBuffer = fs.readFileSync(pdfPath);
    const lines = await extractPdfText(pdfBuffer);
    console.log(`✅ Extracted ${lines.length} lines`);

    // Parse
    const result = parseBOCLines(lines);

    if (result) {
      // Save result
      const outputPath = path.join(process.cwd(), "output", "boc-market-share-ocr.json");
      ensureDir(path.dirname(outputPath));
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`\n✅ Saved result to ${outputPath}`);
    }

    return result;
  } catch (error) {
    console.error("❌ Error scraping BOC:", error);
    return null;
  }
}

// Allow running standalone
if (require.main === module) {
  scrapeBOCMarketShareOCR().then((result) => {
    if (result) {
      console.log("\n📊 Final Result:");
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    } else {
      console.log("\n❌ Failed to extract BOC market share data");
      process.exit(1);
    }
  });
}
