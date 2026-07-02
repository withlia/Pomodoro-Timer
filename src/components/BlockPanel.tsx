import type { BlockedApp, BlockedSite } from '../types'

type Props = {
  blockedSites: BlockedSite[]
  blockedApps: BlockedApp[]
  siteInput: string
  appNameInput: string
  processInput: string
  setSiteInput: (value: string) => void
  setAppNameInput: (value: string) => void
  setProcessInput: (value: string) => void
  setBlockedSites: (updater: (current: BlockedSite[]) => BlockedSite[]) => void
  setBlockedApps: (updater: (current: BlockedApp[]) => BlockedApp[]) => void
  addSite: () => void
  addApp: () => void
  selectApp: () => void
}

export function BlockPanel(props: Props) {
  return (
    <section id="blocks" className="pixel-panel block-card">
      <div className="section-title">
        <div>
          <p className="eyebrow">Focus Shield</p>
          <h2>网站与软件屏蔽</h2>
        </div>
      </div>
      <div className="two-columns">
        <div>
          <h3>域名</h3>
          <div className="inline-form">
            <input value={props.siteInput} onChange={(event) => props.setSiteInput(event.target.value)} placeholder="example.com" />
            <button onClick={props.addSite}>添加</button>
          </div>
          <div className="mini-list">
            {props.blockedSites.map((site) => (
              <label key={site.id}>
                <input type="checkbox" checked={site.enabled} onChange={() => props.setBlockedSites((current) => current.map((item) => (item.id === site.id ? { ...item, enabled: !item.enabled } : item)))} />
                {site.domain}
              </label>
            ))}
          </div>
        </div>
        <div>
          <h3>软件</h3>
          <div className="inline-form stacked">
            <button onClick={props.selectApp}>从本地选择应用</button>
            <input value={props.appNameInput} onChange={(event) => props.setAppNameInput(event.target.value)} placeholder="软件名" />
            <input value={props.processInput} onChange={(event) => props.setProcessInput(event.target.value)} placeholder="进程名.exe" />
            <button onClick={props.addApp}>添加</button>
          </div>
          <div className="mini-list">
            {props.blockedApps.map((app) => (
              <label key={app.id}>
                <input type="checkbox" checked={app.enabled} onChange={() => props.setBlockedApps((current) => current.map((item) => (item.id === app.id ? { ...item, enabled: !item.enabled } : item)))} />
                {app.name} / {app.processName}
              </label>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
