
import { useEffect, useMemo, useState } from 'react'
import { BlockPanel } from './components/BlockPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { StatsPanel } from './components/StatsPanel'
import { TaskPanel } from './components/TaskPanel'
import { TimerPanel } from './components/TimerPanel'
import { getInitialSeconds, initialApps, initialSites, initialTasks, readSettings, readStorage } from './data'
import type { BlockedApp, BlockedSite, FocusSession, Settings, Task, TimerMode } from './types'

function App() {
  const [settings, setSettings] = useState<Settings>(() => readSettings())
  const [mode, setMode] = useState<TimerMode>('focus')
  const [timeLeft, setTimeLeft] = useState(() => getInitialSeconds('focus', readSettings()))
  const [isRunning, setIsRunning] = useState(false)
  const [completedFocusCount, setCompletedFocusCount] = useState(0)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(1)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskEstimate, setNewTaskEstimate] = useState(1)
  const [siteInput, setSiteInput] = useState('')
  const [appSelectMessage, setAppSelectMessage] = useState('')
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
    if (!window.pixelPomodoro) {
      setPlatform('browser')
      setBlockerMessage('请使用安装版应用')
      return
    }
    window.pixelPomodoro.getPlatform().then(setPlatform).catch(() => setPlatform('browser'))
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
      window.pixelPomodoro?.clearAppBlock().catch(() => undefined)
      return
    }

    if (!window.pixelPomodoro) {
      setBlockerMessage('屏蔽不可用：请使用安装版应用')
      return
    }

    const domains = blockedSites.filter((site) => site.enabled).map((site) => site.domain)
    const processNames = blockedApps.filter((app) => app.enabled).map((app) => app.processName)

    if (domains.length === 0 && processNames.length === 0) {
      setBlockerMessage('没有启用的屏蔽项')
      return
    }

    // 【修复6】改进网址屏蔽的错误处理和提示信息
    if (domains.length > 0) {
      window.pixelPomodoro
        ?.applyHostBlock({ domains, redirectUrl: settings.redirectUrl })
        .then((result: { ok?: boolean; entries?: number; error?: string }) => {
          if (result.ok === false) {
            setBlockerMessage(result.error || '写入 hosts 失败')
          } else {
            setBlockerMessage(`已屏蔽 ${result.entries} 条 hosts 规则`)
          }
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err)
          setBlockerMessage(`写入 hosts 失败: ${msg}`)
        })
    } else {
      window.pixelPomodoro?.clearHostBlock().catch(() => undefined)
    }

    // 【修复7】改进软件屏蔽的错误处理
    if (processNames.length > 0) {
      window.pixelPomodoro
        ?.applyAppBlock(processNames)
        .then((result: { ok?: boolean; targets?: number; platform?: string; error?: string }) => {
          if (result.ok === false) {
            setBlockerMessage((prev) => `${prev} | ❌ 软件屏蔽失败: ${result.error || '不支持当前平台'}`)
          } else if (result.targets && result.targets > 0) {
            const platMsg = result.platform ? ` (${result.platform})` : ''
            setBlockerMessage((prev) => `${prev} | ✅ 已监控 ${result.targets} 个进程${platMsg}`)
          }
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err)
          setBlockerMessage((prev) => `${prev} | ❌ 应用屏蔽失败: ${msg}`)
        })
    } else {
      window.pixelPomodoro?.clearAppBlock().catch(() => undefined)
    }

    return () => {
      window.pixelPomodoro?.clearHostBlock().catch(() => undefined)
      window.pixelPomodoro?.clearAppBlock().catch(() => undefined)
    }
  }, [isRunning, mode, blockedSites, blockedApps, settings.redirectUrl])

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
    const estimate = Math.max(1, Math.floor(newTaskEstimate) || 1)
    const task: Task = { id: Date.now(), title, status: 'todo', estimatedPomodoros: estimate, completedPomodoros: 0 }
    setTasks((current) => [task, ...current])
    setSelectedTaskId(task.id)
    setNewTaskTitle('')
    setNewTaskEstimate(1)
  }

  function updateTaskEstimate(id: number, delta: number) {
    setTasks((current) => current.map((task) => {
      if (task.id !== id) return task
      const nextEstimate = Math.max(1, task.estimatedPomodoros + delta)
      const nextEstimateFinal = Math.max(nextEstimate, task.completedPomodoros)
      const nextStatus = task.completedPomodoros >= nextEstimateFinal ? 'done' : task.status === 'done' ? 'doing' : task.status
      return { ...task, estimatedPomodoros: nextEstimateFinal, status: nextStatus }
    }))
  }

  function deleteTask(id: number) {
    setTasks((current) => current.filter((task) => task.id !== id))
    if (selectedTaskId === id) {
      setSelectedTaskId(null)
    }
  }

  function addSite() {
    const domain = siteInput.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').replace(/:\d+$/, '')
    if (!domain) return
    setBlockedSites((current) => [{ id: Date.now(), domain, enabled: true }, ...current])
    setSiteInput('')
  }

  async function selectApp() {
    if (!window.pixelPomodoro?.selectApp) {
      setAppSelectMessage('请在安装版应用中选择 EXE')
      return
    }

    const selected = await window.pixelPomodoro.selectApp()
    if (!selected) {
      setAppSelectMessage('已取消选择')
      return
    }

    setBlockedApps((current) => [
      {
        id: Date.now(),
        name: selected.name,
        processName: selected.processName,
        filePath: selected.filePath,
        action: 'warn',
        enabled: true
      },
      ...current
    ])
    setAppSelectMessage(`已添加 ${selected.processName}`)
  }

  /**
   * 【新增】手动添加应用（用于 macOS/Linux 或 Windows UWP 应用）
   * 用户输入进程名称，直接添加到屏蔽列表
   */
  function addAppByName(processName: string) {
    const name = processName.trim()
    if (!name) return

    // 检查是否重复
    const exists = blockedApps.some(
      (app) => app.processName.toLowerCase() === name.toLowerCase() || app.name.toLowerCase() === name.toLowerCase()
    )
    if (exists) {
      setAppSelectMessage(`⚠️ "${name}" 已在列表中`)
      return
    }

    // 生成显示名（取第一个单词或整个名称）
    const displayName = name.split(/[\/\\]/).pop() || name
    const shortName = displayName.includes('.') ? displayName.replace(/\.[^.]+$/, '') : displayName

    setBlockedApps((current) => [
      {
        id: Date.now(),
        name: shortName,
        processName: name,
        action: 'warn',
        enabled: true
      },
      ...current
    ])
    setAppSelectMessage(`✅ 已添加进程: ${name}`)
  }

  function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    const next = { ...settings, [key]: value }
    setSettings(next)
    if (key !== 'autoStartBreak' && key !== 'theme' && key !== 'redirectUrl') {
      setIsRunning(false)
      setTimeLeft(getInitialSeconds(mode, next))
    }
  }

  return (
    <main className="app-shell" data-theme={settings.theme}>
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
        <TaskPanel tasks={tasks} selectedTaskId={selectedTaskId} newTaskTitle={newTaskTitle} newTaskEstimate={newTaskEstimate} setNewTaskTitle={setNewTaskTitle} setNewTaskEstimate={setNewTaskEstimate} setSelectedTaskId={setSelectedTaskId} addTask={addTask} deleteTask={deleteTask} updateTaskEstimate={updateTaskEstimate} />
        {/* 【修复8】传递 platform 和 addAppByName 给 BlockPanel */}
        <BlockPanel
          blockedSites={blockedSites}
          blockedApps={blockedApps}
          siteInput={siteInput}
          appSelectMessage={appSelectMessage}
          platform={platform}
          setSiteInput={setSiteInput}
          setBlockedSites={setBlockedSites}
          setBlockedApps={setBlockedApps}
          addSite={addSite}
          selectApp={selectApp}
          addAppByName={addAppByName}
        />
        <StatsPanel tasks={tasks} />
        <SettingsPanel settings={settings} updateSetting={updateSetting} />
      </section>
    </main>
  )
}

export default App