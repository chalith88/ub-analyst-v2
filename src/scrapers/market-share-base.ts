/**
 * Base utilities for scraping bank quarterly reports to extract market share data
 * Handles PDF downloading, text extraction, and common parsing patterns
 */

import fs from "fs/promises";
import path from "path";
import { chromium } from "playwright";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

export interface MarketShareData {
  bank: string;
  shortName: string;
  assetBookSize: number;  // LKR millions
  marketShare?: number;    // Percentage (calculated after all banks scraped)
  segments: {
    housing: number;
    personal: number;
    lap: number;
    education: number;
    other: number;
  };
  lastUpdated: string;
  source: string;
  reportType: string;
  reportUrl: string;
  confidence: "high" | "medium" | "low";  // Extraction confidence
  extractedAt: string;
}

interface PDFTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Download PDF from URL using Playwright
 */
export async function downloadPDF(url: string, outputPath: string): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    // Check if URL is a direct download link
    const isDownloadEndpoint = url.includes('/download') || url.includes('/get');
    
    if (isDownloadEndpoint) {
      // Handle download endpoint - navigate will trigger download
      const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
      
      // Navigate without waiting for load (download will start immediately)
      page.goto(url).catch(() => {}); // Ignore navigation error when download starts
      
      const download = await downloadPromise;
      await download.saveAs(outputPath);
      console.log(`✅ Downloaded PDF: ${path.basename(outputPath)}`);
    } else {
      // Handle direct PDF URL
      await page.goto(url, { timeout: 60000, waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);

      const response = await page.goto(url);
      if (!response) throw new Error("No response from URL");

      const buffer = await response.body();
      await fs.writeFile(outputPath, buffer);
      
      console.log(`✅ Downloaded PDF: ${path.basename(outputPath)}`);
    }
  } catch (err) {
    console.error(`❌ Failed to download ${url}:`, err);
    throw err;
  } finally {
    await browser.close();
  }
}

/**
 * Extract text from PDF with position information
 */
export async function extractPDFText(pdfPath: string): Promise<PDFTextItem[]> {
  const buffer = await fs.readFile(pdfPath);
  const data = new Uint8Array(buffer);
  const pdf = await pdfjs.getDocument({ data }).promise;
  
  const allItems: PDFTextItem[] = [];
  
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    for (const item of textContent.items) {
      if ('str' in item && item.str.trim()) {
        allItems.push({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
        });
      }
    }
  }
  
  return allItems;
}

/**
 * Group PDF text items by Y coordinate (lines)
 */
export function groupByLines(items: PDFTextItem[], tolerance: number = 5): Map<number, PDFTextItem[]> {
  const lines = new Map<number, PDFTextItem[]>();
  
  for (const item of items) {
    // Find existing line within tolerance
    let foundLine = false;
    for (const [y, lineItems] of lines.entries()) {
      if (Math.abs(y - item.y) <= tolerance) {
        lineItems.push(item);
        foundLine = true;
        break;
      }
    }
    
    if (!foundLine) {
      lines.set(item.y, [item]);
    }
  }
  
  // Sort items within each line by x coordinate
  for (const lineItems of lines.values()) {
    lineItems.sort((a, b) => a.x - b.x);
  }
  
  return lines;
}

/**
 * Convert lines to text strings
 */
export function linesToText(lines: Map<number, PDFTextItem[]>): string[] {
  const sortedLines = Array.from(lines.entries())
    .sort((a, b) => b[0] - a[0]); // Top to bottom
  
  return sortedLines.map(([_, items]) => 
    items.map(item => item.str).join(' ')
  );
}

/**
 * Find section in PDF text by keywords
 */
export function findSection(
  lines: string[], 
  startKeywords: string[], 
  endKeywords: string[] = []
): string[] {
  let inSection = false;
  const section: string[] = [];
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    
    // Check if we're entering the section
    if (!inSection && startKeywords.some(kw => lowerLine.includes(kw.toLowerCase()))) {
      inSection = true;
      section.push(line);
      continue;
    }
    
    // If in section, collect lines
    if (inSection) {
      section.push(line);
      
      // Check if we've reached the end
      if (endKeywords.length > 0 && endKeywords.some(kw => lowerLine.includes(kw.toLowerCase()))) {
        break;
      }
      
      // Stop if we've collected enough lines (safety limit)
      if (section.length > 200) break;
    }
  }
  
  return section;
}

/**
 * Parse monetary value from string (handles various formats)
 */
