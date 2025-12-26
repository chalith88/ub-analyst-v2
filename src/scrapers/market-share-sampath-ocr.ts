/**
 * Sampath Bank Market Share OCR Scraper
 * Extracts product-wise gross loans from Sampath Bank quarterly reports using OCR
 * 
 * Report URL: https://www.sampath.lk/en/investor-relations/financials/interim-accounts
 * Target Data: Product-wise Loans & Advances - Local currency
 * 
 * Expected values (Q3-2025):
 * - Total: ~986,201M (986B)
 * - Housing loans: ~52,862M
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

async function downloadPDF(outputPath: string): Promise<void> {
  console.log("📥 Downloading Sampath Bank Q3-2025 Interim Report PDF...");
  
  // Use Playwright to navigate and download
  const playwright = await import("playwright");
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto("https://www.sampath.lk/investor-relations?section=Interim-Reports", {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });
    
    // Find the 30th September 2025 link and extract href
    const pdfUrl = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('div, span, p, h3, a'));
      for (const el of elements) {
        const text = (el.textContent || '').trim();
        // Match "30th September 2025" or similar
        if (text.includes('30th September 2025') || (text.includes('September 2025') && text.includes('30'))) {
          // Look for VIEW REPORT button/link nearby
          const parent = el.closest('div') || el.parentElement;
          if (parent) {
            const links = parent.querySelectorAll('a[href*=".pdf"], a[href*="uploads"], a');
            for (const link of links) {
              const href = link.getAttribute('href');
              const linkText = (link.textContent || '').toLowerCase();
              if (href && (linkText.includes('view') || linkText.includes('report') || href.includes('.pdf'))) {
                return href;
              }
            }
          }
        }
      }
      return null;
    });
    
    if (!pdfUrl) {
      throw new Error("Could not find 30th September 2025 PDF link");
    }
    
    const fullUrl = pdfUrl.startsWith('http') ? pdfUrl : `https://www.sampath.lk${pdfUrl}`;
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

function parseSampathLines(lines: string[]): MarketShareResult | null {
  // Dump for debugging
  try {
    ensureDir("./output");
    fs.writeFileSync(
      "./output/sampath-market-share-ocr-lines.txt",
      lines.map((l, idx) => `[${idx}] ${l}`).join("\n"),
      "utf8"
    );
    console.log("✅ Dumped OCR lines to output/sampath-market-share-ocr-lines.txt");
  } catch {}

  let totalLoans = 0;
  let housing = 0;
  let prevTotalLoans = 0;
  let prevHousing = 0;
  let inLocalCurrencySection = false;
  let foundProductWiseSection = false;

  console.log("\n🔍 Parsing Sampath Bank product-wise loans...");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // Detect "Product-wise loans and advances" section (1.2)
    if (!foundProductWiseSection && lower.includes("product") && lower.includes("wise") && lower.includes("loan")) {
      foundProductWiseSection = true;
      inLocalCurrencySection = false;
    }

    // Detect "Local currency" subsection (only in the first product-wise section)
    if (foundProductWiseSection && !inLocalCurrencySection && lower.trim() === "local currency") {
      inLocalCurrencySection = true;
    }

    // Look for "Housing loans" - extract both current and previous year
    if (lower.includes("housing loan")) {
      const numbers = line.match(/(\d{1,3}(?:,\d{3})+)/g);
      if (numbers && numbers.length >= 2) {
        const current = parseFloat(numbers[0].replace(/,/g, ""));
        const previous = parseFloat(numbers[1].replace(/,/g, ""));
        // Range: 45M-65M thousands (45B-65B)
        if (current > 45000000 && current < 65000000) {
          housing = current;
          prevHousing = previous;
          console.log(`  ✓ Housing loans: ${(housing/1000).toFixed(1)}M (prev: ${(prevHousing/1000).toFixed(1)}M)`);
        }
      }
    }

    // Look for "Sub total" in local currency section (BEFORE checking exit condition)
    if (inLocalCurrencySection && (lower.includes("sub total") || lower.includes("subtotal"))) {
      const numbers = line.match(/(\d{1,3}(?:,\d{3}){2,})/g); // At least 2 comma groups (100M+)
      if (numbers && numbers.length >= 2) {
        const current = parseFloat(numbers[0].replace(/,/g, ""));
        const previous = parseFloat(numbers[1].replace(/,/g, ""));
        // Range: 900M-1.1T thousands (900B-1.1T)
        if (current > 900000000 && current < 1100000000) {
          totalLoans = current;
          prevTotalLoans = previous;
          console.log(`  ✓ Local currency sub-total: ${(totalLoans/1000).toFixed(1)}M (prev: ${(prevTotalLoans/1000).toFixed(1)}M)`);
          break; // We have what we need
        }
      }
    }

    // Exit local currency section when we hit "Foreign currency"
    if (inLocalCurrencySection && lower.includes("foreign currency")) {
      inLocalCurrencySection = false;
    }
  }

  if (!totalLoans) {
    console.log("❌ Could not find total loans");
    return null;
  }

  const result: MarketShareResult = {
    bank: "Sampath Bank",
    shortName: "Sampath",
    assetBookSize: totalLoans,
    segments: {
      housing,
      personal: 0  // Not disclosed in Sampath reports
    },
    reportType: "Q3-2025",
    lastUpdated: "2025-09-30",
    source: "Sampath Bank PLC Q3 2025 Interim Financial Statements - Product-wise Loans & Advances - Local currency",
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

async function scrapeSampathMarketShare(): Promise<MarketShareResult | null> {
  try {
    console.log("📊 Scraping Sampath Bank Market Share (OCR method)...");

    const pdfPath = "./tmp/sampath-q3-2025.pdf";
    ensureDir("./tmp");

    // Use Playwright to download PDF with proper browser context
    console.log("📥 Downloading Sampath Bank Q3-2025 PDF via Playwright...");
    const pdfUrl = "https://www.sampath.lk/api/uploads/Sampath_Bank_PLC_Financial_Statements_30_09_2025_e5f8f969d2_b9f26ad064_70ea5b2c30.pdf";
    
    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      acceptDownloads: true
    });
    const page = await context.newPage();
    
    try {
      // Handle download event - start navigation without awaiting to avoid error
      const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
      page.goto(pdfUrl).catch(() => {}); // Ignore the error as download interrupts navigation
      const download = await downloadPromise;
      
      await download.saveAs(pdfPath);
      const fileSize = fs.statSync(pdfPath).size;
      console.log(`✅ Downloaded PDF (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
    } finally {
      await browser.close();
    }

    // Extract text
    const lines = await extractTextFromPDF(pdfPath);

    // Parse lines
    const result = parseSampathLines(lines);

    if (result) {
      console.log("\n📊 Extraction Summary:");
      console.log(`  Bank: ${result.bank}`);
      console.log(`  Total Asset Book: LKR ${(result.assetBookSize/1000).toFixed(1)}M`);
      console.log(`  Housing Loans: LKR ${(result.segments.housing/1000).toFixed(1)}M`);
      console.log(`  Personal Loans: Not disclosed`);

      // Save to output
      ensureDir("./output");
      const outputPath = path.resolve("./output/sampath-market-share-ocr.json");
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`\n✅ Saved result to ${outputPath}`);
      console.log("\n📊 Final Result:");
      console.log(JSON.stringify(result, null, 2));
    }

    return result;
  } catch (error) {
    console.error("❌ Error scraping Sampath Bank market share:", error);
    return null;
  }
}

// Run if executed directly
if (require.main === module) {
  scrapeSampathMarketShare();
}

export { scrapeSampathMarketShare };
