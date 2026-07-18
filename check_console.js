const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  
  page.on('console', async msg => {
    const args = await Promise.all(msg.args().map(async a => {
      try {
        const val = await a.jsonValue();
        return typeof val === 'object' ? JSON.stringify(val) : val;
      } catch (e) {
        return a.toString();
      }
    }));
    console.log('PAGE LOG:', args.join(' '));
  });
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  console.log('Navigating to http://localhost:8080/');
  await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
  
  // Fill login
  await page.evaluate(() => {
     document.querySelectorAll('input')[0].value = 'VFSDEMOACC';
     document.querySelectorAll('input')[1].value = 'VFS1234';
     document.querySelector('.btn-primary, button').click();
  });
  
  await new Promise(r => setTimeout(r, 8000));
  await page.screenshot({ path: 'screenshot.png' });
  await browser.close();
  console.log('Screenshot saved to screenshot.png');
})();
