/** Read once when mounting a Pixi scene, after the app stylesheet is loaded. */
export function readPixiTheme(root = document.documentElement) {
  const styles = getComputedStyle(root);
  const values: Record<string, string> = {};
  for (let index = 0; index < styles.length; index++) {
    const property = styles.item(index);
    if (!property.startsWith('--')) continue;
    const name = property.slice(2);
    if (/^(bg-|surface-|border-|overlay$|light-|text-|ink-|on-accent$|accent-|info$|success$|warning|danger|highlight$|gradient-|group-|player-|space-|design-)/.test(name)) {
      values[name] = styles.getPropertyValue(property).trim();
    }
  }
  return Object.freeze(values);
}

export function boardTheme() {
  const tokens = readPixiTheme();
  const value = (name: string): string => tokens[name] ?? '';
  const colors = (name: string): string[] => value(name).match(/rgba?\([^)]*\)/g) ?? [];
  const font = (name: string): string[] => value(name).split(',').map(family => family.trim().replace(/['"]/g, ''));
  return {
    board: value('bg-deep'),
    frame: colors('gradient-board-frame'),
    cell: value('light-cell'),
    edge: value('light-border'),
    inset: value('light-inset'),
    paper: value('light-0'),
    ink: value('ink-primary'),
    mutedInk: value('ink-secondary'),
    text: value('text-primary'),
    active: value('accent-mint'),
    house: value('design-board-house'),
    mortgage: colors('light-mortgage'),
    rent: value('highlight'),
    ui: font('design-font-ui'),
    display: font('design-font-display'),
    radius: Number.parseFloat(value('design-radius-cell')),
    players: Array.from({ length: 6 }, (_, index) => value(`player-${index + 1}`)),
    group: (id: string) => colors(`group-${id.toLowerCase()}`),
    special: (kind: string) => colors(`gradient-board-${kind}`),
  };
}

export type BoardTheme = ReturnType<typeof boardTheme>;
