// Google Drive puts a desktop.ini in every folder it syncs. This project lives
// inside the synced tree, so there are 978 of them in node_modules alone -- and,
// fatally, one inside .next/cache/turbopack/v16.3.4-<hash>/.
//
// Turbopack's persistence layer reads that directory and parses each filename as
// a number. "desktop.ini" is not a number, so the build dies before it starts:
//
//     Failed to open database
//       0: Loading persistence directory failed
//       1: invalid digit found in string
//
// It struck on every build AFTER a successful one, because a successful build is
// what creates the directory for Drive to then decorate. The workaround was to
// throw the whole cache away each time, which is both slow and how two 50MB
// folders ended up loose in the repo.
//
// This is the same shape of problem as the git one: Drive cannot be trusted
// inside a working tree, and the answer there was to move the real gitdir to
// C:/Users/immex/dev/. Moving .next is not available -- it was tried, and a
// junction breaks Node's module resolution, because resolving "next/dist/..."
// from C:/Users/immex/dev/ walks up to C:/ and never finds node_modules.
//
// So the file is removed instead, immediately before the cache is opened.
// Deliberately narrow: an exact allow-list of known Drive and Explorer droppings,
// under the cache directory only. It will never touch anything Turbopack wrote.
const fs = require("fs");
const path = require("path");

// Exact names only. No patterns, no extensions, nothing inferred.
const JUNK = new Set(["desktop.ini", "Desktop.ini", "Thumbs.db", "thumbs.db", ".DS_Store"]);

function clean(dir, removed) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return; // No cache yet, or no permission. Either way there is nothing to do.
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      clean(p, removed);
    } else if (JUNK.has(e.name)) {
      try {
        // Drive marks these read-only, and its folder System as well, so the
        // unlink is refused unless the attribute is cleared first.
        fs.chmodSync(p, 0o666);
        fs.unlinkSync(p);
        removed.push(p);
      } catch (err) {
        // A file we cannot remove is worth knowing about -- it means the next
        // build will fail the same way -- but it must never stop this one.
        console.warn("[drive-junk] could not remove " + p + ": " + err.message);
      }
    }
  }
}

function cleanBuildCache(root) {
  const cache = path.join(root || process.cwd(), ".next", "cache", "turbopack");
  const removed = [];
  clean(cache, removed);
  if (removed.length) {
    console.warn(
      "[drive-junk] removed " + removed.length +
        " Drive/Explorer file(s) from the Turbopack cache; without this the build fails with 'invalid digit found in string'"
    );
  }
  return removed;
}

module.exports = { cleanBuildCache };

// Runnable on its own, for when a build has already failed and you want to see
// what it found: node scripts/clean-drive-junk.js
if (require.main === module) {
  const removed = cleanBuildCache(path.join(__dirname, ".."));
  console.log(removed.length ? removed.join("\n") : "nothing to clean");
}
