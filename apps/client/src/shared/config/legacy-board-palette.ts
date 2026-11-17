// Existing renderer colors. The board redesign will switch to the computed theme.

export const TOKEN_COLORS = [0xe4572e, 0x29a3a3, 0xf3a712, 0x7d5ba6, 0x5aa02c, 0xd6589f] as const;

export const HOUSE_COLOR = 0x7ee06a;

export const MORTGAGE_COLOR = 0xffc857;

export const COLORS = {
  board: 0x14202b,
  cell: 0x22384a,
  cellEdge: 0x3d5a73,
  start: 0x2e6b4a,
  jail: 0x6b3a2e,
  jailBox: 0x3a1f18,
  text: 0xdbe6ee,
  muted: 0x8fa5b5,
  die: 0xf5f1e6,
  pip: 0x1b2630,
  active: 0xffffff,
  outline: 0x0b1218,
  groupText: 0x101820,
  rent: 0xffe08a,
};

export const GROUP_COLORS: Readonly<Record<string, number>> = {
  M1: 0xb88657, M2: 0x6ac5ed, M3: 0xd979bd, M4: 0xf5a742,
  M5: 0xed6464, M6: 0xe2ce50, M7: 0x65bd81, M8: 0x8583ed,
  logistics: 0xb5c1cc, energy: 0x52ddd1,
};
