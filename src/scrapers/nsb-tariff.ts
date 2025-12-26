// src/scrapers/nsb-tariff.ts
// NSB Tariff Scraper - Server-side PDF parsing with pdfjs-dist

const BANK = "NSB";
const PDF_URL = "https://www.nsb.lk/wp-content/uploads/2022/08/New-Fee-Based-Income.pdf";

interface FeeRow {
  bank: string;
  product: string;
  feeType: string;
  description: string;
  amount: string;
  note?: string;
  updatedAt: string;
  source: string;
}

/** Utility: Clean text */
function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Utility: Group lines by Y-coordinate */
function groupLinesByY(items: any[], yTolerance = 2): string[] {
  const groups: Map<number, string[]> = new Map();
  
  for (const item of items) {
    if (item.str && item.str.trim()) {
      const y = Math.round(item.transform[5] / yTolerance) * yTolerance;
      if (!groups.has(y)) {
        groups.set(y, []);
      }
      groups.get(y)!.push(item.str.trim());
    }
  }
  
  // Sort by Y coordinate (top to bottom) and join each line
  return Array.from(groups.entries())
    .sort((a, b) => b[0] - a[0]) // Descending Y (top to bottom)
    .map(([_, texts]) => texts.join(" "));
}

export async function scrapeNSBTariff(): Promise<FeeRow[]> {
  const rows: FeeRow[] = [];
  
  try {
    // Dynamic import for pdfjs-dist
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    
    // Fetch PDF
    const response = await fetch(PDF_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const pdfData = new Uint8Array(arrayBuffer);
    
    // Load PDF
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    const pdf = await loadingTask.promise;
    
    let allLines: string[] = [];
    
    // Extract text from all pages
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageLines = groupLinesByY(textContent.items);
      allLines = allLines.concat(pageLines);
    }
    
    // Process lines to extract fees
    const lines = allLines.map(l => clean(l)).filter(Boolean);

    
    // --- 1. Legal Fees - Rental / Lease Agreement ---
    for (let i = 0; i < lines.length; i++) {
      if (/Legal fees for Rental \/ Lease Agreement/i.test(lines[i])) {
        let description = lines[i];
        let j = i + 1;
        while (
          j < lines.length &&
          !/Rs\.?/i.test(lines[j]) &&
          !/Deed of Postponement/i.test(lines[j])
        ) {
          description += " " + lines[j];
          j++;
        }
        let amount = "";
        if (j < lines.length && /Rs\.?/i.test(lines[j])) {
          amount = lines[j].match(/Rs\.?\s?[\d,\/\-]+/)?.[0] || "";
        }
        description = clean(description);
        rows.push({
          bank: BANK,
          product: "Home Loan",
          feeType: "Legal Fees - Rental / Lease Agreement",
          description,
          amount,
          updatedAt: new Date().toISOString(),
          source: PDF_URL,
        });
        break;
      }
    }
    
    // --- 2. Legal Fees - Deed of Postponement ---
    for (let i = 0; i < lines.length; i++) {
      if (/Deed of Postponement/i.test(lines[i])) {
        let description = lines[i];
        let j = i + 1;
        while (
          j < lines.length &&
          !/Rs\.?/i.test(lines[j]) &&
          !/Charges on CRIB/i.test(lines[j])
        ) {
          description += " " + lines[j];
          j++;
        }
        let amount = "";
        if (j < lines.length && /Rs\.?/i.test(lines[j])) {
          amount = lines[j].match(/Rs\.?\s?[\d,\/\-]+/)?.[0] || "";
        }
        description = clean(description);
        rows.push({
          bank: BANK,
          product: "Home Loan",
          feeType: "Legal Fees - Deed of Postponement",
          description,
          amount,
          updatedAt: new Date().toISOString(),
          source: PDF_URL,
        });
        break;
      }
    }
    
    // --- 3. Processing Fees - CRIB Report (Home/Personal/Education Loan) ---
    for (let i = 0; i < lines.length; i++) {
      if (/Charges on CRIB report/i.test(lines[i])) {
        for (let j = 1; j <= 3 && i + j < lines.length; j++) {
          const subLine = lines[i + j];
          if (/retail/i.test(subLine)) {
            const amountMatch = subLine.match(/Rs\.?\s?[\d,]+/i);
            if (amountMatch) {
              let amount = amountMatch[0].replace(/\s+/g, "");
              if (!amount.endsWith("/-")) amount += "/-";
              ["Home Loan", "Personal Loan", "Education Loan"].forEach((product) =>
                rows.push({
                  bank: BANK,
                  product,
                  feeType: "Processing Fees - CRIB Report",
                  description: "CRIB report processing fee (Retail)",
                  amount,
                  updatedAt: new Date().toISOString(),
                  source: PDF_URL,
                })
              );
            }
          }
        }
        break;
      }
    }
    
    // --- 4. Early Settlement Charges (Home/Personal/Education Loan) ---
    for (let i = 0; i < lines.length; i++) {
      if (/Early settlement charges/i.test(lines[i])) {
        const line = lines[i];
        const percMatch = line.match(/(\d+\.\d+)%/);
        const amount = percMatch ? percMatch[0] : "5.00%";
        ["Home Loan", "Personal Loan", "Education Loan"].forEach((product) =>
          rows.push({
            bank: BANK,
            product,
            feeType: "Early Settlement Charges",
            description: "Early settlement charges",
            amount,
            updatedAt: new Date().toISOString(),
            source: PDF_URL,
          })
        );
        break;
      }
    }

    
    // --- 5. General Fees - Home Loan ---
    for (let i = 0; i < lines.length; i++) {
      if (/Obtaining deed settling of the housing loan/i.test(lines[i])) {
        let description = lines[i];
        let amount = "";
        for (let j = i; j < i + 4 && j < lines.length; j++) {
          const curr = lines[j];
          if (/Rs\./.test(curr) && /per year/i.test(curr)) {
            amount = curr.match(/Rs\.?\s?[\d,]+\/-?\s*per year/i)?.[0]
              || curr.match(/Rs\.?\s?[\d,]+.*per year/i)?.[0]
              || curr;
            break;
          } else if (/Rs\./.test(curr) && !amount) {
            amount = curr.match(/Rs\.?\s?[\d,]+/)?.[0] || "";
          }
          if (/months/i.test(curr)) {
            description += " " + curr;
          }
        }
        description = clean(description);
        rows.push({
          bank: BANK,
          product: "Home Loan",
          feeType: "General Fees",
          description,
          amount,
          updatedAt: new Date().toISOString(),
          source: PDF_URL,
        });
      }
      if (/Not obtaining loan in full/i.test(lines[i])) {
        let description = lines[i];
        let amount = description.match(/Rs\..*$/)?.[0] || "";
        if (!amount && i + 1 < lines.length) {
          amount = lines[i + 1].match(/Rs\..*$/)?.[0] || "";
        }
        description = description.replace(amount, "").trim();
        rows.push({
          bank: BANK,
          product: "Home Loan",
          feeType: "General Fees",
          description,
          amount,
          updatedAt: new Date().toISOString(),
          source: PDF_URL,
        });
      }
    }
    
    // --- 6. Legal Fees - Deed of Release ---
    for (let i = 0; i < lines.length; i++) {
      if (/Loan Balance upto/i.test(lines[i]) && /Rs\.\s?4,500/.test(lines[i])) {
        rows.push({
          bank: BANK,
          product: "Home Loan",
          feeType: "Legal Fees - Deed of Release",
          description: "Loan Balance upto Rs. 1 Mn",
          amount: "Rs. 4,500",
          updatedAt: new Date().toISOString(),
          source: PDF_URL,
        });
      }
      if (/Loan balance above Rs\.?1 Mn/i.test(lines[i]) && /Rs\.\s?9,000/.test(lines[i])) {
        rows.push({
          bank: BANK,
          product: "Home Loan",
          feeType: "Legal Fees - Deed of Release",
          description: "Loan balance above Rs.1 Mn",
          amount: "Rs. 9,000",
          updatedAt: new Date().toISOString(),
          source: PDF_URL,
        });
      }
    }
    
    // --- 7. Processing Fees - Government Housing Loan ---
    for (let i = 0; i < lines.length; i++) {
      if (/Government Housing Loan Processing Fee/i.test(lines[i])) {
        const amount = lines[i].match(/Rs\..*?\/-?/)?.[0] || "";
        rows.push({
          bank: BANK,
          product: "Home Loan",
          feeType: "Processing Fees - Government Housing Loan",
          description: "Government Housing Loan Processing Fee",
          amount,
          updatedAt: new Date().toISOString(),
          source: PDF_URL,
        });
      }
    }
    
    // --- 8. Processing Fees (Upto/Above 2.5Mn) ---
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/Upto Rs\./.test(l) && /Actual Cost/i.test(l)) {
        rows.push({
          bank: BANK,
          product: "Home Loan",
          feeType: "Processing Fees",
          description: "Upto Rs. 2,500,000/",
          amount: "Actual Cost",
          updatedAt: new Date().toISOString(),
          source: PDF_URL,
        });
      }
      if (/Above Rs\./.test(l) && /0\.5% of the loan/i.test(l)) {
        rows.push({
          bank: BANK,
          product: "Home Loan",
          feeType: "Processing Fees",
          description: "Above Rs. 2,500,000/",
          amount: "0.5% of the loan amount",
          updatedAt: new Date().toISOString(),
          source: PDF_URL,
        });
      }
    }
    
    // --- 9. Legal Fees - Cancellation of Mortgage bond ---
    for (let i = 0; i < lines.length; i++) {
      if (/Cancellation of Mortgage bond/i.test(lines[i])) {
        let description = lines[i];
        let amount = "";
        for (let j = i; j <= i + 2 && j < lines.length; j++) {
          const amtLine = lines[j];
          if (/Rs\./.test(amtLine)) {
            amount = amtLine.match(/Rs\..*?[\d,\/\-]+/)?.[0] || "";
          }
        }
        description = description.replace(/Rs\..*$/, "").trim();
        rows.push({
          bank: BANK,
          product: "Home Loan",
          feeType: "Legal Fees",
          description,
          amount,
          updatedAt: new Date().toISOString(),
          source: PDF_URL,
        });
      }
    }
    
    // --- 10. Processing Fees - Express (Home Loan: 4 days & 10 days) ---
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const expressMatch = l.match(/(4 days|10 days)\s*-?\s*Rs\.?\s?[\d,]+\/\s*-?\s*/i);
      if (expressMatch) {
        const desc = expressMatch[1];
        const amtMatch = l.match(/Rs\.?\s?[\d,]+\/\s*-?\s*/i);
        const amt = amtMatch ? amtMatch[0].replace(/\s+/g, " ").trim() : "";
        rows.push({
          bank: BANK,
          product: "Home Loan",
          feeType: "Processing Fees - Express",
          description: desc.trim(),
          amount: amt.trim(),
          updatedAt: new Date().toISOString(),
          source: PDF_URL,
        });
      }
    }
    
    // --- 11. Processing Fees - Express (Personal Loan) ---
    let note = "";
    for (let i = 0; i < lines.length; i++) {
      if (/Personal Loan related/i.test(lines[i])) {
        // Find the note
        for (let j = i + 1; j < i + 10 && j < lines.length; j++) {
          if (/Service Charges for Personal Loan Including/i.test(lines[j])) {
            note = lines[j];
            for (let k = j + 1; k < j + 6 && k < lines.length; k++) {
              note += " " + lines[k];
              if (/Gurantors/i.test(lines[k])) break;
            }
            break;
          }
        }
        // Extract each band
        for (let j = i + 1; j < i + 20 && j < lines.length; j++) {
          const l = lines[j];
          let description = "";
          let amount = "";
          
          if (/Upto Rs\. 1 Mn/i.test(l)) {
            description = "Upto Rs. 1 Mn";
            amount = l.match(/Rs\.\s?\d{1,3}(,\d{3})*\/\s?-?/)?.[0]?.replace(/\s?-\s?$/, "") || "";
          } else if (/from Rs\. 1,000,001 to Rs\. 3 Mn/i.test(l)) {
            description = "from Rs. 1,000,001 to Rs. 3 Mn";
            amount = l.match(/Rs\.\s?\d{1,3}(,\d{3})*\/\s?-?/)?.[0]?.replace(/\s?-\s?$/, "") || "";
          } else if (/Above Rs\. 3,000,001/i.test(l)) {
            description = "Above Rs. 3,000,001";
            amount = l.match(/Rs\.\s?\d{1,3}(,\d{3})*\/\s?-?/)?.[0]?.replace(/\s?-\s?$/, "") || "";
          }
          
          if (description && amount) {
            rows.push({
              bank: BANK,
              product: "Personal Loan",
              feeType: "Processing Fees",
              note: clean(note),
              description,
              amount,
              updatedAt: new Date().toISOString(),
              source: PDF_URL,
            });
          }
        }
        break;
      }
    }
    
  } catch (error) {
    console.error("NSB tariff scraping error:", error);
    throw error;
  }
  
  return rows;
}

// Test runner
if (require.main === module) {
  (async () => {
    try {
      console.log("Starting NSB tariff scraper...");
      const rows = await scrapeNSBTariff();
      console.log(`✅ Scraped ${rows.length} tariff rows from NSB`);
      console.log(JSON.stringify(rows, null, 2));
    } catch (error) {
      console.error("❌ Scraping failed:", error);
      process.exit(1);
    }
  })();
}

export default scrapeNSBTariff;