export function parseAmount(str: string): number | null {
  // Remove commas and spaces
  const cleaned = str.replace(/,/g, '').replace(/\s+/g, '');
  
  // Match patterns like: 123.45, 123, (123.45), -123.45
  const match = cleaned.match(/^\(?-?\d+\.?\d*\)?$/);
  if (!match) return null;
  
  const num = parseFloat(cleaned.replace(/[()]/g, ''));
  
  // If in parentheses or negative, it's a negative number
  if (str.includes('(') || str.startsWith('-')) {
    return -Math.abs(num);
  }
  
  return num;
}

/**
 * Extract loan categories from table-like text
 * Common patterns in quarterly reports
 */
export function extractLoanCategories(lines: string[]): Record<string, number> {
  const categories: Record<string, number> = {};
  
  // Patterns for loan types
  const patterns = [
    { key: 'housing', patterns: ['housing', 'home loan', 'mortgage', 'residential'] },
    { key: 'personal', patterns: ['personal loan', 'consumer loan', 'individual'] },
    { key: 'lap', patterns: ['loan against property', 'property loan', 'lap'] },
    { key: 'education', patterns: ['education', 'student loan'] },
    { key: 'vehicle', patterns: ['vehicle', 'auto loan', 'automobile'] },
    { key: 'solar', patterns: ['solar', 'renewable energy'] },
    { key: 'pensioner', patterns: ['pensioner', 'senior citizen'] },
    { key: 'migrant', patterns: ['migrant', 'remittance'] },
  ];
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    
    // Try to find a loan category and amount in this line
    for (const { key, patterns: categoryPatterns } of patterns) {
      if (categoryPatterns.some(p => lowerLine.includes(p))) {
        // Look for numbers in the line
        const numbers = line.match(/[\d,]+\.?\d*/g);
        if (numbers) {
          for (const numStr of numbers) {
            const amount = parseAmount(numStr);
            if (amount && amount > 100) {  // Likely in millions if > 100
              categories[key] = amount;
              break;
            }
          }
        }
      }
    }
  }
  
  return categories;
}

/**
 * Aggregate segments into standard format
 */
export function aggregateSegments(categories: Record<string, number>): {
  housing: number;
  personal: number;
  lap: number;
  education: number;
  other: number;
} {
  return {
    housing: categories.housing || 0,
    personal: categories.personal || 0,
    lap: categories.lap || 0,
    education: categories.education || 0,
    other: (categories.vehicle || 0) + (categories.solar || 0) + 
           (categories.pensioner || 0) + (categories.migrant || 0)
  };
}

/**
 * Calculate total from segments
 */
export function calculateTotal(segments: Record<string, number>): number {
  return Object.values(segments).reduce((sum, val) => sum + val, 0);
}

/**
 * Determine confidence level based on extraction
 */
export function determineConfidence(
  segments: { housing: number; personal: number; lap: number; education: number; other: number }
): "high" | "medium" | "low" {
  const total = calculateTotal(segments);
  const nonZeroCount = Object.values(segments).filter(v => v > 0).length;
  
  if (total > 50000 && nonZeroCount >= 4) return "high";
  if (total > 20000 && nonZeroCount >= 3) return "medium";
  return "low";
}

/**
 * Cache management
 */
const CACHE_DIR = path.join(process.cwd(), "output", "market-share-cache");

export async function ensureCacheDir(): Promise<string> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  return CACHE_DIR;
}

export async function getCachedPDF(bank: string, reportType: string): Promise<string | null> {
  const cacheDir = await ensureCacheDir();
  const filename = `${bank.toLowerCase().replace(/\s+/g, '-')}-${reportType}.pdf`;
  const filepath = path.join(cacheDir, filename);
  
  try {
    await fs.access(filepath);
    // Check if file is less than 90 days old
    const stats = await fs.stat(filepath);
    const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
    
    if (ageInDays < 90) {
      console.log(`✅ Using cached PDF for ${bank} (${ageInDays.toFixed(0)} days old)`);
      return filepath;
    } else {
      console.log(`⚠️  Cached PDF for ${bank} is ${ageInDays.toFixed(0)} days old, will re-download`);
    }
  } catch {
    // File doesn't exist
  }
  
  return null;
}

export async function savePDFToCache(bank: string, reportType: string, pdfPath: string): Promise<void> {
  const cacheDir = await ensureCacheDir();
  const filename = `${bank.toLowerCase().replace(/\s+/g, '-')}-${reportType}.pdf`;
  const cachePath = path.join(cacheDir, filename);
  
  await fs.copyFile(pdfPath, cachePath);
  console.log(`💾 Cached PDF for ${bank}`);
}
