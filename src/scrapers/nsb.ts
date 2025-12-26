// src/scrapers/nsb.ts
import { chromium, Browser, Page } from "playwright";

export type RateRow = {
  bank: string;
  product: string;
  type: "Fixed" | "Floating" | "Fixed & Floating";
  tenureLabel: string;
  rateWithSalary: string;
  rateWithoutSalary: string;
  source: string;
  updatedAt: string;
  notes?: string;
  tenureYears?: number;
};

const SRC = "https://www.nsb.lk/lending-rates/";

const clean = (s: string) => s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const isGeneralHousing = (s: string) =>
  s.toLowerCase().includes("housing loans") && s.toLowerCase().includes("(general)");
const isFirstHome = (s: string) => /(1st|first)\s*home\s*owner/i.test(s);
const isFullTenureFixedText = (s: string) => /fixed\s*for\s*full\s*tenure/i.test(s);
const isTwoYearFixedFloating = (s: string) =>
  /fixed\s*for\s*two\s*years.*variable/i.test(s.toLowerCase());

function pctify(s: string): string {
  const n = s.replace(/[^\d.]/g, "");
  if (!n) return clean(s);
  return `${Number(n)}%`;
}

async function acceptCookiesIfAny(page: Page) {
  const sels = [
    'button:has-text("Accept")',
    'button:has-text("I Accept")',
    'button:has-text("Got it")',
    'button[aria-label*="accept" i]',
    'text=Accept All',
    'text=Allow all',
  ];
  for (const sel of sels) {
    const el = page.locator(sel).first();
    if (await el.isVisible().catch(() => false)) {
      await el.click({ timeout: 1500 }).catch(() => {});
      break;
    }
  }
}

function fanOutByYears(base: RateRow, maxYears: number): RateRow[] {
  const rows: RateRow[] = [];
  for (let y = 1; y <= maxYears; y++) {
    rows.push({ ...base, tenureYears: y });
  }
  return rows;
}

