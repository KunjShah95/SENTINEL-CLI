/**
 * Re-exported from the single implementation.
 *
 * This file used to be the *fourth* copy of the package.json walk — with its own
 * candidate paths, its own hardcoded `'2.0.0'` fallback (which was wrong; the
 * real answer had been 3.x for a long time), and no test. The logic now lives in
 * `src/version.js`, which every other caller uses too.
 */
export { getVersion, getDisplayVersion } from '../../version.js';
