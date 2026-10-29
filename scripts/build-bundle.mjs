#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, copyFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const layers = ['backend', 'frontend', 'cli'];
const bundle = join(root, 'bundle');
const args = process.argv.slice(2);

function run(command, values, { cwd = root, capture = false, allowed = [0] } = {}) {
  if (!capture) console.log(`\n$ ${command} ${values.join(' ')}`);
  const result = spawnSync(command, values, {
    cwd,
    stdio: capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    env: { ...process.env, NG_CLI_ANALYTICS: 'false' }
  });
  if (result.error) throw new Error(`Cannot run ${command}: ${result.error.message}`);
  if (!allowed.includes(result.status)) {
    throw new Error(`${command} failed with exit ${result.status ?? result.signal}.${capture ? `\n${result.stderr}` : ''}`);
  }
  return result;
}

function git(values, cwd = root, options = {}) {
  return run('git', values, { ...options, cwd });
}

function hasStagedChanges(cwd) {
  return git(['diff', '--cached', '--quiet'], cwd, { capture: true, allowed: [0, 1] }).status === 1;
}

function assertClean(cwd, label) {
  const status = git(['status', '--porcelain', '--untracked-files=all'], cwd, { capture: true }).stdout.trim();
  if (status) throw new Error(`${label} has local changes. Commit or stash them before bundling.\n${status}`);
}

function commitIfChanged(cwd, label, message) {
  if (!hasStagedChanges(cwd)) {
    console.log(`${label}: nothing to commit.`);
    return;
  }
  const identity = ['user.name', 'user.email'].flatMap((key) => {
    const config = git(['config', '--get', key], root, { capture: true, allowed: [0, 1] });
    return config.status === 0 ? ['-c', `${key}=${config.stdout.trim()}`] : [];
  });
  git([...identity, 'commit', '-m', message], cwd);
}

async function build() {
  if (args.some((arg) => arg !== '--push')) {
    throw new Error('Usage: node scripts/build-bundle.mjs [--push]');
  }
  const branch = git(['symbolic-ref', '--quiet', '--short', 'HEAD'], root, {
    capture: true, allowed: [0, 1]
  }).stdout.trim();
  if (branch && branch !== 'main') throw new Error('Run this script from main (or a detached CI checkout of main).');
  if (hasStagedChanges(root)) throw new Error('Main has staged changes. Commit or unstage them before bundling.');
  for (const layer of [...layers, 'bundle']) {
    const directory = join(root, layer);
    if (existsSync(join(directory, '.git'))) assertClean(directory, layer);
  }

  git(['submodule', 'update', '--init', '--remote', ...layers]);
  git(['submodule', 'update', '--init', 'bundle']);
  git(['fetch', 'origin', 'bundle'], bundle);
  git(['merge', '--ff-only', 'origin/bundle'], bundle);
  assertClean(bundle, 'bundle');

  const frontend = join(root, 'frontend');
  const browser = join(frontend, 'dist', 'snip-frontend', 'browser');
  if (process.platform === 'win32') {
    run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm install'], { cwd: frontend });
  } else {
    run('npm', ['install'], { cwd: frontend });
  }
  await rm(browser, { recursive: true, force: true });
  run(process.execPath, [join(frontend, 'node_modules', '@angular', 'cli', 'bin', 'ng.js'), 'build'], {
    cwd: frontend
  });
  const index = join(browser, 'index.html');
  if (!(await stat(index).catch(() => null))?.isFile()) {
    throw new Error(`Frontend build is missing ${index}. Keep the Angular project named snip-frontend.`);
  }
  for (const layer of layers) assertClean(join(root, layer), layer);

  const revisions = layers.map((layer) => [layer,
    git(['rev-parse', 'HEAD'], join(root, layer), { capture: true }).stdout.trim()]);
  for (const entry of await readdir(bundle)) {
    if (entry !== '.git') await rm(join(bundle, entry), { recursive: true, force: true });
  }
  await copyFile(join(root, 'backend', 'server.js'), join(bundle, 'server.js'));
  await copyFile(join(root, 'cli', 'cli.js'), join(bundle, 'cli.js'));
  await cp(browser, join(bundle, 'public'), { recursive: true });

  const files = {
    '.env': 'PUBLIC_DIR=./public\n',
    'package.json': `${JSON.stringify({
      name: 'snip-bundle', version: '1.0.0', private: true,
      scripts: { start: 'bun server.js' }
    }, null, 2)}\n`,
    'Dockerfile': 'FROM oven/bun:1-alpine\nWORKDIR /app\nCOPY . .\nENV PORT=3000\nEXPOSE 3000\nCMD ["bun", "server.js"]\n',
    '.dockerignore': '.git\nnode_modules\n*.log\n.DS_Store\n',
    'railway.json': `${JSON.stringify({
      $schema: 'https://railway.app/railway.schema.json',
      build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' }
    }, null, 2)}\n`,
    'README.md': `# Generated Snip Bundle

Generated release output. Do not hand-edit these files.
Rebuild from main with \`node scripts/build-bundle.mjs\` (add \`--push\` to publish).

Run \`bun server.js\` from this directory. Bun loads \`.env\`, enabling the
bundled UI in \`public/\`. Run the CLI with \`node cli.js ls\`.
The package intentionally has no \`type\` field so the CLI remains CommonJS.
The Docker image includes \`.env\`; Railway uses the Dockerfile builder.
The current frontend source calls http://localhost:3000; remote browser
deployments need a source-layer API-origin change followed by a rebuild.

## Source Commits

| Layer | Commit |
| --- | --- |
${revisions.map(([layer, revision]) => `| ${layer} | ${revision} |`).join('\n')}
`
  };
  await Promise.all(Object.entries(files).map(([name, content]) =>
    writeFile(join(bundle, name), content, 'utf8')));

  git(['add', '--all'], bundle);
  git(['add', '--force', '.env'], bundle);
  git(['update-index', '--chmod=+x', 'cli.js'], bundle);
  commitIfChanged(bundle, 'bundle', 'Generate Snip release bundle');
  if (hasStagedChanges(root)) throw new Error('Main acquired staged changes during the build; refusing to include them.');
  git(['add', ...layers, 'bundle']);
  commitIfChanged(root, 'main', 'Bump source and bundle submodules');

  if (args.includes('--push')) {
    git(['push', 'origin', 'HEAD:bundle'], bundle);
    git(['push', 'origin', 'HEAD:main']);
  } else {
    console.log('Local build only; nothing pushed. Re-run with --push to publish existing commits.');
  }
  console.log('Bundle ready: bundle/server.js, bundle/cli.js, bundle/public/index.html');
}

build().catch((error) => {
  console.error(`build-bundle: ${error.message}`);
  process.exitCode = 1;
});