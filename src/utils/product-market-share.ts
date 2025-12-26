/**
 * Product Market Share Calculator
 * Calculates market share for specific loan products (HL, PL, LAP, EL)
 * across all banks based on their retail asset book segments
 */

import { type BankMarketShare, type ProductMarketShare } from '../data/market-share';
import { getMarketShareData } from '../scrapers/market-share-orchestrator';

type ProductKey = 'HL' | 'PL' | 'LAP' | 'EL' | 'EDU';

/**
 * Load market share data (uses orchestrator which handles scraping + fallback)
 */
async function loadMarketShareData(): Promise<BankMarketShare[]> {
  try {
    // Use the orchestrator which handles scraping and fallback automatically
    const data = await getMarketShareData(false);
    
    console.log(`\n🔍 loadMarketShareData: Received ${data.length} banks from orchestrator`);
    
    return data.map((bank: any) => {
      // Check if this is scraped data (in thousands) or static fallback (in millions)
      const isScrapedData = bank.source && !bank.source.includes('static fallback');
      const divider = isScrapedData ? 1000 : 1; // Convert thousands to millions only for scraped data
      
      const result: BankMarketShare = {
        bank: bank.bank,
        shortName: bank.shortName,
        assetBookSize: bank.assetBookSize,
        marketShare: bank.marketShare || 0,
        segments: {
          // Scraped data is in thousands (LKR '000), static data is in millions (LKR millions)
          housing: (bank.segments?.housing || 0) / divider,
          personal: (bank.segments?.personal || 0) / divider,
          lap: (bank.segments?.lap || 0) / divider,
          education: (bank.segments?.education || 0) / divider,
          solar: (bank.segments?.solar || 0) / divider,
          pensioner: (bank.segments?.pensioner || 0) / divider,
          migrant: (bank.segments?.migrant || 0) / divider,
          other: (bank.segments?.other || 0) / divider,
        },
        previousYear: bank.previousYear ? {
          assetBookSize: bank.previousYear.assetBookSize,
          segments: {
            housing: (bank.previousYear.segments?.housing || 0) / divider,
            personal: (bank.previousYear.segments?.personal || 0) / divider,
            lap: (bank.previousYear.segments?.lap || 0) / divider,
            education: (bank.previousYear.segments?.education || 0) / divider,
          },
          date: bank.previousYear.date,
        } : undefined,
        lastUpdated: bank.lastUpdated,
        source: bank.source,
        reportType: bank.reportType,
        reportUrl: bank.reportUrl,
        confidence: bank.confidence || 'high',
      };
      
      if (bank.shortName === 'BOC') {
        console.log(`\n📦 BOC Data Processing:`);
        console.log(`  Source: ${bank.source}`);
        console.log(`  Is Scraped: ${isScrapedData}`);
        console.log(`  Divider: ${divider}`);
        console.log(`  Raw housing: ${bank.segments?.housing}`);
        console.log(`  Raw personal: ${bank.segments?.personal}`);
        console.log(`  After division housing: ${result.segments.housing}`);
        console.log(`  After division personal: ${result.segments.personal}`);
      }
      
      return result;
    });
  } catch (error) {
    console.error('Error loading market share data:', error);
    // Final fallback to static data (already in millions)
    const { MARKET_SHARE_DATA } = require('../data/market-share');
    return MARKET_SHARE_DATA;
  }
}

const PRODUCT_NAMES: Record<ProductKey, string> = {
  HL: 'Housing Loans',
  PL: 'Personal Loans',
  LAP: 'Loan Against Property',
  EL: 'Education Loans',
  EDU: 'Education Loans',
};

const SEGMENT_MAP: Record<ProductKey, keyof BankMarketShare['segments']> = {
  HL: 'housing',
  PL: 'personal',
  LAP: 'lap',
  EL: 'education',
  EDU: 'education',
};

/**
 * Calculate market share for a specific product across all banks
 */
