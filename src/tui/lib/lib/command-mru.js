const MAX_MRU = 5;
const recent = [];
export function recordCommand(name) {
  const idx = recent.indexOf(name);
  if (idx !== -1)
    recent.splice(idx, 1);
  recent.unshift(name);
  if (recent.length > MAX_MRU)
    recent.length = MAX_MRU;
}
export function getRecentCommands() {
  return [...recent];
}
export function getMruBoost(name) {
  const idx = recent.indexOf(name);
  return idx === -1 ? 0 : MAX_MRU - idx;
}
