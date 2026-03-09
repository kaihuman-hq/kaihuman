const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching Puppeteer...');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  
  console.log('Navigating to http://localhost:4300 ...');
  await page.goto('http://localhost:4300', { waitUntil: 'networkidle0' });
  
  // Wait for 3 seconds for repos to load etc
  await new Promise(r => setTimeout(r, 3000));
  
  // For the test, we already injected a debug test inside Dashboard.tsx which says:
  // "DEBUG: FATAL ERROR - Successfully decrypted with wrong password:" 
  // OR "DEBUG: Correctly threw error on wrong password:"
  // If we see the correct throw, then WebCrypto in the browser is properly throwing!
  
  await browser.close();
  console.log('Puppeteer finished.');
})();
