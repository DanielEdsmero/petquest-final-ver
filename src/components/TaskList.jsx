import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, Plus, CheckCircle2, Circle } from 'lucide-react'
import { useGame } from '../context/GameContext'

function TaskItem({ task, onComplete, onDelete }) {
  const [showFloat, setShowFloat] = useState(false)

  const handleComplete = () => {
    if (task.completed) return
    setShowFloat(true)
    setTimeout(() => setShowFloat(false), 1200)
    onComplete(task.id)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20, height: 0 }}
      animate={{ opacity: 1, x: 0, height: 'auto' }}
      exit={{ opacity: 0, x: 20, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`task-item relative px-4 py-3 flex items-center gap-3 mb-2 ${task.completed ? 'completed' : ''}`}
    >
      {/* +10 float label */}
      <AnimatePresence>
        {showFloat && (
          <motion.div
            className="float-label font-bold text-sm"
            style={{ color: '#f5a31a', top: '-10px' }}
            initial={{ y: 0, opacity: 1 }}
            animate={{ y: -50, opacity: 0 }}
            exit={{}}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          >
            +10 ✨
          </motion.div>
        )}
      </AnimatePresence>

      {/* Checkbox */}
      <motion.button
        onClick={handleComplete}
        disabled={task.completed}
        className="flex-shrink-0 transition-transform"
        whileTap={{ scale: 0.85 }}
        aria-label={task.completed ? 'Completed' : 'Mark complete'}
      >
        {task.completed ? (
          <CheckCircle2 size={22} className="text-green-500" />
        ) : (
          <Circle size={22} style={{ color: 'rgba(124, 58, 237, 0.5)' }} className="hover:text-gold transition-colors" />
        )}
      </motion.button>

      {/* Task text */}
      <span
        className={`flex-1 text-sm font-nunito font-medium ${task.completed ? 'line-through' : ''}`}
        style={{ color: task.completed ? '#5050aa' : '#c0c0e0' }}
      >
        {task.text}
      </span>

      {/* Delete button */}
      <motion.button
        onClick={() => onDelete(task.id)}
        className="flex-shrink-0 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
        style={{ color: '#5050aa' }}
        whileHover={{ color: '#f43f5e', scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        aria-label="Delete task"
      >
        <Trash2 size={15} />
      </motion.button>
    </motion.div>
  )
}

export default function TaskList() {
  const [input, setInput] = useState('')
  const inputRef = useRef(null)
  const { tasks, addTask, completeTask, deleteTask } = useGame()

  const handleAdd = () => {
    if (addTask(input)) {
      setInput('')
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAdd()
  }

  const activeTasks = tasks.filter(t => !t.completed)
  const completedTasks = tasks.filter(t => t.completed)

  return (
    <div className="flex flex-col h-full">
      {/* Add task input */}
      <div className="flex gap-2 mb-5">
        <input
          ref={inputRef}
          type="text"
          className="input-field flex-1"
          placeholder="Add a new quest..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={80}
        />
        <motion.button
          className="btn-gold px-4 py-2.5 flex items-center gap-1.5 text-sm font-nunito font-bold flex-shrink-0"
          onClick={handleAdd}
          whileTap={{ scale: 0.95 }}
          disabled={!input.trim()}
        >
          <Plus size={16} />
          Add
        </motion.button>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto max-h-72 pr-1 custom-scroll">
        {tasks.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-8"
          >
            <div className="text-4xl mb-2">📜</div>
            <p className="text-sm font-nunito" style={{ color: 'var(--text-muted)' }}>
              No quests yet. Add one to earn points!
            </p>
          </motion.div>
        )}

        <AnimatePresence mode="popLayout">
          {/* Active tasks */}
          {activeTasks.map(task => (
            <div key={task.id} className="group">
              <TaskItem
                task={task}
                onComplete={completeTask}
                onDelete={deleteTask}
              />
            </div>
          ))}

          {/* Completed tasks section */}
          {completedTasks.length > 0 && (
            <motion.div
              key="completed-section"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <p className="text-xs uppercase tracking-widest font-nunito font-semibold mb-2 mt-3 px-1"
                style={{ color: 'var(--text-muted)' }}>
                Completed ({completedTasks.length})
              </p>
              {completedTasks.slice(-5).map(task => (
                <div key={task.id} className="group">
                  <TaskItem
                    task={task}
                    onComplete={completeTask}
                    onDelete={deleteTask}
                  />
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Summary */}
      {tasks.length > 0 && (
        <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs font-nunito"
          style={{ borderColor: 'rgba(124, 58, 237, 0.15)', color: 'var(--text-muted)' }}>
          <span>{activeTasks.length} quest{activeTasks.length !== 1 ? 's' : ''} remaining</span>
          <span className="font-semibold" style={{ color: '#22c55e' }}>
            {completedTasks.length} completed ✓
          </span>
        </div>
      )}
    </div>
  )
}
