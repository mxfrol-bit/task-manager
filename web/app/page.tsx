'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Calendar, CheckCircle2, Circle, Clock, Trash2, Edit2, Network } from 'lucide-react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        loadTasks()
      })
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

  async function updateTaskStatus(taskId: string, status: Task['status']) {
    await supabase
      .from('tasks')
      .update({ status })
      .eq('id', taskId)
    
    loadTasks()
  }

  async function updateTask(taskId: string, updates: Partial<Task>) {
    await supabase
      .from('tasks')
      .update(updates)
      .eq('id', taskId)
    
    setEditingTask(null)
    loadTasks()
  }

  async function deleteTask(taskId: string) {
    if (confirm('Удалить задачу?')) {
      await supabase.from('tasks').delete().eq('id', taskId)
      loadTasks()
    }
  }

  const todoTasks = tasks.filter(t => t.status === 'todo')
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress')
  const doneTasks = tasks.filter(t => t.status === 'done')

  const nodes: Node[] = tasks.map((task, i) => ({
    id: task.id,
    data: { label: task.title },
    position: { x: (i % 3) * 300, y: Math.floor(i / 3) * 150 },
    style: {
      background: task.status === 'done' ? '#10b981' : task.status === 'in_progress' ? '#f59e0b' : '#6b7280',
      color: '#fff',
      border: '2px solid #333',
      borderRadius: '8px',
      padding: '10px',
    },
  }))

  const edges: Edge[] = []

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      <div className="border-b border-gray-700 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              📋 Task Manager
            </h1>
            
            <div className="flex gap-2">
              <button
                onClick={() => setView('kanban')}
                className={`px-4 py-2 rounded-lg transition ${
                  view === 'kanban' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                Kanban
              </button>
              <button
                onClick={() => setView('graph')}
                className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${
                  view === 'graph' ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                <Network size={18} />
                Граф
              </button>
            </div>
          </div>

          {projects.length > 0 && (
            <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
              <button
                onClick={() => setSelectedProject(null)}
                className={`px-4 py-2 rounded-lg whitespace-nowrap transition ${
                  selectedProject === null ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                Все проекты
              </button>
              {projects.map(project => (
                <button
                  key={project.id}
                  onClick={() => setSelectedProject(project.id)}
                  className={`px-4 py-2 rounded-lg whitespace-nowrap transition ${
                    selectedProject === project.id ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  {project.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {view === 'kanban' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gray-800/50 backdrop-blur rounded-xl p-4 border border-gray-700">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Circle className="text-gray-400" size={20} />
                To Do ({todoTasks.length})
              </h2>
              <div className="space-y-3">
                {todoTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStatusChange={updateTaskStatus}
                    onEdit={setEditingTask}
                    onDelete={deleteTask}
                  />
                ))}
              </div>
            </div>

            <div className="bg-gray-800/50 backdrop-blur rounded-xl p-4 border border-gray-700">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Clock className="text-amber-400" size={20} />
                В процессе ({inProgressTasks.length})
              </h2>
              <div className="space-y-3">
                {inProgressTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStatusChange={updateTaskStatus}
                    onEdit={setEditingTask}
                    onDelete={deleteTask}
                  />
                ))}
              </div>
            </div>

            <div className="bg-gray-800/50 backdrop-blur rounded-xl p-4 border border-gray-700">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <CheckCircle2 className="text-green-400" size={20} />
                Выполнено ({doneTasks.length})
              </h2>
              <div className="space-y-3">
                {doneTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStatusChange={updateTaskStatus}
                    onEdit={setEditingTask}
                    onDelete={deleteTask}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {view === 'graph' && (
          <div className="bg-gray-800/50 backdrop-blur rounded-xl p-4 border border-gray-700" style={{ height: '600px' }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              fitView
            >
              <Background />
              <Controls />
            </ReactFlow>
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-6">
            <div className="text-3xl font-bold">{tasks.length}</div>
            <div className="text-blue-100 text-sm">Всего задач</div>
          </div>
          <div className="bg-gradient-to-br from-amber-600 to-amber-700 rounded-xl p-6">
            <div className="text-3xl font-bold">{inProgressTasks.length}</div>
            <div className="text-amber-100 text-sm">В процессе</div>
          </div>
          <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-xl p-6">
            <div className="text-3xl font-bold">{doneTasks.length}</div>
            <div className="text-green-100 text-sm">Завершено</div>
          </div>
          <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-xl p-6">
            <div className="text-3xl font-bold">{projects.length}</div>
            <div className="text-purple-100 text-sm">Проектов</div>
          </div>
        </div>
      </div>

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

function TaskCard({
  task,
  onStatusChange,
  onEdit,
  onDelete,
}: {
  task: Task
  onStatusChange: (id: string, status: Task['status']) => void
  onEdit: (task: Task) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-600 hover:border-blue-500 transition group">
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-medium flex-1">{task.title}</h3>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
          <button
            onClick={() => onEdit(task)}
            className="p-1 hover:bg-gray-700 rounded"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="p-1 hover:bg-red-600 rounded"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {task.projects && (
        <div className="text-xs text-blue-400 mb-2">📁 {task.projects.name}</div>
      )}

      {task.due_date && (
        <div className="text-xs text-gray-400 flex items-center gap-1 mb-2">
          <Calendar size={12} />
          {format(new Date(task.due_date), 'dd MMM, HH:mm', { locale: ru })}
        </div>
      )}

      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {task.tags.map(tag => (
            <span key={tag} className="text-xs bg-blue-600/30 text-blue-300 px-2 py-1 rounded">
              #{tag}
            </span>
          ))}
        </div>
      )}

      <select
        value={task.status}
        onChange={(e) => onStatusChange(task.id, e.target.value as Task['status'])}
        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
      >
        <option value="todo">To Do</option>
        <option value="in_progress">В процессе</option>
        <option value="done">Выполнено</option>
        <option value="cancelled">Отменено</option>
      </select>
    </div>
  )
}

function EditTaskModal({
  task,
  onSave,
  onClose,
}: {
  task: Task
  onSave: (id: string, updates: Partial<Task>) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description || '')
  const [dueDate, setDueDate] = useState(
    task.due_date ? format(new Date(task.due_date), "yyyy-MM-dd'T'HH:mm") : ''
  )

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700">
        <h2 className="text-xl font-bold mb-4">Редактировать задачу</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Название</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Описание</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Дата и время</label>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                onSave(task.id, {
                  title,
                  description,
                  due_date: dueDate ? new Date(dueDate).toISOString() : null,
                })
              }}
              className="flex-1 bg-blue-600 hover:bg-blue-700 rounded px-4 py-2 transition"
            >
              Сохранить
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 rounded px-4 py-2 transition"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
