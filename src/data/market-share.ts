/**
 * Market Share Data - Sri Lankan Banking Sector
 * Retail Asset Book Size (Loan Portfolio) by Bank
 * 
 * UPDATED: December 2024 with latest Q3 2024/H1 2024 data
 * Sources: Bank quarterly reports, annual reports, CSE filings
 * 
 * Methodology:
 * - Total retail lending = Housing + Personal + LAP + Education + Other consumer loans
 * - Excludes corporate/SME lending, overdrafts, trade finance
 * - Data extracted from Notes to Financial Statements (Loan Portfolio breakdown)
 */

export interface BankMarketShare {
  bank: string;
  shortName: string;
  fullName?: string;
  assetBookSize: number;  // LKR millions - RETAIL ONLY (Housing + Personal + LAP + Education + Special retail)
  marketShare: number;    // Percentage (calculated)
  segments: {
    housing: number;      // LKR millions - Housing/Home loans
    personal: number;     // LKR millions - Personal/Unsecured loans
    lap: number;          // LKR millions - Loan Against Property (NOT Leasing)
    education: number;    // LKR millions - Education loans
    solar: number;        // LKR millions - Solar loans (if separately disclosed)
    pensioner: number;    // LKR millions - Pensioner loans (if separately disclosed)
    migrant: number;      // LKR millions - Migrant worker loans (if separately disclosed)
    other: number;        // LKR millions - Other retail products
  };
  // Year-over-year comparison data (extracted from quarterly reports)
  previousYear?: {
    assetBookSize: number;
    segments: {
      housing?: number;
      personal?: number;
      lap?: number;
      education?: number;
    };
    date: string; // e.g., "2024-12-31"
  };
  // Detailed product breakdown (optional - when available from reports)
  detailedBreakdown?: {
    overdrafts?: number;
    termLoans?: number;
    leaseRentalsReceivable?: number;
    creditCards?: number;
    pawning?: number;
    housingLoans?: number;
    tradeFinance?: number;
    personalLoans?: number;
    staffLoans?: number;
    foreClosedProperties?: number;
  };
  lastUpdated: string;    // ISO date
  source: string;
  reportType: "Q3-2025" | "Q3-2024" | "Q2-2024" | "Annual-2024" | "Annual-2023";
  reportUrl?: string;
}

/**
 * Product-level market share data
 * Tracks market share for each loan product type across all banks
 */
export interface ProductMarketShare {
  product: 'HL' | 'PL' | 'LAP' | 'EL' | 'EDU';
  productName: string;
  totalMarketSize: number;  // LKR millions - sum across all banks
  banks: {
    bank: string;
    shortName: string;
    amount: number;         // LKR millions
    marketShare: number;    // Percentage of this product market
    lastUpdated: string;
    source: string;
    reportType: string;
    reportUrl?: string;
  }[];
  lastCalculated: string;   // ISO date when market share was calculated
}

/**
 * All figures in LKR millions
 * Latest available quarterly or annual report data
 */
