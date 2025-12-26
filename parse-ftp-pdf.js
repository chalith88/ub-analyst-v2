const pdfjsLib = require('pdfjs-dist/legacy/build/pdf');
const fs = require('fs');

(async () => {
  const buf = fs.readFileSync('C:/Users/chali/Downloads/fwftp/2025-12.pdf');
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  
  console.log('Total pages:', doc.numPages);
  let rows = [];
  
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let lineTokens = [];
    let lastY = null;
    
    for (const item of content.items) {
      const [, , , , _x, y] = item.transform;
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        if (lineTokens.length) rows.push([...lineTokens]);
        lineTokens = [];
      }
      lastY = y;
      const text = String(item.str || '').trim();
      if (text) lineTokens.push(text);
    }
    if (lineTokens.length) rows.push([...lineTokens]);
  }
  
  console.log('Total rows:', rows.length);
  console.log('\n=== Looking for header row ===');
  
  // Find the header row
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const lower = rows[i].map(s => s.toLowerCase());
    if (lower.includes("period") && lower.includes("asset ftp")) {
      headerIdx = i;
      console.log(`Found header at row ${i}:`, JSON.stringify(rows[i]));
      console.log('Lowercase:', JSON.stringify(lower));
      break;
    }
  }
  
  if (headerIdx === -1) {
    console.log('\n❌ Could not find header row with "period" and "asset ftp"');
    console.log('\n=== Showing all rows for manual inspection ===');
    rows.forEach((r, i) => {
      console.log(`${i}:`, JSON.stringify(r));
    });
  } else {
    console.log('\n=== Data rows after header ===');
    for (let i = headerIdx + 1; i < Math.min(headerIdx + 20, rows.length); i++) {
      console.log(`${i}:`, JSON.stringify(rows[i]));
    }
  }
})();
