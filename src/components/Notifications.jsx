import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useGame } from '../context/GameContext'

const TYPE_STYLES = {
  success: {
    bg: 'rgba(34, 197, 94, 0.12)',
    border: 'rgba(34, 197, 94, 0.3)',
    color: '#4ade80',
    icon: '✓',
  },
  error: {
    bg: 'rgba(244, 63, 94, 0.12)',
    border: 'rgba(244, 63, 94, 0.3)',
    color: '#fb7185',
    icon: '✕',
  },
  info: {
    bg: 'rgba(6, 182, 212, 0.12)',
    border: 'rgba(6, 182, 212, 0.3)',
    color: '#22d3ee',
    icon: '✦',
  },
}

export default function Notifications() {
  const { notifications, dismissNotification } = useGame()

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-xs w-full">
      <AnimatePresence mode="popLayout">
        {notifications.map(notif => {
          const style = TYPE_STYLES[notif.type] || TYPE_STYLES.info
          return (
            <motion.div
              key={notif.id}
              layout
              initial={{ opacity: 0, x: 60, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="notification pointer-events-auto px-4 py-3 flex items-center gap-3"
              style={{
                background: style.bg,
                border: `1px solid ${style.border}`,
                backdropFilter: 'blur(20px)',
              }}
            >
              {/* Icon */}
              <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: `${style.color}20`, color: style.color }}>
                {style.icon}
              </div>

              {/* Message */}
              <p className="flex-1 text-sm font-nunito font-semibold" style={{ color: style.color }}>
                {notif.message}
              </p>

              {/* Dismiss */}
              <button
                onClick={() => dismissNotification(notif.id)}
                className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                style={{ color: style.color }}
              >
                <X size={14} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
