import { chromium } from 'playwright';

async function run() {
  console.log('Launching browser...');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));

  console.log('Navigating to app...');
  await page.goto('http://localhost:4301/');
  
  console.log('Waiting for load...');
  await page.waitForTimeout(3000);

  console.log('Waiting for 5 seconds to catch console logs...');
  await page.waitForTimeout(5000);

  await browser.close();
  console.log('Done.');
}

run().catch(console.error);
