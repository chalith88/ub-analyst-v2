import fs from "fs";
import path from "path";

// ----------- Interface -----------
export interface FeeRow {
  bank: string;
  product: string;
  feeType: string;
  description: string;
  amount: string;
  notes?: string;
  updatedAt: string;
  source: string;
}

// ----------- Constants -----------
const PDF_URL = "https://www.sampath.lk/common/credit/credit_charges.pdf";
const nowISO = () => new Date().toISOString();

function ensureDir(p: string) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function normSpaces(s: string) { return s.replace(/\u00A0/g, " ").replace(/[ \t]+/g, " ").trim(); }
function normAll(txt: string) { return txt.split(/\r?\n+/).map(normSpaces).filter(Boolean); }

// ----------- PDF text extraction using pdfjs-dist -----------
async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfData = new Uint8Array(pdfBuffer);
  
  const loadingTask = pdfjsLib.getDocument({ data: pdfData });
  const pdf = await loadingTask.promise;
  
  let allText = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // Group text items by Y coordinate to form lines
    const lineMap = new Map<number, string[]>();
    for (const item of textContent.items) {
      if ('str' in item && item.str.trim()) {
        const y = Math.round(item.transform[5]);
        if (!lineMap.has(y)) lineMap.set(y, []);
        lineMap.get(y)!.push(item.str);
      }
    }
    
    // Sort by Y coordinate (top to bottom) and concatenate
    const sortedLines = Array.from(lineMap.entries())
      .sort((a, b) => b[0] - a[0]) // Descending Y (top to bottom)
      .map(([_, texts]) => texts.join(" "));
    
    allText += sortedLines.join("\n") + "\n";
  }
  
  return allText;
}