export const MARKET_SHARE_DATA: BankMarketShare[] = [
  {
    bank: "Bank of Ceylon",
    shortName: "BOC",
    fullName: "Bank of Ceylon",
    assetBookSize: 1705125,  // Total local currency loans and advances (Sept 2025 - Page 18)
    marketShare: 0,
    segments: {
      housing: 66148,     // Housing loans (Sept 2025 - Page 18: "2 Loans and advances to customers - By product")
      personal: 363605,   // Personal loans (Sept 2025 - Page 18)
      lap: 0,            // Not separately disclosed in this report
      education: 0,       // Not separately disclosed in this report
      solar: 0,          // Not separately disclosed
      pensioner: 0,      // Not separately disclosed
      migrant: 0,        // Not separately disclosed
      other: 0           // Only counting explicitly disclosed retail products
    },
    // Full breakdown from Sept 2025 (Page 18)
    detailedBreakdown: {
      overdrafts: 131111,           // Local currency
      termLoans: 710113,            // Local currency
      leaseRentalsReceivable: 28502, // Lease rentals receivable (NOT retail)
      creditCards: 9621,            // Credit cards
      pawning: 209829,              // Pawning (NOT retail)
      housingLoans: 66148,          // Housing loans (RETAIL)
      tradeFinance: 65689,          // Trade finance (NOT retail)
      personalLoans: 363605,        // Personal loans (RETAIL)
      staffLoans: 31000,            // Staff loans
      foreClosedProperties: 1681,   // Foreclosed properties
      // Total local currency loans: 1,705,125 (from report: 1,705,124,546 thousands)
    },
    lastUpdated: "2025-09-30",
    source: "BOC Interim Financial Statements for nine-month period ended 30 September 2025 (Un-audited) - Page 18",
    reportType: "Q3-2025",
    reportUrl: "https://www.boc.lk/financial/document/99/download"
  },
  {
    bank: "People's Bank",
    shortName: "People's",
    fullName: "People's Bank",
    assetBookSize: 1475191,  // Total gross loans & advances (Sept 2025 - Product-wise breakdown)
    marketShare: 0,
    segments: {
      housing: 0,        // Not separately disclosed in product breakdown
      personal: 0,       // Not separately disclosed in product breakdown
      lap: 0,           // Not separately disclosed (Lease rentals shown but that's NOT Loan Against Property)
      education: 0,      // Not separately disclosed in product breakdown
      solar: 0,         // Not separately disclosed
      pensioner: 0,     // Not separately disclosed
      migrant: 0,       // Not separately disclosed
      other: 0          // Not separately disclosed
    },
    // Full product breakdown from Sept 2025
    detailedBreakdown: {
      overdrafts: 128023,           // Overdrafts (NOT retail)
      termLoans: 868941,            // Term loans (NOT retail)
      leaseRentalsReceivable: 28502, // Lease rentals receivable (NOT retail - this is leasing, not LAP)
      creditCards: 9765,            // Credit cards
      pawning: 355236,              // Pawning (NOT retail)
      tradeFinance: 86537,          // Trade Finance (NOT retail)
      // Note: Housing, Personal, LAP, Education loans not separately disclosed
      // Total: 1,475,191 (thousands in report shows 1,475,191,228)
    },
    lastUpdated: "2025-09-30",
    source: "People's Bank September 2025 Interim Financial Statements - Product-wise Gross loans & advances",
    reportType: "Q3-2025",
    reportUrl: "https://www.peoplesbank.lk/roastoth/2025/12/September-2025-WEB.pdf"
  },
  {
    bank: "Commercial Bank",
    shortName: "ComBank",
    fullName: "Commercial Bank of Ceylon PLC",
    assetBookSize: 1386436,  // Total gross loans & advances - Domestic Currency (Sept 2025: 1,386,435,733)
    marketShare: 0,
    segments: {
      housing: 82061,     // Housing loans (Sept 2025: 82,060,753)
      personal: 47813,    // Personal loans (Sept 2025: 47,812,663)
      lap: 0,            // Not separately disclosed (Lease rental shown but that's NOT LAP)
      education: 0,       // Not separately disclosed
      solar: 0,          // Not separately disclosed
      pensioner: 0,      // Not separately disclosed
      migrant: 0,        // Not separately disclosed
      other: 0           // Not separately disclosed
    },
    // Full product breakdown from Sept 2025
    detailedBreakdown: {
      overdrafts: 185674,           // Overdrafts: 185,673,752
      tradeFinance: 121973,         // Trade finance: 121,972,514
      leaseRentalsReceivable: 83117, // Lease rental receivable: 83,117,354 (NOT retail - leasing)
      creditCards: 22784,           // Credit cards: 22,783,932
      pawning: 59982,               // Pawning: 59,981,850
      staffLoans: 16239,            // Staff loans: 16,238,640
      housingLoans: 82061,          // Housing loans: 82,060,753 (RETAIL)
      personalLoans: 47813,         // Personal loans: 47,812,663 (RETAIL)
      termLoans: 766515,            // Term loans: 766,514,554
      // Bills of Exchange: 279,721
      // Subtotal: 1,386,435,733
    },
    lastUpdated: "2025-09-30",
    source: "Commercial Bank of Ceylon PLC Q3 2025 Interim Financials - Gross loans and advances (By product - Domestic Currency)",
    reportType: "Q3-2025",
    reportUrl: "https://www.combank.lk/info/file/310/for-the-nine-months-ended-30-09-2025"
  },
  {
    bank: "Hatton National Bank",
    shortName: "HNB",
    fullName: "Hatton National Bank",
    assetBookSize: 1185878,  // Total gross loans & advances (Sept 2025 - Product-wise breakdown: 1,185,878,005)
    marketShare: 0,
    segments: {
      housing: 66125,     // Housing loans (Sept 2025: 66,125,339)
      personal: 0,        // Not separately disclosed
      lap: 0,            // Not separately disclosed (Lease rentals shown but that's NOT LAP)
      education: 0,       // Not separately disclosed
      solar: 0,          // Not separately disclosed
      pensioner: 0,      // Not separately disclosed
      migrant: 0,        // Not separately disclosed
      other: 0           // Not separately disclosed
    },
    // Full product breakdown from Sept 2025
    detailedBreakdown: {
      overdrafts: 137252,           // Overdrafts: 137,252,331
      // Bills of exchange: 451,586
      // Commercial papers: 260,136
      creditCards: 23580,           // Credit Cards: 23,579,629
      // Trust receipts: 47,228,343
      // Packing credit loans: 12,226,183
      staffLoans: 23984,            // Staff loans: 23,983,705
      termLoans: 660156,            // Term loans: 660,156,216
      leaseRentalsReceivable: 111212, // Lease rentals receivable: 111,212,144
      housingLoans: 66125,          // Housing loans: 66,125,339 (RETAIL)
      pawning: 103402,              // Pawning advances: 103,402,393
      // Sub Total: 1,185,878,005
    },
    lastUpdated: "2025-09-30",
    source: "HNB Q3 2025 Interim Financial Report - Product-wise Gross loans and advances",
    reportType: "Q3-2025",
    reportUrl: "https://assets.hnb.lk/atdi/docs/pdfs/quarterly%20financial%20reports/2025/hnb-3q-2025-financials.pdf"
  },
  {
    bank: "Sampath Bank",
    shortName: "Sampath",
    fullName: "Sampath Bank PLC",
    assetBookSize: 986201,  // Total product-wise loans & advances - Local currency (Sept 2025)
    marketShare: 0,
    segments: {
      housing: 52862,     // Housing loans (Sept 2025: 52,862,290)
      personal: 0,        // Not separately disclosed (may be in Refinance loans)
      lap: 0,            // Not separately disclosed (Leasing shown but that's NOT LAP)
      education: 0,       // Not separately disclosed
      solar: 0,          // Not separately disclosed
      pensioner: 0,      // Not separately disclosed
      migrant: 0,        // Not separately disclosed
      other: 0           // Not separately disclosed
    },
    // Full product breakdown from Sept 2025
    detailedBreakdown: {
      // Bills of exchange: 189,737
      leaseRentalsReceivable: 47966, // Leasing: 47,965,584 (NOT retail - equipment/vehicle leasing)
      housingLoans: 52862,          // Housing loans: 52,862,290 (RETAIL)
      // Export loans: 5,218,688
      // Import loans: 135,669,723
      // Refinance loans: 5,392,988 (may include personal loans)
      termLoans: 437432,            // Term Loans - Long term: 432,156,655 + Short term: 5,275,927
      overdrafts: 115572,           // Overdraft: 115,571,992
      staffLoans: 13500,            // Staff loans: 13,500,131
      pawning: 98945,               // Pawning and gold loans: 98,945,319
      creditCards: 21616,           // Credit cards: 21,616,214
      // Money market loans: 49,658,311
      // Factoring: 2,175,040
      // Others: 2,690
      // Sub total: 986,201,298
    },
    lastUpdated: "2025-09-30",
    source: "Sampath Bank PLC Q3 2025 Financial Statements - Product-wise loans and advances (Local currency)",
    reportType: "Q3-2025",
    reportUrl: "https://www.sampath.lk/api/uploads/Sampath_Bank_PLC_Financial_Statements_30_09_2025_e5f8f969d2_b9f26ad064_70ea5b2c30.pdf"
  },
  {
    bank: "National Savings Bank",
    shortName: "NSB",
    assetBookSize: 540414, // Total gross loans & advances (LKR millions)
    marketShare: 0,
    segments: {
      // NO housing or personal loans separately disclosed in Q3 2025 report
      // Only product categories shown without retail breakdown
    },
    detailedBreakdown: {
      // Lease rental and hire purchase receivable: - (shown as dash, likely 0 or N/A)
      termLoans: 356808,
      pawning: 143306,
      loanToGovernment: 0, // Listed but no value shown
      securitiesPurchasedUnderResaleAgreements: 23626,
      staffLoans: 16674
      // Sub Total: 540,414,116 thousands
    },
    lastUpdated: "2025-09-30",
    source: "National Savings Bank Q3 2025 Interim Financial Statements - Product-wise Gross Loans and Advances",
    reportType: "Q3-2025",
    reportUrl: "https://www.nsb.lk/wp-content/uploads/2025/11/Interim-Financials-30.09.2025-Web-version.pdf"
  },
  {
    bank: "Seylan Bank",
    shortName: "Seylan",
    fullName: "Seylan Bank",
    assetBookSize: 462182,  // Total gross loans & advances - Local Currency (2024 Annual Report)
    marketShare: 0,
    segments: {
      housing: 16391,     // Housing Loans (2024: 16,390,682)
      personal: 0,        // Not separately disclosed (may be in Refinance Loans)
      lap: 0,            // Not separately disclosed (Lease Rentals shown but that's NOT LAP)
      education: 0,       // Not separately disclosed
      solar: 0,          // Not separately disclosed
      pensioner: 0,      // Not separately disclosed
      migrant: 0,        // Not separately disclosed
      other: 0           // Not separately disclosed
    },
    // Full product breakdown from 2024 Annual Report
    detailedBreakdown: {
      // Export Bills: 17,098
      // Import Bills: 103,767
      // Local Bills: 16,620
      leaseRentalsReceivable: 24800, // Lease Rentals Receivable: 24,799,910
      overdrafts: 56121,            // Overdrafts: 56,121,344
      // Revolving Import Loans: 15,998,123
      // Packing Credit Loans: 4,370,262
      staffLoans: 7516,             // Staff Loans: 7,516,072
      housingLoans: 16391,          // Housing Loans: 16,390,682 (RETAIL)
      pawning: 36449,               // Pawning Receivables: 36,448,577
      // Refinance Loans: 9,285,543 (may include personal loans)
      creditCards: 8571,            // Credit Cards: 8,571,125
      // Margin Trading: 9,643,481
      // Factoring: 1,667,480
      termLoans: 271232,            // Term Loans: 271,231,656
      // Total: 462,181,740 (thousands)
    },
    lastUpdated: "2024-12-31",
    source: "Seylan Bank 2024 Annual Report - Analysis of Gross Loans and Advances (25.1.1 by Product)",
    reportType: "Annual-2024",
    reportUrl: "https://www.seylan.lk/about-us/investor-relation?type=annual-report#flipbook-annual_report_2024/256/"
  },
  {
    bank: "National Development Bank",
    shortName: "NDB",
    fullName: "National Development Bank PLC",
    assetBookSize: 456179,  // Total product-wise gross loans & receivables - Domestic Currency (Sept 2025: 456,179,007)
    marketShare: 0,
    segments: {
      housing: 16893,     // Housing loans (Sept 2025: 16,893,114)
      personal: 57919,    // Consumer loans = Personal loans (Sept 2025: 57,919,078)
      lap: 0,            // Not separately disclosed (Lease rentals shown but that's NOT LAP)
      education: 0,       // Not separately disclosed
      solar: 0,          // Not separately disclosed
      pensioner: 0,      // Not separately disclosed
      migrant: 0,        // Not separately disclosed
      other: 0           // Not separately disclosed
    },
    // Full product breakdown from Sept 2025
    detailedBreakdown: {
      termLoans: 104222,            // Term loans: 104,222,145
      // Medium and short term loans: 93,375,376
      overdrafts: 66674,            // Overdrafts: 66,674,102
      tradeFinance: 28153,          // Trade Finance: 28,152,974
      // Consumer loans: 57,919,078 = Personal loans
      personalLoans: 57919,         // Consumer loans: 57,919,078 (RETAIL)
      leaseRentalsReceivable: 25576, // Lease rentals receivable and Hire Purchase: 25,575,747
      housingLoans: 16893,          // Housing loans: 16,893,114 (RETAIL)
      pawning: 26093,               // Pawning: 26,093,028
      // Islamic Banking facilities: 17,006,607
      creditCards: 8802,            // Credit cards: 8,801,925
      // AF Loans: 7,865,600
      staffLoans: 3599,             // Staff loans: 3,599,311
      // Sub total: 456,179,007
    },
    lastUpdated: "2025-09-30",
    source: "National Development Bank PLC Q3 2025 - Product wise Gross Loans and Receivables (Domestic Currency)",
    reportType: "Q3-2025",
    reportUrl: "https://ndbbankweb.ndbbank.com/downloads/2c3c6324-53a8-4e68-a957-83fbe044761b_pdf---22-pages---2.3mb.pdf"
  },
  {
    bank: "DFCC Bank",
    shortName: "DFCC",
    assetBookSize: 459130, // Total gross loans & advances (LKR millions)
    marketShare: 0,
    segments: {
      // NO housing or personal loans separately disclosed in Q3 2025 report
      // Only product categories shown without retail breakdown
    },
    detailedBreakdown: {
      overdrafts: 62130,
      tradeFinance: 57920,
      creditCards: 9347,
      pawning: 23444,
      staffLoans: 3760,
      termLoans: 267295,
      leaseRentalsReceivable: 35233
    },
    lastUpdated: "2025-09-30",
    source: "DFCC Bank Q3 2025 Interim Financial Statements - Gross Loans and Advances by Product",
    reportType: "Q3-2025",
    reportUrl: "https://properties.dfcc.lk/dfccweb/uploads/e2d9ca7d-c38a-4bb6-9e24-38e9abf09cc4/Interim-Financial-Statements-as-at-30.09.2025.pdf"
  },
  {
    bank: "Nations Trust Bank",
    shortName: "NTB",
    assetBookSize: 330873, // Total gross loans & advances (LKR millions)
    marketShare: 0,
    segments: {
      // NO housing or personal loans separately disclosed in Q3 2025 report
      // Only product categories shown without retail breakdown
    },
    detailedBreakdown: {
      billsOfExchange: 7,
      tradeFinance: 97856,
      overdrafts: 47446,
      termLoans: 125586,
      staffLoans: 4585,
      leaseRentalsReceivable: 28983,
      creditCards: 26153,
      pawning: 628,
      otherAdvances: 263
      // Sub total: 330,872,972 thousands
    },
    lastUpdated: "2025-09-30",
    source: "Nations Trust Bank Q3 2025 Interim Financial Statements - Product-wise Gross Loans and Advances",
    reportType: "Q3-2025",
    reportUrl: "https://www.nationstrust.com/images/pdf/financial-reports/2025-q3.pdf"
  },
  {
    bank: "Union Bank",
    shortName: "Union Bank",
    assetBookSize: 103236, // Total gross loans & advances (LKR millions)
    marketShare: 0,
    segments: {
      // NO housing or personal loans separately disclosed in Q3 2025 report
      // Only product categories shown without retail breakdown
    },
    detailedBreakdown: {
      termLoans: 67287,
      overdrafts: 13459,
      tradeFinance: 7603,
      leaseHirePurchase: 4856,
      factoring: 405,
      pawningGold: 4637,
      creditCards: 3828,
      staffLoans: 1161
    },
    lastUpdated: "2025-09-30",
    source: "Union Bank Q3 2025 Interim Financial Statements - Product-wise Gross Loans & Advances",
    reportType: "Q3-2025",
    reportUrl: "https://www.unionb.com/wp-content/uploads/2025/10/Interim-Financial-Statements-for-the-period-ended-30.09.2025.pdf"
  },
  {
    bank: "Amana Bank",
    shortName: "Amana",
    assetBookSize: 140338, // Total financing and receivables (LKR millions)
    marketShare: 0,
    segments: {
      // NO housing or personal loans separately disclosed in Q3 2025 report
      // Only product categories shown without retail breakdown
    },
    detailedBreakdown: {
      overdraft: 14296,
      tradeFinance: 7618,
      leaseReceivables: 14427,
      staffFacilities: 1626,
      termFinancing: 88136,
      goldFacilities: 13862,
      others: 371
      // Sub Total: 140,338,010 thousands
    },
    lastUpdated: "2025-09-30",
    source: "Amana Bank Q3 2025 Interim Financial Statements - Financing and Receivables by Product",
    reportType: "Q3-2025",
    reportUrl: "https://www.amanabank.lk/pdf/investor-relations/quarterly-financial-reports/amana-bank---interim-financial-statements-as-of-30-september-2025.pdf"
  },
  {
    bank: "Cargills Bank",
    shortName: "Cargills",
    assetBookSize: 59744, // Total gross loans & advances (LKR millions)
    marketShare: 0,
    segments: {
      housing: 1538, // Housing loans: 1,537,711 (RETAIL)
      personal: 3562, // Personal loans: 3,562,280 (RETAIL)
      lap: 1786      // Loans against property: 1,785,515 (RETAIL)
    },
    detailedBreakdown: {
      overdrafts: 7923,
      tradeFinance: 5663,
      housingLoans: 1538,
      personalLoans: 3562,
      staffLoans: 484,
      termLoans: 24486,
      loansAgainstProperty: 1786,
      agricultureLoans: 801,
      moneyMarketLoans: 10203,
      vehicleLoans: 665,
      creditCards: 1745,
      microFinance: 86,
      others: 804
      // Sub total: 59,744,013 thousands
    },
    lastUpdated: "2025-09-30",
    source: "Cargills Bank Q3 2025 Interim Financial Statements - Product wise Gross Loans and Advances",
    reportType: "Q3-2025",
    reportUrl: "https://www.cargillsbank.com/investor-relations/interim-reports/"
  }
];

