import { scrapeHNB } from "./scrapers/hnb";

(async () => {
  try {
    console.log("Starting HNB scraper...");
    const rows = await scrapeHNB({ show: false, slow: 0 });
    
    // Filter Solar Loan rows
    const solarRows = rows.filter(r => r.product === "Solar Loan");
    
    console.log(`✅ Scraped ${rows.length} total rows from HNB`);
    console.log(`   - Solar Loan rows: ${solarRows.length}`);
    
    if (solarRows.length > 0) {
      console.log("\nSolar Loan rates:");
      console.log(JSON.stringify(solarRows, null, 2));
    }
  } catch (error) {
    console.error("❌ Scraping failed:", error);
    process.exit(1);
  }
})();
