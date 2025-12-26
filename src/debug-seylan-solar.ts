import { chromium } from "playwright";
import { acceptAnyCookie } from "./utils/dom";
import { clean } from "./utils/text";

const URL = "https://www.seylan.lk/interest-rates";

async function clickMenuItemById(page: any, id: string) {
  const link = page.locator(`li#${id} a`);
  await link.scrollIntoViewIfNeeded().catch(() => {});
  await link.click({ timeout: 10000, force: true });
  await page.waitForTimeout(250);
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await acceptAnyCookie(page);

  // Open Loans & Advances
  await page.locator('text=Loans & Advances Rates').first().click({ timeout: 20000 }).catch(async () => {
    await page.locator('xpath=//a[contains(.,"Loans & Advances Rates")]').first().click({ timeout: 20000, force: true });
  });
  await page.waitForSelector("text=Loans and Advances", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(250);

  // Click Solar Loan
  await clickMenuItemById(page, "solarloan");
  await page.waitForTimeout(1000);

  // Find table
  const tables = await page.locator("table").all();
  console.log(`Found ${tables.length} tables`);

  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    try {
      const headerRows = await t.locator("thead tr").all();
      console.log(`\nTable ${i} has ${headerRows.length} header rows`);
      
      for (let j = 0; j < headerRows.length; j++) {
        const headers = (await headerRows[j].locator("th").allTextContents()).map((s) => clean(s));
        console.log(`  Header row ${j}:`, headers);
      }

      const headers = (await t.locator("thead tr th").allTextContents()).map((s) => clean(s));
      const headersLower = headers.map(h => h.toLowerCase());
      const idxWith = headersLower.findIndex((h) => /with.*credit.*card.*internet/.test(h));
      const idxWithout = headersLower.findIndex((h) => /without.*credit.*card.*internet/.test(h));

      console.log(`  idxWith: ${idxWith}, idxWithout: ${idxWithout}`);

      // Get first data row
      const firstRow = await t.locator("tbody tr").first();
      const tds = (await firstRow.locator("td").allTextContents()).map(clean);
      console.log(`  First row data:`, tds);
    } catch (e) {
      console.log(`  Error reading table ${i}`);
    }
  }

  await page.waitForTimeout(5000);
  await browser.close();
})();
