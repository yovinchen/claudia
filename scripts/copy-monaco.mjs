#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.join(projectRoot, 'node_modules', 'monaco-editor', 'min', 'vs');
const destDir = path.join(projectRoot, 'public', 'monaco', 'vs');
const mapsSrcDir = path.join(projectRoot, 'node_modules', 'monaco-editor', 'min-maps', 'vs');
const mapsDestDir = path.join(projectRoot, 'public', 'min-maps', 'vs');

function copyRecursiveSync(src, dest) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      copyRecursiveSync(path.join(src, item), path.join(dest, item));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

try {
  if (!fs.existsSync(srcDir)) {
    console.warn('[copy-monaco] monaco-editor not found at', srcDir);
    process.exit(0);
  }
  console.log('[copy-monaco] Ensuring Monaco assets are available...');
  console.log('[copy-monaco] Copying', srcDir, '->', destDir);
  copyRecursiveSync(srcDir, destDir);
  if (fs.existsSync(mapsSrcDir)) {
    console.log('[copy-monaco] Copying', mapsSrcDir, '->', mapsDestDir);
    copyRecursiveSync(mapsSrcDir, mapsDestDir);
  } else {
    console.warn('[copy-monaco] Source maps directory not found:', mapsSrcDir);
  }
  console.log('[copy-monaco] Done.');
} catch (e) {
  console.error('[copy-monaco] Error:', e);
  process.exit(1);
}
