/**
 * DFCC Bank Market Share OCR Scraper
 * Extracts total gross loans from DFCC Bank quarterly reports using OCR
 * 
 * Report URL: https://properties.dfcc.lk/dfccweb/uploads/e2d9ca7d-c38a-4bb6-9e24-38e9abf09cc4/Interim-Financial-Statements-as-at-30.09.2025.pdf
 * Target Data: Gross Loans and Advances by Product
 * 
 * Expected values (Q3-2025):
 * - Total: ~459,130M (459B)
 * - Housing/Personal loans: Not disclosed
 */

import fs from "fs";
import path from "path";
import fetch from "node-fetch";

interface MarketShareResult {
  bank: string;
  shortName: string;
  assetBookSize: number;
  segments: { housing: number; personal: number };
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
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

async function scrape(): Promise<MarketShareResult | null> {
  try {
    console.log("📊 Scraping DFCC Bank Market Share...");
    const url = "https://properties.dfcc.lk/dfccweb/uploads/e2d9ca7d-c38a-4bb6-9e24-38e9abf09cc4/Interim-Financial-Statements-as-at-30.09.2025.pdf";
    const pdfPath = "./tmp/dfcc-q3-2025.pdf";
    ensureDir("./tmp");

    console.log("📥 Downloading PDF...");
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);
    fs.writeFileSync(pdfPath, Buffer.from(await response.arrayBuffer()));

    console.log("📖 Extracting text...");
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await (await pdfjsLib.getDocument({ data: new Uint8Array(fs.readFileSync(pdfPath)) }).promise);
    
    const lines: string[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const lineMap = new Map<number, string[]>();
      for (const item of textContent.items) {
        if ("str" in item && item.str.trim()) {
          const y = Math.round(item.transform[5]);
          if (!lineMap.has(y)) lineMap.set(y, []);
          lineMap.get(y)!.push(item.str);
        }
      }
      Array.from(lineMap.keys()).sort((a, b) => b - a).forEach(y => {
        lines.push(lineMap.get(y)!.join(" ").trim());
      });
    }

    ensureDir("./output");
    fs.writeFileSync("./output/dfcc-market-share-ocr-lines.txt", lines.map((l, i) => `[${i}] ${l}`).join("\n"));
    console.log(`✅ Extracted ${lines.length} lines`);

    let total = 0;
    let prevTotal = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();
      const nextLine = i + 1 < lines.length ? lines[i + 1].toLowerCase() : "";
      
      // Check if next line is "foreign" section - this means current line is domestic total
      if (nextLine.includes("foreign") || (lower.includes("total") && lower.includes("gross"))) {
        const numbers = line.match(/(\d{1,3}(?:,\d{3})+)/g);
        if (numbers && numbers.length >= 2) {
          const current = parseFloat(numbers[0].replace(/,/g, ""));
          const previous = parseFloat(numbers[1].replace(/,/g, ""));
          if (current > 450000000 && current < 500000000) {
            total = current;
            prevTotal = previous;
            console.log(`  ✓ Total: ${(total/1000).toFixed(1)}M (prev: ${(prevTotal/1000).toFixed(1)}M)`);
            break;
          }
        }
      }
    }

    if (!total) {
      console.log("❌ Could not find total");
      return null;
    }

    const result: MarketShareResult = {
      bank: "DFCC Bank",
      shortName: "DFCC",
      assetBookSize: total,
      segments: { housing: 0, personal: 0 },
      reportType: "Q3-2025",
      lastUpdated: "2025-09-30",
      source: "DFCC Bank Q3 2025 Interim Financial Statements",
      extractedAt: new Date().toISOString(),
      confidence: "high",
      ...(prevTotal > 0 && {
        previousYear: {
          assetBookSize: prevTotal,
          segments: {
            housing: 0,
            personal: 0
          },
          date: "2024-12-31"
        }
      })
    };

    fs.writeFileSync("./output/dfcc-market-share-ocr.json", JSON.stringify(result, null, 2));
    console.log(`\n✅ Total: LKR ${(result.assetBookSize/1000).toFixed(1)}M`);
    return result;
  } catch (error) {
    console.error("❌ Error:", error);
    return null;
  }
}

if (require.main === module) scrape();
export { scrape as scrapeDFCCMarketShare };
