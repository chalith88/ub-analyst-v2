/**
 * Market Share Scraper - Bank of Ceylon (BOC)
 * Extracts retail loan portfolio from quarterly reports
 */

import path from "path";
import os from "os";
import fs from "fs/promises";
import {
  MarketShareData,
  downloadPDF,
  extractPDFText,
  groupByLines,
  linesToText,
  findSection,
  extractLoanCategories,
  aggregateSegments,
  calculateTotal,
  determineConfidence,
  getCachedPDF,
  savePDFToCache,
} from "./market-share-base";

const BANK_NAME = "Bank of Ceylon";
const SHORT_NAME = "BOC";

/**
 * Extract loan categories from BOC's specific format
 * BOC Q3-2025 shows totals in format: "1,705,124,546" with categories like:
 * Housing loans: 66,148,403
 * Personal loans: 363,605,520
 */
function extractBOCLoanCategories(lines: string[]): Record<string, number> {
  const categories: Record<string, number> = {};
  let totalFound = false;
  
  console.log("🔍 Parsing BOC loan categories...");
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    
    // Look for total local currency loans
    if (line.includes('total local currency loans') || line.includes('total local currency loans and advances')) {
      // Total is usually on the same line or next line
      const match = lines[i].match(/[\d,]+,\d{3},\d{3}/);
      if (match) {
        const total = parseFloat(match[0].replace(/,/g, ''));
        if (!isNaN(total) && total > 1000000) { // Should be > 1 trillion
          console.log(`  ✓ Found total: ${total.toLocaleString()}M (${(total/1000).toFixed(1)}B)`);
          totalFound = true;
        }
      }
    }
    
    // Housing loans
    if (line.includes('housing loan')) {
      // Look for number pattern in this line or surrounding lines
      for (let j = Math.max(0, i-1); j <= Math.min(lines.length-1, i+2); j++) {
        const numMatch = lines[j].match(/(\d{1,3}(?:,\d{3}){2,})/);
        if (numMatch && !lines[j].toLowerCase().includes('total')) {
          const amount = parseFloat(numMatch[1].replace(/,/g, ''));
          if (!isNaN(amount) && amount > 10000 && amount < 200000) { // 10B - 200B range
            categories['housing'] = amount;
            console.log(`  ✓ Found housing: ${amount.toLocaleString()}M (${(amount/1000).toFixed(1)}B)`);
            break;
          }
        }
      }
    }
    
    // Personal loans
    if (line.includes('personal loan')) {
      for (let j = Math.max(0, i-1); j <= Math.min(lines.length-1, i+2); j++) {
        const numMatch = lines[j].match(/(\d{1,3}(?:,\d{3}){2,})/);
        if (numMatch && !lines[j].toLowerCase().includes('total')) {
          const amount = parseFloat(numMatch[1].replace(/,/g, ''));
          if (!isNaN(amount) && amount > 100000 && amount < 500000) { // 100B - 500B range
            categories['personal'] = amount;
            console.log(`  ✓ Found personal: ${amount.toLocaleString()}M (${(amount/1000).toFixed(1)}B)`);
            break;
          }
        }
      }
    }
  }
  
  return categories;
}

/**
 * Find BOC's latest quarterly report URL
 */
async function findLatestReportURL(): Promise<{ url: string; reportType: string } | null> {
  // BOC publishes reports at: https://www.boc.lk/financial/interim-financial-statements
  
  const knownReports = [
    {
      url: "https://www.boc.lk/financial/document/99/download",
      reportType: "Q3-2025"
    },
    {
      url: "https://www.boc.lk/images/financials/2024/Q3-2024-Interim-Financial-Statements.pdf",
      reportType: "Q3-2024"
    },
    {
      url: "https://www.boc.lk/images/financials/2024/Q2-2024-Interim-Financial-Statements.pdf",
      reportType: "Q2-2024"
    }
  ];
  
  // Try each URL until one works
  for (const report of knownReports) {
    try {
      const response = await fetch(report.url, { method: "HEAD" });
      if (response.ok) {
        console.log(`✅ Found report: ${report.reportType} at ${report.url}`);
        return report;
      }
    } catch {
      continue;
    }
  }
  
  return null;
}

/**
 * Extract market share data from BOC quarterly report
 */
