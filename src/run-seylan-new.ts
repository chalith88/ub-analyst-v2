import { scrapeSeylan } from "./scrapers/seylan";

(async () => {
  console.log("Testing Seylan Pensioner & Solar Loan scraper...\n");
  
  const rows = await scrapeSeylan();
  
  const pensioner = rows.filter(r => r.product === "Pensioner Loan");
  const solar = rows.filter(r => r.product === "Solar Loan");
  
  console.log(`Total rows scraped: ${rows.length}`);
  console.log(`Pensioner Loan rows: ${pensioner.length}`);
  console.log(`Solar Loan rows: ${solar.length}\n`);
  
  if (pensioner.length > 0) {
    console.log("Pensioner Loan rates:");
    pensioner.forEach(r => {
      console.log(`  ${r.tenureYears} year(s): ${r.rateWithSalary} (${r.type})`);
    });
    console.log();
  } else {
    console.log("⚠️  No Pensioner Loan rows found!\n");
  }
  
  if (solar.length > 0) {
    console.log("Solar Loan rates:");
    solar.forEach(r => {
      const withRate = (r as any).rateSolarWithCreditCardInternetBanking;
      const withoutRate = (r as any).rateSolarWithoutCreditCardInternetBanking;
      console.log(`  ${r.tenureYears} year(s): With CC&IB=${withRate}, Without CC&IB=${withoutRate}`);
    });
  } else {
    console.log("⚠️  No Solar Loan rows found!");
  }
})();