/* ---------------- parsing ---------------- */
function parseSampathTariffLines(lines: string[], source: string): FeeRow[] {
  const out: FeeRow[] = [];

  // Dump OCR for further debugging
  try {
    ensureDir("./work_sampath");
    fs.writeFileSync(
      "./work_sampath/sampath-tariff-ocr-lines.txt",
      lines.map((l, idx) => `[${idx}] ${l}`).join("\n"),
      "utf8"
    );
    console.log("Dumped OCR lines to work_sampath/sampath-tariff-ocr-lines.txt");
  } catch {}

  /* --- 1) Personal Loan → Processing fee "Up to Rs. 500,000" --- */
  for (let i = 0; i < lines.length - 1; ++i) {
    if (/personal\s*loans?/i.test(lines[i])) {
      const next = lines[i + 1] || "";
      const descMatch = next.match(/Up to Rs\.?\s*[\d,\.\s]+\/?-?/i) || next.match(/Up to Rs\.?\s*[\d,\.]+/i);
      const amtMatch = next.match(/\d{1,3}(?:\s*,\s*\d{3})*\s*\/\s*-/);
      if (descMatch && amtMatch) {
        out.push({
          bank: "Sampath Bank",
          product: "Personal Loan",
          feeType: "Processing fee",
          description: descMatch[0].replace(/\s+/g, " ").replace(/\/-$/,'').replace(/\/ -$/, '').trim(),
          amount: amtMatch[0].replace(/\s+/g, "").trim(),
          updatedAt: nowISO(),
          source,
        });
        break; // only first Personal Loan processing row
      }
    }
  }

  // --- Personal Loan: Processing Fee Additional Slabs [11]-[14], but skip Samachara/Review Charges [38]-[41] ---
  for (let i = 0; i < lines.length; ++i) {
    const line = lines[i].replace(/\s+/g, " ").trim();

    // Lookback 2 lines for exclusion clues
    const prev1 = (lines[i - 1] || "").toLowerCase();
    const prev2 = (lines[i - 2] || "").toLowerCase();
    const shouldSkip = prev1.includes("samachara loan scheme") ||
                       prev2.includes("samachara loan scheme") ||
                       prev1.includes("review charges for") ||
                       prev2.includes("review charges for");

    if (shouldSkip) continue;

    // Rs. 500,001 — 1,000,000 10,000/-
    let m = line.match(/^(Rs\.?\s*\d[\d,\s]*\s*[—-]\s*\d[\d,\s]*)(?:\s*\|)?\s*(\d{1,3}(?:\s*,\s*\d{3})*\s*\/\s*-)/i);
    if (m) {
      out.push({
        bank: "Sampath Bank",
        product: "Personal Loan",
        feeType: "Processing fee",
        description: m[1].replace(/\s+/g, " ").trim(),
        amount: m[2].replace(/\s+/g, "").trim(),
        updatedAt: nowISO(),
        source,
      });
      continue;
    }

    // Rs. 1,000,001- 5,000,000 20,000/-
    m = line.match(/^(Rs\.?\s*\d[\d,\s]*-+\s*\d[\d,\s]*)(?:\s*\|)?\s*(\d{1,3}(?:\s*,\s*\d{3})*\s*\/\s*-)/i);
    if (m) {
      out.push({
        bank: "Sampath Bank",
        product: "Personal Loan",
        feeType: "Processing fee",
        description: m[1].replace(/\s+/g, " ").trim(),
        amount: m[2].replace(/\s+/g, "").trim(),
        updatedAt: nowISO(),
        source,
      });
      continue;
    }

    // Rs.5,000,001- 10,000,000 | 25,000/- OR Rs.5,000,001- 10,000,000 25,000/-
    m = line.match(/^(Rs\.?\s*\d[\d,\s]*-+\s*\d[\d,\s]*)(?:\s*\|)?\s*(\d{1,3}(?:\s*,\s*\d{3})*\s*\/\s*-)/i);
    if (m) {
      out.push({
        bank: "Sampath Bank",
        product: "Personal Loan",
        feeType: "Processing fee",
        description: m[1].replace(/\s+/g, " ").trim(),
        amount: m[2].replace(/\s+/g, "").trim(),
        updatedAt: nowISO(),
        source,
      });
      continue;
    }

    // Above 10.0 Mn 0.25%
    m = line.match(/^(Above\s*\d+\.?\d*\s*Mn)\s*(0\s*\.\s*\d+\s*%)/i);
    if (m) {
      out.push({
        bank: "Sampath Bank",
        product: "Personal Loan",
        feeType: "Processing fee",
        description: m[1].replace(/\s+/g, " ").trim(),
        amount: m[2].replace(/\s+/g, "").trim(),
        updatedAt: nowISO(),
        source,
      });
      continue;
    }
  }

  /* --- 3) Home Loan & LAP → Handling fee (lines 149–151) --- */
  for (let i = 0; i < lines.length - 1; ++i) {
    const ln = lines[i].replace(/\s+/g, " ").trim().toLowerCase();
    if (/handling fee of\s*rs\.?\s*5,?000\/-\s*per property\s*plus/.test(ln)) {
      const raw1 = lines[i] || "";
      const raw2 = lines[i + 1] || "";
      const raw3 = lines[i + 2] || "";
      const headNote = (raw1.replace(/.*handling fee of\s*rs\.?\s*5,?000\/-\s*per property\s*plus/i, "") || "").trim();
      const note = [headNote, raw2.trim(), raw3.trim()]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      ["Home Loan", "Loan Against Property"].forEach(product => {
        out.push({
          bank: "Sampath Bank",
          product,
          feeType: "Handling fee",
          description: "per property",
          amount: "5,000/-",
          notes: note,
          updatedAt: nowISO(),
          source,
        });
      });
      break;
    }
  }

  /* --- 4) Sevana loans → Legal fee (Bond value slabs) for Home Loan & LAP (lines 165–170) --- */
  for (let i = 0; i < lines.length; ++i) {
    if (/sevana\s+loans/i.test(lines[i])) {
      const bondVal = lines[i + 1] || ""; // "- Bond value 1.0%"
      const slab1 = lines[i + 2] || "";   // "Up to Rs 1,000,000/- (Rs. 1.0Mn) 0.75%"
      const slab2 = lines[i + 3] || "";   // "Rs 1,000,001/- — 5,000,000/- 0.50%"
      const slab3 = lines[i + 4] || "";   // "Rs 5,000,001/- — 10,000,000/- 0.25%"
      const slab4 = lines[i + 5] || "";   // "Over Rs 10,000,001/-"

      // Tripartite note lines [171-175]
      const noteBlock = [
        lines[i + 6] || "",
        lines[i + 7] || "",
        lines[i + 8] || "",
        lines[i + 9] || "",
        lines[i + 10] || "",
      ]
        .map(s => s.trim())
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      const hasTripartite = /\btripartite\b/i.test(noteBlock);
      const tripartiteNote = hasTripartite ? noteBlock : undefined;

      const getPct = (line: string) => {
        const m = line.match(/(\d+(?:\.\d+)?)\s*%/);
        return m ? `${m[1]}%` : "";
      };

      const addBothProducts = (description: string, amount: string) => {
        ["Home Loan", "Loan Against Property"].forEach(product => {
          out.push({
            bank: "Sampath Bank",
            product,
            feeType: "Legal fee",
            description,
            amount,
            notes: tripartiteNote,
            updatedAt: nowISO(),
            source,
          });
        });
      };

      // Slab 1: Use Bond value line for 1.0%
      addBothProducts("Up to Rs 1,000,000/- (Rs. 1.0Mn)", getPct(bondVal));
      // Slab 2: Use slab1 for 0.75%
      addBothProducts("Rs 1,000,001/- — 5,000,000/-", getPct(slab1));
      // Slab 3: Use slab2 for 0.50%
      addBothProducts("Rs 5,000,001/- — 10,000,000/-", getPct(slab2));
      // Slab 4: Use slab3 for 0.25%
      addBothProducts("Over Rs 10,000,001/-", getPct(slab3));

      break; // only process once
    }
  }

  /* --- 5) Senior Citizen Loan Scheme / Samachara (Pensioner Loan) → Processing fee --- */
  for (let i = 0; i < lines.length - 2; ++i) {
    const line = lines[i].replace(/\s+/g, " ").trim();
    if (/senior\s+citizen\s+loan/i.test(line)) {
      // Next line should be the amount (2,500/- or 2, 5 00/ - with OCR spaces)
      const amtLine = (lines[i + 1] || "").replace(/\s+/g, "").trim(); // Remove ALL spaces first
      // Following line should be "Scheme/ Samachara"
      const confirmLine = (lines[i + 2] || "").toLowerCase();
      
      const amtMatch = amtLine.match(/(\d{1,3}(?:,?\d{3})*)\/-/);
      if (amtMatch && /scheme.*samachara/i.test(confirmLine)) {
        out.push({
          bank: "Sampath Bank",
          product: "Pensioner Loan",
          feeType: "Processing fee",
          description: "Senior Citizen Loan Scheme / Samachara",
          amount: amtMatch[1] + "/-",
          updatedAt: nowISO(),
          source,
        });
        break;
      }
    }
  }

  /* --- 6) Premature Settlement / Part Settlement Table (Dynamic, via OCR) --- */
  for (let i = 0; i < lines.length; ++i) {
    // Find start of the settlement table (header)
    if (/3\.5 Premature.*Loan outstanding at the time of the settlement/i.test(lines[i])) {
      // Look for 'Personal', 'Commercial', 'Housing' rows within next 10 lines
      for (let j = i + 1; j < Math.min(i + 12, lines.length); ++j) {
        const line = lines[j].replace(/\s+/g, " ").trim();

        // Personal Loan row
        let m = line.match(/^Personal\s+([\d.]+%)[ ]+([\d.]+%)[ ]+([\d.]+%)[ ]+([\d.]+%)/i);
        if (m) {
          const slabs = [
            "Loan o/s 100%-75%",
            "Less than 75% - up to 50%",
            "Less than 50% - up to 25%",
            "Loan o/s less than 25%",
          ];
          for (let k = 0; k < 4; ++k) {
            out.push({
              bank: "Sampath Bank",
              product: "Personal Loan",
              feeType: "Premature settlement or part settlement",
              description: slabs[k],
              amount: m[k + 1],
              updatedAt: nowISO(),
              source,
            });
          }
        }

        // Housing (applies to both Home Loan and Loan Against Property)
        m = line.match(/^Housing\s+([\d.]+%)[ ]+([\d.]+%)[ ]+([\d.]+%)[ ]+([\d.]+%)/i);
        if (m) {
          const slabs = [
            "Loan o/s 100%-75%",
            "Less than 75% - up to 50%",
            "Less than 50% - up to 25%",
            "Loan o/s less than 25%",
          ];
          for (let k = 0; k < 4; ++k) {
            ["Home Loan", "Loan Against Property"].forEach(product => {
              out.push({
                bank: "Sampath Bank",
                product,
                feeType: "Premature settlement or part settlement",
                description: slabs[k],
                amount: m[k + 1],
                updatedAt: nowISO(),
                source,
              });
            });
          }
        }
      }
      break; // Process only the first table found
    }
  }

  return out;
}

