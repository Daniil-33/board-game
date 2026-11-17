// Run from the repository root with a Vite dev server and a production preview.
const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');
const evidence = process.env.DESIGN_EVIDENCE;
const dev = process.env.DESIGN_DEV_URL ?? 'http://127.0.0.1:5176';
const preview = process.env.DESIGN_PREVIEW_URL ?? 'http://127.0.0.1:4176';

async function main() {
  const browser = await chromium.launch();
  try {
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.goto(dev + '/?ds');
      await expect(page.getByTestId('design-system-preview')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('.ds-preview-grid dd').first()).toBeVisible();
      const expectedSwatches = {
        'bg-base': 'rgb(11, 15, 26)',
        'player-1': 'rgb(59, 167, 255)',
        'text-muted': 'rgb(154, 166, 191)',
      };
      for (const [name, color] of Object.entries(expectedSwatches)) {
        await expect(page.locator('.ds-preview-grid > div').filter({ has: page.getByText(name, { exact: true }) }).locator('dd')).toHaveCSS('background-color', color);
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth), 'Preview must fit the viewport');
      if (evidence) await page.screenshot({ path: `${evidence}/design-system-${width}x${height}.png` });
      await expect(page.getByTestId('ds-disabled')).toBeDisabled();
      const reason = page.locator('.ds-disabled-reason');
      await expect(page.locator('.ds-disabled-trigger')).toHaveAccessibleName('Дом уже построен в этом ходу.');
      if (width < 1024) {
        await expect(reason).toBeVisible();
      } else {
        await expect(reason).toBeHidden();
        await page.locator('.ds-disabled-trigger').focus();
        await expect(page.getByRole('tooltip')).toHaveText('Дом уже построен в этом ходу.');
        await page.keyboard.press('Escape');
        await expect(page.getByRole('tooltip')).toHaveCount(0);
      }

      const trigger = page.getByTestId('ds-dialog-trigger');
      await trigger.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(page.getByTestId('ds-dialog-first')).toBeFocused();
      const box = await dialog.boundingBox();
      assert(box && (width < 1024 ? Math.abs(box.y + box.height - height) <= 1 : box.y > 0));
      await page.keyboard.press('Shift+Tab');
      await expect(page.getByTestId('ds-dialog-last')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.getByTestId('ds-dialog-first')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();

      const alertTrigger = page.getByTestId('ds-alert-trigger');
      await alertTrigger.click();
      const alert = page.getByRole('alertdialog');
      await expect(alert.getByRole('button', { name: 'Отмена' })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(alert.getByRole('button', { name: 'Подтвердить сдачу' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(alert).toHaveCount(0);
      await expect(alertTrigger).toBeFocused();

      await page.getByTestId('ds-tooltip-trigger').focus();
      await expect(page.getByRole('tooltip')).toHaveText('Ссылка-приглашение');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      const popoverTrigger = page.getByTestId('ds-popover-trigger');
      await popoverTrigger.click();
      const popover = page.getByRole('dialog', { name: 'Рента' });
      await expect(page.getByTestId('ds-popover-action')).toBeFocused();
      assert.equal(await popover.locator('.ds-number').textContent(), '6\u202F150');
      await expect(popover.locator('.ds-number')).toHaveCSS('font-variant-numeric', 'tabular-nums');
      await page.keyboard.press('Escape');
      await expect(popover).toHaveCount(0);
      await expect(popoverTrigger).toBeFocused();
      const tab = page.getByRole('tab', { name: 'Игроки' });
      await tab.focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('tab', { name: 'Рента' })).toBeFocused();
      await expect(page.getByRole('tabpanel')).toHaveText('350');
      await expect(page.locator('.ds-badge .ds-number')).toHaveCSS('font-variant-numeric', 'tabular-nums');
      await page.getByTestId('ds-toast-trigger').click();
      const toast = page.locator('.ds-toast');
      await expect(toast).toContainText('Приглашение скопировано.');
      await expect(page.getByRole('status')).toContainText('Приглашение скопировано.');
      await toast.getByRole('button', { name: 'Закрыть' }).click();
      await expect(toast).toHaveCount(0);
      console.log(`PASS development primitives at ${width}×${height}`);
      await page.close();
    }
    const page = await browser.newPage();
    const scripts = [];
    page.on('request', request => {
      if (request.resourceType() === 'script') scripts.push(request.url());
    });
    await page.goto(preview + '/?ds');
    await expect(page.getByTestId('screen-login')).toBeVisible();
    await expect(page.getByTestId('design-system-preview')).toHaveCount(0);
    assert(!scripts.some(url => /designsystem/i.test(url)), 'Production must not fetch the playground');
    console.log('PASS production ignores ?ds');
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
