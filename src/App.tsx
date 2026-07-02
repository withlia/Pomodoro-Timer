import { useEffect, useMemo, useState } from 'react'
import { BlockPanel } from './components/BlockPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { StatsPanel } from './components/StatsPanel'
import { TaskPanel } from './components/TaskPanel'
import { TimerPanel } from './components/TimerPanel'
import { defaultSettings, getInitialSeconds, initialApps, initialSites, initialTasks, readStorage } from './data'
import type { BlockedApp, BlockedSite, FocusSession, Settings, Task, TimerMode } from './types'

function App() {
  const [settings, setSettings] = useState<Settings>(() => readStorage('settings', defaultSettings))
  const [mode, setMode] = useState<TimerMode>('focus')
  const [timeLeft, setTimeLeft] = useState(() => getInitialSeconds('focus', readStorage('settings', defaultSettings)))
  const [isRunning, setIsRunning] = useState(false)
  const [completedFocusCount, setCompletedFocusCount] = useState(0)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(1)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [siteInput, setSiteInput] = useState('')
  const [appNameInput, setAppNameInput] = useState('')
  const [processInput, setProcessInput] = useState('')
  const [platform, setPlatform] = useState('browser')
  const [blockerMessage, setBlockerMessage] = useState('屏蔽未启用')
  const [tasks, setTasks] = useState<Task[]>(() => readStorage('tasks', initialTasks))
  const [sessions, setSessions] = useState<FocusSession[]>(() => readStorage('sessions', []))
  const [blockedSites, setBlockedSites] = useState<BlockedSite[]>(() => readStorage('blockedSites', initialSites))
  const [blockedApps, setBlockedApps] = useState<BlockedApp[]>(() => readStorage('blockedApps', initialApps))

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null
  const totalMinutes = sessions.reduce((sum, session) => sum + session.minutes, 0)
  const activeBlockCount = blockedSites.filter((site) => site.enabled).length + blockedApps.filter((app) => app.enabled).length
  const progress = useMemo(() => {
    const total = getInitialSeconds(mode, settings)
    return Math.max(0, Math.min(100, ((total - timeLeft) / total) * 100))
  }, [mode, settings, timeLeft])

  useEffect(() => {
    window.pixelPomodoro?.getPlatform().then(setPlatform).catch(() => setPlatform('browser'))
  }, [])

  useEffect(() => localStorage.setItem('settings', JSON.stringify(settings)), [settings])
  useEffect(() => localStorage.setItem('tasks', JSON.stringify(tasks)), [tasks])
  useEffect(() => localStorage.setItem('sessions', JSON.stringify(sessions)), [sessions])
  useEffect(() => localStorage.setItem('blockedSites', JSON.stringify(blockedSites)), [blockedSites])
  useEffect(() => localStorage.setItem('blockedApps', JSON.stringify(blockedApps)), [blockedApps])

  useEffect(() => {
    if (!isRunning) return
    const timer = window.setInterval(() => setTimeLeft((current) => Math.max(0, current - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [isRunning])

  useEffect(() => {
    if (timeLeft === 0 && isRunning) completeCurrentMode()
  }, [timeLeft, isRunning])

  useEffect(() => {
    if (!isRunning || mode !== 'focus') {
      window.pixelPomodoro?.clearHostBlock().then(() => setBlockerMessage('屏蔽未启用')).catch(() => setBlockerMessage('屏蔽清理失败'))
      return
    }

    const domains = blockedSites.filter((site) => site.enabled).map((site) => site.domain)
    if (domains.length === 0) {
      setBlockerMessage('没有启用的屏蔽域名')
      return
    }

    window.pixelPomodoro
      ?.applyHostBlock(domains)
      .then((result) => setBlockerMessage(`已写入 ${result.entries} 条 hosts 规则`))
      .catch(() => setBlockerMessage('写入 hosts 失败，请用管理员权限启动'))

    return () => {
      window.pixelPomodoro?.clearHostBlock().catch(() => undefined)
    }
  }, [isRunning, mode, blockedSites])

  function switchMode(nextMode: TimerMode, autoStart = false) {
    setMode(nextMode)
    setTimeLeft(getInitialSeconds(nextMode, settings))
    setIsRunning(autoStart)
  }

  function completeCurrentMode() {
    setIsRunning(false)
    if (mode !== 'focus') {
      switchMode('focus')
      return
    }
    const nextCount = completedFocusCount + 1
    const taskTitle = selectedTask?.title ?? '未绑定任务'
    setCompletedFocusCount(nextCount)
    setSessions((current) => [{ id: Date.now(), taskId: selectedTaskId, taskTitle, startedAt: new Date().toISOString(), minutes: settings.focusMinutes }, ...current])
    if (selectedTaskId) {
      setTasks((current) => current.map((task) => task.id === selectedTaskId ? { ...task, completedPomodoros: task.completedPomodoros + 1, status: task.completedPomodoros + 1 >= task.estimatedPomodoros ? 'done' : 'doing' } : task))
    }
    window.pixelPomodoro?.notify({ title: '番茄完成', body: `${taskTitle} +1` })
    switchMode(nextCount % settings.longBreakInterval === 0 ? 'longBreak' : 'shortBreak', settings.autoStartBreak)
  }

  function addTask() {
    const title = newTaskTitle.trim()
    if (!title) return
    const task: Task = { id: Date.now(), title, status: 'todo', estimatedPomodoros: 1, completedPomodoros: 0 }
    setTasks((current) => [task, ...current])
    setSelectedTaskId(task.id)
    setNewTaskTitle('')
  }

  function addSite() {
    const domain = siteInput.trim().replace(/^https?:\/\//, '').replace(/\/.*/, '')
    if (!domain) return
    setBlockedSites((current) => [{ id: Date.now(), domain, enabled: true }, ...current])
    setSiteInput('')
  }

  function addApp() {
    const name = appNameInput.trim()
    const processName = processInput.trim()
    if (!name || !processName) return
    setBlockedApps((current) => [{ id: Date.now(), name, processName, action: 'warn', enabled: true }, ...current])
    setAppNameInput('')
    setProcessInput('')
  }

  function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    const next = { ...settings, [key]: value }
    setSettings(next)
    if (key !== 'autoStartBreak') {
      setIsRunning(false)
      setTimeLeft(getInitialSeconds(mode, next))
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar pixel-panel">
        <div><p className="eyebrow">Pixel Pomodoro</p><h1>像素番茄钟</h1></div>
        <nav><a href="#timer">计时</a><a href="#tasks">任务</a><a href="#blocks">屏蔽</a><a href="#stats">统计</a><a href="#settings">设置</a></nav>
        <div className="system-card"><span>平台</span><strong>{platform}</strong><small>{blockerMessage}</small></div>
      </aside>
      <section className="content-grid">
        <TimerPanel mode={mode} settings={settings} timeLeft={timeLeft} isRunning={isRunning} progress={progress} tasks={tasks} selectedTaskId={selectedTaskId} setSelectedTaskId={setSelectedTaskId} setIsRunning={setIsRunning} switchMode={switchMode} completeCurrentMode={completeCurrentMode} />
        <section className="summary-grid">
          <div className="pixel-panel stat-card"><span>今日番茄</span><strong>{completedFocusCount}</strong></div>
          <div className="pixel-panel stat-card"><span>专注分钟</span><strong>{totalMinutes}</strong></div>
          <div className="pixel-panel stat-card"><span>启用屏蔽</span><strong>{activeBlockCount}</strong></div>
        </section>
        <TaskPanel tasks={tasks} selectedTaskId={selectedTaskId} newTaskTitle={newTaskTitle} setNewTaskTitle={setNewTaskTitle} setSelectedTaskId={setSelectedTaskId} addTask={addTask} />
        <BlockPanel blockedSites={blockedSites} blockedApps={blockedApps} siteInput={siteInput} appNameInput={appNameInput} processInput={processInput} setSiteInput={setSiteInput} setAppNameInput={setAppNameInput} setProcessInput={setProcessInput} setBlockedSites={setBlockedSites} setBlockedApps={setBlockedApps} addSite={addSite} addApp={addApp} />
        <StatsPanel tasks={tasks} />
        <SettingsPanel settings={settings} updateSetting={updateSetting} />
      </section>
    </main>
  )
}

export default App
