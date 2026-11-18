import { t } from '../../shared/i18n/index';
import type { BoardScene } from './BoardCanvas';

export function mountCellTooltip(canvas: HTMLCanvasElement, scene: BoardScene): () => void {
  const tooltip = document.createElement('div');
  tooltip.className = 'ds-float';
  tooltip.setAttribute('role', 'tooltip');
  Object.assign(tooltip.style, {
    position: 'fixed',
    pointerEvents: 'none',
    padding: 'var(--space-2)',
    maxWidth: 'min(20rem, 90vw)',
  });
  tooltip.hidden = true;
  document.body.append(tooltip);

  const hide = () => { tooltip.hidden = true; };
  const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
  window.addEventListener('scroll', hide, true);
  window.addEventListener('keydown', onKeyDown);
  const canHover = window.matchMedia('(any-hover: hover) and (any-pointer: fine)');
  scene.setHover(details => {
    if (details === null || !canHover.matches) {
      hide();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / scene.size;
    const { x, y, width, height } = details.bounds;
    const summary = `${details.name} · ${details.price}`;
    tooltip.textContent = details.mortgaged ? `${summary} · ${t('board_canvas.mortgage_marker')}` : summary;
    tooltip.hidden = false;
    const centre = rect.left + (x + width / 2) * scale;
    const left = Math.max(4, Math.min(centre - tooltip.offsetWidth / 2, window.innerWidth - tooltip.offsetWidth - 4));
    const above = rect.top + y * scale - tooltip.offsetHeight - 6;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${above >= 4 ? above : rect.top + (y + height) * scale + 6}px`;
  });

  return () => {
    scene.setHover(null);
    window.removeEventListener('scroll', hide, true);
    window.removeEventListener('keydown', onKeyDown);
    tooltip.remove();
  };
}
