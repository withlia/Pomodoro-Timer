import type { Settings, TimerMode, Task } from '../types'
import { formatTime, getInitialSeconds, modeLabels, modeTips } from '../data'

type Props = {
  mode: TimerMode
  settings: Settings
  timeLeft: number
  isRunning: boolean
  progress: number
  tasks: Task[]
  selectedTaskId: number | null
  setSelectedTaskId: (id: number | null) => void
  setIsRunning: (updater: (current: boolean) => boolean) => void
  switchMode: (mode: TimerMode, autoStart?: boolean) => void
  completeCurrentMode: () => void
}

export function TimerPanel(props: Props) {
  return (
    <section id="timer" className="timer-card pixel-panel hero-card">
      <div className="mode-row">
        {(Object.keys(modeLabels) as TimerMode[]).map((item) => (
          <button key={item} className={props.mode === item ? 'active' : ''} onClick={() => props.switchMode(item)}>
            {modeLabels[item]}
          </button>
        ))}
      </div>
      <div className="timer-display">
        <span>{modeLabels[props.mode]}</span>
        <strong>{formatTime(props.timeLeft)}</strong>
        <p>{modeTips[props.mode]}</p>
      </div>
      <div className="progress-track">
        <div style={{ width: `${props.progress}%` }} />
      </div>
      <div className="control-row">
        <button className="primary" onClick={() => props.setIsRunning((current) => !current)}>
          {props.isRunning ? '暂停' : '开始'}
        </button>
        <button onClick={() => props.switchMode(props.mode)}>重置</button>
        <button onClick={props.completeCurrentMode}>完成</button>
      </div>
      <div className="current-task">
        <span>当前任务</span>
        <select value={props.selectedTaskId ?? ''} onChange={(event) => props.setSelectedTaskId(Number(event.target.value) || null)}>
          <option value="">未绑定</option>
          {props.tasks.map((task) => (
            <option key={task.id} value={task.id}>{task.title}</option>
          ))}
        </select>
      </div>
    </section>
  )
}
