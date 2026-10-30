#!/usr/bin/env node

/**
 * Unified 1-Command Build Pipeline for DBNerd Desktop
 *
 * Supports building macOS (.app, .dmg with Applications shortcut, .zip)
 * and Windows (NSIS installer .exe, standalone portable .exe).
 *
 * Usage:
 *   node scripts/build-dist.js --all                  # Build macOS + Windows
 *   node scripts/build-dist.js --mac                  # Build macOS only
 *   node scripts/build-dist.js --win                  # Build Windows only
 *   node scripts/build-dist.js --all --downloads      # Also copy to ~/Downloads
 *   node scripts/build-dist.js --channel=beta         # Set channel before building
 *   node scripts/build-dist.js --channel=release      # Set release channel
 *   node scripts/build-dist.js --out-dir=./dist-bin   # Custom output directory
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Environment PATH enrichment for macOS / cross-compilation
const userHome = os.homedir();
const enrichedPath = [
  path.join(userHome, '.local', 'bin'),
  path.join(userHome, '.cargo', 'bin'),
  '/opt/homebrew/bin',
  '/opt/homebrew/opt/llvm/bin',
  '/usr/local/bin',
  process.env.PATH || '',
].join(':');

const execEnv = {
  ...process.env,
  PATH: enrichedPath,
};

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

function log(msg) {
  console.log(`${colors.cyan}[DBNerd Build]${colors.reset} ${msg}`);
}
function logSuccess(msg) {
  console.log(`${colors.green}✔ ${msg}${colors.reset}`);
}
function logWarn(msg) {
  console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`);
}
function logError(msg) {
  console.error(`${colors.red}✖ ${msg}${colors.reset}`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mac: false,
    win: false,
    all: false,
    downloads: false,
    skipFrontend: false,
    channel: null,
    outDir: path.join(rootDir, 'dist-releases'),
  };

  for (const arg of args) {
    if (arg === '--all') options.all = true;
    else if (arg === '--mac') options.mac = true;
    else if (arg === '--win' || arg === '--windows') options.win = true;
    else if (arg === '--downloads') options.downloads = true;
    else if (arg === '--skip-frontend') options.skipFrontend = true;
    else if (arg.startsWith('--channel=')) options.channel = arg.split('=')[1].trim();
    else if (arg.startsWith('--out-dir=')) options.outDir = path.resolve(arg.split('=')[1].trim());
    else if (arg === '-h' || arg === '--help') {
      console.log(`
${colors.bright}DBNerd Universal Build Pipeline${colors.reset}

Usage:
  node scripts/build-dist.js [options]
  pnpm build:dist [options]

Options:
  --all            Build installers for both macOS and Windows (Default if none specified)
  --mac            Build macOS package (.app, .dmg with Applications shortcut, .zip)
  --win            Build Windows package (NSIS installer .exe, standalone .exe)
  --channel=NAME   Switch channel before build ("beta" or "release")
  --downloads      Automatically copy completed packages to ~/Downloads
  --out-dir=PATH   Destination directory (Default: ./dist-releases)
  --skip-frontend  Skip 'pnpm build' frontend compile step
  -h, --help       Show this help message
`);
      process.exit(0);
    }
  }

  // Default to all if neither mac nor win explicitly selected
  if (!options.mac && !options.win && !options.all) {
    options.all = true;
  }
  if (options.all) {
    options.mac = true;
    options.win = true;
  }

  return options;
}

function findTool(binName) {
  const result = spawnSync('which', [binName], { env: execEnv, encoding: 'utf-8' });
  if (result.status === 0 && result.stdout.trim()) {
    return result.stdout.trim().split('\n')[0];
  }
  return null;
}

function runCmd(cmd, cwd = rootDir) {
  log(`${colors.dim}$ ${cmd}${colors.reset}`);
  execSync(cmd, { cwd, env: execEnv, stdio: 'inherit' });
}

function getChecksum(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

function getAppMetadata() {
  const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf-8'));
  return {
    productName: tauriConf.productName || 'DBNerd',
    version: tauriConf.version || '0.1.0',
    identifier: tauriConf.identifier || 'com.dbnerd.desktop',
  };
}

async function main() {
  const options = parseArgs();
  const startTime = Date.now();

  console.log(`\n${colors.bright}====================================================${colors.reset}`);
  console.log(`${colors.bright}  DBNerd Desktop App Build Pipeline                ${colors.reset}`);
  console.log(`${colors.bright}====================================================${colors.reset}\n`);

  // 1. Channel configuration if requested
  if (options.channel) {
    log(`Configuring build channel to: ${colors.bright}${options.channel}${colors.reset}...`);
    runCmd(`node scripts/set-channel.js ${options.channel}`);
  }

  const { productName, version } = getAppMetadata();
  const safeName = productName.replace(/\s+/g, '_');
  log(`Target product: ${colors.bright}${productName}${colors.reset} (v${version})`);

  // Ensure output directory
  if (!fs.existsSync(options.outDir)) {
    fs.mkdirSync(options.outDir, { recursive: true });
  }

  // 2. Build Frontend
  if (!options.skipFrontend) {
    log(`Building frontend (Vite + TypeScript)...`);
    runCmd('pnpm build');
    logSuccess(`Frontend built successfully.`);
  }

  const artifacts = [];

  // 3. Build macOS packages
  if (options.mac) {
    console.log(`\n${colors.magenta}----------------------------------------------------${colors.reset}`);
    console.log(`${colors.magenta}  Building macOS Release (Apple Silicon / ARM64)    ${colors.reset}`);
    console.log(`${colors.magenta}----------------------------------------------------${colors.reset}\n`);

    log(`Compiling macOS .app via Tauri...`);
    // Build the .app bundle
    runCmd(`pnpm tauri build --target aarch64-apple-darwin --bundles app`);

    // Locate .app
    const candidateAppPaths = [
      path.join(rootDir, 'src-tauri', 'target', 'aarch64-apple-darwin', 'release', 'bundle', 'macos', `${productName}.app`),
      path.join(rootDir, 'src-tauri', 'target', 'release', 'bundle', 'macos', `${productName}.app`),
    ];
    const appPath = candidateAppPaths.find(p => fs.existsSync(p));

    if (!appPath) {
      throw new Error(`Could not find built macOS application at expected paths: ${candidateAppPaths.join(', ')}`);
    }
    logSuccess(`Built application: ${appPath}`);

    // Create standard DMG with Applications symlink
    const dmgFileName = `${safeName}_${version}_aarch64.dmg`;
    const dmgDestPath = path.join(options.outDir, dmgFileName);
    if (fs.existsSync(dmgDestPath)) fs.unlinkSync(dmgDestPath);

    log(`Packaging DMG with Applications shortcut...`);
    const createDmg = findTool('create-dmg');
    if (createDmg) {
      runCmd(
        `create-dmg --volname "${productName}" --app-drop-link 480 170 --skip-jenkins --overwrite "${dmgDestPath}" "${appPath}"`
      );
    } else {
      logWarn(`'create-dmg' not found in PATH, using native hdiutil fallback with Applications symlink...`);
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbnerd-dmg-'));
      const stagedApp = path.join(tempDir, `${productName}.app`);
      runCmd(`ditto "${appPath}" "${stagedApp}"`);
      fs.symlinkSync('/Applications', path.join(tempDir, 'Applications'));
      runCmd(`hdiutil create -volname "${productName}" -srcfolder "${tempDir}" -ov -format UDZO "${dmgDestPath}"`);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    logSuccess(`Generated DMG: ${dmgDestPath}`);
    artifacts.push({ platform: 'macOS (ARM64)', name: dmgFileName, path: dmgDestPath });

    // Create macOS .zip archive
    const zipFileName = `${safeName}_${version}_macOS_aarch64.zip`;
    const zipDestPath = path.join(options.outDir, zipFileName);
    if (fs.existsSync(zipDestPath)) fs.unlinkSync(zipDestPath);

    log(`Packaging ZIP archive...`);
    runCmd(`ditto -c -k --keepParent "${appPath}" "${zipDestPath}"`);
    logSuccess(`Generated ZIP: ${zipDestPath}`);
    artifacts.push({ platform: 'macOS (ARM64)', name: zipFileName, path: zipDestPath });
  }

  // 4. Build Windows packages
  if (options.win) {
    console.log(`\n${colors.cyan}----------------------------------------------------${colors.reset}`);
    console.log(`${colors.cyan}  Building Windows Release (x64 NSIS + Standalone)  ${colors.reset}`);
    console.log(`${colors.cyan}----------------------------------------------------${colors.reset}\n`);

    if (process.platform === 'win32') {
      log(`Compiling native Windows NSIS bundle...`);
      runCmd(`pnpm tauri build --bundles nsis`);
    } else {
      // Cross-compiling
      const cargoXwin = findTool('cargo-xwin');
      const makensis = findTool('makensis');

      if (!cargoXwin || !makensis) {
        logError(`Windows cross-compilation requires 'cargo-xwin' and 'makensis'.`);
        if (!cargoXwin) logError(`  Install cargo-xwin: uv tool install cargo-xwin`);
        if (!makensis) logError(`  Install makensis: brew install nsis`);
        throw new Error(`Missing Windows cross-compilation dependencies.`);
      }

      log(`Cross-compiling Windows x64 binary & NSIS installer via cargo-xwin...`);
      runCmd(
        `pnpm tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc -c '{"bundle":{"targets":["nsis"]}}' --no-sign`
      );
    }

    // Locate Windows NSIS installer
    const candidateNsisDirs = [
      path.join(rootDir, 'src-tauri', 'target', 'release', 'bundle', 'nsis'),
      path.join(rootDir, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release', 'bundle', 'nsis'),
    ];
    let setupExePath = null;
    for (const dir of candidateNsisDirs) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.exe'));
        if (files.length > 0) {
          setupExePath = path.join(dir, files[0]);
          break;
        }
      }
    }

    // Locate standalone exe
    const candidateStandalonePaths = [
      path.join(rootDir, 'src-tauri', 'target', 'release', 'DBNerd.exe'),
      path.join(rootDir, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release', 'DBNerd.exe'),
    ];
    const standaloneExePath = candidateStandalonePaths.find(p => fs.existsSync(p));

    if (setupExePath && fs.existsSync(setupExePath)) {
      const setupFileName = `${safeName}_${version}_Windows_x64_Setup.exe`;
      const setupDestPath = path.join(options.outDir, setupFileName);
      fs.copyFileSync(setupExePath, setupDestPath);
      logSuccess(`Generated Windows NSIS Setup: ${setupDestPath}`);
      artifacts.push({ platform: 'Windows (x64)', name: setupFileName, path: setupDestPath });
    } else {
      logWarn(`Could not locate generated NSIS setup installer.`);
    }

    if (fs.existsSync(standaloneExePath)) {
      const standaloneFileName = `${safeName}_${version}_Windows_x64_standalone.exe`;
      const standaloneDestPath = path.join(options.outDir, standaloneFileName);
      fs.copyFileSync(standaloneExePath, standaloneDestPath);
      logSuccess(`Generated Windows Standalone: ${standaloneDestPath}`);
      artifacts.push({ platform: 'Windows (x64)', name: standaloneFileName, path: standaloneDestPath });
    }
  }

  // 5. Copy to ~/Downloads if requested
  const downloadsDir = path.join(userHome, 'Downloads');
  if (options.downloads && fs.existsSync(downloadsDir)) {
    log(`Copying release artifacts to ${downloadsDir}...`);
    for (const art of artifacts) {
      const dest = path.join(downloadsDir, art.name);
      fs.copyFileSync(art.path, dest);
      logSuccess(`Copied: ${dest}`);
    }
  }

  // 6. Generate Checksums
  const checksumFilePath = path.join(options.outDir, 'checksums.txt');
  const checksumLines = [];
  for (const art of artifacts) {
    const hash = getChecksum(art.path);
    art.hash = hash;
    art.size = fs.statSync(art.path).size;
    checksumLines.push(`${hash}  ${art.name}`);
  }
  fs.writeFileSync(checksumFilePath, checksumLines.join('\n') + '\n');
  logSuccess(`Generated Checksums: ${checksumFilePath}`);

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

  // 7. Print Release Summary
  console.log(`\n${colors.bright}========================================================================${colors.reset}`);
  console.log(`${colors.bright}  BUILD COMPLETE (${elapsedSec}s) — Release Artifacts: ${colors.reset}`);
  console.log(`${colors.bright}========================================================================${colors.reset}`);
  console.log(
    `${colors.dim}${'Platform'.padEnd(16)} ${'File Name'.padEnd(46)} ${'Size'.padEnd(10)} ${'SHA256 (first 12)'}${colors.reset}`
  );
  console.log(`${colors.dim}${'─'.repeat(84)}${colors.reset}`);

  for (const art of artifacts) {
    const sizeStr = formatSize(art.size);
    const shortHash = art.hash.substring(0, 12);
    console.log(
      `${colors.green}${art.platform.padEnd(16)}${colors.reset} ${colors.bright}${art.name.padEnd(46)}${colors.reset} ${sizeStr.padEnd(10)} ${shortHash}`
    );
  }
  console.log(`${colors.dim}${'─'.repeat(84)}${colors.reset}`);
  console.log(`${colors.cyan}Output Directory:${colors.reset} ${options.outDir}`);
  if (options.downloads) {
    console.log(`${colors.cyan}Downloads Directory:${colors.reset} ${downloadsDir}`);
  }
  console.log(`${colors.bright}========================================================================\n${colors.reset}`);
}

main().catch(err => {
  logError(`Build failed: ${err.message}`);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
