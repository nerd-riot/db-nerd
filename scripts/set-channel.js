#!/usr/bin/env node

/**
 * Script to toggle build channel between "release" and "beta".
 *
 * Usage:
 *   node scripts/set-channel.js beta
 *   node scripts/set-channel.js release
 *   node scripts/set-channel.js status
 *   node scripts/set-channel.js toggle
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const channelFile = path.join(rootDir, 'channel.json');
const tauriConfFile = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
const indexHtmlFile = path.join(rootDir, 'index.html');

function getCurrentChannel() {
  try {
    if (fs.existsSync(channelFile)) {
      const data = JSON.parse(fs.readFileSync(channelFile, 'utf-8'));
      if (data.channel === 'beta') return 'beta';
    }
  } catch {}
  return 'release';
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const item of fs.readdirSync(src)) {
      copyRecursive(path.join(src, item), path.join(dest, item));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function setChannel(targetChannel) {
  if (targetChannel !== 'beta' && targetChannel !== 'release') {
    console.error(`Invalid channel: "${targetChannel}". Allowed channels are "beta" or "release".`);
    process.exit(1);
  }

  const isBeta = targetChannel === 'beta';
  const appName = isBeta ? 'DBNerd Beta' : 'DBNerd';
  const bundleId = isBeta ? 'com.dbnerd.desktop.beta' : 'com.dbnerd.desktop';

  // 1. Update channel.json
  fs.writeFileSync(channelFile, JSON.stringify({ channel: targetChannel }, null, 2) + '\n');

  // 2. Copy Active Icons
  const iconSuffix = isBeta ? 'beta' : 'release';

  const publicSrc = path.join(rootDir, 'public', `app-icon-${iconSuffix}.png`);
  const publicDest = path.join(rootDir, 'public', 'app-icon.png');
  if (fs.existsSync(publicSrc)) {
    fs.copyFileSync(publicSrc, publicDest);
  }

  const assetSrc = path.join(rootDir, 'src', 'assets', `app-icon-${iconSuffix}.png`);
  const assetDest = path.join(rootDir, 'src', 'assets', 'app-icon.png');
  if (fs.existsSync(assetSrc)) {
    fs.copyFileSync(assetSrc, assetDest);
  }

  const tauriIconsSrc = path.join(rootDir, 'src-tauri', `icons-${iconSuffix}`);
  const tauriIconsDest = path.join(rootDir, 'src-tauri', 'icons');
  if (fs.existsSync(tauriIconsSrc)) {
    copyRecursive(tauriIconsSrc, tauriIconsDest);
  }

  // 3. Update src-tauri/tauri.conf.json
  if (fs.existsSync(tauriConfFile)) {
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfFile, 'utf-8'));
    tauriConf.productName = appName;
    tauriConf.identifier = bundleId;
    if (tauriConf.app?.windows?.[0]) {
      tauriConf.app.windows[0].title = appName;
    }
    fs.writeFileSync(tauriConfFile, JSON.stringify(tauriConf, null, 2) + '\n');
  }

  // 4. Update index.html title
  if (fs.existsSync(indexHtmlFile)) {
    let html = fs.readFileSync(indexHtmlFile, 'utf-8');
    html = html.replace(/<title>.*?<\/title>/, `<title>${appName}</title>`);
    fs.writeFileSync(indexHtmlFile, html);
  }

  console.log(`\x1b[32m✔ Successfully switched build channel to: \x1b[1m${targetChannel.toUpperCase()}\x1b[0m`);
  console.log(`  • Product Name: ${appName}`);
  console.log(`  • Identifier:   ${bundleId}`);
  console.log(`  • Active Icon:  app-icon-${iconSuffix}.png`);
}

// CLI argument parsing
const command = (process.argv[2] || 'status').toLowerCase();

if (command === 'status') {
  const current = getCurrentChannel();
  console.log(`Current DBNerd build channel: \x1b[1m${current.toUpperCase()}\x1b[0m`);
} else if (command === 'toggle') {
  const current = getCurrentChannel();
  const next = current === 'beta' ? 'release' : 'beta';
  setChannel(next);
} else if (command === 'beta' || command === 'release') {
  setChannel(command);
} else {
  console.log('Usage: node scripts/set-channel.js [beta|release|toggle|status]');
  process.exit(1);
}
