/**
 * People's Bank Market Share OCR Scraper
 * Extracts total asset book size from People's Bank quarterly reports using OCR
 * 
 * Report URL: https://www.peoplesbank.lk/roastoth/2025/12/September-2025-WEB.pdf
 * Target Data: Product-wise Gross loans & advances
 * 
 * Expected values (Q3-2025):
 * - Total gross loans: ~1,475,191M (1.475T)
 * - Housing loans: Not disclosed
 * - Personal loans: Not disclosed
 */

import fs from "fs";
import path from "path";
import fetch from "node-fetch";

interface MarketShareResult {
  bank: string;
  shortName: string;
  assetBookSize: number; // LKR thousands
  segments: {
    housing: number;     // LKR thousands (0 if not disclosed)
    personal: number;    // LKR thousands (0 if not disclosed)
  };
  previousYear?: {
    assetBookSize: number;
    segments: {
      housing: number;
      personal: number;
    };
    date: string;
  };
  reportType: string;
  lastUpdated: string;
  source: string;
  extractedAt: string;
  confidence: "high" | "medium" | "low";
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function downloadPDF(url: string, outputPath: string): Promise<void> {
  console.log("📥 Downloading People's Bank Q3-2025 PDF...");
  
  // Direct download
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.statusText}`);
  }
  
  const buffer = await response.buffer();
  fs.writeFileSync(outputPath, buffer);
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

function parsePeoplesBankLines(lines: string[]): MarketShareResult | null {
  // Dump for debugging
  try {
    ensureDir("./output");
    fs.writeFileSync(
      "./output/peoples-market-share-ocr-lines.txt",
      lines.map((l, idx) => `[${idx}] ${l}`).join("\n"),
      "utf8"
    );
    console.log("✅ Dumped OCR lines to output/peoples-market-share-ocr-lines.txt");
  } catch {}

  let totalGrossLoans = 0;
  let prevTotalGrossLoans = 0;

  console.log("\n🔍 Parsing People's Bank product-wise loans...");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // Look for "Sub Total" line after product breakdown (local currency section)
    if (lower.includes("sub total") && !lower.includes("foreign")) {
      // Check next line for amounts (format: amount1 amount2 amount3 amount4)
      // We want the second amount (net loans)
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const matches = nextLine.match(/(\d{1,3}(?:,\d{3})+)/g);
        if (matches && matches.length >= 2) {
          // Second amount is net loans (after provisions)
          const amount = parseFloat(matches[1].replace(/,/g, ""));
          // Range: 1.4T-1.6T thousands (1,400,000,000 - 1,600,000,000)
          if (amount > 1400000000 && amount < 1600000000) {
            totalGrossLoans = amount;
            // Try to extract previous year (3rd or 4th amount in comparative format)
            if (matches.length >= 4) {
              const prevAmount = parseFloat(matches[3].replace(/,/g, ""));
              if (prevAmount > 1300000000 && prevAmount < 1600000000) {
                prevTotalGrossLoans = prevAmount;
                console.log(`  ✓ Total gross loans: ${(totalGrossLoans/1000).toFixed(1)}M (prev: ${(prevTotalGrossLoans/1000).toFixed(1)}M)`);
              }
            } else {
              console.log(`  ✓ Total gross loans (local currency): ${(totalGrossLoans/1000).toFixed(1)}M`);
            }
            break;
          }
        }
      }
    }
  }

  if (!totalGrossLoans) {
    console.log("❌ Could not find total gross loans");
    return null;
  }

  const result: MarketShareResult = {
    bank: "People's Bank",
    shortName: "People's",
    assetBookSize: totalGrossLoans,
    segments: {
      housing: 0,   // Not disclosed in People's Bank reports
      personal: 0   // Not disclosed in People's Bank reports
    },
    previousYear: prevTotalGrossLoans > 0 ? {
      assetBookSize: prevTotalGrossLoans,
      segments: {
        housing: 0,
        personal: 0
      },
      date: "2024-12-31"
    } : undefined,
    reportType: "Q3-2025",
    lastUpdated: "2025-09-30",
    source: "People's Bank September 2025 Interim Financial Statements - Product-wise Gross loans & advances",
    extractedAt: new Date().toISOString(),
    confidence: "high"
  };

  return result;
}

async function scrapePeoplesBankMarketShare(): Promise<MarketShareResult | null> {
  try {
    console.log("📊 Scraping People's Bank Market Share (OCR method)...");

    const pdfUrl = "https://www.peoplesbank.lk/roastoth/2025/12/September-2025-WEB.pdf";
    const pdfPath = "./tmp/peoples-q3-2025.pdf";

    ensureDir("./tmp");

    // Download PDF
    await downloadPDF(pdfUrl, pdfPath);

    // Extract text
    const lines = await extractTextFromPDF(pdfPath);

    // Parse lines
    const result = parsePeoplesBankLines(lines);

    if (result) {
      console.log("\n📊 Extraction Summary:");
      console.log(`  Bank: ${result.bank}`);
      console.log(`  Total Asset Book: LKR ${(result.assetBookSize/1000).toFixed(1)}M`);
      console.log(`  Housing Loans: Not disclosed`);
      console.log(`  Personal Loans: Not disclosed`);

      // Save to output
      ensureDir("./output");
      const outputPath = path.resolve("./output/peoples-market-share-ocr.json");
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`\n✅ Saved result to ${outputPath}`);
      console.log("\n📊 Final Result:");
      console.log(JSON.stringify(result, null, 2));
    }

    return result;
  } catch (error) {
    console.error("❌ Error scraping People's Bank market share:", error);
    return null;
  }
}

// Run if executed directly
if (require.main === module) {
  scrapePeoplesBankMarketShare();
}

export { scrapePeoplesBankMarketShare };