export async function scrapeBOCMarketShare(): Promise<MarketShareData | null> {
  try {
    console.log(`\n📊 Scraping ${BANK_NAME} market share data...`);
    
    // Find latest report
    const reportInfo = await findLatestReportURL();
    if (!reportInfo) {
      console.error(`❌ Could not find ${BANK_NAME} quarterly report`);
      return null;
    }
    
    console.log(`📄 Found report: ${reportInfo.reportType}`);
    
    // Check cache first
    let pdfPath = await getCachedPDF(SHORT_NAME, reportInfo.reportType);
    
    if (!pdfPath) {
      // Download PDF
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "boc-market-share-"));
      pdfPath = path.join(tmpDir, "report.pdf");
      
      await downloadPDF(reportInfo.url, pdfPath);
      await savePDFToCache(SHORT_NAME, reportInfo.reportType, pdfPath);
    }
    
    // Extract text from PDF
    console.log("📖 Extracting text from PDF...");
    const items = await extractPDFText(pdfPath);
    const lines = groupByLines(items);
    const textLines = linesToText(lines);
    
    // Find loan portfolio section
    // BOC format: Look for lines with "Housing loans" and "Personal loans" and large numbers
    const loanSection = findSection(
      textLines,
      ["housing loan", "personal loan", "local currency loans"],
      ["total equity", "total assets", "financial statements"]
    );
    
    if (loanSection.length === 0) {
      console.error(`❌ Could not find loan portfolio section in ${BANK_NAME} report`);
      console.log("🔍 Searching entire document for housing/personal loans...");
      
      // Fallback: search entire document
      const fallbackSection = textLines.filter(line => {
        const lower = line.toLowerCase();
        return lower.includes('housing loan') || 
               lower.includes('personal loan') ||
               lower.includes('total local currency loans');
      });
      
      if (fallbackSection.length > 0) {
        console.log(`✅ Found ${fallbackSection.length} relevant lines via fallback search`);
        return extractFromLines(fallbackSection, reportInfo);
      }
      
      return null;
    }
    
    console.log(`✅ Found loan section (${loanSection.length} lines)`);
    return extractFromLines(loanSection, reportInfo);
    
  } catch (err) {
    console.error(`❌ Error scraping ${BANK_NAME}:`, err);
    return null;
  }
}

function extractFromLines(loanSection: string[], reportInfo: { url: string; reportType: string }): MarketShareData | null {
  try {
    
    // Extract loan categories using BOC-specific extraction
    const categories = extractBOCLoanCategories(loanSection);
    console.log("📊 Extracted categories:", categories);
    
    const segments = aggregateSegments(categories);
    
    // For BOC, total should be from the PDF, not just retail sum
    // Look for total in the lines
    let assetBookSize = 0;
    for (const line of loanSection) {
      const match = line.match(/(\d{1,3}(?:,\d{3}){2,})/g);
      if (match) {
        for (const num of match) {
          const val = parseFloat(num.replace(/,/g, ''));
          if (val > 1500000 && val < 2000000) { // BOC total is ~1.7 trillion
            assetBookSize = val;
            console.log(`✅ Found total asset book size: ${assetBookSize.toLocaleString()}M (${(assetBookSize/1000).toFixed(1)}B)`);
            break;
          }
        }
        if (assetBookSize > 0) break;
      }
    }
    
    if (assetBookSize === 0) {
      assetBookSize = calculateTotal(segments);
    }
    
    const confidence = determineConfidence(segments);
    
    if (assetBookSize < 1000000) {  // BOC should have > 1 trillion in total loans
      console.warn(`⚠️  Total seems low (${assetBookSize}M), extraction may be incomplete - using static data instead`);
      return null;  // Return null to trigger fallback to static data
    }
    
    const result: MarketShareData = {
      bank: BANK_NAME,
      shortName: SHORT_NAME,
      assetBookSize: assetBookSize,
      segments,
      lastUpdated: getQuarterEndDate(reportInfo.reportType),
      source: `${BANK_NAME} ${reportInfo.reportType} Interim Financial Statements`,
      reportType: reportInfo.reportType,
      reportUrl: reportInfo.url,
      confidence,
      extractedAt: new Date().toISOString(),
    };
    
    console.log(`✅ ${BANK_NAME}: LKR ${(assetBookSize / 1000).toFixed(1)}B (${confidence} confidence)`);
    console.log(`   Housing: ${segments.housing ? (segments.housing/1000).toFixed(1) + 'B' : 'N/A'}`);
    console.log(`   Personal: ${segments.personal ? (segments.personal/1000).toFixed(1) + 'B' : 'N/A'}`);
    
    return result;
    
  } catch (err) {
    console.error(`❌ Error in extractFromLines:`, err);
    return null;
  }
}

/**
 * Get quarter end date from report type
 */
function getQuarterEndDate(reportType: string): string {
  const match = reportType.match(/Q(\d)-(\d{4})/);
  if (match) {
    const quarter = parseInt(match[1]);
    const year = match[2];
    const month = quarter * 3;
    const lastDay = new Date(parseInt(year), month, 0).getDate();
    return `${year}-${month.toString().padStart(2, '0')}-${lastDay}`;
  }
  return new Date().toISOString().split('T')[0];
}

// Allow running standalone
if (require.main === module) {
  scrapeBOCMarketShare().then(data => {
    if (data) {
      console.log("\n📊 Final Result:");
      console.log(JSON.stringify(data, null, 2));
    }
  });
}