/* ---------------- main ---------------- */
export async function scrapeSampathTariff(): Promise<FeeRow[]> {
  // Download PDF
  const res = await fetch(PDF_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${PDF_URL}`);
  const buf = Buffer.from(await res.arrayBuffer());

  // Extract text using pdfjs-dist
  let combined = "";
  try {
    combined = await extractPdfText(buf);
  } catch (err) {
    throw new Error(`PDF text extraction failed: ${String(err)}`);
  }

  // Save extracted text for debugging
  try {
    ensureDir("./work_sampath");
    fs.writeFileSync("./work_sampath/sampath-tariff-extracted.txt", combined, "utf8");
    console.log("Saved extracted text to work_sampath/sampath-tariff-extracted.txt");
  } catch {}

  // Normalize → parse
  const lines = normAll(combined);
  return parseSampathTariffLines(lines, PDF_URL);
}

export default scrapeSampathTariff;

// Execute if run directly
if (require.main === module) {
  console.log("Starting Sampath tariff scraper...");
  scrapeSampathTariff()
    .then(data => {
      console.log(`✅ Scraped ${data.length} tariff rows from Sampath Bank`);
      console.log(JSON.stringify(data, null, 2));
    })
    .catch(err => {
      console.error("❌ Error scraping Sampath tariff:", err);
      process.exit(1);
    });
}
