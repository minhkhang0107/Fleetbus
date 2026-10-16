/**
 * Syntax check for every JavaScript file of the project.
 * `node --check a.js b.js` only checks the first file, so each file is checked on its own.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = ['source', 'test', 'tools'];
const skippedDirs = new Set(['node_modules', 'web_dist', 'build', '.dart_tool', '.git', 'ephemeral']);
const extensions = new Set(['.js', '.cjs', '.mjs']);

function collect(dir, files) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skippedDirs.has(entry.name)) collect(path.join(dir, entry.name), files);
    } else if (extensions.has(path.extname(entry.name))) {
      files.push(path.join(dir, entry.name));
    }
  }
}

const files = [];
for (const dir of roots) collect(path.join(root, dir), files);

const failures = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) failures.push({ file, output: (result.stderr || result.stdout).trim() });
}

if (failures.length > 0) {
  for (const { file, output } of failures) {
    console.error(`FAIL ${path.relative(root, file)}\n${output}\n`);
  }
  console.error(`Syntax check failed: ${failures.length} of ${files.length} files`);
  process.exit(1);
}

console.log(`Syntax check passed: ${files.length} files`);
