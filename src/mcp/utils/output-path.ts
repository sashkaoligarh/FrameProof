import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const OUTPUT_ROOT_ENV = 'FRAMEPROOF_OUTPUT_ROOT';

interface OutputRoots {
  configured: string;
  real: string;
}

interface DirectoryIdentity {
  dev: number;
  ino: number;
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function configuredOutputRoot(): { root: string; explicit: boolean } {
  const configured = process.env[OUTPUT_ROOT_ENV];
  const explicit = configured !== undefined && configured.length > 0;
  return {
    root: path.resolve(explicit ? configured : process.cwd()),
    explicit,
  };
}

function broadRootDescription(candidate: string): string | undefined {
  if (candidate === path.parse(candidate).root) return 'the filesystem root';

  const home = path.resolve(os.homedir());
  let realHome = home;
  try {
    realHome = fs.realpathSync(home);
  } catch {
    // The lexical home path is still sufficient if the configured home is unavailable.
  }
  if (candidate === home || candidate === realHome) return 'the user home directory';
  return undefined;
}

function assertSafeOutputRoot(candidate: string, explicit: boolean): void {
  const description = broadRootDescription(candidate);
  if (!description) return;

  if (explicit) {
    throw new Error(
      `Refusing to use ${description} as the output root. Set ${OUTPUT_ROOT_ENV} to a narrower project directory.`,
    );
  }
  throw new Error(
    `Refusing to use ${description} as the default output root. Set ${OUTPUT_ROOT_ENV} to a project directory ` +
      'or launch frameproof inside a project.',
  );
}

function outputRoots(): OutputRoots {
  const { root: configured, explicit } = configuredOutputRoot();
  assertSafeOutputRoot(configured, explicit);
  fs.mkdirSync(configured, { recursive: true, mode: 0o700 });
  const real = fs.realpathSync(configured);
  assertSafeOutputRoot(real, explicit);
  return { configured, real };
}

function rejectTraversal(requestedPath: string): void {
  if (requestedPath.length === 0 || requestedPath.includes('\0')) {
    throw new Error('Output path must not be empty or contain null bytes.');
  }

  if (requestedPath.split(/[\\/]+/).includes('..')) {
    throw new Error(`Output path traversal is not allowed: "${requestedPath}".`);
  }

  if (!path.isAbsolute(requestedPath) && path.win32.isAbsolute(requestedPath)) {
    throw new Error(`Output path uses an unsupported absolute path: "${requestedPath}".`);
  }
}

function assertExistingPathWithinRoot(root: string, candidate: string): void {
  let existing = candidate;
  while (true) {
    try {
      fs.lstatSync(existing);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }

  let realExisting: string;
  try {
    realExisting = fs.realpathSync(existing);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Output path contains a dangling symbolic link: "${candidate}".`);
    }
    throw error;
  }
  if (!isWithin(root, realExisting)) {
    throw new Error(`Output path escapes the configured safe root through a symbolic link: "${candidate}".`);
  }
}

function resolveOutputPathWithinRoots(requestedPath: string, roots: OutputRoots): string {
  rejectTraversal(requestedPath);

  let resolved: string;
  if (path.isAbsolute(requestedPath)) {
    const absolute = path.resolve(requestedPath);
    if (isWithin(roots.configured, absolute)) {
      resolved = path.resolve(roots.real, path.relative(roots.configured, absolute));
    } else if (isWithin(roots.real, absolute)) {
      resolved = absolute;
    } else {
      throw new Error(
        `Output path must be inside the configured safe root "${roots.configured}": "${requestedPath}".`,
      );
    }
  } else {
    resolved = path.resolve(roots.real, requestedPath);
  }

  if (!isWithin(roots.real, resolved)) {
    throw new Error(`Output path escapes the configured safe root: "${requestedPath}".`);
  }

  assertExistingPathWithinRoot(roots.real, resolved);
  return resolved;
}

function prepareOutputDirectoryWithinRoots(requestedPath: string, roots: OutputRoots): string {
  const outputDir = resolveOutputPathWithinRoots(requestedPath, roots);
  fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });

  const realOutputDir = fs.realpathSync(outputDir);
  if (!isWithin(roots.real, realOutputDir)) {
    throw new Error(`Output directory escapes the configured safe root: "${requestedPath}".`);
  }
  return realOutputDir;
}

/** Resolve a caller-provided output path beneath the configured safe root. */
export function resolveOutputPath(requestedPath: string): string {
  return resolveOutputPathWithinRoots(requestedPath, outputRoots());
}

/** Resolve and create an output directory, rechecking it after creation for symlink escapes. */
export function prepareOutputDirectory(requestedPath: string): string {
  return prepareOutputDirectoryWithinRoots(requestedPath, outputRoots());
}

function assertOutputDirectoryUnchanged(
  root: string,
  outputDir: string,
  identity: DirectoryIdentity,
): void {
  const realOutputDir = fs.realpathSync(outputDir);
  if (!isWithin(root, realOutputDir)) {
    throw new Error(`Output directory escaped the configured safe root before the file could be committed: "${outputDir}".`);
  }

  const current = fs.statSync(outputDir);
  if (!current.isDirectory() || current.dev !== identity.dev || current.ino !== identity.ino) {
    throw new Error(`Output directory changed before the file could be committed: "${outputDir}".`);
  }
}

function exclusiveWriteFlags(): number {
  const noFollow = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
  return fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | noFollow;
}

/** Write a file atomically in its destination directory and return its resolved path. */
export function atomicWriteOutputFile(
  requestedPath: string,
  data: string | Uint8Array,
  encoding: BufferEncoding = 'utf8',
): string {
  const roots = outputRoots();
  const outputPath = resolveOutputPathWithinRoots(requestedPath, roots);
  const outputDir = prepareOutputDirectoryWithinRoots(path.dirname(outputPath), roots);
  const outputDirStats = fs.statSync(outputDir);
  const outputDirIdentity = { dev: outputDirStats.dev, ino: outputDirStats.ino };
  const finalPath = path.join(outputDir, path.basename(outputPath));
  const temporaryPath = path.join(outputDir, `.${path.basename(outputPath)}.${randomUUID()}.tmp`);
  let descriptor: number | undefined;

  try {
    descriptor = fs.openSync(temporaryPath, exclusiveWriteFlags(), 0o600);
    if (typeof data === 'string') {
      fs.writeFileSync(descriptor, data, { encoding });
    } else {
      fs.writeFileSync(descriptor, data);
    }
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    assertOutputDirectoryUnchanged(roots.real, outputDir, outputDirIdentity);
    fs.renameSync(temporaryPath, finalPath);
    return finalPath;
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try {
      assertOutputDirectoryUnchanged(roots.real, outputDir, outputDirIdentity);
      fs.unlinkSync(temporaryPath);
    } catch {
      // Do not follow a replaced output directory merely to clean up a temporary file.
    }
    throw error;
  }
}

export function nodeIdFilenamePart(nodeId: string): string {
  return nodeId
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'node';
}
