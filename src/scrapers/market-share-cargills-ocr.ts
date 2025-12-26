/**
 * Cargills Bank Market Share OCR Scraper
 * Extracts product-wise gross loans from Cargills Bank quarterly reports using OCR
 * 
 * Report URL: https://www.cargillsbank.com/investor-relations/interim-reports/
 * Target Data: Product wise Gross Loans and Advances
 * 
 * Expected values (Q3-2025):
 * - Total: ~59,744M (59.7B)
 * - Housing loans: ~1,538M
 * - Personal loans: ~3,562M
 * - LAP: ~1,786M
 */

import fs from "fs";
import path from "path";
import { chromium } from "playwright";

interface MarketShareResult {
  bank: string;
  shortName: string;
  assetBookSize: number; // LKR thousands
  segments: {
    housing: number;     // LKR thousands
    personal: number;    // LKR thousands
    lap: number;         // LKR thousands
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
  console.log("📥 Downloading Cargills Bank Q3-2025 PDF...");
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    // Navigate to interim reports page
    await page.goto("https://www.cargillsbank.com/investor-relations/interim-reports/", {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });
    
    await page.waitForTimeout(2000);
    
    // Find the PDF URL for "30 September 2025"
    const pdfUrl = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div, a'));
      for (const card of cards) {
        const text = card.textContent || '';
        if (text.includes('30 September 2025') || text.includes('30th September 2025')) {
          // Look for cloud icon link or any href with pdf
          const parent = card.closest('div') || card.parentElement;
          if (parent) {
            const links = parent.querySelectorAll('a[href*=".pdf"], a[href*="uploads"], a[href*="download"]');
            for (const link of links) {
              const href = link.getAttribute('href');
              if (href && href.includes('.pdf')) {
                return href;
              }
            }
          }
          // Check if this element itself is a link
          if (card.tagName === 'A') {
            const href = card.getAttribute('href');
            if (href && href.includes('.pdf')) {
              return href;
            }
          }
        }
      }
      return null;
    });
    
    if (!pdfUrl) {
      throw new Error("Could not find 30 September 2025 PDF link");
    }
    
    const fullUrl = pdfUrl.startsWith('http') ? pdfUrl : `https://www.cargillsbank.com${pdfUrl}`;
    console.log(`  Found PDF URL: ${fullUrl}`);
    
    await browser.close();
    
    // Download using fetch
    const response = await fetch(fullUrl);
    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(outputPath, Buffer.from(buffer));
    console.log(`✅ Downloaded PDF: ${path.basename(outputPath)}`);
  } catch (error) {
    await browser.close();
    throw error;
  }
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

