// Auto-generates the landing-page screencast by driving the console app in
// demo mode through a scripted storyline and recording it to a webm video.
//
// Usage:
//   node apps/landing-page-nextgen/scripts/record-screencast.mjs
//
// Prerequisites (handled automatically when possible):
//   - The console dev server (http://localhost:4300). If it isn't running the
//     script starts `pnpm --filter @lifosy/app-console dev` itself and stops it
//     when done. That requires deps installed (`pnpm install`) and the UI
//     package built once (`pnpm --filter @lifosy/ui build`).
//   - A Chromium for Playwright (bundled in CI; locally run
//     `pnpm exec playwright install chromium`).
//
// Output (committed, consumed by src/pages/index.astro):
//   public/screencast.webm         — the looping hero screencast
//   public/screencast-poster.jpg   — first-frame poster
//
// The demo data lives only in memory and is seeded by visiting `/demo`. Because
// a full page reload wipes that in-memory session, every navigation after the
// initial load is done client-side (history.pushState + popstate, which
// preact-router listens to) — never a fresh `page.goto`.

import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const REPO_ROOT = join(__dirname, '..', '..', '..');

const BASE = 'http://localhost:4300';
const WIDTH = 1440;
const HEIGHT = 900;

// ─── Server helpers ──────────────────────────────────────────────────────────

