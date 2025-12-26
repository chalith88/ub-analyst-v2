// src/scrapers/cargills.ts
import { chromium, Browser, Page } from "playwright";
import type { RateRow } from "../types";

/** ------------------------------------------------------------------------
 * Cargills Bank – Lending Rates scraper
 * URL: https://www.cargillsbank.com/rates-and-charges/lending-rates/
 *
 * Banded schema (single row per tenure):
 *  rateWithSalaryAssignmentAbove300k
 *  rateWithSalaryRemittedAbove300k
 *  rateWithoutSalaryAbove300k
 *  rateWithSalaryAssignment150kTo299999
 *  rateWithSalaryRemitted150kTo299999
 *  rateWithoutSalary150kTo299999
 *  rateWithSalaryAssignmentUpTo149999
 *  rateWithSalaryRemittedUpTo149999
 *  rateWithoutSalaryUpTo149999
 *
 * Mapping (left→right sub-columns):
 *  Salary Assignment → rateWithSalaryAssignment<Band>
 *  Salary Remitted   → rateWithSalaryRemitted<Band>
 *  Standing Instruction → rateWithoutSalary<Band>
 *
 * Sections captured:
 *  • Home Loan (6M Var, 1y Fix, 3y Fix, 5y Fix)         → simple two-column mapping
 *  • LAP       (6M Var, 1y Fix, 3y Fix, 5y Fix)         → simple two-column mapping
 *  • Education Loan (01M Var, 6M Var, 1y Fix, 3y Fix, 5y Fix) → banded aggregate
 *  • Personal Loan – Employees / Professionals / Bankers Product → banded aggregate
 * ------------------------------------------------------------------------ */

const SRC = "https://www.cargillsbank.com/rates-and-charges/lending-rates/";
const BANK = "Cargills Bank";

type Opts = { show?: string; slow?: string; save?: string };

const nowISO = () => new Date().toISOString();
const clean = (s: string) => s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const pctRe = /(\d+(?:\.\d+)?)\s*%/;
const awplrRe = /\bAWP(?:LR)?\b/i;

/* ------------------------------ Types ------------------------------ */
type PdfItem = { str: string; x: number; y: number; w: number; h: number; page: number };

/* ------------------------------- row grouping ------------------------------ */
type Row = { y: number; cells: { x: number; str: string }[]; text: string };

function groupRows(items: PdfItem[], yTol = 2): Row[] {
  const byPage = new Map<number, PdfItem[]>();
  items.forEach((it) => {
    const arr = byPage.get(it.page) ?? [];
    arr.push(it);
    byPage.set(it.page, arr);
  });

  const rows: Row[] = [];
  for (const page of [...byPage.keys()].sort((a, b) => a - b)) {
    const arr = byPage.get(page)!.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    let cur: { y: number; cells: { x: number; str: string }[] } | null = null;
    for (const it of arr) {
      if (!cur || Math.abs(it.y - cur.y) > yTol) {
        if (cur)
          rows.push({
            y: cur.y,
            cells: cur.cells.sort((a, b) => a.x - b.x),
            text: clean(cur.cells.map((c) => c.str).join(" ")),
          });
        cur = { y: it.y, cells: [{ x: it.x, str: it.str }] };
      } else {
        cur!.cells.push({ x: it.x, str: it.str });
      }
    }
    if (cur)
      rows.push({
        y: cur.y,
        cells: cur.cells.sort((a, b) => a.x - b.x),
        text: clean(cur.cells.map((c) => c.str).join(" ")),
      });
  }
  return rows;
}

/* --------------------------------- utils ---------------------------------- */
function findRowIndex(rows: Row[], re: RegExp): number {
  return rows.findIndex((r) => re.test(r.text));
}
function sliceBetween(rows: Row[], start: number, end: number) {
  return rows.slice(start, end);
}
function betweenTitles(rows: Row[], title: RegExp, nextTitles: RegExp[]): Row[] {
  const i = findRowIndex(rows, title);
  if (i === -1) return [];
  const nextIdxs = nextTitles.map((re) => {
    const j = rows.slice(i + 1).findIndex((r) => re.test(r.text));
    return j === -1 ? Infinity : i + 1 + j;
  });
  const end = Math.min(...nextIdxs.filter((n) => Number.isFinite(n))) || rows.length;
  return sliceBetween(rows, i, end);
}

