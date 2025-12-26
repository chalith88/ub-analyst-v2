import { scrapeSeylan } from "./scrapers/seylan";

(async () => {
  const rows = await scrapeSeylan();
  const solar = rows.filter(r => r.product === "Solar Loan");
  
  console.log("\nSolar Loan rows:");
  console.log(JSON.stringify(solar, null, 2));
})();
