import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useGame } from '../context/GameContext'

/* Navy snackbar pills at the bottom-centre; the icon dot carries the type. */
const TYPE_STYLES = {
  success: { dot: '#5EAF7B', icon: '✓' },
  error:   { dot: '#E58A73', icon: '✕' },
  info:    { dot: '#3F8580', icon: '✦' },
}

export default function Notifications() {
  const { notifications, dismissNotification } = useGame()

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10001] flex flex-col-reverse items-center gap-2 pointer-events-none w-[calc(100%-2rem)] max-w-sm"
      role="status" aria-live="polite">
      <AnimatePresence mode="popLayout">
        {notifications.map(notif => {
          const style = TYPE_STYLES[notif.type] || TYPE_STYLES.info
          return (
            <motion.div
              key={notif.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="pointer-events-auto w-full flex items-center gap-3 pl-4 pr-1 rounded-2xl font-nunito"
              style={{ background: '#102A43', color: '#FFFFFF', boxShadow: '0 6px 20px rgba(16,42,67,0.25)', minHeight: 48 }}
            >
              <span aria-hidden="true" className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: style.dot, color: '#FFFFFF' }}>
                {style.icon}
              </span>
              <p className="flex-1 text-sm font-semibold py-2">{notif.message}</p>
              <button
                onClick={() => dismissNotification(notif.id)}
                aria-label="Dismiss"
                className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-xl"
                style={{ color: '#CBD5D0' }}
              >
                <X size={16} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