function yearsFromLabel(label: string): number | undefined {
  const m = label.match(/(\d+)\s*year/i);
  return m ? Number(m[1]) : undefined;
}

/** tenureCenters: X positions for tenure headers (used to bucket values by column) */
function tenureCenters(block: Row[], labels: string[]): number[] {
  const xs: number[] = [];
  for (const label of labels) {
    const re = new RegExp(label.replace(/\s+/g, "\\s+"), "i");
    let x: number | undefined;
    for (const r of block) {
      const c = r.cells.find((c) => re.test(c.str));
      if (c) {
        x = c.x;
        break;
      }
    }
    xs.push(x ?? NaN);
  }
  if (xs.some((v) => Number.isNaN(v))) {
    const minX = Math.min(...block.flatMap((r) => r.cells.map((c) => c.x)));
    const maxX = Math.max(...block.flatMap((r) => r.cells.map((c) => c.x)));
    const step = (maxX - minX) / (labels.length + 1);
    return labels.map((_, i) => minX + step * (i + 1));
  }
  return xs;
}

/** tokens left→right: percentages or AWPLR + margin expressions */
function tokensL2R(row: Row): { x: number; val: string }[] {
  const toks: { x: number; val: string }[] = [];
  const cells = row.cells;
  for (let i = 0; i < cells.length; i++) {
    const s = clean(cells[i].str);
    if (!s) continue;

    // Merge AWPLR + margin if split
    if (awplrRe.test(s)) {
      let j = i + 1;
      let merged = s;
      while (j < cells.length && !pctRe.test(merged) && (cells[j].str || "").length < 18) {
        merged = clean(merged + " " + cells[j].str);
        j++;
      }
      if (/\d+(?:\.\d+)?\s*%/.test(merged)) {
        toks.push({ x: cells[i].x, val: merged.replace(/\s+/g, " ").replace(/–/g, "-") });
        i = j - 1;
        continue;
      }
    }

    const m = s.match(pctRe);
    if (m) toks.push({ x: cells[i].x, val: `${m[1]}%` });
  }
  return toks.sort((a, b) => a.x - b.x);
}

function put(obj: any, k: string, v?: string) {
  if (v !== undefined && v !== null && v !== "") obj[k] = v;
}

/* -------------------------- band detection & helpers ----------------------- */
type BandSuffix = "Above300k" | "150kTo299999" | "UpTo149999";
const BAND_SUFFIXES: BandSuffix[] = ["Above300k", "150kTo299999", "UpTo149999"];
const SUBCOL_KEYS = ["rateWithSalaryAssignment", "rateWithSalaryRemitted", "rateWithoutSalary"] as const;

