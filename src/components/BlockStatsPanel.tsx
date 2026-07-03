import { useEffect, useMemo, useState } from 'react'
import type { BlockedApp, BlockedSite, TimerMode } from '../types'

type Props = {
  blockedSites: BlockedSite[]
  blockedApps: BlockedApp[]
  mode: TimerMode
  isRunning: boolean
  timeLeft: number
  focusTotalSeconds: number
}

type KillEvent = { processName: string; at: number }

export function BlockStatsPanel(props: Props) {
  const [sessionKills, setSessionKills] = useState<KillEvent[]>([])
  const [totalKills, setTotalKills] = useState<KillEvent[]>(() => {
    try {
      const raw = localStorage.getItem('blockKillHistory')
      return raw ? (JSON.parse(raw) as KillEvent[]) : []
    } catch {
      return []
    }
  })
  const [tick, setTick] = useState(Date.now())

  useEffect(() => {
    if (!window.pixelPomodoro?.onAppKilled) return
    const off = window.pixelPomodoro.onAppKilled((payload) => {
      setSessionKills((current) => [payload, ...current].slice(0, 200))
      setTotalKills((current) => {
        const next = [payload, ...current].slice(0, 500)
        try {
          localStorage.setItem('blockKillHistory', JSON.stringify(next))
        } catch {
          // ignore quota
        }
        return next
      })
    })
    return () => {
      if (typeof off === 'function') off()
    }
  }, [])

  useEffect(() => {
    if (props.mode === 'focus' && props.isRunning && props.timeLeft === props.focusTotalSeconds) {
      setSessionKills([])
    }
  }, [props.mode, props.isRunning, props.timeLeft, props.focusTotalSeconds])

  useEffect(() => {
    if (!props.isRunning) return
    const id = window.setInterval(() => setTick(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [props.isRunning])

  const enabledSites = useMemo(() => props.blockedSites.filter((site) => site.enabled), [props.blockedSites])
  const enabledApps = useMemo(() => props.blockedApps.filter((app) => app.enabled), [props.blockedApps])

  const elapsedSeconds = props.mode === 'focus' && props.isRunning
    ? Math.max(0, props.focusTotalSeconds - props.timeLeft)
    : 0
  const elapsedMinutes = Math.floor(elapsedSeconds / 60)
  const elapsedRemainSec = elapsedSeconds % 60

  const perAppSession = useMemo(() => {
    const map = new Map<string, number>()
    sessionKills.forEach((event) => {
      map.set(event.processName, (map.get(event.processName) || 0) + 1)
    })
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [sessionKills])

  const perAppTotal = useMemo(() => {
    const map = new Map<string, number>()
    totalKills.forEach((event) => {
      map.set(event.processName, (map.get(event.processName) || 0) + 1)
    })
    return map
  }, [totalKills])

  const recent = sessionKills.slice(0, 6)
  const relativeTime = (at: number) => {
    const diff = Math.max(0, Math.floor((tick - at) / 1000))
    if (diff < 60) return `${diff}秒前`
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
    return `${Math.floor(diff / 3600)}小时前`
  }

  return (
    <section id="block-stats" className="pixel-panel block-stats-card">
      <div className="section-title">
        <div>
          <p className="eyebrow">Shield Monitor</p>
          <h2>屏蔽实时统计</h2>
        </div>
        <span className={props.isRunning && props.mode === 'focus' ? 'shield-badge active' : 'shield-badge'}>
          {props.isRunning && props.mode === 'focus' ? '● 监控中' : '○ 待机'}
        </span>
      </div>

      <div className="shield-stats-grid">
        <div className="shield-stat">
          <span>启用网址</span>
          <strong>{enabledSites.length}</strong>
          <small>共 {props.blockedSites.length} 条</small>
        </div>
        <div className="shield-stat">
          <span>启用软件</span>
          <strong>{enabledApps.length}</strong>
          <small>共 {props.blockedApps.length} 个</small>
        </div>
        <div className="shield-stat">
          <span>本次拦截</span>
          <strong>{sessionKills.length}</strong>
          <small>{elapsedMinutes}分{elapsedRemainSec}秒内</small>
        </div>
        <div className="shield-stat">
          <span>累计拦截</span>
          <strong>{totalKills.length}</strong>
          <small>历史总数</small>
        </div>
      </div>

      <div className="shield-columns">
        <div>
          <h3>启用网址</h3>
          {enabledSites.length === 0 ? (
            <p className="hint-text">暂无启用的网址</p>
          ) : (
            <ul className="shield-tag-list">
              {enabledSites.map((site) => (
                <li key={site.id} className="shield-tag">{site.domain}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>软件拦截排行</h3>
          {enabledApps.length === 0 ? (
            <p className="hint-text">暂无启用的软件</p>
          ) : (
            <ul className="shield-rank-list">
              {enabledApps.map((app) => {
                const sessionCount = perAppSession.find(([name]) => name.toLowerCase() === app.processName.toLowerCase())?.[1] ?? 0
                const totalCount = perAppTotal.get(app.processName.toLowerCase()) || perAppTotal.get(app.processName) || 0
                return (
                  <li key={app.id}>
                    <span className="shield-rank-name">{app.name}</span>
                    <span className="shield-rank-count">
                      本次 <strong>{sessionCount}</strong> · 累计 <strong>{totalCount}</strong>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <div>
        <h3>最近拦截</h3>
        {recent.length === 0 ? (
          <p className="hint-text">本次专注还未拦截任何进程</p>
        ) : (
          <ul className="shield-recent-list">
            {recent.map((event, index) => (
              <li key={`${event.at}-${index}`}>
                <span className="shield-recent-name">{event.processName}</span>
                <span className="shield-recent-time">{relativeTime(event.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