const isUp = async () => {
  try {
    await fetch(BASE, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
};

const waitForServer = async (timeoutMs) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isUp()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
};

async function ensureServer() {
  if (await isUp()) {
    console.log('• Using already-running console dev server.');
    return null;
  }
  console.log('• Starting console dev server…');
  const child = spawn('pnpm', ['--filter', '@lifosy/app-console', 'dev'], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  if (!(await waitForServer(90_000))) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {}
    throw new Error('Console dev server did not come up on :4300 within 90s.');
  }
  console.log('• Dev server is up.');
  return child;
}

// ─── Cursor overlay (recorded videos have no real pointer) ───────────────────

const CURSOR_SCRIPT = `
  const c = document.createElement('div');
  c.id = '__kh_cursor';
  Object.assign(c.style, {
    position: 'fixed', width: '22px', height: '22px', zIndex: 2147483647,
    left: '0', top: '0', pointerEvents: 'none', transform: 'translate(-50%,-50%)',
    transition: 'opacity .2s ease',
    backgroundImage: "url(\\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 22 22'><path d='M3 2 L3 17 L7 13 L10 19 L13 18 L10 12 L16 12 Z' fill='black' stroke='%2300ff00' stroke-width='1.4' stroke-linejoin='round'/></svg>\\")",
    backgroundRepeat: 'no-repeat',
  });
  document.body.appendChild(c);
  const ring = document.createElement('div');
  Object.assign(ring.style, {
    position: 'fixed', width: '10px', height: '10px', borderRadius: '50%',
    border: '2px solid #00ff00', zIndex: 2147483646, left: '0', top: '0',
    pointerEvents: 'none', transform: 'translate(-50%,-50%) scale(1)', opacity: '0',
  });
  document.body.appendChild(ring);
  window.__khMoveCursor = (x, y) => { c.style.left = x + 'px'; c.style.top = y + 'px';
    ring.style.left = x + 'px'; ring.style.top = y + 'px'; };
  window.__khClickPulse = (x, y) => {
    ring.style.transition = 'none';
    ring.style.left = x + 'px'; ring.style.top = y + 'px';
    ring.style.opacity = '1'; ring.style.transform = 'translate(-50%,-50%) scale(1)';
    requestAnimationFrame(() => {
      ring.style.transition = 'transform .4s ease-out, opacity .4s ease-out';
      ring.style.transform = 'translate(-50%,-50%) scale(3.2)';
      ring.style.opacity = '0';
    });
  };
`;

// ─── Main ────────────────────────────────────────────────────────────────────

let server = null;
let browser = null;
let videoDir = null;

try {
  server = await ensureServer();
  videoDir = await mkdtemp(join(tmpdir(), 'kh-screencast-'));

  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: { width: WIDTH, height: HEIGHT } },
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  ⚠ page error:', e.message));

  // Track the synthetic cursor position so clicks can pulse + move smoothly.
  let cx = WIDTH / 2;
  let cy = HEIGHT / 2;
  const setCursor = (x, y) => page.evaluate(([x, y]) => window.__khMoveCursor?.(x, y), [x, y]);

  const pause = (ms) => page.waitForTimeout(ms);

  // Smoothly glide the (synthetic + real) pointer to an absolute coordinate.
  const glideTo = async (x, y, steps = 24) => {
    const fromX = cx;
    const fromY = cy;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // easeInOutQuad
      const nx = fromX + (x - fromX) * ease;
      const ny = fromY + (y - fromY) * ease;
      await page.mouse.move(nx, ny);
      await setCursor(nx, ny);
      await pause(14);
    }
    cx = x;
    cy = y;
  };

  const glideToLocator = async (locator) => {
    const box = await locator.boundingBox();
    if (!box) return null;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await glideTo(x, y);
    return { x, y };
  };

  const clickLocator = async (locator) => {
    const at = await glideToLocator(locator);
    if (at) {
      await page.evaluate(([x, y]) => window.__khClickPulse?.(x, y), [at.x, at.y]);
      await pause(140);
    }
    await locator.click();
  };

  // Client-side route change — keeps the in-memory demo session alive.
  const nav = (url) =>
    page.evaluate((u) => {
      history.pushState(null, '', u);
      dispatchEvent(new PopStateEvent('popstate'));
    }, url);

  // ── Scene 1 — Seed demo + land on the Overview dashboard ──────────────────
  console.log('• Recording…');
  await page.goto(`${BASE}/demo`, { waitUntil: 'networkidle' });
  await pause(3800);
  await page.evaluate(CURSOR_SCRIPT);
  await setCursor(cx, cy);
  await page.screenshot({ path: join(PUBLIC_DIR, 'screencast-poster.jpg'), quality: 90 });
  await glideTo(360, 140);
  await pause(700);
  await glideTo(900, 130);
  await pause(900);
  await glideTo(1250, 200);
  await pause(1400);

  // ── Scene 2 — Switch workspaces: Overview → Finance → Reading → Overview ──
  const nextWs = page.locator('[title="Next Workspace"]');
  await clickLocator(nextWs); // Finance
  await pause(3200);
  await clickLocator(nextWs); // Reading
  await pause(3000);
  await clickLocator(nextWs); // back to Overview
  await pause(1800);

  // ── Scene 3 — Kanban board ────────────────────────────────────────────────
  await nav('/board');
  await pause(3200);
  await glideTo(720, 450);
  await page.mouse.wheel(0, 320);
  await pause(1400);
  await page.mouse.wheel(0, -320);
  await pause(1400);

  // ── Scene 4 — Todo analytics ─────────────────────────────────────────────
  await nav('/analytics');
  await pause(4200);

  // ── Scene 5 — Action log ─────────────────────────────────────────────────
  await nav('/action-log');
  await pause(3600);

  // ── Scene 6 — Wiki ───────────────────────────────────────────────────────
  await nav('/wiki');
  await pause(3600);

  // ── Scene 7 — Files browser + markdown editor ────────────────────────────
  await nav('/');
  await pause(2000);
  await clickLocator(page.getByRole('button', { name: 'Files' }).first());
  await pause(1800);
  await clickLocator(page.getByText('notes', { exact: true }).first());
  await pause(1400);
  await clickLocator(page.getByText('welcome.md', { exact: true }).first());
  await pause(2600);

  // ── Scene 8 — Close on the Overview dashboard ────────────────────────────
  await nav('/');
  await pause(2600);

  // Finalize: Playwright writes the webm on context close.
  await ctx.close();
  const files = (await readdir(videoDir)).filter((f) => f.endsWith('.webm'));
  if (files.length === 0) throw new Error('No video was produced.');
  const out = join(PUBLIC_DIR, 'screencast.webm');
  await rm(out, { force: true });
  await rename(join(videoDir, files[0]), out);
  console.log(`✓ Wrote ${out}`);
  console.log(`✓ Wrote ${join(PUBLIC_DIR, 'screencast-poster.jpg')}`);
} finally {
  if (browser) await browser.close();
  if (videoDir) await rm(videoDir, { recursive: true, force: true });
  if (server) {
    try {
      process.kill(-server.pid, 'SIGTERM');
      console.log('• Stopped dev server.');
    } catch {}
  }
}
