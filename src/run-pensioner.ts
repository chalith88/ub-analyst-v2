import { scrapeHNB } from "./scrapers/hnb";

(async () => {
  console.log("Testing HNB Pensioner Loan scraper...\n");
  
  const rows = await scrapeHNB();
  const pensioner = rows.filter(r => r.product === "Pensioner Loan");
  
  console.log(`Total rows scraped: ${rows.length}`);
  console.log(`Pensioner Loan rows: ${pensioner.length}\n`);
  
  if (pensioner.length > 0) {
    console.log("Pensioner Loan rates:");
    pensioner.forEach(r => {
      console.log(`  ${r.tenureYears} year(s): ${r.rateWithSalary} (${r.type})`);
      if (r.notes) console.log(`    Notes: ${r.notes}`);
    });
  } else {
    console.log("No Pensioner Loan rows found!");
  }
})();
