#!/usr/bin/env node
/**
 * Generate mes-baseline-free.pdf from the print-ready HTML.
 *
 * Usage:
 *   npx puppeteer browsers install chrome   (one-time, installs headless Chrome)
 *   node generate-pdf.js
 *
 * Requires: Node.js 18+, puppeteer installed via npx
 * Output:   mes-baseline-free.pdf in the same directory
 */

const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  const htmlPath = path.resolve(__dirname, 'mes-baseline-free-print.html');
  await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0' });

  await page.pdf({
    path: path.resolve(__dirname, 'mes-baseline-free.pdf'),
    format: 'Letter',
    printBackground: true,
    margin: { top: '1in', bottom: '1in', left: '0.85in', right: '0.85in' },
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `
      <div style="width:100%;font-family:Courier New,monospace;font-size:9px;color:#888;display:flex;justify-content:space-between;padding:0 0.85in;">
        <span>ORBAlpha.com — generated ${new Date().toISOString().slice(0, 10)}</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>
    `,
  });

  await browser.close();
  console.log('PDF generated: mes-baseline-free.pdf');
})();
