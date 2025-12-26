import { scrapeCombank } from "./scrapers/combank";

(async () => {
  console.log("Testing Commercial Bank scraper...\n");
  
  const rows = await scrapeCombank();
  const pensioner = rows.filter(r => r.product === "Pensioner Loan");
  const solar = rows.filter(r => r.product === "Solar Loan");
  
  console.log(`Total rows: ${rows.length}`);
  console.log(`Pensioner Loan rows: ${pensioner.length}`);
  console.log(`Solar Loan rows: ${solar.length}\n`);
  
  if (pensioner.length > 0) {
    console.log("Pensioner Loan samples:");
    pensioner.slice(0, 3).forEach(r => {
      console.log(`  ${r.tenureYears}y: ${r.rateWithSalary} (${r.type}) - ${r.notes}`);
    });
    console.log();
  }
  
  if (solar.length > 0) {
    console.log("Solar Loan samples:");
    solar.slice(0, 3).forEach(r => {
      console.log(`  ${r.tenureYears}y: ${r.rateWithSalary} (${r.type}) - ${r.notes}`);
    });
  }
})();
