export type TimerMode = 'focus' | 'shortBreak' | 'longBreak'
export type TaskStatus = 'todo' | 'doing' | 'done'
export type BlockAction = 'warn' | 'kill'

export type Task = {
  id: number
  title: string
  status: TaskStatus
  estimatedPomodoros: number
  completedPomodoros: number
}

export type FocusSession = {
  id: number
  taskId: number | null
  taskTitle: string
  startedAt: string
  minutes: number
}

export type BlockedSite = {
  id: number
  domain: string
  enabled: boolean
}

export type BlockedApp = {
  id: number
  name: string
  processName: string
  filePath?: string
  action: BlockAction
  enabled: boolean
}

export type Settings = {
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  longBreakInterval: number
  autoStartBreak: boolean
  theme: 'light' | 'dark'
  redirectUrl: string
}
