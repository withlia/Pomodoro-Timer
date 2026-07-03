import type { Settings } from '../types'

type Props = {
  settings: Settings
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
}

export function SettingsPanel({ settings, updateSetting }: Props) {
  return (
    <section id="settings" className="pixel-panel settings-card">
      <div className="section-title">
        <div>
          <p className="eyebrow">Config</p>
          <h2>设置</h2>
        </div>
        <button className="theme-button" onClick={() => updateSetting('theme', settings.theme === 'dark' ? 'light' : 'dark')}>
          {settings.theme === 'dark' ? '切换日间模式' : '切换夜间模式'}
        </button>
      </div>
      <div className="settings-grid">
        <label>
          专注分钟
          <input type="number" min="1" value={settings.focusMinutes} onChange={(event) => updateSetting('focusMinutes', Number(event.target.value))} />
        </label>
        <label>
          短休息
          <input type="number" min="1" value={settings.shortBreakMinutes} onChange={(event) => updateSetting('shortBreakMinutes', Number(event.target.value))} />
        </label>
        <label>
          长休息
          <input type="number" min="1" value={settings.longBreakMinutes} onChange={(event) => updateSetting('longBreakMinutes', Number(event.target.value))} />
        </label>
        <label>
          长休息间隔
          <input type="number" min="1" value={settings.longBreakInterval} onChange={(event) => updateSetting('longBreakInterval', Number(event.target.value))} />
        </label>
        <label>
          重定向网站
          <input value={settings.redirectUrl} onChange={(event) => updateSetting('redirectUrl', event.target.value)} placeholder="https://www.google.com" />
        </label>
        <label className="toggle-line">
          <input type="checkbox" checked={settings.autoStartBreak} onChange={(event) => updateSetting('autoStartBreak', event.target.checked)} />
          自动开始休息
        </label>
      </div>
    </section>
  )
}
