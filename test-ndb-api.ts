import { scrapeNDB } from './src/scrapers/ndb';

async function test() {
  const rows = await scrapeNDB();
  
  // Filter to Solar and Pensioner
  const filtered = rows.filter(r => r.product === 'Solar Loan' || r.product === 'Pensioner Loan');
  
  console.log(`Found ${filtered.length} Solar/Pensioner rows`);
  console.log('\nFirst 3 rows:');
  filtered.slice(0, 3).forEach(r => {
    console.log(JSON.stringify({
      bank: r.bank,
      product: r.product,
      type: r.type,
      rateWithSalary: r.rateWithSalary,
      rateWithoutSalary: r.rateWithoutSalary,
      notes: r.notes,
      tenureYears: r.tenureYears,
    }, null, 2));
  });
}

test().catch(console.error);
