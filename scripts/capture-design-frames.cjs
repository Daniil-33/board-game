const { chromium } = require('/workspace/node_modules/.pnpm/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const { assertNonBlankImage } = require('./image-stats.cjs');

const root = '/workspace';
const out = process.argv[2] || '/evidence/design-frames';
const sources = [
  ['desktop', 'docs/design/ui-mvp-v1.html'],
  ['mobile', 'docs/design/ui-mvp-mobile-v1.html'],
];

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const index = [];
  try {
    for (const [family, source] of sources) {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
      await page.goto(`file://${path.join(root, source)}`, { waitUntil: 'load' });
      const frames = await page.locator('iframe').evaluateAll(items => items.map(frame => ({
        title: frame.title || 'untitled', width: Number(frame.getAttribute('width')) || 0,
        height: Number(frame.getAttribute('height')) || 0,
      })));
      for (const [position, frame] of frames.entries()) {
        const safeTitle = frame.title.toLowerCase().replace(/[^a-z0-9а-яё]+/giu, '-').replace(/^-|-$/g, '');
        const filename = `${family}-${String(position + 1).padStart(2, '0')}-${safeTitle}.png`;
        const iframe = page.locator('iframe').nth(position);
        await iframe.waitFor({ state: 'visible' });
        await iframe.scrollIntoViewIfNeeded();
        const frameDocument = page.frames().filter(candidate => candidate.parentFrame() === page.mainFrame())[position];
        if (!frameDocument) throw new Error(`Unable to access the design document in ${filename}`);
        await frameDocument.waitForFunction(() => {
          const body = document.body;
          if (!body || body.children.length === 0) return false;
          return Array.from(body.children).some(element => {
            const bounds = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return bounds.width > 0 && bounds.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
          });
        }, undefined, { timeout: 30_000 });
        await frameDocument.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all(Array.from(document.images, image => image.decode()));
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        const screenshot = await iframe.screenshot({ animations: 'disabled' });
        assertNonBlankImage(screenshot, filename);
        fs.writeFileSync(path.join(out, filename), screenshot);
        index.push({ family, title: frame.title, width: frame.width, height: frame.height, file: filename, source });
      }
      await page.close();
    }
    fs.writeFileSync(path.join(out, 'frames.json'), JSON.stringify(index, null, 2));
    fs.writeFileSync(path.join(out, 'README.md'), [
      '# Design frames captured in Chromium', '',
      ...index.map(frame => `- **${frame.family} · ${frame.title}** (${frame.width}×${frame.height}): [${frame.file}](./${frame.file}) — opened from \`${frame.source}\`.`),
      '',
    ].join('\n'));
    console.log(`Captured ${index.length} design frames to ${out}`);
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
