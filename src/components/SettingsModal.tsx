import React, { useState } from 'react';
import { useAppStore } from '../stores/useAppStore';
import {
  X,
  Sun,
  Moon,
  Laptop,
  Check,
  RotateCcw,
  Sliders,
  Keyboard,
  Database,
  Sparkles,
  ShieldAlert,
  Palette,
  Bell,
} from 'lucide-react';
import { RowDensity } from '../types';
import { APP_THEMES } from '../themes/themeRegistry';

export const SettingsModal: React.FC = () => {
  const {
    settings,
    updateSettings,
    setThemeMode,
    setAppTheme,
    isSettingsModalOpen,
    setSettingsModalOpen,
    showToast,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'appearance' | 'query' | 'shortcuts'>('appearance');

  if (!isSettingsModalOpen) return null;

  const handleResetDefaults = () => {
    if (confirm('Reset all preferences to default values?')) {
      updateSettings({
        themeMode: 'auto',
        editorFontSize: 13,
        rowDensity: 'normal',
        autoFormatSql: false,
        confirmDestructive: true,
        defaultQueryLimit: 100,
        toastPosition: 'bottom-right',
      });
      showToast('Settings reset to defaults');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-150"
      onClick={() => setSettingsModalOpen(false)}
    >
      <div
        className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-black/5 dark:ring-white/10 flex flex-col animate-in zoom-in-95 duration-150 font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Titlebar */}
        <div className="h-12 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-5 flex items-center justify-between select-none">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 rounded-lg">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100">Preferences & Settings</h2>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Customize theme, appearance, editor, and system behaviors</p>
            </div>
          </div>
          <button
            onClick={() => setSettingsModalOpen(false)}
            className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800/80 px-5 flex items-center space-x-2 pt-2 select-none">
          <button
            onClick={() => setActiveTab('appearance')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-colors flex items-center space-x-1.5 cursor-pointer border-b-2 ${
              activeTab === 'appearance'
                ? 'border-sky-500 text-sky-700 dark:text-sky-300 bg-white dark:bg-slate-900/60 font-bold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
            <span>Appearance & Theme</span>
          </button>
          <button
            onClick={() => setActiveTab('query')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-colors flex items-center space-x-1.5 cursor-pointer border-b-2 ${
              activeTab === 'query'
                ? 'border-sky-500 text-sky-700 dark:text-sky-300 bg-white dark:bg-slate-900/60 font-bold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Editor & Queries</span>
          </button>
          <button
            onClick={() => setActiveTab('shortcuts')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-colors flex items-center space-x-1.5 cursor-pointer border-b-2 ${
              activeTab === 'shortcuts'
                ? 'border-sky-500 text-sky-700 dark:text-sky-300 bg-white dark:bg-slate-900/60 font-bold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>Shortcuts Cheatsheet</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto max-h-[580px] space-y-6 text-xs bg-white dark:bg-slate-900">
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              {/* Theme Mode Option */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-slate-200">Color Theme</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Select Light, Dark, or sync with your macOS device settings.</p>
                  </div>
                  <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded font-mono text-[10px] uppercase font-semibold">
                    Active: {settings.themeMode}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {/* Light Theme Card */}
                  <button
                    type="button"
                    onClick={() => setThemeMode('light')}
                    className={`p-3.5 rounded-xl border flex flex-col items-center justify-center space-y-2 transition-all cursor-pointer ${
                      settings.themeMode === 'light'
                        ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/10 ring-2 ring-sky-500/20 text-sky-950 dark:text-white shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 hover:bg-slate-100 dark:hover:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-amber-400/15 text-amber-500 dark:text-amber-400 flex items-center justify-center">
                      <Sun className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-200">Light Mode</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 text-center">Clean macOS light pastel aesthetic</span>
                    {settings.themeMode === 'light' && (
                      <span className="w-4 h-4 rounded-full bg-sky-600 text-white flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    )}
                  </button>

                  {/* Dark Theme Card */}
                  <button
                    type="button"
                    onClick={() => setThemeMode('dark')}
                    className={`p-3.5 rounded-xl border flex flex-col items-center justify-center space-y-2 transition-all cursor-pointer ${
                      settings.themeMode === 'dark'
                        ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/10 ring-2 ring-sky-500/20 text-sky-950 dark:text-white shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 hover:bg-slate-100 dark:hover:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-indigo-400/15 text-indigo-500 dark:text-indigo-400 flex items-center justify-center">
                      <Moon className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-200">Dark Mode</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 text-center">Deep slate & TablePlus dark mode</span>
                    {settings.themeMode === 'dark' && (
                      <span className="w-4 h-4 rounded-full bg-sky-600 text-white flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    )}
                  </button>

                  {/* Auto Theme Card */}
                  <button
                    type="button"
                    onClick={() => setThemeMode('auto')}
                    className={`p-3.5 rounded-xl border flex flex-col items-center justify-center space-y-2 transition-all cursor-pointer ${
                      settings.themeMode === 'auto'
                        ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/10 ring-2 ring-sky-500/20 text-sky-950 dark:text-white shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 hover:bg-slate-100 dark:hover:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-emerald-400/15 text-emerald-500 dark:text-emerald-400 flex items-center justify-center">
                      <Laptop className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-200">Auto (System)</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 text-center">Syncs automatically with device OS</span>
                    {settings.themeMode === 'auto' && (
                      <span className="w-4 h-4 rounded-full bg-sky-600 text-white flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Developer Themes & Syntax Highlighting Showcase */}
              <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800/80">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded-lg">
                      <Palette className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 dark:text-slate-200">Editor & App Themes</h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Choose from curated themes for SQL editor syntax, background, and data grids.
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-sky-700 dark:text-sky-400 font-mono text-[10px] rounded-lg border border-slate-200 dark:border-slate-700/60 font-semibold shadow-xs">
                    {APP_THEMES.find((t) => t.id === settings.appTheme)?.name || 'Default Dark'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {APP_THEMES.map((th) => {
                    const isSelected = (settings.appTheme || 'default-dark') === th.id;
                    return (
                      <button
                        key={th.id}
                        type="button"
                        onClick={() => setAppTheme(th.id)}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between group ${
                          isSelected
                            ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/10 ring-2 ring-sky-500/25 shadow-xs'
                            : 'border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-950/60 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-1.5 w-full">
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <span className="font-bold text-xs text-slate-800 dark:text-slate-200 group-hover:text-slate-950 dark:group-hover:text-white transition">
                                {th.name}
                              </span>
                            </div>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-medium uppercase inline-block mt-0.5 ${
                                th.category === 'light'
                                  ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700/60'
                              }`}
                            >
                              {th.category}
                            </span>
                          </div>

                          {isSelected && (
                            <span className="w-4 h-4 rounded-full bg-sky-600 text-white flex items-center justify-center shrink-0">
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </span>
                          )}
                        </div>

                        <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 mb-2.5 leading-relaxed min-h-[28px]">
                          {th.description}
                        </p>

                        {/* Color Swatches Bar */}
                        <div className="flex items-center space-x-1.5 pt-2 border-t border-slate-200 dark:border-slate-800/60 w-full">
                          {th.swatches.map((color, idx) => (
                            <span
                              key={idx}
                              className="w-4 h-4 rounded-full border border-black/10 dark:border-white/20 shadow-xs inline-block shrink-0"
                              style={{ backgroundColor: color }}
                              title={`Theme color ${idx + 1}: ${color}`}
                            />
                          ))}
                          <span
                            className="ml-auto text-[9px] font-mono font-semibold"
                            style={{ color: th.accentColor }}
                          >
                            ● Accent
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row Density */}
              <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800/80">
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-200">Data Grid Row Density</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Controls row height and visual density for data tables.</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'compact', label: 'Compact (28px)', desc: 'Max rows visible' },
                    { id: 'normal', label: 'Normal (34px)', desc: 'TablePlus standard' },
                    { id: 'relaxed', label: 'Relaxed (40px)', desc: 'Touch & comfortable' },
                  ].map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => updateSettings({ rowDensity: d.id as RowDensity })}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        settings.rowDensity === d.id
                          ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/10 text-sky-800 dark:text-sky-200 font-semibold shadow-xs'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{d.label}</span>
                        {settings.rowDensity === d.id && <Check className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />}
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-0.5">{d.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Editor Font Size */}
              <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800/80">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-slate-200">SQL Code Editor Font Size</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Adjust code font size in the SQL query editor.</p>
                  </div>
                  <span className="font-mono text-sky-600 dark:text-sky-400 font-bold">{settings.editorFontSize}px</span>
                </div>
                <div className="flex items-center space-x-2">
                  {[11, 12, 13, 14, 15, 16, 18].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => updateSettings({ editorFontSize: size })}
                      className={`px-3 py-1 rounded-lg border text-xs font-mono transition cursor-pointer ${
                        settings.editorFontSize === size
                          ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/20 text-sky-800 dark:text-white font-bold shadow-xs'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {size}px
                    </button>
                  ))}
                </div>
              </div>

              {/* Notification Toast Position */}
              <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800/80">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 rounded-lg">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-slate-200">Notification Toast Alert Position</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Position where system notifications and query result alerts appear.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { id: 'bottom-right', label: 'Bottom Right (Recommended)', desc: 'Keeps top tab bar completely unobstructed' },
                    { id: 'top-right', label: 'Top Right', desc: 'Top right corner, avoids covering tabs' },
                  ].map((p) => {
                    const isSelected = (settings.toastPosition || 'bottom-right') === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          updateSettings({ toastPosition: p.id as any });
                          showToast(`Notification position set to ${p.label}`);
                        }}
                        className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                          isSelected
                            ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/10 text-sky-800 dark:text-sky-200 font-semibold shadow-xs'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold">{p.label}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />}
                        </div>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-0.5">{p.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'query' && (
            <div className="space-y-5">
              {/* Default Query Limit */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 rounded-xl">
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">Default Query Row Limit</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Automatic safety LIMIT clause appended to raw SELECT queries.</p>
                </div>
                <div className="flex items-center space-x-1.5 font-mono">
                  {[50, 100, 500, 1000].map((limit) => (
                    <button
                      key={limit}
                      type="button"
                      onClick={() => updateSettings({ defaultQueryLimit: limit })}
                      className={`px-2.5 py-1 rounded-lg border text-xs transition cursor-pointer ${
                        settings.defaultQueryLimit === limit
                          ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/20 text-sky-800 dark:text-white font-bold shadow-xs'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {limit}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto Format SQL on Run */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 rounded-xl">
                <div className="flex items-start space-x-3">
                  <Sparkles className="w-4 h-4 text-sky-600 dark:text-sky-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-slate-200">Auto-Format SQL on Execute</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Automatically beautify query syntax (UPPERCASE keywords, 2-space indentation) when running.</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.autoFormatSql}
                  onChange={(e) => updateSettings({ autoFormatSql: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sky-600 focus:ring-0 cursor-pointer"
                />
              </div>

              {/* Confirm on Destructive Actions */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 rounded-xl">
                <div className="flex items-start space-x-3">
                  <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-slate-200">Confirm on Destructive Operations</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Require explicit confirmation before executing DROP TABLE, TRUNCATE, or DELETE without WHERE.</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.confirmDestructive}
                  onChange={(e) => updateSettings({ confirmDestructive: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sky-600 focus:ring-0 cursor-pointer"
                />
              </div>
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-slate-700 dark:text-slate-300">Keyboard Shortcuts Reference</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">macOS Standard Bindings</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {[
                  { key: '⌘ ↵', desc: 'Run Query / Selection' },
                  { key: '⇧ ⌥ F', desc: 'Format / Beautify SQL' },
                  { key: '⌘ R', desc: 'Reload Active Table / Query' },
                  { key: '⌘ T / ⌘ E', desc: 'New SQL Query Tab' },
                  { key: '⌘ W', desc: 'Close Active Tab' },
                  { key: '⌘ K', desc: 'Connection Manager' },
                  { key: '⌘ O', desc: 'Database Switcher' },
                  { key: '⌘ B', desc: 'Toggle Left Sidebar' },
                  { key: '⌘ I', desc: 'Toggle Right Inspector' },
                  { key: '⌘ ,', desc: 'Open Settings / Preferences' },
                  { key: '⌘ S', desc: 'Commit Transaction' },
                  { key: '⌘ Z', desc: 'Rollback Transaction' },
                ].map((s, idx) => (
                  <div
                    key={idx}
                    className="p-2 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/70 rounded-lg flex items-center justify-between"
                  >
                    <span className="text-slate-700 dark:text-slate-300">{s.desc}</span>
                    <span className="px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded font-mono font-bold text-[10px] shadow-2xs">
                      {s.key}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-12 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 px-5 flex items-center justify-between select-none">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 flex items-center space-x-1.5 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>

          <button
            type="button"
            onClick={() => setSettingsModalOpen(false)}
            className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl transition shadow-xs active:scale-95 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
