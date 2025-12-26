// src/scrapers/cargills-tariff.ts
import { chromium, Page } from "playwright";
import fs from "fs/promises";
import path from "path";

export type TariffRow = {
  bank: string;
  product: "Home Loan" | "LAP" | "Personal Loan" | "Education Loan" | "Personal Loan - Pilots" | "Loan Against Property";
  feeCategory: "Processing Fee" | "Legal" | "Valuation" | "Early Settlement" | "Penal" | "Other";
  description?: string;
  amount: string;
  updatedAt: string;
  source: string;
  notes?: string;
};

export type Opts = { show?: string; slow?: string; save?: string };

const SRC = "https://www.cargillsbank.com/rates-and-charges/fees-charges/";
const BANK = "Cargills Bank";
const outDir = path.join(process.cwd(), "output");
const waiverNote = "50% waived for Salary Savings Account holders, subject to 1 Month Net Salary Remittance. 25% waived for Abhimani Account holders, who obtain loans for the purpose of education & wedding.";

const nowISO = () => new Date().toISOString();
const clean = (s: string) => s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

async function acceptCookies(page: Page, logs: string[]) {
  await page.evaluate(() => {
    try { localStorage.setItem("cookieConsent", "true"); } catch {}
    document.querySelectorAll(".cookie, .cookie-policy, .cookie-consent").forEach(e => e.remove());
  });
  logs.push("cookie: removed via JS");
}

async function extractPdfLines(pdfBuffer: Buffer): Promise<string[]> {
  // Parse PDF server-side using pdfjs-dist (legacy build for Node.js)
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  
  // Convert Buffer to Uint8Array
  const pdfData = new Uint8Array(pdfBuffer);
  
  // Load the PDF document
  const loadingTask = pdfjsLib.getDocument({ data: pdfData });
  const pdf = await loadingTask.promise;
  
  const all: { p: number; x: number; y: number; str: string }[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const pg = await pdf.getPage(p);
    const text = await pg.getTextContent();
    for (const it of text.items as any[]) {
      if ('str' in it && it.str) {
        const tr = it.transform || [1,0,0,1,0,0];
        const x = tr[4] ?? 0;
        const y = tr[5] ?? 0;
        const str = (it.str || "").replace(/\u00a0/g, " ");
        if (str.trim()) all.push({ p, x, y, str });
      }
    }
  }
  
  // Group into lines
  const out: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const items = all.filter(r => r.p === p).sort((a, b) => {
      if (Math.abs(b.y - a.y) > 2) return b.y - a.y;
      return a.x - b.x;
    });
    const lines: { y: number; chunks: string[] }[] = [];
    const TOL = 2.5;
    for (const it of items) {
      let bucket = lines.find(L => Math.abs(L.y - it.y) <= TOL);
      if (!bucket) {
        bucket = { y: it.y, chunks: [] };
        lines.push(bucket);
      }
      bucket.chunks.push(it.str);
    }
    for (const L of lines) {
      const line = L.chunks.join(" ").replace(/\s+/g, " ").trim();
      if (line) out.push(line);
    }
  }
  return out;
}

