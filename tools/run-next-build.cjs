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

if (require.main === module) {
  const preload = `--require=${__filename}`;
  const projectRoot = fs.realpathSync(process.cwd());
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
