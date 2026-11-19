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
      await page.goto(`file://${path.join(root, source)}`, { waitUntil: 'domcontentloaded' });
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
        const iframeHandle = await iframe.elementHandle();
        const frameDocument = iframeHandle ? await iframeHandle.contentFrame() : null;
        if (!frameDocument) throw new Error(`Unable to access the design document in ${filename}`);
        const deadline = Date.now() + 30_000;
        const fontsReady = frameDocument.evaluate(() => document.fonts.ready).catch(() => undefined);
        let fontWaitTimer;
        await Promise.race([
          fontsReady,
          new Promise(resolve => {
            fontWaitTimer = setTimeout(resolve, Math.max(0, deadline - Date.now()));
          }),
        ]);
        clearTimeout(fontWaitTimer);
        let screenshot;
        let lastGuardError;
        let passed = false;
        const captureFrame = async () => {
          try {
            return await iframe.screenshot({
              animations: 'disabled', timeout: Math.max(1, deadline - Date.now()),
            });
          } catch (error) {
            if (error && error.name === 'TimeoutError') {
              throw new Error(`Frame ${filename} did not render a non-blank image within 30s: screenshot timed out`);
            }
            throw error;
          }
        };
        while (Date.now() < deadline) {
          const firstScreenshot = await captureFrame();
          try {
            assertNonBlankImage(firstScreenshot, filename);
          } catch (error) {
            lastGuardError = error;
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
          if (Date.now() + 500 >= deadline) {
            lastGuardError = new Error('deadline reached before a second stable screenshot');
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 500));
          if (Date.now() >= deadline) {
            lastGuardError = new Error('deadline reached before a second stable screenshot');
            break;
          }
          screenshot = await captureFrame();
          try {
            assertNonBlankImage(screenshot, filename);
            if (Date.now() <= deadline && firstScreenshot.equals(screenshot)) {
              passed = true;
              break;
            }
            lastGuardError = new Error('two consecutive guarded screenshots differed');
          } catch (error) {
            lastGuardError = error;
          }
        }
        if (!passed) {
          if (Date.now() >= deadline) lastGuardError = new Error('30 second capture deadline reached');
          throw new Error(`Frame ${filename} did not render a non-blank image within 30s: ${lastGuardError?.message ?? 'no screenshot'}`);
        }
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
