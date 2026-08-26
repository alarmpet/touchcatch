const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');

const isTemporaryExportNotEmpty = (target, error) => {
  const value = String(target);
  const exportRoot = `${path.sep}export`;
  return error?.code === 'ENOTEMPTY' &&
    (value.endsWith(exportRoot) || value.includes(`${exportRoot}${path.sep}`));
};

const originalRmdir = fs.rmdir.bind(fs);
fs.rmdir = (target, options, callback) => {
  const hasOptions = typeof options !== 'function';
  const done = hasOptions ? callback : options;
  const complete = (error) => {
    if (isTemporaryExportNotEmpty(target, error)) return done(null);
    return done(error);
  };
  return hasOptions ? originalRmdir(target, options, complete) : originalRmdir(target, complete);
};

const originalRmdirSync = fs.rmdirSync.bind(fs);
fs.rmdirSync = (target, options) => {
  try {
    return originalRmdirSync(target, options);
  } catch (error) {
    if (!isTemporaryExportNotEmpty(target, error)) throw error;
    return undefined;
  }
};

const originalPromiseRmdir = fsPromises.rmdir.bind(fsPromises);
fsPromises.rmdir = async (target, options) => {
  try {
    return await originalPromiseRmdir(target, options);
  } catch (error) {
    if (!isTemporaryExportNotEmpty(target, error)) throw error;
    return undefined;
  }
};
fs.promises.rmdir = fsPromises.rmdir;

function normalizeReadlinkError(error) {
  if (error && error.code === 'EISDIR') {
    error.code = 'EINVAL';
    error.message = error.message.replace('EISDIR', 'EINVAL');
  }
  return error;
}

const originalReadlink = fs.readlink.bind(fs);
fs.readlink = (path, options, callback) => {
  const hasOptions = typeof options !== 'function';
  const done = hasOptions ? callback : options;
  const complete = (error, value) => done(normalizeReadlinkError(error), value);
  return hasOptions
    ? originalReadlink(path, options, complete)
    : originalReadlink(path, complete);
};

const originalReadlinkSync = fs.readlinkSync.bind(fs);
fs.readlinkSync = (...args) => {
  try {
    return originalReadlinkSync(...args);
  } catch (error) {
    throw normalizeReadlinkError(error);
  }
};

const originalPromiseReadlink = fs.promises.readlink.bind(fs.promises);
fs.promises.readlink = async (...args) => {
  try {
    return await originalPromiseReadlink(...args);
  } catch (error) {
    throw normalizeReadlinkError(error);
  }
};

/**
 * Removes build directories left by earlier runs.
 *
 * Every build gets its own `distDir` on purpose, so a directory a previous run still holds open
 * can never block the next one. Nothing ever removed them, though, and they are gitignored, so
 * they accumulate silently -- 95 of them and 7.1 GB by the time anyone looked.
 *
 * Pruning happens on the way in, not on the way out, because `admin:client-secret-check` runs
 * after the build and reads the directory this run is about to create. The directory named by
 * the existing marker is spared so a concurrent build keeps its output, and any directory that
 * cannot be removed -- held open by that build, or by an editor -- is simply skipped and pruned
 * on a later run. Failing to tidy is never a reason to fail a build.
 */
function prunePreviousBuilds(projectRoot) {
  let active = null;
  try {
    const marker = fs.readFileSync(path.resolve(projectRoot, '.next-build-active.json'), 'utf8');
    active = JSON.parse(marker).distDir;
  } catch {
    active = null;
  }
  let entries = [];
  try {
    entries = fs.readdirSync(projectRoot, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith('.next-build-') || entry.name === active) continue;
    try {
      fs.rmSync(path.resolve(projectRoot, entry.name), { recursive: true, force: true });
    } catch {
      // Held open. Next run gets it.
    }
  }
}

if (require.main === module) {
  const preload = `--require=${__filename}`;
  const projectRoot = fs.realpathSync(process.cwd());
  prunePreviousBuilds(projectRoot);
  const distDir = `.next-build-${process.pid}-${Date.now()}`;
  const distPath = path.resolve(projectRoot, distDir);
  if (path.dirname(distPath) !== projectRoot) {
    throw new Error(`Unsafe Next build output: ${distPath}`);
  }
  fs.writeFileSync(
    path.resolve(projectRoot, '.next-build-active.json'),
    `${JSON.stringify({ distDir })}\n`,
    'utf8',
  );
  process.env.NEXT_DIST_DIR = distDir;
  process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, preload]
    .filter(Boolean)
    .join(' ');
  process.argv.push('build', '--webpack');
  require('next/dist/bin/next');
}
