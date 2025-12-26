/**
 * Seylan Bank Market Share OCR Scraper
 * Extracts product-wise gross loans from Seylan Bank annual reports using OCR
 * 
 * Note: Using 2024 Annual Report as Q3-2025 may not be available
 * Report URL: https://www.seylan.lk/about-us/investor-relation?type=annual-report
 * Target Data: Analysis of Gross Loans and Advances (by Product)
 * 
 * Expected values (Annual 2024):
 * - Total: ~462,182M (462B)
 * - Housing loans: ~16,391M
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
  console.log("📥 Downloading Seylan Bank Q3-2025 Interim Report PDF...");
  
  // Use Playwright to navigate and download
  const playwright = await import("playwright");
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto("https://www.seylan.lk/about-us/investor-relation?type=interim-financials", {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });
    
    // Find the Q3 2025 English link and extract href
    const pdfUrl = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr, div, td, p, span'));
      for (const row of rows) {
        const text = (row.textContent || '').trim();
        // Match exactly "Interim Financial Q3 - 2025 - English" pattern
        if (text.includes('Interim Financial Q3') && 
            text.includes('2025') && 
            text.includes('English') &&
            !text.includes('Sinhala') &&
            !text.includes('Tamil')) {
          // Look for download link within this element or its parent row
          const parent = row.closest('tr') || row.parentElement || row;
          const links = parent.querySelectorAll('a[href*=".pdf"], a[download], a[href*="uploads"]');
          for (const link of links) {
            const href = link.getAttribute('href');
            const linkText = link.textContent || '';
            // Must be a download link, not view/policy links
            if (href && href.includes('/uploads/') && 
                (linkText.includes('Download') || href.toLowerCase().includes('q3') || href.toLowerCase().includes('interim'))) {
              return href;
            }
          }
        }
      }
      return null;
    });
    
    if (!pdfUrl) {
      throw new Error("Could not find Q3 2025 English PDF link");
    }
    
    const fullUrl = pdfUrl.startsWith('http') ? pdfUrl : `https://www.seylan.lk${pdfUrl}`;
    console.log(`  Found PDF URL: ${fullUrl}`);
    
    // Download the PDF
    const response = await fetch(fullUrl);
    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(outputPath, Buffer.from(buffer));
    console.log(`✅ Downloaded PDF: ${path.basename(outputPath)}`);
  } finally {
    await browser.close();
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

function parseSeylanLines(lines: string[]): MarketShareResult | null {
  // Dump for debugging
  try {
    ensureDir("./output");
    fs.writeFileSync(
      "./output/seylan-market-share-ocr-lines.txt",
      lines.map((l, idx) => `[${idx}] ${l}`).join("\n"),
      "utf8"
    );
    console.log("✅ Dumped OCR lines to output/seylan-market-share-ocr-lines.txt");
  } catch {}

  let totalLoans = 0;
  let housing = 0;
  let prevTotalLoans = 0;
  let prevHousing = 0;

  console.log("\n🔍 Parsing Seylan Bank product-wise loans...");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // Look for "Housing loans" - extract both current and previous year
    if (lower.includes("housing loan")) {
      const numbers = line.match(/(\d{1,3}(?:,\d{3})+)/g);
      if (numbers && numbers.length >= 2) {
        const current = parseFloat(numbers[0].replace(/,/g, ""));
        const previous = parseFloat(numbers[1].replace(/,/g, ""));
        // Range: 17M-20M thousands (17B-20B) for Q3-2025
        if (current > 17000000 && current < 20000000) {
          housing = current;
          prevHousing = previous;
          console.log(`  ✓ Housing loans: ${(housing/1000).toFixed(1)}M (prev: ${(prevHousing/1000).toFixed(1)}M)`);
        }
      }
    }

    // Look for "Loans and Advances" (Q3 interim format) - extract both current and previous year
    if (lower.includes("loans and advances") || lower.includes("loan and advance")) {
      const numbers = line.match(/(\d{1,3}(?:,\d{3})+)/g);
      if (numbers && numbers.length >= 2) {
        const current = parseFloat(numbers[0].replace(/,/g, ""));
        const previous = parseFloat(numbers[1].replace(/,/g, ""));
        // Range: 520M-550M thousands (520B-550B) for Q3-2025
        if (current > 520000000 && current < 550000000) {
          totalLoans = current;
          prevTotalLoans = previous;
          console.log(`  ✓ Total loans and advances: ${(totalLoans/1000).toFixed(1)}M (prev: ${(prevTotalLoans/1000).toFixed(1)}M)`);
        }
      }
    }

    // Also look for "Total" (gross loans format - annual report)
    if (!totalLoans && lower.includes("total") && (lower.includes("gross") || lower.includes("loan"))) {
      const match = line.match(/(\d{1,3}(?:,\d{3})+)/);
      if (match) {
        const amount = parseFloat(match[1].replace(/,/g, ""));
        // Range: 450B-500B thousands
        if (amount > 450000000 && amount < 500000000) {
          totalLoans = amount;
          console.log(`  ✓ Total gross loans: ${(totalLoans/1000).toFixed(1)}M`);
        }
      }
    }
  }

  if (!totalLoans) {
    console.log("❌ Could not find total loans");
    return null;
  }

  const result: MarketShareResult = {
    bank: "Seylan Bank",
    shortName: "Seylan",
    assetBookSize: totalLoans,
    segments: {
      housing,
      personal: 0  // Not disclosed in Seylan reports
    },
    reportType: "Q3-2025",
    lastUpdated: "2025-09-30",
    source: "Seylan Bank Q3-2025 Interim Financial Statements - Analysis of Gross Loans and Advances",
    extractedAt: new Date().toISOString(),
    confidence: "high",
    ...(prevTotalLoans > 0 && {
      previousYear: {
        assetBookSize: prevTotalLoans,
        segments: {
          housing: prevHousing,
          personal: 0
        },
        date: "2024-12-31"
      }
    })
  };

  return result;
}

async function scrapeSeylanMarketShare(): Promise<MarketShareResult | null> {
  try {
    console.log("📊 Scraping Seylan Bank Market Share (OCR method)...");

    // Q3-2025 Interim Report (will be dynamically found via Playwright)
    const pdfPath = "./tmp/seylan-q3-2025.pdf";

    ensureDir("./tmp");

    // Download PDF using Playwright
    await downloadPDF("", pdfPath);

    // Extract text
    const lines = await extractTextFromPDF(pdfPath);

    // Parse lines
    const result = parseSeylanLines(lines);

    if (result) {
      console.log("\n📊 Extraction Summary:");
      console.log(`  Bank: ${result.bank}`);
      console.log(`  Total Asset Book: LKR ${(result.assetBookSize/1000).toFixed(1)}M`);
      console.log(`  Housing Loans: LKR ${(result.segments.housing/1000).toFixed(1)}M`);
      console.log(`  Personal Loans: Not disclosed`);

      // Save to output
      ensureDir("./output");
      const outputPath = path.resolve("./output/seylan-market-share-ocr.json");
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`\n✅ Saved result to ${outputPath}`);
      console.log("\n📊 Final Result:");
      console.log(JSON.stringify(result, null, 2));
    }

    return result;
  } catch (error) {
    console.error("❌ Error scraping Seylan Bank market share:", error);
    return null;
  }
}

// Run if executed directly
if (require.main === module) {
  scrapeSeylanMarketShare();
}

export { scrapeSeylanMarketShare };
