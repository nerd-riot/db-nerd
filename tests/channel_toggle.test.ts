import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Build Channel & App Icon Toggle System', () => {
  const channelFile = path.join(rootDir, 'channel.json');
  const tauriConfFile = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
  const publicIcon = path.join(rootDir, 'public', 'app-icon.png');
  const publicReleaseIcon = path.join(rootDir, 'public', 'app-icon-release.png');
  const publicBetaIcon = path.join(rootDir, 'public', 'app-icon-beta.png');

  it('both release and beta source icons exist and are valid PNG images', () => {
    assert.ok(fs.existsSync(publicReleaseIcon), 'public/app-icon-release.png must exist');
    assert.ok(fs.existsSync(publicBetaIcon), 'public/app-icon-beta.png must exist');

    const releaseStat = fs.statSync(publicReleaseIcon);
    const betaStat = fs.statSync(publicBetaIcon);
    assert.ok(releaseStat.size > 50000, 'Release icon must be valid high-resolution image');
    assert.ok(betaStat.size > 50000, 'Beta icon must be valid high-resolution image');
  });

  it('both release and beta Tauri icon bundles exist with macOS .icns', () => {
    const releaseIcns = path.join(rootDir, 'src-tauri', 'icons-release', 'icon.icns');
    const betaIcns = path.join(rootDir, 'src-tauri', 'icons-beta', 'icon.icns');

    assert.ok(fs.existsSync(releaseIcns), 'src-tauri/icons-release/icon.icns must exist');
    assert.ok(fs.existsSync(betaIcns), 'src-tauri/icons-beta/icon.icns must exist');
  });

  it('switches build channel to BETA and updates all configuration and icon assets', () => {
    execSync('node scripts/set-channel.js beta', { cwd: rootDir });

    const channelData = JSON.parse(fs.readFileSync(channelFile, 'utf-8'));
    assert.equal(channelData.channel, 'beta');

    const tauriConf = JSON.parse(fs.readFileSync(tauriConfFile, 'utf-8'));
    assert.equal(tauriConf.productName, 'DBNerd Beta');
    assert.equal(tauriConf.identifier, 'com.dbnerd.desktop.beta');
    assert.equal(tauriConf.app?.windows?.[0]?.title, 'DBNerd Beta');

    const activeIconBuf = fs.readFileSync(publicIcon);
    const betaIconBuf = fs.readFileSync(publicBetaIcon);
    assert.ok(activeIconBuf.equals(betaIconBuf), 'Active icon must match beta icon in beta channel');
  });

  it('switches build channel back to RELEASE and restores official assets', () => {
    execSync('node scripts/set-channel.js release', { cwd: rootDir });

    const channelData = JSON.parse(fs.readFileSync(channelFile, 'utf-8'));
    assert.equal(channelData.channel, 'release');

    const tauriConf = JSON.parse(fs.readFileSync(tauriConfFile, 'utf-8'));
    assert.equal(tauriConf.productName, 'DBNerd');
    assert.equal(tauriConf.identifier, 'com.dbnerd.desktop');
    assert.equal(tauriConf.app?.windows?.[0]?.title, 'DBNerd');

    const activeIconBuf = fs.readFileSync(publicIcon);
    const releaseIconBuf = fs.readFileSync(publicReleaseIcon);
    assert.ok(activeIconBuf.equals(releaseIconBuf), 'Active icon must match release icon in release channel');
  });
});
