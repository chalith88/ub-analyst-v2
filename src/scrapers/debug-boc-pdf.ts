/**
 * Debug script to inspect BOC PDF content
 */

import { downloadPDF, extractPDFText, groupByLines, linesToText, findSection } from "./market-share-base";
import path from "path";
import os from "os";
import fs from "fs/promises";

async function debugBOCPDF() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "boc-debug-"));
  const pdfPath = path.join(tmpDir, "boc-q3-2025.pdf");
  
  console.log("📥 Downloading BOC Q3-2025 PDF...");
  await downloadPDF("https://www.boc.lk/financial/document/99/download", pdfPath);
  
  console.log("📖 Extracting text from:", pdfPath);
  
  const items = await extractPDFText(pdfPath);
  const lines = groupByLines(items);
  const textLines = linesToText(lines);
  
  console.log("\n📄 Total lines extracted:", textLines.length);
  
  // Test findSection
  const loanSection = findSection(
    textLines,
    ["housing loan", "personal loan", "local currency loans"],
    ["total equity", "total assets", "financial statements"]
  );
  
  console.log("\n🔍 Section found by findSection:", loanSection.length, "lines");
  loanSection.forEach((line, idx) => {
    console.log(`  ${idx}: ${line.substring(0, 200)}`);
  });
  
  // Show lines around housing/personal
  console.log("\n🏠 Lines containing 'housing loan' (with 5 lines context):");
  textLines.forEach((line, idx) => {
    if (line.toLowerCase().includes('housing loan')) {
      for (let i = Math.max(0, idx-5); i <= Math.min(textLines.length-1, idx+5); i++) {
        console.log(`  Line ${i} ${i===idx ? '>>>' : '   '}: ${textLines[i].substring(0, 150)}`);
      }
      console.log("  ---");
    }
  });
}

debugBOCPDF().catch(console.error);
