import { useEffect, useMemo, useState } from 'react'
import type { Task } from '../types'
import { Pagination } from './Pagination'

type Props = {
  tasks: Task[]
}

const PAGE_SIZE = 5

export function StatsPanel({ tasks }: Props) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(tasks.length / PAGE_SIZE))

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const pageItems = useMemo(() => {
    const start = (Math.min(page, pageCount) - 1) * PAGE_SIZE
    return tasks.slice(start, start + PAGE_SIZE)
  }, [tasks, page, pageCount])

  return (
    <section id="stats" className="pixel-panel stats-card">
      <div className="section-title">
        <div>
          <p className="eyebrow">Stats</p>
          <h2>统计图表</h2>
        </div>
        <span className="hint-text">共 {tasks.length} 项</span>
      </div>
      {tasks.length === 0 ? (
        <p className="hint-text">暂无任务</p>
      ) : (
        <>
          <div className="bar-chart">
            {pageItems.map((task) => (
              <div key={task.id}>
                <span>{task.title}</span>
                <div>
                  <i style={{ width: `${Math.min(100, (task.completedPomodoros / Math.max(1, task.estimatedPomodoros)) * 100)}%` }} />
                </div>
                <em>{task.completedPomodoros}</em>
              </div>
            ))}
          </div>
          <Pagination page={page} pageCount={pageCount} setPage={setPage} />
        </>
      )}
    </section>
  )
}
