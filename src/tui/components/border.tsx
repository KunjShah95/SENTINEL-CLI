// Stub: border constants are no longer needed for Ink rendering.
// Kept for import compatibility only.

export const EmptyBorder = {
  topLeft: '',
  bottomLeft: '',
  vertical: '',
  topRight: '',
  bottomRight: '',
  horizontal: ' ',
  bottomT: '',
  topT: '',
  cross: '',
  leftT: '',
  rightT: '',
};

export const SplitBorderChars = {
  ...EmptyBorder,
  vertical: '┃',
};

export const SentinelBorderChars = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  vertical: '│',
  horizontal: '─',
  bottomT: '┴',
  topT: '┬',
  cross: '┼',
  leftT: '├',
  rightT: '┤',
};
