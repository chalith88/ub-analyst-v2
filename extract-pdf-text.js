// Quick PDF text extraction using poppler (if available) or manual inspection
const { execSync } = require('child_process');
const fs = require('fs');

try {
  // Try using pdftotext from poppler-utils
  const output = execSync('pdftotext -layout "C:/Users/chali/Downloads/fwftp/2025-12.pdf" -', { encoding: 'utf-8' });
  console.log('PDF Text Content:');
  console.log('='.repeat(80));
  console.log(output);
} catch (err) {
  console.error('pdftotext not available. Please check PDF manually.');
  console.error('Error:', err.message);
}
