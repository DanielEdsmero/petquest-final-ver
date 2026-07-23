import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import useReducedMotion from '../hooks/useReducedMotion'

/*
 * Cinematic login backdrop: an optional looping video, a self-contained
 * Ken Burns fallback scene, and a gold magical-dust canvas overlay.
 *
 * VIDEO SOURCE — deliberately a LOCAL path, not a hotlinked CDN URL.
 * Hotlinking a stock clip is fragile (CDNs move/expire), usually violates the
 * provider's licence (they expect a download), and can't be verified from here.
 * Drop a licensed, muted, seamless-loop clip at `public/login-bg.mp4` and it
 * appears automatically. With no file present the video errors out and the
 * Ken Burns scene below carries the page on its own — so it looks cinematic
 * today with zero external assets. To use a remote URL instead, just point
 * VIDEO_SRC at it.
 */
const VIDEO_SRC = '/login-bg.mp4'

/* Treat phones/small screens as mobile and skip the canvas to save battery. */
function isMobile() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(max-width: 767px)').matches
    || (navigator.maxTouchPoints > 0 && window.innerWidth < 900)
}

export default function CinematicBackground() {
  const reduceMotion = useReducedMotion()
  const [videoReady, setVideoReady] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)
  const canvasRef = useRef(null)

  const showVideo = !reduceMotion && !videoFailed
  const showCanvas = !reduceMotion && !isMobile()

  /* Gold magical-dust particles drifting upward. Plain canvas + rAF — no
     dependency, tiny footprint, and easy to switch off on mobile. */
  useEffect(() => {
    if (!showCanvas) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf
    let running = true

    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let particles = []

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = window.innerWidth + 'px'
      canvas.style.height = window.innerHeight + 'px'
      // Scale count with area, capped so it never floods.
      const target = Math.min(70, Math.round((window.innerWidth * window.innerHeight) / 26000))
      particles = Array.from({ length: target }, () => spawn(true))
    }

    const spawn = (anywhere) => ({
      x: Math.random() * window.innerWidth,
      y: anywhere ? Math.random() * window.innerHeight : window.innerHeight + 10,
      r: Math.random() * 1.8 + 0.6,
      speed: Math.random() * 0.35 + 0.12,       // upward drift
      drift: Math.random() * 0.5 + 0.15,        // horizontal sway amplitude
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: Math.random() * 0.012 + 0.004,
      alpha: 0,
      targetAlpha: Math.random() * 0.6 + 0.25,
      fadeIn: true,
    })

    const draw = () => {
      if (!running) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.scale(dpr, dpr)

      for (const p of particles) {
        p.y -= p.speed
        p.phase += p.phaseSpeed
        p.x += Math.sin(p.phase) * p.drift

        // Gentle fade in near spawn, fade out near the top.
        if (p.fadeIn) {
          p.alpha += 0.006
          if (p.alpha >= p.targetAlpha) p.fadeIn = false
        }
        if (p.y < window.innerHeight * 0.25) p.alpha -= 0.004

        if (p.y < -10 || p.alpha <= 0) Object.assign(p, spawn(false))

        ctx.globalAlpha = Math.max(0, p.alpha)
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = '#f5a31a'
        ctx.shadowBlur = 8
        ctx.shadowColor = 'rgba(245, 163, 26, 0.9)'
        ctx.fill()
      }

      ctx.restore()
      raf = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    raf = requestAnimationFrame(draw)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [showCanvas])

  return (
    <div className="cinematic-bg" aria-hidden="true">
      {/* Base scene: gradient "fantasy horizon" with a slow Ken Burns pan/zoom.
          Always present, so it covers the video while it loads and stands in
          entirely when there's no video / reduced motion. Swap the background
          for url(/login-bg.jpg) to use a real image. */}
      <div className={`cinematic-kenburns ${reduceMotion ? 'is-static' : ''}`} />

      {/* Optional looping video, faded in over 1.5s once it can play. */}
      {showVideo && (
        <motion.video
          className="cinematic-video"
          src={VIDEO_SRC}
          muted
          loop
          autoPlay
          playsInline
          preload="auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: videoReady ? 1 : 0 }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
          onCanPlay={() => setVideoReady(true)}
          onError={() => setVideoFailed(true)}
        />
      )}

      {/* Gold magical dust. */}
      {showCanvas && <canvas ref={canvasRef} className="cinematic-canvas" />}

      {/* Darkening + vignette so the form stays legible over a busy scene. */}
      <div className="cinematic-veil" />
    </div>
  )
}
