import { useEffect, useMemo, useState } from 'react'
import type { BlockedApp, BlockedSite, TimerMode } from '../types'
import { Pagination } from './Pagination'

type Props = {
  blockedSites: BlockedSite[]
  blockedApps: BlockedApp[]
  mode: TimerMode
  isRunning: boolean
  timeLeft: number
  focusTotalSeconds: number
}

type HitEvent = {
  kind: 'app' | 'site'
  name: string
  at: number
  redirected?: boolean
}

const STORAGE_KEY = 'blockHitHistory'
const PAGE_SIZE = 5

export function BlockStatsPanel(props: Props) {
  const [sessionHits, setSessionHits] = useState<HitEvent[]>([])
  const [totalHits, setTotalHits] = useState<HitEvent[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return JSON.parse(raw) as HitEvent[]
      const legacy = localStorage.getItem('blockKillHistory')
      if (legacy) {
        const parsed = JSON.parse(legacy) as { processName: string; at: number }[]
        return parsed.map((event) => ({ kind: 'app' as const, name: event.processName, at: event.at }))
      }
      return []
    } catch {
      return []
    }
  })
  const [tick, setTick] = useState(Date.now())
  const [sitePage, setSitePage] = useState(1)
  const [appPage, setAppPage] = useState(1)
  const [recentPage, setRecentPage] = useState(1)

  useEffect(() => {
    const record = (event: HitEvent) => {
      setSessionHits((current) => [event, ...current].slice(0, 200))
      setTotalHits((current) => {
        const next = [event, ...current].slice(0, 500)
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        } catch {
          // ignore quota
        }
        return next
      })
    }

    const disposers: Array<() => void> = []

    const offApp = window.pixelPomodoro?.onAppKilled?.((payload) => {
      record({ kind: 'app', name: payload.processName, at: payload.at })
    })
    if (typeof offApp === 'function') disposers.push(offApp)

    const offSite = window.pixelPomodoro?.onSiteHit?.((payload) => {
      record({ kind: 'site', name: payload.domain, at: payload.at, redirected: payload.redirected })
    })
    if (typeof offSite === 'function') disposers.push(offSite)

    return () => disposers.forEach((fn) => fn())
  }, [])

  useEffect(() => {
    if (props.mode === 'focus' && props.isRunning && props.timeLeft === props.focusTotalSeconds) {
      setSessionHits([])
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

  const sessionAppHits = sessionHits.filter((event) => event.kind === 'app')
  const sessionSiteHits = sessionHits.filter((event) => event.kind === 'site')

  const perAppSession = useMemo(() => {
    const map = new Map<string, number>()
    sessionAppHits.forEach((event) => {
      map.set(event.name, (map.get(event.name) || 0) + 1)
    })
    return map
  }, [sessionAppHits])

  const perAppTotal = useMemo(() => {
    const map = new Map<string, number>()
    totalHits.filter((event) => event.kind === 'app').forEach((event) => {
      map.set(event.name.toLowerCase(), (map.get(event.name.toLowerCase()) || 0) + 1)
    })
    return map
  }, [totalHits])

  const perSiteSession = useMemo(() => {
    const map = new Map<string, number>()
    sessionSiteHits.forEach((event) => {
      map.set(event.name, (map.get(event.name) || 0) + 1)
    })
    return map
  }, [sessionSiteHits])

  const perSiteTotal = useMemo(() => {
    const map = new Map<string, number>()
    totalHits.filter((event) => event.kind === 'site').forEach((event) => {
      map.set(event.name.toLowerCase(), (map.get(event.name.toLowerCase()) || 0) + 1)
    })
    return map
  }, [totalHits])

  const recent = sessionHits
  const recentPageCount = Math.max(1, Math.ceil(recent.length / PAGE_SIZE))
  const sitePageCount = Math.max(1, Math.ceil(enabledSites.length / PAGE_SIZE))
  const appPageCount = Math.max(1, Math.ceil(enabledApps.length / PAGE_SIZE))

  useEffect(() => {
    if (sitePage > sitePageCount) setSitePage(sitePageCount)
  }, [sitePage, sitePageCount])
  useEffect(() => {
    if (appPage > appPageCount) setAppPage(appPageCount)
  }, [appPage, appPageCount])
  useEffect(() => {
    if (recentPage > recentPageCount) setRecentPage(recentPageCount)
  }, [recentPage, recentPageCount])

  const sitePageItems = useMemo(() => {
    const start = (Math.min(sitePage, sitePageCount) - 1) * PAGE_SIZE
    return enabledSites.slice(start, start + PAGE_SIZE)
  }, [enabledSites, sitePage, sitePageCount])

  const appPageItems = useMemo(() => {
    const start = (Math.min(appPage, appPageCount) - 1) * PAGE_SIZE
    return enabledApps.slice(start, start + PAGE_SIZE)
  }, [enabledApps, appPage, appPageCount])

  const recentPageItems = useMemo(() => {
    const start = (Math.min(recentPage, recentPageCount) - 1) * PAGE_SIZE
    return recent.slice(start, start + PAGE_SIZE)
  }, [recent, recentPage, recentPageCount])

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
          <strong>{sessionHits.length}</strong>
          <small>{sessionSiteHits.length}网址 · {sessionAppHits.length}应用 · {elapsedMinutes}分{elapsedRemainSec}秒</small>
        </div>
        <div className="shield-stat">
          <span>累计拦截</span>
          <strong>{totalHits.length}</strong>
          <small>历史总数</small>
        </div>
      </div>

      <div className="shield-columns">
        <div>
          <h3>网址拦截排行</h3>
          {enabledSites.length === 0 ? (
            <p className="hint-text">暂无启用的网址</p>
          ) : (
            <>
              <ul className="shield-rank-list">
                {sitePageItems.map((site) => {
                  const sessionCount = perSiteSession.get(site.domain) || 0
                  const totalCount = perSiteTotal.get(site.domain.toLowerCase()) || 0
                  return (
                    <li key={site.id}>
                      <span className="shield-rank-name">{site.domain}</span>
                      <span className="shield-rank-count">
                        本次 <strong>{sessionCount}</strong> · 累计 <strong>{totalCount}</strong>
                      </span>
                    </li>
                  )
                })}
              </ul>
              <Pagination page={sitePage} pageCount={sitePageCount} setPage={setSitePage} />
            </>
          )}
        </div>
        <div>
          <h3>软件拦截排行</h3>
          {enabledApps.length === 0 ? (
            <p className="hint-text">暂无启用的软件</p>
          ) : (
            <>
              <ul className="shield-rank-list">
                {appPageItems.map((app) => {
                  const sessionCount = perAppSession.get(app.processName) || 0
                  const totalCount = perAppTotal.get(app.processName.toLowerCase()) || 0
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
              <Pagination page={appPage} pageCount={appPageCount} setPage={setAppPage} />
            </>
          )}
        </div>
      </div>

      <div>
        <h3>最近拦截</h3>
        {recent.length === 0 ? (
          <p className="hint-text">本次专注还未拦截任何进程或网址</p>
        ) : (
          <>
            <ul className="shield-recent-list">
              {recentPageItems.map((event, index) => (
                <li key={`${event.at}-${index}`}>
                  <span className="shield-recent-tag" data-kind={event.kind}>
                    {event.kind === 'app' ? '软件' : '网址'}
                  </span>
                  <span className="shield-recent-name">{event.name}</span>
                  <span className="shield-recent-time">{relativeTime(event.at)}</span>
                </li>
              ))}
            </ul>
            <Pagination page={recentPage} pageCount={recentPageCount} setPage={setRecentPage} />
          </>
        )}
      </div>
    </section>
  )
}
