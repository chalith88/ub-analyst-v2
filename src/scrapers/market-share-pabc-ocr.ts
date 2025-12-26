/**
 * Pan Asia Banking Corporation (PABC) Market Share OCR Scraper
 * Extracts product-wise gross loans from PABC quarterly reports using OCR
 * 
 * Report URL: https://www.pabcbank.com/about-us/interim-financial-reports/
 * Target Data: Loans and Advances - By Product (Domestic Currency)
 * 
 * Expected values (Q3-2025):
 * - Total: ~188,125M (188.1B)
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

async function downloadPDF(outputPath: string): Promise<void> {
  console.log("📥 Downloading PABC Q3-2025 PDF...");
  
  const pdfUrl = "https://pabcbank.com/wp-content/uploads/2025/11/Interim-Financial-Statements-30th-September-2025-1.pdf";
  
  const response = await fetch(pdfUrl);
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

function parsePABCLines(lines: string[]): MarketShareResult | null {
  // Dump for debugging
  try {
    ensureDir("./output");
    fs.writeFileSync(
      "./output/pabc-market-share-ocr-lines.txt",
      lines.map((l, idx) => `[${idx}] ${l}`).join("\n"),
      "utf8"
    );
    console.log("✅ Dumped OCR lines to output/pabc-market-share-ocr-lines.txt");
  } catch {}

  let totalLoans = 0;
  let prevTotalLoans = 0;
  let inDomesticSection = false;
  let foundLoansSection = false;

  console.log("\n🔍 Parsing PABC product-wise loans...");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // Detect "Loans and Advances - By Product" section
    if (!foundLoansSection && lower.includes("loan") && lower.includes("advance") && lower.includes("product")) {
      console.log(`  Found section at line ${i}: ${line}`);
      foundLoansSection = true;
      inDomesticSection = false;
    }

    // Detect "Domestic Currency" subsection
    if (foundLoansSection && !inDomesticSection && lower.includes("domestic") && lower.includes("currency")) {
      inDomesticSection = true;
      console.log(`  Entering Domestic Currency section at line ${i}`);
    }

    // Look for "Sub Total" in domestic currency section
    if (inDomesticSection && (lower.includes("sub total") || lower.includes("subtotal"))) {
      const numbers = line.match(/(\d{1,3}(?:,\d{3}){2,})/g); // At least 2 comma groups (100M+)
      if (numbers && numbers.length >= 2) {
        const current = parseFloat(numbers[0].replace(/,/g, ""));
        const previous = parseFloat(numbers[1].replace(/,/g, ""));
        // Range: 150M-250M thousands (150B-250B)
        if (current > 150000000 && current < 250000000) {
          totalLoans = current;
          prevTotalLoans = previous;
          console.log(`  ✓ Domestic currency sub-total: ${(totalLoans/1000).toFixed(1)}M (prev: ${(prevTotalLoans/1000).toFixed(1)}M)`);
          break; // We have what we need
        }
      }
    }

    // Exit domestic currency section when we hit "Foreign Currency"
    if (inDomesticSection && lower.includes("foreign") && lower.includes("currency")) {
      console.log(`  Exiting Domestic Currency section at line ${i}`);
      inDomesticSection = false;
    }
  }

  if (!totalLoans) {
    console.log("❌ Could not find total loans");
    return null;
  }

  const result: MarketShareResult = {
    bank: "Pan Asia Banking Corporation",
    shortName: "PABC",
    assetBookSize: totalLoans,
    segments: {
      housing: 0,      // Not disclosed separately in summary
      personal: 0      // Not disclosed separately in summary
    },
    reportType: "Q3-2025",
    lastUpdated: "2025-09-30",
    source: "Pan Asia Banking Corporation Q3 2025 Interim Financial Statements - Loans and Advances by Product (Domestic Currency)",
    extractedAt: new Date().toISOString(),
    confidence: "high",
    ...(prevTotalLoans > 0 && {
      previousYear: {
        assetBookSize: prevTotalLoans,
        segments: {
          housing: 0,
          personal: 0
        },
        date: "2024-12-31"
      }
    })
  };

  return result;
}

async function scrapePABCMarketShare(): Promise<MarketShareResult | null> {
  try {
    console.log("📊 Scraping PABC Market Share (OCR method)...");

    const pdfPath = "./tmp/pabc-q3-2025.pdf";
    ensureDir("./tmp");

    // Download PDF if not exists
    if (!fs.existsSync(pdfPath)) {
      await downloadPDF(pdfPath);
    } else {
      console.log("📄 Using existing PDF");
    }

    // Extract text
    const lines = await extractTextFromPDF(pdfPath);

    // Parse lines
    const result = parsePABCLines(lines);

    if (result) {
      console.log("\n📊 Extraction Summary:");
      console.log(`  Bank: ${result.bank}`);
      console.log(`  Total Asset Book: LKR ${(result.assetBookSize/1000).toFixed(1)}M`);
      console.log(`  Housing Loans: Not disclosed separately`);
      console.log(`  Personal Loans: Not disclosed separately`);

      // Save to output
      ensureDir("./output");
      const outputPath = path.resolve("./output/pabc-market-share-ocr.json");
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`\n✅ Saved result to ${outputPath}`);
      console.log("\n📊 Final Result:");
      console.log(JSON.stringify(result, null, 2));
    }

    return result;
  } catch (error) {
    console.error("❌ Error scraping PABC market share:", error);
    return null;
  }
}

// Run if executed directly
if (require.main === module) {
  scrapePABCMarketShare();
}

export { scrapePABCMarketShare };