/** Normalize band text to improve matching (strip "/-" and collapse spaces) */
function normBandText(t: string): string {
  return t.replace(/\/-\b/g, "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

/** Robust generic band detector (Education + Employees + Bankers) */
function detectBand(txtRaw: string): BandSuffix | undefined {
  const t = normBandText(txtRaw);
  const c = t.replace(/\s+/g, "");

  // Above 300,000
  if (/\bSalary\s*(?:over|above)\s*(?:LKR\s*)?300[, ]?000\b/i.test(t) ||
      /Salary(?:over|above)LKR?300,?000\b/i.test(c)) return "Above300k";

  // Between 150,000 & 299,***
  if (/\bSalary\s*between\s*(?:LKR\s*)?150[, ]?000(?:\/-)?\s*(?:&|and|to|–|-)\s*(?:LKR\s*)?299[, ]?\d{3}(?:\/-)?\b/i.test(t) ||
      /SalarybetweenLKR?150,?000(?:\/-)?(?:&|and|to|–|-)?LKR?299,?\d{3}(?:\/-)?/i.test(c)) return "150kTo299999";

  // Up to / upto / up tp / below / less than 149,***
  const upWord = "(?:up\\s*(?:to|tp)|upto|below|less\\s*than)";
  if (new RegExp(`\\bSalary\\s*${upWord}\\s*(?:LKR\\s*)?149[, ]?\\d{3}(?:\\/-)?\\b`, "i").test(t) ||
      /Salary(?:upto|uptp|up(?:to|tp)|below|lessthan)LKR?149,?\d{3}(?:\/-)?/i.test(c)) return "UpTo149999";

  return undefined;
}

/** Look ahead a few rows after a band header to collect its values */
function collectBandValues(
  block: Row[],
  startIdx: number,
  labels: string[],
  centers: number[],
  maxLookahead = 4
): { buckets: { x: number; v: string }[][] } {
  const buckets: { x: number; v: string }[][] = labels.map(() => []);
  const end = Math.min(block.length, startIdx + 1 + maxLookahead);

  for (let rIdx = startIdx; rIdx < end; rIdx++) {
    const row = block[rIdx];
    if (rIdx !== startIdx && (detectBand(row.text) || detectBandProfessionals(row.text))) break;

    const toks = tokensL2R(row);
    if (!toks.length) continue;

    for (const t of toks) {
      let best = 0, bestd = Infinity;
      centers.forEach((cx, i) => {
        const d = Math.abs(t.x - cx);
        if (d < bestd) { bestd = d; best = i; }
      });
      buckets[best].push({ x: t.x, v: t.val });
    }

    if (buckets.every(arr => arr.length >= 3)) break;
  }

  return { buckets };
}

/** Ensure all 9 band keys exist on a row (fill missing with null for stable shape). */
function ensureAllBandKeys(row: any) {
  for (const band of BAND_SUFFIXES) {
    for (const base of SUBCOL_KEYS) {
      const k = `${base}${band}`;
      if (!(k in row)) row[k] = null;
    }
  }
}

/* ----------------- Professionals-specific band support --------------------- */
const PROF_BAND_SUFFIXES = ["Above500k", "300kTo499999", "150kTo299999"] as const;
type ProfBandSuffix = typeof PROF_BAND_SUFFIXES[number];

function detectBandProfessionals(txtRaw: string): ProfBandSuffix | undefined {
  const t = normBandText(txtRaw);
  const c = t.replace(/\s+/g, "");

  // Above 500,000
  if (/\bSalary\s*(?:over|above)\s*(?:LKR\s*)?500[, ]?000\b/i.test(t) ||
      /Salary(?:over|above)LKR?500,?000\b/i.test(c)) return "Above500k";

  // Between 300,000 & 499,***
  if (/\bSalary\s*between\s*(?:LKR\s*)?300[, ]?000(?:\/-)?\s*(?:&|and|to|–|-)\s*(?:LKR\s*)?499[, ]?\d{3}(?:\/-)?\b/i.test(t) ||
      /SalarybetweenLKR?300,?000(?:\/-)?(?:&|and|to|–|-)?LKR?499,?\d{3}(?:\/-)?/i.test(c)) return "300kTo499999";

  // Between 150,000 & 299,***
  if (/\bSalary\s*between\s*(?:LKR\s*)?150[, ]?000(?:\/-)?\s*(?:&|and|to|–|-)\s*(?:LKR\s*)?299[, ]?\d{3}(?:\/-)?\b/i.test(t) ||
      /SalarybetweenLKR?150,?000(?:\/-)?(?:&|and|to|–|-)?LKR?299,?\d{3}(?:\/-)?/i.test(c)) return "150kTo299999";

  return undefined;
}

function ensureAllBandKeysCustom(row: any, suffixes: readonly string[]) {
  for (const band of suffixes) {
    row[`rateWithSalaryAssignment${band}`] ??= null;
    row[`rateWithSalaryRemitted${band}`]   ??= null;
    row[`rateWithoutSalary${band}`]        ??= null;
  }
}

/* ---------------------- emitters (band aggregate rows) --------------------- */
/** Aggregate-banded rows (one object per tenure with all bands).
 *  Options let us override detector/suffixes for Professionals.
 */
function parseBandedBlockAggregate(
  block: Row[],
  product: RateRow["product"],
  labels: string[],
  types: ("Floating" | "Fixed")[],
  notes: string | undefined,
  opts?: {
    bandDetector?: (text: string) => string | undefined;
    suffixes?: readonly string[];
  }
): RateRow[] {
  const detector = opts?.bandDetector ?? detectBand;
  const suffixes = opts?.suffixes ?? BAND_SUFFIXES;

  const out: RateRow[] = [];
  const centers = tenureCenters(block, labels);

  const bandHeaderIdxs: { idx: number; band: string }[] = [];
  for (let i = 0; i < block.length; i++) {
    const b = detector(block[i].text);
    if (b) bandHeaderIdxs.push({ idx: i, band: b });
  }
  if (!bandHeaderIdxs.length) return out;

  const rowsMap = new Map<number, any>();
  const mkBase = (i: number) =>
    ({
      bank: BANK,
      product,
      type: types[i],
      tenureLabel: labels[i],
      source: SRC,
      updatedAt: nowISO(),
      notes,
      tenureYears: types[i] === "Fixed" ? yearsFromLabel(labels[i]) : undefined,
    } as any);

  for (const { idx, band } of bandHeaderIdxs) {
    const { buckets } = collectBandValues(block, idx, labels, centers, 4);
    for (let i = 0; i < labels.length; i++) {
      const row = rowsMap.get(i) ?? mkBase(i);
      const vals = buckets[i].sort((a, b) => a.x - b.x).map((b) => b.v).slice(0, 3);
      if (vals[0]) row[`rateWithSalaryAssignment${band}`] = vals[0];
      if (vals[1]) row[`rateWithSalaryRemitted${band}`]   = vals[1];
      if (vals[2]) row[`rateWithoutSalary${band}`]        = vals[2];
      rowsMap.set(i, row);
    }
  }

  for (let i = 0; i < labels.length; i++) {
    const row = rowsMap.get(i) ?? mkBase(i);
    ensureAllBandKeysCustom(row, suffixes);
    out.push(row as RateRow);
  }

  return out;
}

/* ------------------ Bankers-only: map to WITHOUT-SALARY keys --------------- */
/** For Bankers Product: every band value is a "without salary" rate.
 * We emit ONLY:
 *   - rateWithoutSalaryAbove300k
 *   - rateWithoutSalary150kTo299999
 *   - rateWithoutSalaryUpTo149999
 */
function parseBankersBlockAggregate(
  block: Row[],
  product: RateRow["product"],
  labels: string[],
  types: ("Floating" | "Fixed")[],
  notes: string | undefined
): RateRow[] {
  const out: RateRow[] = [];
  const centers = tenureCenters(block, labels);

  const bandHeaderIdxs: { idx: number; band: BandSuffix }[] = [];
  for (let i = 0; i < block.length; i++) {
    const b = detectBand(block[i].text);
    if (b) bandHeaderIdxs.push({ idx: i, band: b });
  }
  if (!bandHeaderIdxs.length) return out;

  const rowsMap = new Map<number, any>();
  const mkBase = (i: number) =>
    ({
      bank: BANK,
      product,
      type: types[i],
      tenureLabel: labels[i],
      source: SRC,
      updatedAt: nowISO(),
      notes,
      tenureYears: types[i] === "Fixed" ? yearsFromLabel(labels[i]) : undefined,
    } as any);

  // Helper to ensure we always have the three without-salary keys
  function ensureBankersWithout(row: any) {
    for (const band of BAND_SUFFIXES) {
      const k = `rateWithoutSalary${band}`;
      if (!(k in row)) row[k] = null;
    }
  }

  for (const { idx, band } of bandHeaderIdxs) {
    const { buckets } = collectBandValues(block, idx, labels, centers, 4);
    for (let i = 0; i < labels.length; i++) {
      const row = rowsMap.get(i) ?? mkBase(i);
      const vals = buckets[i].sort((a, b) => a.x - b.x).map((b) => b.v);
      // pick the rightmost token (or the only token) as the "without salary" rate
      const v = vals.length >= 3 ? vals[2] : vals[vals.length - 1];
      if (v) row[`rateWithoutSalary${band}`] = v;
      rowsMap.set(i, row);
    }
  }

  for (let i = 0; i < labels.length; i++) {
    const row = rowsMap.get(i) ?? mkBase(i);
    ensureBankersWithout(row);
    out.push(row as RateRow);
  }
  return out;
}

/** Home/LAP simple (two columns) — unchanged */
function emitHomeOrLAPSimple(
  out: RateRow[],
  product: "Home Loan" | "LAP",
  block: Row[],
  labels: string[],
  types: ("Floating" | "Fixed")[]
) {
  const r = block.find((rw) => (rw.text.match(pctRe) || []).length >= 2);
  if (!r) return;

  const centers = tenureCenters(block, labels);
  const toks = tokensL2R(r);

  const buckets: { x: number; v: string }[][] = labels.map(() => []);
  for (const t of toks) {
    let best = 0, bestd = Infinity;
    centers.forEach((cx, idx) => {
      const d = Math.abs(t.x - cx);
      if (d < bestd) { bestd = d; best = idx; }
    });
    buckets[best].push({ x: t.x, v: t.val });
  }

  for (let i = 0; i < labels.length; i++) {
    const vs = buckets[i].sort((a, b) => a.x - b.x).map((b) => b.v);
    const row: any = {
      bank: BANK,
      product,
      type: types[i],
      tenureLabel: labels[i],
      source: SRC,
      updatedAt: nowISO(),
      tenureYears: types[i] === "Fixed" ? yearsFromLabel(labels[i]) : undefined,
    };
    if (vs.length >= 2) {
      put(row, "rateWithSalaryRemitted", vs[0]);
      put(row, "rateWithoutSalary",     vs[1]);
    } else if (vs.length === 1) {
      put(row, "rateWithSalaryRemitted", vs[0]);
    }
    out.push(row as RateRow);
  }
}

/* ------------------------------ main scrape ------------------------------- */
async function openBrowser(opts: Opts): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch({
    headless: !(opts.show === "true"),
    slowMo: opts.slow ? Number(opts.slow) : 0,
    args: [
      '--disable-blink-features=AutomationControlled', // Hide automation
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ]
  });
  const context = await browser.newContext({
    // Prevent PDF download prompts - treat PDFs as regular pages
    acceptDownloads: false,
    // Add realistic user agent
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    // Add comprehensive headers to mimic real browser
    extraHTTPHeaders: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
    },
    // Set realistic viewport
    viewport: { width: 1920, height: 1080 },
    // Set locale and timezone
    locale: 'en-US',
    timezoneId: 'Asia/Colombo',
  });
  const page = await context.newPage();
  
  // Hide webdriver and automation indicators
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'pdfViewerEnabled', { get: () => false });
    
    // Override the plugins array to look more real
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5]
    });
    
    // Override languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en']
    });
  });
  
  return { browser, page };
}