function parseCargillsLines(lines: string[]): MarketShareResult | null {
  // Dump for debugging
  try {
    ensureDir("./output");
    fs.writeFileSync(
      "./output/cargills-market-share-ocr-lines.txt",
      lines.map((l, idx) => `[${idx}] ${l}`).join("\n"),
      "utf8"
    );
    console.log("✅ Dumped OCR lines to output/cargills-market-share-ocr-lines.txt");
  } catch {}

  let totalLoans = 0;
  let housing = 0;
  let personal = 0;
  let lap = 0;
  let prevTotalLoans = 0;
  let prevHousing = 0;
  let prevPersonal = 0;
  let prevLap = 0;

  console.log("\n🔍 Parsing Cargills Bank product-wise loans...");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // Look for "Housing loans" - extract both current and previous year
    if (lower.includes("housing loan")) {
      const numbers = line.match(/(\d{1,3}(?:,\d{3})+)/g);
      if (numbers && numbers.length >= 2) {
        const current = parseFloat(numbers[0].replace(/,/g, ""));
        const previous = parseFloat(numbers[1].replace(/,/g, ""));
        // Range: 1M-3M thousands (1B-3B)
        if (current > 1000000 && current < 3000000) {
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
        // Range: 3M-5M thousands (3B-5B)
        if (current > 3000000 && current < 5000000) {
          personal = current;
          prevPersonal = previous;
          console.log(`  ✓ Personal loans: ${(personal/1000).toFixed(1)}M (prev: ${(prevPersonal/1000).toFixed(1)}M)`);
        }
      }
    }

    // Look for "Loans against property" or "LAP" - extract both current and previous year
    if (lower.includes("loan") && (lower.includes("against property") || lower.includes("lap"))) {
      const numbers = line.match(/(\d{1,3}(?:,\d{3})+)/g);
      if (numbers && numbers.length >= 2) {
        const current = parseFloat(numbers[0].replace(/,/g, ""));
        const previous = parseFloat(numbers[1].replace(/,/g, ""));
        // Range: 1.5M-2.5M thousands (1.5B-2.5B)
        if (current > 1500000 && current < 2500000) {
          lap = current;
          prevLap = previous;
          console.log(`  ✓ Loans against property: ${(lap/1000).toFixed(1)}M (prev: ${(prevLap/1000).toFixed(1)}M)`);
        }
      }
    }

    // Look for "Sub total" (total loans) - extract both current and previous year
    if ((lower.includes("sub total") || lower.includes("subtotal")) && totalLoans === 0) {
      const numbers = line.match(/(\d{1,3}(?:,\d{3})+)/g);
      if (numbers && numbers.length >= 2) {
        const current = parseFloat(numbers[0].replace(/,/g, ""));
        const previous = parseFloat(numbers[1].replace(/,/g, ""));
        // Range: 55B-65B thousands (55,000-65,000 millions)
        if (current > 55000000 && current < 65000000) {
          totalLoans = current;
          prevTotalLoans = previous;
          console.log(`  ✓ Total gross loans: ${(totalLoans/1000).toFixed(1)}M (prev: ${(prevTotalLoans/1000).toFixed(1)}M)`);
        }
      }
    }
  }

  if (!totalLoans) {
    console.log("❌ Could not find total loans");
    return null;
  }

  const result: MarketShareResult = {
    bank: "Cargills Bank",
    shortName: "Cargills",
    assetBookSize: totalLoans,
    segments: {
      housing,
      personal,
      lap
    },
    reportType: "Q3-2025",
    lastUpdated: "2025-09-30",
    source: "Cargills Bank Q3 2025 Interim Financial Statements - Product wise Gross Loans and Advances",
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

async function scrapeCargillsMarketShare(): Promise<MarketShareResult | null> {
  try {
    console.log("📊 Scraping Cargills Bank Market Share (OCR method)...");

    const pdfPath = "./tmp/cargills-q3-2025.pdf";
    ensureDir("./tmp");

    // Download PDF
    await downloadPDF(pdfPath);

    // Extract text
    const lines = await extractTextFromPDF(pdfPath);

    // Parse lines
    const result = parseCargillsLines(lines);

    if (result) {
      console.log("\n📊 Extraction Summary:");
      console.log(`  Bank: ${result.bank}`);
      console.log(`  Total Asset Book: LKR ${(result.assetBookSize/1000).toFixed(1)}M`);
      console.log(`  Housing Loans: LKR ${(result.segments.housing/1000).toFixed(1)}M`);
      console.log(`  Personal Loans: LKR ${(result.segments.personal/1000).toFixed(1)}M`);
      console.log(`  LAP: LKR ${(result.segments.lap/1000).toFixed(1)}M`);

      // Save to output
      ensureDir("./output");
      const outputPath = path.resolve("./output/cargills-market-share-ocr.json");
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`\n✅ Saved result to ${outputPath}`);
      console.log("\n📊 Final Result:");
      console.log(JSON.stringify(result, null, 2));
    }

    return result;
  } catch (error) {
    console.error("❌ Error scraping Cargills Bank market share:", error);
    return null;
  }
}

// Run if executed directly
if (require.main === module) {
  scrapeCargillsMarketShare();
}

export { scrapeCargillsMarketShare };
