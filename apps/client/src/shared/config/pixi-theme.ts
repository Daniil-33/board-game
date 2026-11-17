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
