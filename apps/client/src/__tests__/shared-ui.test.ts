import { readFileSync } from 'node:fs';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  AlertDialog, Badge, Button, Countdown, Money, Popover,
  ResponsiveDialog, Tabs, Toast, Tooltip, UiProvider,
} from '../shared/ui/index';

let wrapper: VueWrapper | undefined;
let styles: HTMLStyleElement;
const press = (target: EventTarget, key: string, shiftKey = false) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
const button = (id: string) => h('button', { id, type: 'button', tabindex: 0 }, id);
const element = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const css = readFileSync(import.meta.dirname + '/../app/style.css', 'utf8');
const originalWidth = window.innerWidth;
const resize = (window as Window & { happyDOM?: { setInnerWidth: (width: number) => void } }).happyDOM!;

beforeEach(() => {
  styles = document.createElement('style');
  styles.textContent = css.replace(/^@import .*;$/gm, '');
  document.head.append(styles);
});

afterEach(async () => {
  wrapper?.unmount();
  wrapper = undefined;
  await nextTick();
  document.body.replaceChildren();
  styles.remove();
  resize.setInnerWidth(originalWidth);
});

function render(content: () => ReturnType<typeof h>) {
  wrapper = mount(defineComponent({
    setup: () => () => h(UiProvider, null, { default: content }),
  }), { attachTo: document.body });
  return wrapper;
}

it('renders a badge and locale-aware tabular money and countdown', () => {
  render(() => h('div', [
    h(Badge, { id: 'badge' }, () => 'Ходит'),
    h(Money, { id: 'money', value: 6150 }),
    h(Countdown, { id: 'countdown', seconds: 31 }),
  ]));
  expect(element('#badge').textContent).toBe('Ходит');
  expect(element('#money').textContent).toBe('6\u202F150');
  expect(element('#countdown').textContent).toBe('31 с');
  for (const id of ['#money', '#countdown']) {
    expect(getComputedStyle(element(id)).getPropertyValue('font-variant-numeric')).toBe('tabular-nums');
  }
});

it('associates the disabled reason text with the button and its focusable group', async () => {
  resize.setInnerWidth(390);
  const click = vi.fn();
  render(() => h(Button, { disabled: true, reason: 'Ход завершён', onClick: click }, () => 'Бросить кости'));
  const control = element('button') as HTMLButtonElement;
  const reasonId = control.getAttribute('aria-describedby');
  expect(control.disabled).toBe(true);
  expect(reasonId).toBeTruthy();
  const reason = document.getElementById(reasonId!);
  expect(reason?.textContent).toBe('Ход завершён');
  expect(getComputedStyle(reason!).display).toBe('block');
  expect(element('[role="group"]').getAttribute('aria-labelledby')).toBe(reasonId);
  control.click();
  expect(click).not.toHaveBeenCalled();
});