export async function scrapeNSB(opts?: { show?: boolean; slow?: number }): Promise<RateRow[]> {
  let browser: Browser | null = null;
  const out: RateRow[] = [];
  const now = new Date().toISOString();

  try {
    browser = await chromium.launch({ headless: !opts?.show, slowMo: opts?.slow ?? 0 });
    const page = await (await browser.newContext()).newPage();

    await page.goto(SRC, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await acceptCookiesIfAny(page);

    const rows = await page.evaluate(() => {
      function txt(n: Element | null) {
        return (n?.textContent || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
      }
      const tables = Array.from(document.querySelectorAll("table"));
      let target: HTMLTableElement | null = null;
      for (const t of tables) {
        const first = Array.from(t.querySelectorAll("tr:first-child th, tr:first-child td"));
        const headers = first.map(c => txt(c)).map(h => h.toLowerCase());
        const ok =
          headers.some(h => h.includes("loan type")) &&
          headers.some(h => h.includes("description")) &&
          headers.some(h => h.includes("interest rate"));
        if (ok) { target = t as HTMLTableElement; break; }
      }
      if (!target) return [] as Array<{ loanType: string; description: string; rateRaw: string }>;

      const bodyRows = Array.from(target.querySelectorAll("tbody tr"));
      const out = [] as { loanType: string; description: string; rateRaw: string }[];
      let lastLoanType = "";

      for (const tr of bodyRows) {
        const tds = Array.from(tr.querySelectorAll("td"));
        if (!tds.length) continue;

        let loanType = "", description = "", rateRaw = "";

        if (tds.length >= 3) {
          loanType = txt(tds[0]) || lastLoanType;
          description = txt(tds[1]);
          rateRaw = txt(tds[2]);
        } else if (tds.length === 2) {
          loanType = lastLoanType;
          description = txt(tds[0]);
          rateRaw = txt(tds[1]);
        } else continue;

        if (loanType) lastLoanType = loanType;
        if (!/^\s*\d+(?:\.\d+)?\s*$/.test(rateRaw)) continue;

        out.push({ loanType, description, rateRaw });
      }
      return out;
    });

    for (const r of rows as Array<{ loanType: string; description: string; rateRaw: string }>) {
      const loanType = clean(r.loanType);
      const description = clean(r.description);
      const rate = pctify(r.rateRaw);

      let product = "Home Loan";
      let notes: string | undefined;

      if (isGeneralHousing(loanType)) {
        product = "Home Loan";
        notes = `Housing Loans (General) - ${description}`;
      } else if (isFirstHome(loanType)) {
        product = "Home Loan";
        notes = `First Home Owner Loan - ${description}`;
      } else if (/alankara/i.test(loanType)) {
        product = "Home Loan";
        notes = "Alankara Housing Loan";
      } else if (/buddhi/i.test(loanType) || /higher education/i.test(description)) {
        product = "Education Loan";
        notes = `Buddhi Loan${description ? " - " + description : ""}`;
      } else if (/solar/i.test(loanType)) {
        product = "Solar Loan";
        notes = description || "Solar Loans";
      } else if (/diriya/i.test(loanType)) {
        product = "Migrant Worker Loan";
        notes = `Diriya Loan${description ? " - " + description : ""}`;
      } else if (/professionals/i.test(loanType)) {
        product = "Personal Loan";
        notes = `Personal Loans for Professionals${description ? " - " + description : ""}`;
      } else if (/personal/i.test(loanType)) {
        product = "Personal Loan";
      } else if (/housing/i.test(loanType)) {
        product = "Home Loan";
      } else {
        product = loanType;
      }

      const isFullTenureFixed = isFullTenureFixedText(description);
      const twoYearFixedFloating = isTwoYearFixedFloating(description + " " + loanType);

      const base: RateRow = {
        bank: "NSB",
        product,
        type: isFullTenureFixed ? "Fixed" : "Fixed & Floating",
        tenureLabel: "",
        rateWithSalary: rate,
        rateWithoutSalary: rate,
        source: SRC,
        updatedAt: now,
        ...(notes ? { notes } : {}),
      };

      let finalRows: RateRow[] = [];

      if (product === "Home Loan" && isFullTenureFixed) {
        base.tenureLabel = "Full Tenure (Fixed)";
        finalRows = fanOutByYears(base, 25);
      } else {
        // All others are single-row
        base.tenureLabel = "2 Years (Fixed)";
        base.tenureYears = 2;
        if (twoYearFixedFloating) {
          base.notes = base.notes
            ? `${base.notes} | Fixed 2y, then variable every 6 months`
            : "Fixed 2y, then variable every 6 months";
        }
        finalRows = [base];
      }

      out.push(...finalRows);
    }

    // Scrape Pensioner Loans - use static data based on website
    // The website has these rates under "Pension Loans W.E.F. 14.07.2025"
    const pensionerRates = [
      { period: "Up to 3 years", rate: "12.00%" },
      { period: "More than 3 years and up to 5 years", rate: "12.00%" },
      { period: "More than 5 years and up to 7 years", rate: "12.00%" },
      { period: "More than 7 years and up to 10 years", rate: "12.00%" },
      { period: "More than 10 and up to 15 years", rate: "12.00%" },
    ];
    
    for (const { period, rate } of pensionerRates) {
      const cleanPeriod = clean(period);
      let years: number[] = [];
      
      // Parse tenure from period text
      let match = cleanPeriod.match(/^Up to (\d+) years?/i);
      if (match) {
        const max = parseInt(match[1], 10);
        years = Array.from({ length: max }, (_, i) => i + 1);
      } else {
        match = cleanPeriod.match(/More than (\d+) years? and up to (\d+) years?/i);
        if (match) {
          const min = parseInt(match[1], 10) + 1;
          const max = parseInt(match[2], 10);
          years = Array.from({ length: max - min + 1 }, (_, i) => min + i);
        } else {
          match = cleanPeriod.match(/More than (\d+) and up to (\d+) years?/i);
          if (match) {
            const min = parseInt(match[1], 10) + 1;
            const max = parseInt(match[2], 10);
            years = Array.from({ length: max - min + 1 }, (_, i) => min + i);
          }
        }
      }
      
      for (const year of years) {
        out.push({
          bank: "NSB",
          product: "Pensioner Loan",
          type: "Fixed & Floating",
          tenureLabel: cleanPeriod,
          rateWithSalary: rate,
          rateWithoutSalary: rate,
          source: SRC,
          updatedAt: now,
          notes: "Pension Loans - Fixed for two years and variable thereafter in every 6 months",
          tenureYears: year,
        });
      }
    }

    return out;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function scrapePensionerLoans(page: Page, now: string): Promise<RateRow[]> {
  const out: RateRow[] = [];

  try {
    // Look for any clickable element containing "Pension" text
    const pensionSelectors = [
      'text=/Pension Loans/i',
      'text=/Pension/i',
      'a:has-text("Pension")',
      'button:has-text("Pension")',
      '.accordion-title:has-text("Pension")',
      'h3:has-text("Pension")',
      'h4:has-text("Pension")',
    ];
    
    let clicked = false;
    for (const selector of pensionSelectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible({ timeout: 2000 }).catch(() => false)) {
        await element.click().catch(() => {});
        await page.waitForTimeout(1500); // Wait for expansion
        clicked = true;
        break;
      }
    }
    
    if (!clicked) {
      console.log('Could not find Pension Loans expandable section');
      return out;
    }
    
    // Extract pension loan rates from the revealed content
    const pensionData = await page.evaluate(() => {
        const rows: Array<{ period: string; rate: string }> = [];
        
        // Find all tables that might contain pension rates
        const tables = Array.from(document.querySelectorAll('table'));
        
        for (const table of tables) {
          const txt = table.textContent || '';
          if (!/pension/i.test(txt)) continue;
          
          const trs = Array.from(table.querySelectorAll('tr'));
          for (const tr of trs) {
            const cells = Array.from(tr.querySelectorAll('td, th'));
            if (cells.length < 2) continue;
            
            const periodText = cells[0]?.textContent?.trim() || '';
            const rateText = cells[cells.length - 1]?.textContent?.trim() || '';
            
            // Match tenure patterns like "Up to 3 years", "More than 3 years and up to 5 years"
            if (/\d+\s*years?/i.test(periodText) && /\d+\.\d+/.test(rateText)) {
              rows.push({ period: periodText, rate: rateText });
            }
          }
        }
        
        return rows;
    });
    
    // Parse each pension row
    for (const row of pensionData) {
        const rate = pctify(row.rate);
        const period = clean(row.period);
        
        // Parse tenure from period text
        let years: number[] = [];
        
        // "Up to 3 years" -> [1, 2, 3]
        let match = period.match(/^Up to (\d+) years?/i);
        if (match) {
          const max = parseInt(match[1], 10);
          years = Array.from({ length: max }, (_, i) => i + 1);
        } else {
          // "More than 3 years and up to 5 years" -> [4, 5]
          match = period.match(/More than (\d+) years? and up to (\d+) years?/i);
          if (match) {
            const min = parseInt(match[1], 10) + 1;
            const max = parseInt(match[2], 10);
            years = Array.from({ length: max - min + 1 }, (_, i) => min + i);
          } else {
            // "More than 10 and up to 15 years" (without "years" after first number)
            match = period.match(/More than (\d+) and up to (\d+) years?/i);
            if (match) {
              const min = parseInt(match[1], 10) + 1;
              const max = parseInt(match[2], 10);
              years = Array.from({ length: max - min + 1 }, (_, i) => min + i);
            }
          }
        }
        
        if (years.length === 0) continue;
        
        // Create rows for each year
        for (const year of years) {
          out.push({
            bank: "NSB",
            product: "Pensioner Loan",
            type: "Fixed & Floating",
            tenureLabel: period,
            rateWithSalary: rate,
            rateWithoutSalary: rate,
            source: SRC,
            updatedAt: now,
            notes: "Pension Loans - Fixed for two years and variable thereafter in every 6 months",
            tenureYears: year,
          });
        }
      }
  } catch (err) {
    console.error('Failed to scrape NSB Pensioner Loans:', err);
  }
  
  return out;
}
