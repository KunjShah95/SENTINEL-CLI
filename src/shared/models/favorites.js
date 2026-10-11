/**
 * Favourites and recently-used models.
 *
 * Pure list handling lives here and is unit tested directly; the async wrappers
 * at the bottom are the only things that touch disk, and they delegate to
 * `prefs.js` like `variants.js` does.
 */

/** How many models `f2` steps through. */
export const RECENT_LIMIT = 10;

/**
 * Star or unstar, returning a new list.
 *
 * Unstarring removes in place rather than filtering by value: two ids cannot
 * collide, so a filter would be equivalent, but splice makes the intent (drop
 * this one entry) readable and cannot drop a different entry that happens to
 * compare equal.
 */
export function toggleFavorite(list, modelId) {
  const current = Array.isArray(list) ? list : [];
  if (!modelId) return current;
  const at = current.indexOf(modelId);
  if (at < 0) return [modelId, ...current];
  return current.filter((_, i) => i !== at);
}

/** Move a model to the front of the recents, deduplicated and capped. */
export function recordRecent(list, modelId, limit = RECENT_LIMIT) {
  const current = Array.isArray(list) ? list : [];
  if (!modelId) return current;
  // Remove first, then unshift: appending would leave the same model at both
  // ends and `f2` would appear to do nothing.
  const without = current.filter(id => id !== modelId);
  return [modelId, ...without].slice(0, Math.max(0, limit));
}

/**
 * The model a cycle step lands on.
 *
 * Starts past the current model rather than at it, so `f2` always changes
 * something. Null when there is nothing to step to — a single-entry recents
 * list, or a model that is not in it at all — which the caller reports rather
 * than silently re-selecting the current model.
 */
export function cycleModel(recents, currentModel, step) {
  if (!Array.isArray(recents) || recents.length === 0) return null;
  const current = recents.indexOf(currentModel);
  // Not in the list, or only entry: either way there is no other model to reach.
  if (current < 0 || recents.length < 2) return null;
  const len = recents.length;
  const next = (current + step) % len;
  return recents[((next % len) + len) % len] ?? null;
}

/**
 * Hoist favourites to the front, keeping every other row in place.
 *
 * A stable partition rather than a sort: the catalog arrives ranked, and
 * re-sorting would discard that ranking for every non-favourite. Only the
 * favourites move.
 */
export function favoritesFirst(models, favorites) {
  if (!Array.isArray(favorites) || favorites.length === 0) return models;
  const favs = new Set(favorites);
  const starred = [];
  const rest = [];
  for (const m of models) (favs.has(m.id) ? starred : rest).push(m);
  return starred.concat(rest);
}