it.each([1024, 1023])('opens a responsive dialog, manages focus and closes on Escape at %i px', async width => {
  resize.setInnerWidth(width);
  render(() => h(ResponsiveDialog, { title: 'Карточка актива', description: 'Сведения' }, {
    trigger: () => button('trigger'),
    default: () => [button('first'), button('last')],
  }));
  const trigger = element('#trigger');
  trigger.focus();
  trigger.click();
  await vi.waitFor(() => expect(document.activeElement).toBe(element('#first')));
  const dialog = element('[role="dialog"]');
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(dialog.textContent).toContain('Карточка актива');
  expect(getComputedStyle(dialog).transform).toBe(width < 1024 ? 'none' : 'translate(-50%, -50%)');
  press(element('#first'), 'Tab', true);
  expect(document.activeElement).toBe(element('#last'));
  press(element('#last'), 'Tab');
  expect(document.activeElement).toBe(element('#first'));
  const outside = document.createElement('button'); outside.id = 'outside'; document.body.append(outside); outside.focus();
  await nextTick();
  expect(dialog.contains(document.activeElement)).toBe(true);
  press(document.activeElement!, 'Escape');
  await vi.waitFor(() => {
    expect(element('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

it('keeps required rent payment non-dismissible and asset inspection dismissible; purchase and auction responder policy is tested by widgets', async () => {
  resize.setInnerWidth(390);
  const open = ref(true);
  render(() => h(ResponsiveDialog, {
    title: 'Rent payment', dismissible: false, open: open.value,
    'onUpdate:open': (value: boolean) => { open.value = value; },
  }, { default: () => button('required-response') }));
  await vi.waitFor(() => expect(element('[role="dialog"]')).toBeTruthy());
  await vi.waitFor(() => expect(element('#required-response')).toBeTruthy());
  const dialog = element('[role="dialog"]');
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  press(element('#required-response'), 'Escape');
  expect(element('[role="dialog"]')).toBeTruthy();
  element('.ds-overlay').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  expect(element('[role="dialog"]')).toBeTruthy();
  open.value = false; await nextTick(); wrapper?.unmount(); wrapper = undefined;
  const dismissible = ref(true);
  render(() => h(ResponsiveDialog, {
    title: 'Asset inspection', dismissible: true, open: dismissible.value,
    'onUpdate:open': (value: boolean) => { dismissible.value = value; },
  }, { default: () => button('asset-close') }));
  await vi.waitFor(() => expect(element('#asset-close')).toBeTruthy());
  press(element('#asset-close'), 'Escape');
  await vi.waitFor(() => expect(element('[role="dialog"]')).toBeNull());
});

it('focuses cancel in an alert dialog and restores focus after Escape or cancel', async () => {
  render(() => h(AlertDialog, { title: 'Подтвердить сдачу', description: 'Действие необратимо' }, {
    trigger: () => button('trigger'),
    cancel: () => button('cancel'),
    action: () => button('confirm'),
  }));
  const trigger = element('#trigger');
  for (const close of ['escape', 'cancel']) {
    trigger.focus();
    trigger.click();
    await vi.waitFor(() => expect(document.activeElement).toBe(element('#cancel')));
    expect(element('[role="alertdialog"]').textContent).toContain('Подтвердить сдачу');
    if (close === 'escape') {
      press(element('#cancel'), 'Tab', true);
      expect(document.activeElement).toBe(element('#confirm'));
      press(document.activeElement!, 'Escape');
    } else {
      element('#cancel').click();
    }
    await vi.waitFor(() => {
      expect(element('[role="alertdialog"]')).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  }
});

it('opens a tooltip on focus and dismisses it on Escape', async () => {
  render(() => h(Tooltip, { text: 'Ссылка-приглашение' }, () => button('trigger')));
  const trigger = element('#trigger');
  trigger.focus();
  await vi.waitFor(() => expect(element('[role="tooltip"]')?.textContent).toBe('Ссылка-приглашение'));
  press(trigger, 'Escape');
  await vi.waitFor(() => expect(element('[role="tooltip"]')).toBeNull());
  expect(document.activeElement).toBe(trigger);
});

it('opens a popover and closes it on Escape', async () => {
  render(() => h(Popover, { label: 'Рента' }, {
    trigger: () => button('trigger'), default: () => button('action'),
  }));
  const trigger = element('#trigger');
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  trigger.click();
  await vi.waitFor(() => {
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(element('[role="dialog"]')?.getAttribute('aria-label')).toBe('Рента');
  });
  press(element('#action'), 'Escape');
  await vi.waitFor(() => {
    expect(element('[role="dialog"]')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});

it('moves focus and selection across tabs with the arrow keys', async () => {
  const selected = ref('players');
  render(() => h(Tabs, {
    label: 'Игра',
    modelValue: selected.value,
    'onUpdate:modelValue': (value: string) => { selected.value = value; },
    tabs: [{ value: 'players', label: 'Игроки' }, { value: 'rent', label: 'Рента' }],
  }, {
    players: () => 'Список игроков',
    rent: () => 'Сумма ренты',
  }));
  await nextTick();
  const tabs = document.querySelectorAll<HTMLElement>('[role="tab"]');
  tabs[0]!.focus();
  press(tabs[0]!, 'ArrowRight');
  await vi.waitFor(() => {
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('true');
    expect(element('[role="tabpanel"]:not([hidden])').textContent).toBe('Сумма ренты');
  });
});

it('shows and announces a toast, then dismisses it with the labeled close button', async () => {
  const open = ref(false);
  render(() => h(Toast, {
    open: open.value,
    'onUpdate:open': (value: boolean) => { open.value = value; },
    message: 'Приглашение скопировано.',
  }));
  expect(element('.ds-toast')).toBeNull();
  open.value = true;
  await vi.waitFor(() => {
    expect(element('.ds-toast')?.textContent).toContain('Приглашение скопировано.');
    expect(element('[role="status"]').textContent).toBe('Приглашение скопировано.');
    expect(element('[role=region]').getAttribute('aria-label')).toContain('Уведомления');
  });
  element('.ds-toast button[aria-label="Закрыть"]').click();
  await vi.waitFor(() => expect(element('.ds-toast')).toBeNull());
  expect(open.value).toBe(false);
});
