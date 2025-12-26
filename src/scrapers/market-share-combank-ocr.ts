/**
 * Commercial Bank Market Share OCR Scraper
 * Extracts product-wise gross loans from Commercial Bank quarterly reports using OCR
 * 
 * Report URL: https://www.combank.lk/info/file/310/for-the-nine-months-ended-30-09-2025
 * Target Data: Gross loans and advances (By product - Domestic Currency)
 * 
 * Expected values (Q3-2025):
 * - Total: ~1,386,436M (1.386T)
 * - Housing loans: ~82,061M
 * - Personal loans: ~47,813M
 */

import fs from "fs";
import path from "path";
import fetch from "node-fetch";

interface MarketShareResult {
  bank: string;
  shortName: string;
  assetBookSize: number; // LKR thousands
  segments: {
    housing: number;     // LKR thousands
    personal: number;    // LKR thousands
  };
  reportType: string;
  lastUpdated: string;
  source: string;
  extractedAt: string;
  confidence: "high" | "medium" | "low";
  previousYear?: {
    assetBookSize: number;
    segments: {
      housing: number;
      personal: number;
    };
    date: string;
  };
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function downloadPDF(url: string, outputPath: string): Promise<void> {
  console.log("📥 Downloading Commercial Bank Q3-2025 PDF...");
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.statusText}`);
  }
  
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(buffer));
  console.log(`✅ Downloaded PDF: ${path.basename(outputPath)}`);
}

async function extractTextFromPDF(pdfPath: string): Promise<string[]> {
  console.log("📖 Extracting text from PDF...");
  
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  
  const lines: string[] = [];
  
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // Group by Y coordinate to form lines
    const lineMap = new Map<number, string[]>();
    
    for (const item of textContent.items) {
      if ("str" in item && item.str.trim()) {
        const y = Math.round(item.transform[5]);
        if (!lineMap.has(y)) {
          lineMap.set(y, []);
        }
        lineMap.get(y)!.push(item.str);
      }
    }
    
    // Sort by Y coordinate (top to bottom) and join
    const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);
    for (const y of sortedYs) {
      const lineText = lineMap.get(y)!.join(" ").trim();
      if (lineText) {
        lines.push(lineText);
      }
    }
  }
  
  console.log(`✅ Extracted ${lines.length} lines`);
  return lines;
}

function parseCommercialBankLines(lines: string[]): MarketShareResult | null {
  // Dump for debugging
  try {
    ensureDir("./output");
    fs.writeFileSync(
      "./output/combank-market-share-ocr-lines.txt",
      lines.map((l, idx) => `[${idx}] ${l}`).join("\n"),
      "utf8"
    );
    console.log("✅ Dumped OCR lines to output/combank-market-share-ocr-lines.txt");
  } catch {}

  let totalLoans = 0;
  let housing = 0;
  let personal = 0;
  let prevTotalLoans = 0;
  let prevHousing = 0;
  let prevPersonal = 0;

  console.log("\n🔍 Parsing Commercial Bank product-wise loans...");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // Look for "Housing loans" - extract both current and previous year
    if (lower.includes("housing loan")) {
      const numbers = line.match(/(\d{1,3}(?:,\d{3})+)/g);
      if (numbers && numbers.length >= 2) {
        const current = parseFloat(numbers[0].replace(/,/g, ""));
        const previous = parseFloat(numbers[1].replace(/,/g, ""));
        // Range: 70M-100M thousands (70B-100B)
        if (current > 70000000 && current < 100000000) {
          housing = current;
          prevHousing = previous;
          console.log(`  ✓ Housing loans: ${(housing/1000).toFixed(1)}M (prev: ${(prevHousing/1000).toFixed(1)}M)`);
        }
      }
    }

    // Look for "Personal loans" - extract both current and previous year
    if (lower.includes("personal loan")) {
      const numbers = line.match(/(\d{1,3}(?:,\d{3})+)/g);
      if (numbers && numbers.length >= 2) {
        const current = parseFloat(numbers[0].replace(/,/g, ""));
        const previous = parseFloat(numbers[1].replace(/,/g, ""));
        // Range: 40M-60M thousands (40B-60B)
        if (current > 40000000 && current < 60000000) {
          personal = current;
          prevPersonal = previous;
          console.log(`  ✓ Personal loans: ${(personal/1000).toFixed(1)}M (prev: ${(prevPersonal/1000).toFixed(1)}M)`);
        }
      }
    }

    // Look for total (subtotal after domestic currency section) - extract both current and previous year
    if (lower.includes("subtotal") && !lower.includes("foreign")) {
      const numbers = line.match(/(\d{1,3}(?:,\d{3}){3,})/g);
      if (numbers && numbers.length >= 2) {
        const current = parseFloat(numbers[0].replace(/,/g, ""));
        const previous = parseFloat(numbers[1].replace(/,/g, ""));
        // Range: 1.3T-1.5T thousands
        if (current > 1300000000 && current < 1500000000) {
          totalLoans = current;
          prevTotalLoans = previous;
          console.log(`  ✓ Total domestic currency loans: ${(totalLoans/1000).toFixed(1)}M (prev: ${(prevTotalLoans/1000).toFixed(1)}M)`);
        }
      }
    }
  }

  if (!totalLoans) {
    console.log("❌ Could not find total loans");
    return null;
  }

  const result: MarketShareResult = {
    bank: "Commercial Bank of Ceylon",
    shortName: "ComBank",
    assetBookSize: totalLoans,
    segments: {
      housing,
      personal
    },
    reportType: "Q3-2025",
    lastUpdated: "2025-09-30",
    source: "Commercial Bank of Ceylon PLC Q3 2025 Interim Financials - Gross loans and advances (By product - Domestic Currency)",
    extractedAt: new Date().toISOString(),
    confidence: "high",
    ...(prevTotalLoans > 0 && {
      previousYear: {
        assetBookSize: prevTotalLoans,
        segments: {
          housing: prevHousing,
          personal: prevPersonal
        },
        date: "2024-12-31"
      }
    })
  };

  return result;
}

async function scrapeCommercialBankMarketShare(): Promise<MarketShareResult | null> {
  try {
    console.log("📊 Scraping Commercial Bank Market Share (OCR method)...");

    const pdfUrl = "https://www.combank.lk/info/file/310/for-the-nine-months-ended-30-09-2025";
    const pdfPath = "./tmp/combank-q3-2025.pdf";

    ensureDir("./tmp");

    // Download PDF
    await downloadPDF(pdfUrl, pdfPath);

    // Extract text
    const lines = await extractTextFromPDF(pdfPath);

    // Parse lines
    const result = parseCommercialBankLines(lines);

    if (result) {
      console.log("\n📊 Extraction Summary:");
      console.log(`  Bank: ${result.bank}`);
      console.log(`  Total Asset Book: LKR ${(result.assetBookSize/1000).toFixed(1)}M`);
      console.log(`  Housing Loans: LKR ${(result.segments.housing/1000).toFixed(1)}M`);
      console.log(`  Personal Loans: LKR ${(result.segments.personal/1000).toFixed(1)}M`);

      // Save to output
      ensureDir("./output");
      const outputPath = path.resolve("./output/combank-market-share-ocr.json");
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`\n✅ Saved result to ${outputPath}`);
      console.log("\n📊 Final Result:");
      console.log(JSON.stringify(result, null, 2));
    }

    return result;
  } catch (error) {
    console.error("❌ Error scraping Commercial Bank market share:", error);
    return null;
  }
}

// Run if executed directly
if (require.main === module) {
  scrapeCommercialBankMarketShare();
}

export { scrapeCommercialBankMarketShare };
