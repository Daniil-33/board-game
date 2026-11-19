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

const namedColors = new Set(('aliceblue,antiquewhite,aqua,aquamarine,azure,beige,bisque,black,blanchedalmond,blue,blueviolet,brown,burlywood,cadetblue,chartreuse,chocolate,coral,cornflowerblue,cornsilk,crimson,cyan,darkblue,darkcyan,darkgoldenrod,darkgray,darkgreen,darkgrey,darkkhaki,darkmagenta,darkolivegreen,darkorange,darkorchid,darkred,darksalmon,darkseagreen,darkslateblue,darkslategray,darkslategrey,darkturquoise,darkviolet,deeppink,deepskyblue,dimgray,dimgrey,dodgerblue,firebrick,floralwhite,forestgreen,fuchsia,gainsboro,ghostwhite,gold,goldenrod,gray,green,greenyellow,grey,honeydew,hotpink,indianred,indigo,ivory,khaki,lavender,lavenderblush,lawngreen,lemonchiffon,lightblue,lightcoral,lightcyan,lightgoldenrodyellow,lightgray,lightgreen,lightgrey,lightpink,lightsalmon,lightseagreen,lightskyblue,lightslategray,lightslategrey,lightsteelblue,lightyellow,lime,limegreen,linen,magenta,maroon,mediumaquamarine,mediumblue,mediumorchid,mediumpurple,mediumseagreen,mediumslateblue,mediumspringgreen,mediumturquoise,mediumvioletred,midnightblue,mintcream,mistyrose,moccasin,navajowhite,navy,oldlace,olive,olivedrab,orange,orangered,orchid,palegoldenrod,palegreen,paleturquoise,palevioletred,papayawhip,peachpuff,peru,pink,plum,powderblue,purple,rebeccapurple,red,rosybrown,royalblue,saddlebrown,salmon,sandybrown,seagreen,seashell,sienna,silver,skyblue,slateblue,slategray,slategrey,snow,springgreen,steelblue,tan,teal,thistle,tomato,turquoise,violet,wheat,white,whitesmoke,yellow,yellowgreen,transparent').split(','));

/** Extract CSS colors from gradient layers without relying on the CSS serializer's spelling. */
export function parseCssColors(value: string): string[] {
  const colors: string[] = [];
  const candidates = value.match(/#[\da-f]{3,8}\b|rgba?\([^)]*\)|\b[a-z]+\b/gi) ?? [];
  for (const candidate of candidates) {
    if (/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(candidate)) {
      colors.push(candidate);
    } else if (/^rgba?\(/i.test(candidate) && /^rgba?\(\s*[-+\d.%]+(?:\s*[,/]\s*|\s+)[-+\d.%]+(?:\s*[,/]\s*|\s+)[-+\d.%]+(?:\s*(?:[,/]\s*|\s+)\s*[-+\d.%]+)?\s*\)$/i.test(candidate)) {
      colors.push(candidate);
    } else if (namedColors.has(candidate.toLowerCase())) {
      colors.push(candidate);
    }
  }
  return colors;
}

export function boardTheme() {
  const tokens = readPixiTheme();
  const value = (name: string): string => tokens[name] ?? '';
  const colors = (name: string): string[] => parseCssColors(value(name));
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
