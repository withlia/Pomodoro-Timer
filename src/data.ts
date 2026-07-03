import type { BlockedApp, BlockedSite, Settings, Task, TimerMode } from './types'

export const defaultSettings: Settings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
  autoStartBreak: false,
  theme: 'light',
  redirectUrl: 'https://www.google.com'
}

export const initialTasks: Task[] = [
  { id: 1, title: '设计像素风主界面', status: 'doing', estimatedPomodoros: 3, completedPomodoros: 1 },
  { id: 2, title: '整理屏蔽网站清单', status: 'todo', estimatedPomodoros: 2, completedPomodoros: 0 }
]

export const initialSites: BlockedSite[] = [
  { id: 1, domain: 'youtube.com', enabled: true },
  { id: 2, domain: 'twitter.com', enabled: true }
]

export const initialApps: BlockedApp[] = [
  { id: 1, name: 'Steam', processName: 'steam.exe', action: 'warn', enabled: true }
]

export const modeLabels: Record<TimerMode, string> = {
  focus: '专注',
  shortBreak: '短休息',
  longBreak: '长休息'
}

export const modeTips: Record<TimerMode, string> = {
  focus: '屏蔽干扰，完成一个像素番茄',
  shortBreak: '站起来活动一下',
  longBreak: '奖励自己一段长休息'
}

export function getInitialSeconds(mode: TimerMode, settings: Settings) {
  if (mode === 'focus') return settings.focusMinutes * 60
  if (mode === 'shortBreak') return settings.shortBreakMinutes * 60
  return settings.longBreakMinutes * 60
}

export function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const rest = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${rest}`
}

export function readSettings() {
  return { ...defaultSettings, ...readStorage('settings', defaultSettings) }
}

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