async function maybeSave(bank: string, data: any, save?: string) {
  if (save !== "true") return;
  const fs = await import("fs/promises");
  const path = await import("path");
  const outDir = path.join(process.cwd(), "output");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, `${bank.toLowerCase().replace(/\s+/g, "")}.json`), JSON.stringify(data, null, 2), "utf8");
}

/* ---------------------- Pensioner Loan Scraper (WiShrama) ------------------ */
/**
 * Scrape Cargills Bank Pensioner Loan (WiShrama) from product page.
 * Static data based on website information:
 * - Interest Rate: 15.00% fixed
 * - Max Tenure: 10 years
 * - Max Amount: LKR 5,000,000
 * URL: https://www.cargillsbank.com/products/wishrama-personal-loans/
 */
export async function scrapeCargillsPensionerLoan(opts: Opts = {}): Promise<RateRow[]> {
  const out: RateRow[] = [];
  const updatedAt = nowISO();
  const rate = "15.00%";
  const notes = "WiShrama Personal Loans - Pensioner Loan (Max: LKR 5,000,000)";
  const source = "https://www.cargillsbank.com/products/wishrama-personal-loans/";

  // Generate 10 rows (1-10 years) with same rate
  for (let year = 1; year <= 10; year++) {
    out.push({
      bank: BANK,
      product: "Pensioner Loan",
      type: "Fixed",
      tenureLabel: `${year} Year${year > 1 ? 's' : ''}`,
      tenureYears: year,
      rateWithSalary: rate,
      rateWithoutSalary: rate,
      source,
      updatedAt,
      notes,
    } as RateRow);
  }

  console.log(`Generated ${out.length} Pensioner Loan rows from Cargills`);
  return out;
}

