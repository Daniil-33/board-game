import { CanvasTextMetrics, FillGradient, Graphics, Text } from 'pixi.js';
import type { BoardTheme } from '../../shared/config/index';

export function gradient(colors: string[], direction: 'horizontal' | 'vertical' | 'diagonal' = 'horizontal'): FillGradient {
  return new FillGradient({
    end: { x: direction === 'vertical' ? 0 : 1, y: direction === 'horizontal' ? 0 : 1 },
    colorStops: colors.map((color, index) => ({ color, offset: index / (colors.length - 1) })),
  });
}

export function label(text: string, size: number, color: string, fontFamily: string[], bold = false): Text {
  const result = new Text({ text, style: { fontFamily, fontSize: size, fill: color, fontWeight: bold ? '700' : '400' } });
  result.anchor.set(0.5);
  return result;
}

export function textWidth(label: Text, value = label.text): number {
  return CanvasTextMetrics.measureText(value, label.style).width;
}

export function fitLabel(label: Text, maxWidth: number): void {
  if (textWidth(label) <= maxWidth) return;
  const chars = Array.from(label.text);
  while (chars.length > 0 && textWidth(label, `${chars.join('')}…`) > maxWidth) chars.pop();
  label.text = `${chars.join('')}…`;
}

export function specialIcon(kind: string, theme: BoardTheme): Graphics {
  const icon = new Graphics();
  switch (kind) {
    case 'start':
      icon.moveTo(-9, 0).lineTo(9, 0).moveTo(2, -7).lineTo(9, 0).lineTo(2, 7);
      break;
    case 'jail':
      icon.roundRect(-8, -8, 16, 16, 2).moveTo(-3, -7).lineTo(-3, 7).moveTo(3, -7).lineTo(3, 7);
      break;
    case 'casino':
      icon.roundRect(-8, -8, 16, 16, 3).circle(-4, -4, 1).circle(4, 4, 1).circle(0, 0, 1);
      break;
    case 'go-to-jail':
      icon.poly([0, -9, 10, 8, -10, 8], true).moveTo(0, -4).lineTo(0, 2).circle(0, 5, 0.6);
      break;
    case 'chance':
      icon.roundRect(-7, -9, 14, 18, 2).moveTo(-3, 0).lineTo(3, 0).moveTo(-3, 4).lineTo(2, 4);
      break;
  }
  return icon.stroke({ width: 1.6, color: theme.ink, cap: 'round', join: 'round' });
}
