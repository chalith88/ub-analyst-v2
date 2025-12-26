import { scrapeDFCC } from "./scrapers/dfcc";

(async () => {
  const rows = await scrapeDFCC({ show: false, slow: 0 }); // headless mode
  console.log(`✅ Scraped ${rows.length} rows from DFCC`);
  console.log(JSON.stringify(rows, null, 2));
})();