/** Exported entry */
export async function scrapeCargills(opts: Opts = {}): Promise<RateRow[]> {
  const { browser, page } = await openBrowser(opts);
  
  try {
    // 1) Page → accept cookies if present
    console.log(`Navigating to ${SRC}...`);
    await page.goto(SRC, { waitUntil: "domcontentloaded", timeout: 45000 });
    console.log("Page loaded, handling cookies...");
    await page.evaluate(() => { try { (sessionStorage as any)["cookiePloicyShown"] = "yes"; } catch {} });
    const cookieBtn = page.locator("button.cookie-dismiss");
    if (await cookieBtn.count().then((n) => n > 0) && (await cookieBtn.first().isVisible().catch(() => false))) {
      await cookieBtn.first().click().catch(() => {});
      console.log("Cookie banner dismissed");
    } else {
      console.log("No cookie banner found");
    }

    // 2) Get embedded PDF URL from <object type="application/pdf" data="...">
    console.log("Waiting for PDF object to load...");
    await page.waitForTimeout(2000); // Give page time to fully load
    
    const obj = page.locator('object[type="application/pdf"]');
    const objCount = await obj.count();
    console.log(`Found ${objCount} PDF objects`);
    
    if (objCount === 0) {
      const fs = require('fs');
      const html = await page.content();
      fs.writeFileSync('tmp/cargills-debug.html', html);
      console.log("Page content saved to tmp/cargills-debug.html");
      throw new Error("No PDF object found on page");
    }
    
    await obj.first().waitFor({ state: "visible", timeout: 30000 });
    let pdfUrl = await obj.first().getAttribute("data");
    if (!pdfUrl) throw new Error("Embedded PDF URL not found");
    console.log(`Found PDF URL: ${pdfUrl}`);
    
    // Convert relative URL to absolute
    if (pdfUrl.startsWith('/')) {
      const baseUrl = new URL(SRC);
      pdfUrl = `${baseUrl.protocol}//${baseUrl.host}${pdfUrl}`;
    }
    
    // 3) Download PDF using Playwright's request context (not via page navigation)
    console.log(`Downloading PDF from: ${pdfUrl}`);
    const pdfResponse = await page.context().request.get(pdfUrl);
    const pdfBuffer = await pdfResponse.body();
    console.log(`Downloaded ${pdfBuffer.length} bytes`);
    
    // 4) Parse PDF server-side using pdfjs-dist (legacy build for Node.js)
    console.log("Parsing PDF with pdfjs-dist...");
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    
    // Convert Buffer to Uint8Array
    const pdfData = new Uint8Array(pdfBuffer);
    
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    const pdfDoc = await loadingTask.promise;
    console.log(`PDF loaded: ${pdfDoc.numPages} pages`);
    
    // Extract text items with coordinates from all pages
    const allItems: PdfItem[] = [];
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      for (const item of textContent.items) {
        if ('str' in item && item.str.trim()) {
          allItems.push({
            str: item.str,
            x: item.transform[4],
            y: item.transform[5],
            w: item.width,
            h: item.height,
            page: pageNum
          });
        }
      }
    }
    
    console.log(`Extracted ${allItems.length} text items from PDF`);
    
    // 5) Process the extracted items (same as before)
    const rows = groupRows(allItems);
    console.log(`Grouped into ${rows.length} rows`);
    
    const out: RateRow[] = [];
    
    // Define section titles
    const tHome = /Housing Loans Rates/i;
    const tLap  = /Loan against property rates/i;
    const tEdu  = /Education Loan Rates/i;
    const tPLCorp = /Personal Loans\s*-\s*Employees of (?:Large|Diversified|Large\/Diversified)\s*Corporates.*including\s*Cargills\s*Group\s*staff\s*\(Excluding Bank staff\)/i;
    const tPLProf = /Personal Loans\s*-\s*Professionals.*Engineers.*Doctors.*Accountants.*Architects.*Pilots/i;
    const tPLBankers = /Personal Loans\s*-\s*(?:General Product|Bankers Product)/i;
    
    const allTitles = [tHome, tLap, tEdu, tPLCorp, tPLProf, tPLBankers];
    
    // Column labels and types
    const HL_LAP_LABELS = ["6 Months Variable", "1 year Fixed", "3 year Fixed", "5 Year Fixed"];
    const HL_LAP_TYPES: ("Floating" | "Fixed")[] = ["Floating", "Fixed", "Fixed", "Fixed"];
    
    const EDU_PL_LABELS = ["01 Month Variable", "6 Months Variable", "1 year Fixed", "3 year Fixed", "5 Year Fixed"];
    const EDU_PL_TYPES: ("Floating" | "Fixed")[] = ["Floating", "Floating", "Fixed", "Fixed", "Fixed"];
    
    // Parse Home Loan (simple two-column)
    {
      const block = betweenTitles(rows, tHome, allTitles.filter((r) => r !== tHome));
      emitHomeOrLAPSimple(out, "Home Loan", block, HL_LAP_LABELS, HL_LAP_TYPES);
    }
    
    // Parse LAP (simple two-column)
    {
      const block = betweenTitles(rows, tLap, allTitles.filter((r) => r !== tLap));
      emitHomeOrLAPSimple(out, "LAP", block, HL_LAP_LABELS, HL_LAP_TYPES);
    }
    
    // Parse Education Loan (banded aggregate)
    {
      const block = betweenTitles(rows, tEdu, allTitles.filter((r) => r !== tEdu));
      out.push(...parseBandedBlockAggregate(block, "Education Loan", EDU_PL_LABELS, EDU_PL_TYPES, "Education Loan Rates"));
    }
    
    // Parse Personal Loan - Employees (banded aggregate)
    {
      const block = betweenTitles(rows, tPLCorp, allTitles.filter((r) => r !== tPLCorp));
      out.push(...parseBandedBlockAggregate(
        block,
        "Personal Loan",
        EDU_PL_LABELS,
        EDU_PL_TYPES,
        "Employees of Large/Diversified Corporates (incl. Cargills Group staff, excluding bank staff)"
      ));
    }
    
    // Parse Personal Loan - Professionals (banded aggregate with custom bands)
    {
      const block = betweenTitles(rows, tPLProf, allTitles.filter((r) => r !== tPLProf));
      out.push(...parseBandedBlockAggregate(
        block,
        "Personal Loan",
        EDU_PL_LABELS,
        EDU_PL_TYPES,
        "Professionals (Engineers, Doctors, Accountants, Architects, Pilots)",
        {
          bandDetector: detectBandProfessionals,
          suffixes: PROF_BAND_SUFFIXES,
        }
      ));
    }
    
    // Parse Personal Loan - Bankers Product (only without-salary keys)
    {
      const block = betweenTitles(rows, tPLBankers, allTitles.filter((r) => r !== tPLBankers));
      if (block.length) {
        out.push(...parseBankersBlockAggregate(block, "Personal Loan", EDU_PL_LABELS, EDU_PL_TYPES, "Bankers Product"));
      }
    }
    
    // De-duplicate exact objects
    const seen = new Set<string>();
    const data = out.filter((r) => {
      const k = JSON.stringify(r);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    
    console.log(`Scraped ${data.length} rate rows from Cargills`);
    await maybeSave(BANK, data, opts.save);
    return data;
    
  } catch (err: any) {
    console.error("Error scraping Cargills:", err.message || err);
    throw err;
  } finally {
    await browser.close();
  }
}

// Execute if run directly
if (require.main === module) {
  console.log("Starting Cargills scraper...");
  scrapeCargills({ show: "true", save: "true", slow: "500" })
    .then(data => {
      console.log(`Scraped ${data.length} rows from Cargills Bank`);
      console.log(JSON.stringify(data, null, 2));
    })
    .catch(err => {
      console.error("Error scraping Cargills:", err);
      process.exit(1);
    });
}
