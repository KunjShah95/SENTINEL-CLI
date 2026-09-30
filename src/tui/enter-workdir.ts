/**
 * Must stay the FIRST import of index.tsx. bin/sentinel.js starts tsx from
 * Sentinel's own directory, because tsx's preloaded loader is resolved
 * against the cwd and Node aborts on a malformed package.json there, so a
 * project with a broken package.json could not open the TUI at all. The
 * user's directory arrives in SENTINEL_CWD; every tool resolves paths
 * against cwd, so switch back before anything else loads.
 */
const dir = process.env.SENTINEL_CWD;
if (dir) {
  try {
    process.chdir(dir);
  } catch (e) {
    // Staying in the install directory would point file and shell tools at
    // Sentinel itself instead of the project; refuse instead.
    console.error(`sentinel: cannot enter ${dir}: ${(e as Error).message}`);
    process.exit(1);
  }
}