export async function calculateProductMarketShare(productKey: ProductKey): Promise<ProductMarketShare> {
  const segmentKey = SEGMENT_MAP[productKey];
  
  // Load market share data from orchestrator
  const MARKET_SHARE_DATA = await loadMarketShareData();
  
  console.log(`\n🔍 Product: ${productKey}, Segment: ${segmentKey}`);
  console.log(`📊 Loaded ${MARKET_SHARE_DATA.length} banks from orchestrator`);
  
  // Extract product amounts from each bank
  const bankAmounts = MARKET_SHARE_DATA.map(bank => {
    const amount = bank.segments[segmentKey];
    const previousAmount = bank.previousYear?.segments?.[segmentKey];
    
    if (bank.shortName === 'BOC' || bank.shortName === 'ComBank' || bank.shortName === 'NDB') {
      console.log(`\n📊 ${bank.shortName} - Product: ${productKey}`);
      console.log(`  Segment key: ${segmentKey}`);
      console.log(`  Segments:`, JSON.stringify(bank.segments));
      console.log(`  Amount: ${amount}`);
      if (previousAmount !== undefined) {
        console.log(`  Previous Year Amount: ${previousAmount}`);
        console.log(`  Growth: ${((amount - previousAmount) / previousAmount * 100).toFixed(2)}%`);
      }
    }
    
    return {
      bank: bank.bank,
      shortName: bank.shortName,
      amount: amount,
      previousAmount: previousAmount,
      previousYearDate: bank.previousYear?.date,
      lastUpdated: bank.lastUpdated,
      source: bank.source,
      reportType: bank.reportType,
      reportUrl: bank.reportUrl,
      confidence: bank.confidence || 'high',
    };
  });

  console.log(`\n💰 Bank amounts for ${productKey}:`);
  bankAmounts.forEach(b => {
    if (b.amount > 0 || b.shortName === 'BOC' || b.shortName === 'ComBank' || b.shortName === 'NDB') {
      console.log(`  ${b.shortName}: ${b.amount.toLocaleString()} millions`);
    }
  });

  // Calculate total market size for this product
  const totalMarketSize = bankAmounts.reduce((sum, b) => sum + b.amount, 0);

  // Filter out banks with zero amounts (no data available for this product)
  const banksWithData = bankAmounts.filter(b => b.amount > 0);
  
  console.log(`\n✅ Banks with data: ${banksWithData.length} (filtered from ${bankAmounts.length})`);
  console.log(`   Filtered banks:`, banksWithData.map(b => b.shortName).join(', '));
  
  // Recalculate total market size based on banks with data
  const totalMarketSizeWithData = banksWithData.reduce((sum, b) => sum + b.amount, 0);
  
  // Calculate each bank's market share
  const banksWithShare = banksWithData
    .map(b => {
      const marketShare = totalMarketSizeWithData > 0 ? (b.amount / totalMarketSizeWithData) * 100 : 0;
      
      // Calculate YoY growth if previous year data is available
      let growth = undefined;
      let growthPercentage = undefined;
      
      if (b.previousAmount !== undefined && b.previousAmount > 0) {
        growth = b.amount - b.previousAmount;
        growthPercentage = (growth / b.previousAmount) * 100;
      }
      
      return {
        ...b,
        marketShare,
        growth,
        growthPercentage,
      };
    })
    .sort((a, b) => b.amount - a.amount); // Sort by amount descending

  return {
    product: productKey,
    productName: PRODUCT_NAMES[productKey],
    totalMarketSize: totalMarketSizeWithData,
    banks: banksWithShare,
    lastCalculated: new Date().toISOString(),
  };
}

/**
 * Get market share for all products
 */
export async function getAllProductMarketShares(): Promise<ProductMarketShare[]> {
  const results = await Promise.all(
    ['HL', 'PL', 'LAP', 'EL'].map(key => 
      calculateProductMarketShare(key as ProductKey)
    )
  );
  return results;
}

/**
 * Get top N banks for a specific product
 */
export async function getTopBanksForProduct(productKey: ProductKey, limit: number = 5): Promise<ProductMarketShare> {
  const productData = await calculateProductMarketShare(productKey);
  return {
    ...productData,
    banks: productData.banks.slice(0, limit),
  };
}

/**
 * Format amount in billions with proper suffix
 */
export function formatAmount(millions: number): string {
  if (millions >= 1000) {
    return `LKR ${(millions / 1000).toFixed(1)}B`;
  }
  return `LKR ${millions.toFixed(0)}M`;
}
