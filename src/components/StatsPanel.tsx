import type { Task } from '../types'

type Props = {
  tasks: Task[]
}

export function StatsPanel({ tasks }: Props) {
  return (
    <section id="stats" className="pixel-panel stats-card">
      <div className="section-title">
        <div>
          <p className="eyebrow">Stats</p>
          <h2>统计图表</h2>
        </div>
      </div>
      <div className="bar-chart">
        {tasks.map((task) => (
          <div key={task.id}>
            <span>{task.title}</span>
            <div>
              <i style={{ width: `${Math.min(100, (task.completedPomodoros / Math.max(1, task.estimatedPomodoros)) * 100)}%` }} />
            </div>
            <em>{task.completedPomodoros}</em>
          </div>
        ))}
      </div>
    </section>
  )
}
