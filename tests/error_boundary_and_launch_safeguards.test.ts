import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Error Boundary & Launch Safeguards', () => {
  const rootDir = path.resolve(__dirname, '..');

  it('ErrorBoundary component defines getDerivedStateFromError and user recovery actions', () => {
    const errorBoundaryCode = fs.readFileSync(path.join(rootDir, 'src', 'components', 'ErrorBoundary.tsx'), 'utf-8');

    // Verifies ErrorBoundary catches rendering errors
    assert.match(errorBoundaryCode, /class ErrorBoundary extends Component/);
    assert.match(errorBoundaryCode, /static getDerivedStateFromError/);
    assert.match(errorBoundaryCode, /componentDidCatch/);

    // Verifies recovery actions exist
    assert.match(errorBoundaryCode, /handleReload\s*=\s*\(\)\s*=>/);
    assert.match(errorBoundaryCode, /handleResetWorkspace\s*=\s*\(\)\s*=>/);
    assert.match(errorBoundaryCode, /handleCopyDetails\s*=\s*\(\)\s*=>/);

    // Verifies action buttons
    assert.match(errorBoundaryCode, /Reload Application/);
    assert.match(errorBoundaryCode, /Reset Workspace/);
    assert.match(errorBoundaryCode, /Copy Error/);
  });

  it('index.html contains dark background color and critical inline style to prevent white screen flash', () => {
    const htmlContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');

    // Body has dark styling
    assert.match(htmlContent, /class="[^"]*bg-\[#0a0f1d\][^"]*"/);
    assert.match(htmlContent, /class="[^"]*text-slate-100[^"]*"/);

    // Inline style block defines dark background for html and body
    assert.match(htmlContent, /background-color:\s*#0a0f1d;/);
    assert.match(htmlContent, /app-initial-loader/);
    assert.match(htmlContent, /app-initial-spinner/);
  });

  it('tauri.conf.json sets window theme to Dark and backgroundColor to #0a0f1d', () => {
    const configContent = fs.readFileSync(path.join(rootDir, 'src-tauri', 'tauri.conf.json'), 'utf-8');
    const tauriConfig = JSON.parse(configContent);

    const mainWindow = tauriConfig.app?.windows?.[0];
    assert.ok(mainWindow, 'Main window must be configured in tauri.conf.json');
    assert.equal(mainWindow.theme, 'Dark');
    assert.equal(mainWindow.backgroundColor, '#0a0f1d');
  });

  it('main.tsx imports App.css early and wraps application inside ErrorBoundary', () => {
    const mainContent = fs.readFileSync(path.join(rootDir, 'src', 'main.tsx'), 'utf-8');

    assert.match(mainContent, /import\s+["']\.\/App\.css["']/);
    assert.match(mainContent, /import\s+\{\s*ErrorBoundary\s*\}\s+from\s+["']\.\/components\/ErrorBoundary["']/);
    assert.match(mainContent, /<ErrorBoundary>\s*<App\s*\/>\s*<\/ErrorBoundary>/);
    assert.match(mainContent, /window\.addEventListener\(["']error["']/);
    assert.match(mainContent, /window\.addEventListener\(["']unhandledrejection["']/);
  });
});