/**
 * Calculate market share percentages
 */
export function calculateMarketShare(): BankMarketShare[] {
  const totalMarket = MARKET_SHARE_DATA.reduce((sum, bank) => sum + bank.assetBookSize, 0);
  
  return MARKET_SHARE_DATA.map(bank => ({
    ...bank,
    marketShare: (bank.assetBookSize / totalMarket) * 100
  })).sort((a, b) => b.assetBookSize - a.assetBookSize);
}

/**
 * Get market share by product segment
 */
export function getSegmentShare(segment: keyof BankMarketShare['segments']) {
  const totalSegment = MARKET_SHARE_DATA.reduce((sum, bank) => sum + bank.segments[segment], 0);
  
  return MARKET_SHARE_DATA.map(bank => ({
    bank: bank.shortName,
    fullName: bank.bank,
    amount: bank.segments[segment],
    share: (bank.segments[segment] / totalSegment) * 100
  })).sort((a, b) => b.amount - a.amount);
}

/**
 * Get top N banks by market share
 */
export function getTopBanks(limit = 13): BankMarketShare[] {
  return calculateMarketShare().slice(0, limit);
}

/**
 * Get total market size
 */
export function getTotalMarketSize() {
  const total = MARKET_SHARE_DATA.reduce((sum, bank) => sum + bank.assetBookSize, 0);
  const segments = {
    housing: MARKET_SHARE_DATA.reduce((sum, bank) => sum + bank.segments.housing, 0),
    personal: MARKET_SHARE_DATA.reduce((sum, bank) => sum + bank.segments.personal, 0),
    lap: MARKET_SHARE_DATA.reduce((sum, bank) => sum + bank.segments.lap, 0),
    education: MARKET_SHARE_DATA.reduce((sum, bank) => sum + bank.segments.education, 0),
    other: MARKET_SHARE_DATA.reduce((sum, bank) => sum + bank.segments.other, 0),
  };

  return {
    total,
    totalFormatted: `LKR ${(total / 1000).toFixed(1)}B`,
    segments,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Get market concentration metrics
 */
export function getMarketConcentration() {
  const banksWithShare = calculateMarketShare();
  
  // Herfindahl-Hirschman Index
  const hhi = banksWithShare.reduce((sum, bank) => sum + Math.pow(bank.marketShare, 2), 0);
  
  // Concentration ratios
  const cr3 = banksWithShare.slice(0, 3).reduce((sum, bank) => sum + bank.marketShare, 0);
  const cr5 = banksWithShare.slice(0, 5).reduce((sum, bank) => sum + bank.marketShare, 0);
  
  return {
    hhi: Math.round(hhi),
    hhiInterpretation: hhi < 1500 ? "Competitive" : hhi < 2500 ? "Moderately Concentrated" : "Highly Concentrated",
    cr3: parseFloat(cr3.toFixed(1)),
    cr3Banks: banksWithShare.slice(0, 3).map(b => b.shortName),
    cr5: parseFloat(cr5.toFixed(1)),
    cr5Banks: banksWithShare.slice(0, 5).map(b => b.shortName),
  };
}
