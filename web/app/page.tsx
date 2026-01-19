'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Trash2,
  Edit2,
  Network,
} from 'lucide-react'
import format from 'date-fns/format'
import ru from 'date-fns/locale/ru'
import ReactFlow, { Node, Edge, Background, Controls } from 'reactflow'
import 'reactflow/dist/style.css'

type Task = {
  id: string
  title: string
  description: string | null
  status: 'todo' | 'in_progress' | 'done' | 'cancelled'
  due_date: string | null
  tags: string[]
  created_at: string
  projects?: { name: string }
}

type Project = {
  id: string
  name: string
  color: string
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [view, setView] = useState<'kanban' | 'graph'>('kanban')
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  useEffect(() => {
    loadTasks()
    loadProjects()

    const subscription = supabase
      .channel('tasks_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        loadTasks
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [selectedProject])

  async function loadTasks() {
    let query = supabase
      .from('tasks')
      .select('*, projects(name)')
      .order('created_at', { ascending: false })

    if (selectedProject) {
      query = query.eq('project_id', selectedProject)
    }

    const { data } = await query
    if (data) setTasks(data)
  }

  async function loadProjects() {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('name')

    if (data) setProjects(data)
  }

  async function updateTaskStatus(id: string, status: Task['status']) {
    await supabase.from('tasks').update({ status }).eq('id', id)
    loadTasks()
  }

  async function updateTask(id: string, updates: Partial<Task>) {
    await supabase.from('tasks').update(updates).eq('id', id)
    setEditingTask(null)
    loadTasks()
  }

  async function deleteTask(id: string) {
    if (!confirm('Удалить задачу?')) return
    await supabase.from('tasks').delete().eq('id', id)
    loadTasks()
  }

  const todo = tasks.filter(t => t.status === 'todo')
  const progress = tasks.filter(t => t.status === 'in_progress')
  const done = tasks.filter(t => t.status === 'done')

  const nodes: Node[] = tasks.map((task, i) => ({
    id: task.id,
    data: { label: task.title },
    position: { x: (i % 3) * 300, y: Math.floor(i / 3) * 150 },
    style: {
      background:
        task.status === 'done'
          ? '#10b981'
          : task.status === 'in_progress'
          ? '#f59e0b'
          : '#6b7280',
      color: '#fff',
      borderRadius: 8,
      padding: 10,
    },
  }))

  const edges: Edge[] = []

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="flex justify-between mb-6">
        <h1 className="text-2xl font-bold">📋 Task Manager</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setView('kanban')}
            className={`px-4 py-2 rounded ${
              view === 'kanban' ? 'bg-blue-600' : 'bg-gray-700'
            }`}
          >
            Kanban
          </button>
          <button
            onClick={() => setView('graph')}
            className={`px-4 py-2 rounded flex items-center gap-2 ${
              view === 'graph' ? 'bg-purple-600' : 'bg-gray-700'
            }`}
          >
            <Network size={18} /> Граф
          </button>
        </div>
      </div>

      {view === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Column
            title="To Do"
            icon={<Circle size={18} />}
            tasks={todo}
            onEdit={setEditingTask}
            onDelete={deleteTask}
            onStatusChange={updateTaskStatus}
          />
          <Column
            title="В процессе"
            icon={<Clock size={18} />}
            tasks={progress}
            onEdit={setEditingTask}
            onDelete={deleteTask}
            onStatusChange={updateTaskStatus}
          />
          <Column
            title="Готово"
            icon={<CheckCircle2 size={18} />}
            tasks={done}
            onEdit={setEditingTask}
            onDelete={deleteTask}
            onStatusChange={updateTaskStatus}
          />
        </div>
      )}

      {view === 'graph' && (
        <div className="h-[600px] bg-gray-800 rounded">
          <ReactFlow nodes={nodes} edges={edges} fitView>
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      )}

      {editingTask && (
        <EditTaskModal
          task={editingTask}
          onSave={updateTask}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  )
}

function Column({
  title,
  icon,
  tasks,
  onEdit,
  onDelete,
  onStatusChange,
}: any) {
  return (
    <div className="bg-gray-800 p-4 rounded space-y-3">
      <h2 className="flex items-center gap-2 font-semibold">
        {icon} {title} ({tasks.length})
      </h2>
      {tasks.map((task: Task) => (
        <TaskCard
          key={task.id}
          task={task}
          onEdit={onEdit}
          onDelete={onDelete}
          onStatusChange={onStatusChange}
        />
      ))}
    </div>
  )
}

function TaskCard({ task, onEdit, onDelete, onStatusChange }: any) {
  return (
    <div className="bg-gray-900 p-3 rounded border border-gray-700">
      <div className="flex justify-between mb-1">
        <div>{task.title}</div>
        <div className="flex gap-1">
          <button onClick={() => onEdit(task)}>
            <Edit2 size={14} />
          </button>
          <button onClick={() => onDelete(task.id)}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {task.due_date && (
        <div className="text-xs text-gray-400 flex gap-1 items-center">
          <Calendar size={12} />
          {format(new Date(task.due_date), 'dd MMM, HH:mm', { locale: ru })}
        </div>
      )}

      <select
        value={task.status}
        onChange={e => onStatusChange(task.id, e.target.value)}
        className="w-full mt-2 bg-gray-700 rounded px-2 py-1 text-sm"
      >
        <option value="todo">To Do</option>
        <option value="in_progress">В процессе</option>
        <option value="done">Готово</option>
        <option value="cancelled">Отменено</option>
      </select>
    </div>
  )
}

function EditTaskModal({ task, onSave, onClose }: any) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description || '')
  const [dueDate, setDueDate] = useState(
    task.due_date ? format(new Date(task.due_date), "yyyy-MM-dd'T'HH:mm") : ''
  )

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center">
      <div className="bg-gray-800 p-6 rounded w-full max-w-md space-y-4">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full bg-gray-700 p-2 rounded"
          placeholder="Название"
        />
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="w-full bg-gray-700 p-2 rounded"
          placeholder="Описание"
        />
        <input
          type="datetime-local"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className="w-full bg-gray-700 p-2 rounded"
        />

        <div className="flex gap-2">
          <button
            onClick={() =>
              onSave(task.id, {
                title,
                description,
                due_date: dueDate ? new Date(dueDate).toISOString() : null,
              })
            }
            className="flex-1 bg-blue-600 p-2 rounded"
          >
            Сохранить
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-600 p-2 rounded"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}