async function findTariffPdf(page: Page, logs: string[]): Promise<string> {
  await page.goto(SRC + "#Loans-and-Advances", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(500);
  let pdfUrl =
    (await page.locator("#Loans-and-Advances.tab-pane iframe[src*='.pdf']").first().getAttribute("src").catch(() => null)) ||
    (await page.locator("#Loans-and-Advances.tab-pane object[type='application/pdf']").first().getAttribute("data").catch(() => null)) ||
    (await page.locator("#Loans-and-Advances.tab-pane a[href$='.pdf']").first().getAttribute("href").catch(() => null)) ||
    null;
  if (!pdfUrl) throw new Error("PDF URL not found on Loans-and-Advances tab");
  if (pdfUrl.startsWith("/")) pdfUrl = "https://www.cargillsbank.com" + pdfUrl;
  logs.push(`pdf: resolved -> ${pdfUrl}`);
  return pdfUrl;
}

export async function scrapeCargillsTariff(opts: Opts = {}): Promise<TariffRow[]> {
  const logs: string[] = [];
  const browser = await chromium.launch({
    headless: !(opts.show === "true"),
    slowMo: opts.slow ? Number(opts.slow) : 0,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ]
  });
  
  const context = await browser.newContext({
    acceptDownloads: false,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
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
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'Asia/Colombo',
  });
  
  const page = await context.newPage();
  
  // Hide webdriver and automation indicators
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  });

  try {
    await page.goto(SRC, { waitUntil: "domcontentloaded", timeout: 30000 });
    await acceptCookies(page, logs);

    const pdfUrl = await findTariffPdf(page, logs);
    
    // Download PDF using Playwright's request context (not via page navigation)
    logs.push(`Downloading PDF from: ${pdfUrl}`);
    const pdfResponse = await context.request.get(pdfUrl);
    const pdfBuffer = await pdfResponse.body();
    logs.push(`Downloaded ${pdfBuffer.length} bytes`);
    
    // Parse PDF server-side
    const lines = await extractPdfLines(pdfBuffer);
    await fs.mkdir(outDir, { recursive: true });
    const numbered = lines.map((s, idx) => `${idx + 1}\t${s}`);
    await fs.writeFile(path.join(outDir, "cargills-tariff-ocr-lines.txt"), numbered.join("\n"), "utf8");

    const result: TariffRow[] = [];
    let section = "";
    let waiverForSection = false;

    for (let i = 0; i < lines.length; ++i) {
      const line = clean(lines[i]);

      // SECTION MARKERS
      if (/^3\s+Personal & Education Loans/i.test(line)) { section = "Personal & Education"; waiverForSection = true; continue; }
      if (/^4\s+Personal Loans.*Pilots/i.test(line)) { section = "Personal Loan - Pilots"; waiverForSection = true; continue; }
      if (/^5\s+Housing Loans/i.test(line)) { section = "Home Loan"; waiverForSection = false; continue; }
      if (/^6\s+Loan Against Property/i.test(line)) { section = "LAP"; waiverForSection = false; continue; }
      if (/^15\s+Legal Fee/i.test(line)) { section = "Legal Fee"; waiverForSection = false; continue; }
      if (/^7\s+Vehicle Loans/i.test(line)) { section = "Other"; waiverForSection = false; continue; }

      // --- Personal & Education Loans ---
      if (section === "Personal & Education") {
        if (/Loans up to 500K Per Event/i.test(line)) {
          for (const prod of ["Personal Loan", "Education Loan"] as const) {
            result.push({ bank: BANK, product: prod, feeCategory: "Processing Fee", description: "Loans up to 500K Per Event", amount: "5,000", updatedAt: nowISO(), source: pdfUrl, notes: waiverNote });
          } continue;
        }
        if (/Loans up to 7.5Mn Per Event/i.test(line)) {
          for (const prod of ["Personal Loan", "Education Loan"] as const) {
            result.push({ bank: BANK, product: prod, feeCategory: "Processing Fee", description: "Loans up to 7.5Mn Per Event", amount: "8,500", updatedAt: nowISO(), source: pdfUrl, notes: waiverNote });
          } continue;
        }
        if (/Loans above 7.5Mn Per Event/i.test(line)) {
          for (const prod of ["Personal Loan", "Education Loan"] as const) {
            result.push({ bank: BANK, product: prod, feeCategory: "Processing Fee", description: "Loans above 7.5Mn Per Event", amount: "12,500", updatedAt: nowISO(), source: pdfUrl, notes: waiverNote });
          } continue;
        }
        if (/early settlement fee.*within.*1 year/i.test(line)) {
          for (const prod of ["Personal Loan", "Education Loan"] as const) {
            result.push({ bank: BANK, product: prod, feeCategory: "Early Settlement", description: "within 1 year of granting the facility", amount: "5% or Min 10,000 whichever", updatedAt: nowISO(), source: pdfUrl, notes: waiverNote });
          } continue;
        }
        if (/early settlement fee.*after.*1 year/i.test(line)) {
          for (const prod of ["Personal Loan", "Education Loan"] as const) {
            result.push({ bank: BANK, product: prod, feeCategory: "Early Settlement", description: "after 1 year of granting the facility", amount: "4% or Min 10,000 whichever", updatedAt: nowISO(), source: pdfUrl, notes: waiverNote });
          } continue;
        }
        if (/default penalty charge/i.test(line)) {
          for (const prod of ["Personal Loan", "Education Loan"] as const) {
            result.push({ bank: BANK, product: prod, feeCategory: "Penal", description: "Default penalty charge Per Event", amount: "2% from the due amount", updatedAt: nowISO(), source: pdfUrl, notes: waiverNote });
          } continue;
        }
        continue;
      }

      // --- Personal Loan - Pilots ---
      if (section === "Personal Loan - Pilots") {
        if (/Loans up to 500K Per Event/i.test(line)) {
          result.push({ bank: BANK, product: "Personal Loan - Pilots", feeCategory: "Processing Fee", description: "Loans up to 500K Per Event", amount: "5,000", updatedAt: nowISO(), source: pdfUrl, notes: waiverNote }); continue;
        }
        if (/Loans up to 7.5Mn Per Event/i.test(line)) {
          result.push({ bank: BANK, product: "Personal Loan - Pilots", feeCategory: "Processing Fee", description: "Loans up to 7.5Mn Per Event", amount: "8,500", updatedAt: nowISO(), source: pdfUrl, notes: waiverNote }); continue;
        }
        if (/Loans above 7.5Mn Per Event/i.test(line)) {
          result.push({ bank: BANK, product: "Personal Loan - Pilots", feeCategory: "Processing Fee", description: "Loans above 7.5Mn Per Event", amount: "12,500", updatedAt: nowISO(), source: pdfUrl, notes: waiverNote }); continue;
        }
        if (/early settlement fee.*within.*1 year/i.test(line)) {
          result.push({ bank: BANK, product: "Personal Loan - Pilots", feeCategory: "Early Settlement", description: "within 1 year of granting the facility", amount: "4% or Min 10,000 whichever", updatedAt: nowISO(), source: pdfUrl, notes: waiverNote }); continue;
        }
        if (/early settlement fee.*after.*1 year/i.test(line)) {
          result.push({ bank: BANK, product: "Personal Loan - Pilots", feeCategory: "Early Settlement", description: "after 1 year of granting the facility", amount: "2% or Min 10,000 whichever", updatedAt: nowISO(), source: pdfUrl, notes: waiverNote }); continue;
        }
        if (/NO EARLY SETTLEMENT FEE/i.test(line)) {
          result.push({ bank: BANK, product: "Personal Loan - Pilots", feeCategory: "Early Settlement", description: "Salary Savings Account Holders", amount: "No Early Settlement Fee", updatedAt: nowISO(), source: pdfUrl, notes: waiverNote }); continue;
        }
        if (/default penalty charge/i.test(line)) {
          result.push({ bank: BANK, product: "Personal Loan - Pilots", feeCategory: "Penal", description: "Default penalty charge Per Event", amount: "2% from the due amount", updatedAt: nowISO(), source: pdfUrl, notes: waiverNote }); continue;
        }
        continue;
      }

      // --- Home Loan ---
      if (section === "Home Loan") {
        if (/Loan Amount 0.50%/i.test(line)) {
          // Wait for "Min Per Event 5,000" and "Max Per Event 100,000" for the next two lines
          if (
            i + 2 < lines.length &&
            /Min Per Event 5,000/i.test(lines[i + 1]) &&
            /Max Per Event 100,000/i.test(lines[i + 2])
          ) {
            result.push({
              bank: BANK,
              product: "Home Loan",
              feeCategory: "Processing Fee",
              description: "Processing Fee",
              amount: "0.50% (Min - 5,000 , Max - 100,000)",
              updatedAt: nowISO(),
              source: pdfUrl,
            });
            i += 2; // Skip next 2 lines
            continue;
          }
        }
        if (/early settlement fee.*within.*1 year/i.test(line)) {
          result.push({ bank: BANK, product: "Home Loan", feeCategory: "Early Settlement", description: "within 1 year of granting the facility", amount: "5%", updatedAt: nowISO(), source: pdfUrl, notes: "50% waived for Salary Savings Account holders" }); continue;
        }
        if (/early settlement fee.*after.*1 year/i.test(line)) {
          result.push({ bank: BANK, product: "Home Loan", feeCategory: "Early Settlement", description: "after 1 year of granting the facility", amount: "4%", updatedAt: nowISO(), source: pdfUrl, notes: "50% waived for Salary Savings Account holders" }); continue;
        }
        if (/default penalty charge/i.test(line)) {
          result.push({ bank: BANK, product: "Home Loan", feeCategory: "Penal", description: "Default penalty charge Per Event", amount: "2% from the due amount", updatedAt: nowISO(), source: pdfUrl }); continue;
        }
        if (/Stamp Duty Loan Amount/i.test(line)) {
          result.push({ bank: BANK, product: "Home Loan", feeCategory: "Other", description: "Stamp Duty Loan Amount", amount: "As per regulations", updatedAt: nowISO(), source: pdfUrl }); continue;
        }
        continue;
      }

      // --- Loan Against Property ---
      if (section === "LAP") {
        if (/Loans up to 5Mn Per Event/i.test(line)) {
          result.push({ bank: BANK, product: "Loan Against Property", feeCategory: "Processing Fee", description: "Loans up to 5Mn Per Event", amount: "0.5% Minimum 10,000", updatedAt: nowISO(), source: pdfUrl });
          continue;
        }
        if (/Processing Fee Loans up to 25Mn Per Event/i.test(line)) {
          result.push({ bank: BANK, product: "Loan Against Property", feeCategory: "Processing Fee", description: "Loans up to 25Mn Per Event", amount: "0.5% Minimum 10,000", updatedAt: nowISO(), source: pdfUrl });
          continue;
        }
        if (/Loans up to 50Mn Per Event/i.test(line)) {
          result.push({ bank: BANK, product: "Loan Against Property", feeCategory: "Processing Fee", description: "Loans up to 50Mn Per Event", amount: "0.5% Minimum 10,000", updatedAt: nowISO(), source: pdfUrl });
          continue;
        }
        if (/Loans up to 100Mn Per Event/i.test(line)) {
          result.push({ bank: BANK, product: "Loan Against Property", feeCategory: "Processing Fee", description: "Loans up to 100Mn Per Event", amount: "0.5% Minimum 10,000", updatedAt: nowISO(), source: pdfUrl });
          continue;
        }
        if (/early settlement fee.*within.*1 year/i.test(line)) {
          result.push({ bank: BANK, product: "Loan Against Property", feeCategory: "Early Settlement", description: "within 1 year of granting the facility", amount: "5%", updatedAt: nowISO(), source: pdfUrl, notes: "50% waived for Salary Savings Account holders" }); continue;
        }
        if (/early settlement fee.*after.*1 year/i.test(line)) {
          result.push({ bank: BANK, product: "Loan Against Property", feeCategory: "Early Settlement", description: "after 1 year of granting the facility", amount: "4%", updatedAt: nowISO(), source: pdfUrl, notes: "50% waived for Salary Savings Account holders" }); continue;
        }
        if (/default penalty charge/i.test(line)) {
          result.push({ bank: BANK, product: "Loan Against Property", feeCategory: "Penal", description: "Default penalty charge Per Event", amount: "2% from the due amount", updatedAt: nowISO(), source: pdfUrl }); continue;
        }
        if (/Stamp Duty \(Loans above 3Mn\) Loan Amount/i.test(line)) {
          result.push({ bank: BANK, product: "Loan Against Property", feeCategory: "Other", description: "Stamp Duty (Loans above 3Mn) Loan Amount", amount: "As per regulations", updatedAt: nowISO(), source: pdfUrl }); continue;
        }
        continue;
      }

      // --- Legal Fee for Home Loan & LAP ---
      if (section === "Legal Fee") {
        const LEGAL_PRODUCTS: TariffRow["product"][] = ["Home Loan", "Loan Against Property"];
        // Exclude "Vehicle Loans Per event"
        if (/15.3 Vehicle Loans Per event/i.test(line)) continue;
        if (/Up to 1,000,000 Per Event/i.test(line)) {
          for (const prod of LEGAL_PRODUCTS) result.push({ bank: BANK, product: prod, feeCategory: "Legal", description: "Up to 1,000,000 Per Event", amount: "1.50%", updatedAt: nowISO(), source: pdfUrl });
          continue;
        }
        if (/1,000,001 to Per Event/i.test(line)) {
          for (const prod of LEGAL_PRODUCTS) result.push({ bank: BANK, product: prod, feeCategory: "Legal", description: "1,000,001 to Per Event", amount: "1.00%", updatedAt: nowISO(), source: pdfUrl });
          continue;
        }
        if (/15.1 Property 5,000,001 to Per Event/i.test(line)) {
          for (const prod of LEGAL_PRODUCTS) result.push({ bank: BANK, product: prod, feeCategory: "Legal", description: "5,000,001 to Per Event", amount: "0.75%", updatedAt: nowISO(), source: pdfUrl });
          continue;
        }
        if (/25,000,001 to Per Event up to 25Mn/i.test(line)) {
          for (const prod of LEGAL_PRODUCTS) result.push({ bank: BANK, product: prod, feeCategory: "Legal", description: "25,000,001 to Per Event up to 25Mn", amount: "187,000 + 0.50%", updatedAt: nowISO(), source: pdfUrl });
          continue;
        }
        if (/Above 50,000,001 Per Event upto 50Mn/i.test(line)) {
          for (const prod of LEGAL_PRODUCTS) result.push({ bank: BANK, product: prod, feeCategory: "Legal", description: "Above 50,000,001 Per Event upto 50Mn", amount: "312,500 + 0.3%", updatedAt: nowISO(), source: pdfUrl });
          continue;
        }
        if (/15.2 Housing loans 75% of the amount to be/i.test(line)) {
          for (const prod of LEGAL_PRODUCTS) result.push({ bank: BANK, product: prod, feeCategory: "Legal", description: "Housing loans 75% of the amount to be", amount: "", updatedAt: nowISO(), source: pdfUrl });
          continue;
        }
        if (/15.4 Issuing certified copies Title deed/i.test(line)) {
          for (const prod of LEGAL_PRODUCTS) result.push({ bank: BANK, product: prod, feeCategory: "Legal", description: "Issuing certified copies Title deed", amount: "2,500", updatedAt: nowISO(), source: pdfUrl });
          continue;
        }
        if (/15.5 Issuing certified copies Survey plan/i.test(line)) {
          for (const prod of LEGAL_PRODUCTS) result.push({ bank: BANK, product: prod, feeCategory: "Legal", description: "Issuing certified copies Survey plan", amount: "500", updatedAt: nowISO(), source: pdfUrl });
          continue;
        }
        if (/15.6 Sending Letter of Demand/i.test(line)) {
          for (const prod of LEGAL_PRODUCTS) result.push({ bank: BANK, product: prod, feeCategory: "Legal", description: "Sending Letter of Demand", amount: "1,000", updatedAt: nowISO(), source: pdfUrl });
          continue;
        }
        if (/15.7 Court appearances by in house lawyers/i.test(line)) {
          for (const prod of LEGAL_PRODUCTS) result.push({ bank: BANK, product: prod, feeCategory: "Legal", description: "Court appearances by in house lawyers", amount: "3,000", updatedAt: nowISO(), source: pdfUrl });
          continue;
        }
        continue;
      }
    }

    if (opts.save === "true") {
      const outFile = path.join(outDir, "cargills-tariff.json");
      await fs.writeFile(outFile, JSON.stringify(result, null, 2), "utf8");
      logs.push(`save: ${outFile}`);
    }
    return result;
  } finally {
    await browser.close();
  }
}

// Execute if run directly
if (require.main === module) {
  console.log("Starting Cargills tariff scraper...");
  scrapeCargillsTariff({ save: "true" })
    .then(data => {
      console.log(`✅ Scraped ${data.length} tariff rows from Cargills Bank`);
      console.log(JSON.stringify(data, null, 2));
    })
    .catch(err => {
      console.error("❌ Error scraping Cargills tariff:", err);
      process.exit(1);
    });
}
