import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url = process.env.APP_URL ?? 'http://127.0.0.1:5173/';
const outDir = fileURLToPath(new URL('../output/playwright/', import.meta.url));

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: chromePath,
  args: ['--use-gl=swiftshader', '--disable-gpu', '--enable-webgl']
});

const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (error) => errors.push(error.message));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('#scene');
await page.waitForTimeout(900);

const initial = await page.evaluate(() => {
  const canvas = document.querySelector('#scene');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.canvas.width = canvas.width;
  ctx.canvas.height = canvas.height;
  ctx.drawImage(canvas, 0, 0);
  const data = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data;
  let litPixels = 0;
  for (let i = 0; i < data.length; i += 4 * 97) {
    if (data[i] + data[i + 1] + data[i + 2] > 24) litPixels++;
  }
  return {
    webgl: Boolean(gl),
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    litPixels,
    met: document.querySelector('#met')?.textContent,
    phase: document.querySelector('#phase')?.textContent,
    earthRange: document.querySelector('#earthRange')?.textContent
  };
});

await page.locator('#play').dispatchEvent('click');
await page.waitForTimeout(550);
const afterPlay = await page.locator('#met').textContent();
await page.locator('#reset').dispatchEvent('click');
await page.waitForTimeout(100);
const afterReset = await page.locator('#met').textContent();
await page.locator('#timeline').evaluate((el) => {
  el.value = '5800';
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(250);
const afterSlider = {
  met: await page.locator('#met').textContent(),
  phase: await page.locator('#phase').textContent()
};
await page.locator('#labelToggle').dispatchEvent('click');
await page.locator('#guideToggle').dispatchEvent('click');
await page.waitForTimeout(100);
const labelsHidden = await page.locator('#labels').evaluate((el) => el.classList.contains('hidden'));
const screenshotPath = `${outDir}artemis-smoke.png`;
await page.screenshot({ path: screenshotPath, fullPage: true });

const moonScreenshotPath = `${outDir}artemis-moon-texture.png`;
await page.locator('#scaleToggle').dispatchEvent('click');
await page.locator('#focus').selectOption('flyby');
await page.waitForTimeout(450);
await page.screenshot({ path: moonScreenshotPath, fullPage: true });

await browser.close();

if (!initial.webgl) throw new Error('WebGL context was not available');
if (initial.canvasWidth < 1000 || initial.canvasHeight < 600) throw new Error(`Canvas too small: ${initial.canvasWidth}x${initial.canvasHeight}`);
if (initial.litPixels < 60) throw new Error(`Canvas appears blank; lit sample pixels: ${initial.litPixels}`);
if (errors.length) throw new Error(`Console/page errors:\n${errors.join('\n')}`);
if (afterPlay === initial.met) throw new Error('Play button did not advance mission time');
if (afterReset !== 'T+0/00:00:00') throw new Error(`Reset did not return to launch MET: ${afterReset}`);
if (!afterSlider.met || afterSlider.met === afterReset) throw new Error('Timeline input did not update MET');
if (!labelsHidden) throw new Error('Label toggle did not hide labels');

console.log(JSON.stringify({
  ok: true,
  initial,
  afterPlay,
  afterReset,
  afterSlider,
  screenshot: screenshotPath,
  moonScreenshot: moonScreenshotPath
}, null, 2));
