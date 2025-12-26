/**
 * Test script to check product market share calculation
 */

import { calculateProductMarketShare } from "./src/utils/product-market-share";

async function test() {
  console.log("\n=== Testing Personal Loans (PL) ===\n");
  
  const result = await calculateProductMarketShare("PL");
  
  console.log(`\n📊 Results:`);
  console.log(`Total Market Size: ${result.totalMarketSize.toLocaleString()} million`);
  console.log(`Total Banks: ${result.banks.length}`);
  console.log(`\nTop Banks:`);
  
  result.banks.forEach((bank, i) => {
    console.log(`${i + 1}. ${bank.shortName}: ${bank.amount.toLocaleString()}M (${bank.marketShare.toFixed(1)}%)`);
  });
  
  const bocBank = result.banks.find(b => b.shortName === "BOC");
  if (bocBank) {
    console.log(`\n✅ BOC FOUND: ${bocBank.amount.toLocaleString()}M (${bocBank.marketShare.toFixed(1)}%)`);
  } else {
    console.log(`\n❌ BOC NOT FOUND`);
  }
}

test().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
