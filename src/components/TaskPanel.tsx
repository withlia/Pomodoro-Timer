import type { Task } from '../types'

type Props = {
  tasks: Task[]
  selectedTaskId: number | null
  newTaskTitle: string
  newTaskEstimate: number
  setNewTaskTitle: (value: string) => void
  setNewTaskEstimate: (value: number) => void
  setSelectedTaskId: (id: number) => void
  addTask: () => void
  deleteTask: (id: number) => void
  updateTaskEstimate: (id: number, delta: number) => void
}

export function TaskPanel(props: Props) {
  return (
    <section id="tasks" className="pixel-panel list-card">
      <div className="section-title">
        <div>
          <p className="eyebrow">Quest Log</p>
          <h2>任务管理</h2>
        </div>
        <div className="inline-form">
          <input value={props.newTaskTitle} onChange={(event) => props.setNewTaskTitle(event.target.value)} placeholder="新任务" />
          <input
            type="number"
            min={1}
            max={99}
            value={props.newTaskEstimate}
            onChange={(event) => props.setNewTaskEstimate(Math.max(1, Number(event.target.value) || 1))}
            title="预估番茄数"
            style={{ width: '4rem' }}
          />
          <button onClick={props.addTask}>添加</button>
        </div>
      </div>
      <div className="task-list">
        {props.tasks.map((task) => (
          <article key={task.id} className={props.selectedTaskId === task.id ? 'task-item selected' : 'task-item'} onClick={() => props.setSelectedTaskId(task.id)}>
            <div>
              <strong>{task.title}</strong>
              <span>{task.status === 'todo' ? '待办' : task.status === 'doing' ? '进行中' : '已完成'}</span>
            </div>
            <div className="task-actions">
              <button onClick={(event) => { event.stopPropagation(); props.updateTaskEstimate(task.id, -1) }} title="减少预估">−</button>
              <p>{task.completedPomodoros}/{task.estimatedPomodoros}</p>
              <button onClick={(event) => { event.stopPropagation(); props.updateTaskEstimate(task.id, 1) }} title="增加预估">+</button>
              <button onClick={(event) => { event.stopPropagation(); props.deleteTask(task.id) }}>删除</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
