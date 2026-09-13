import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { GameProvider, useGame } from './context/GameContext'
import PageTransition from './components/animations/PageTransition'
import { MascotWakeScreen } from './components/animations/MascotWakeLoader'
import ErrorBoundary from './components/ErrorBoundary'
import LoginPage          from './pages/LoginPage'
import EggHatchingPage    from './pages/EggHatchingPage'
import GameModeSelectPage from './pages/GameModeSelectPage'
import DashboardPage      from './pages/DashboardPage'
import AccessoriesPage    from './pages/AccessoriesPage'
import LeaderboardPage    from './pages/LeaderboardPage'
import AdminPage          from './pages/AdminPage'
import Notifications      from './components/Notifications'

function AppRoutes() {
  const { profile, authReady, signingIn } = useGame()

  /* ── Account-loading gate (the single one) ──
     It lives here, above the router, so no redirect can tear the animation down
     halfway — which is exactly what happened when the login page owned its own
     overlay and the route guard swapped it out the instant the profile landed.
     Requests are never gated: GameContext starts auth + the profile/task
     fetches on mount, and `signingIn` flips the moment a sign-in begins, so the
     mascot and the network call run in parallel.

     Gated while an account load is in flight, and then until that account has
     been revealed (data ready AND the wake-up minimum played, or Skip pressed).
     A logged-out visitor has no account to load, so the login page is never
     held behind the animation, and a failed sign-in clears `signingIn` and
     drops the gate immediately rather than trapping anyone. */
  const [revealedFor, setRevealedFor] = useState(null)
  const accountDataReady = authReady && !signingIn
  const accountId = profile?.id || null
  const gated = !accountDataReady || (!!accountId && revealedFor !== accountId)

  /* One token per loading instance. It must NOT change while the loader is up —
     the account id arrives mid-sequence, and keying off that would restart the
     animation right as the profile lands. */
  const [loadId, setLoadId] = useState(0)
  const wasGated = useRef(true)
  useEffect(() => {
    if (gated && !wasGated.current) setLoadId(n => n + 1)
    wasGated.current = gated
  }, [gated])

  const loggedIn = !!profile
  const done     = !!profile?.onboarding_complete
  /* Once onboarding is complete, treat both steps as satisfied so a completed
     user is NEVER redirected back into egg/mode-select (Phase 1). Existing users
     (no flag, but a pet + mode already) are unaffected. */
  const hasPet   = !!profile?.selected_pet_id || done
  const hasMode  = !!profile?.game_mode || done
  const isAdmin  = profile?.role === 'admin'

  /* Pages animate IN on mount via PageTransition. We intentionally do NOT wrap
     Routes in AnimatePresence "wait": with redirect routes and the motion
     element nested inside each element, exit-complete never fires and the
     incoming page stays unmounted (blank screen). Enter-only is robust. */
  /* What renders UNDER the overlay.
     While an account is being revealed we keep its screens unmounted, so the
     dashboard cannot run its celebrations (the evolution overlay auto-dismisses
     after 9s) or its heavy work behind a loading screen nobody can see past.
     But a sign-in that has no account yet DOES keep rendering — that is the
     login page, and unmounting it would wipe the participant's typed values
     when a failed sign-in drops the gate. */
  const showRoutes = authReady && (!gated || !accountId)

  return (
    <>
      <Notifications />
      {showRoutes && <Routes>
        <Route path="/"
          element={
            !loggedIn ? <PageTransition variant="fade"><LoginPage /></PageTransition> :
            !hasPet   ? <Navigate to="/select"      replace /> :
            !hasMode  ? <Navigate to="/mode-select" replace /> :
            <Navigate to="/dashboard" replace />
          }
        />
        <Route path="/select"
          element={
            !loggedIn ? <Navigate to="/" replace /> :
            hasPet    ? (hasMode ? <Navigate to="/dashboard" replace /> : <Navigate to="/mode-select" replace />) :
            <PageTransition variant="scaleFade"><EggHatchingPage /></PageTransition>
          }
        />
        <Route path="/mode-select"
          element={
            !loggedIn ? <Navigate to="/"       replace /> :
            !hasPet   ? <Navigate to="/select" replace /> :
            <PageTransition variant="scaleFade"><GameModeSelectPage /></PageTransition>
          }
        />
        <Route path="/dashboard"
          element={
            !loggedIn ? <Navigate to="/"            replace /> :
            !hasPet   ? <Navigate to="/select"      replace /> :
            !hasMode  ? <Navigate to="/mode-select" replace /> :
            <PageTransition variant="fade"><DashboardPage /></PageTransition>
          }
        />
        <Route path="/accessories"
          element={
            !loggedIn ? <Navigate to="/"            replace /> :
            !hasPet   ? <Navigate to="/select"      replace /> :
            !hasMode  ? <Navigate to="/mode-select" replace /> :
            <PageTransition variant="slideLeft"><AccessoriesPage /></PageTransition>
          }
        />
        {/* Leaderboard is open to every logged-in player. */}
        <Route path="/leaderboard"
          element={
            !loggedIn ? <Navigate to="/" replace /> :
            <PageTransition variant="slideLeft"><LeaderboardPage /></PageTransition>
          }
        />
        <Route path="/admin"
          element={
            !loggedIn ? <Navigate to="/"          replace /> :
            !isAdmin  ? <Navigate to="/dashboard" replace /> :
            <PageTransition variant="slideLeft"><AdminPage /></PageTransition>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>}

      {/* The account-loading screen, over the top. Same element position in
          both branches above, so it is one continuous instance from boot
          through to the reveal — it never remounts and never restarts. */}
      {gated && (
        <MascotWakeScreen
          petType={profile?.selected_pet_id}
          evolutionStage={profile?.pet_level || 1}
          restartToken={loadId}
          accountDataReady={accountDataReady}
          onComplete={() => setRevealedFor(accountId || 'none')}
        />
      )}
    </>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <GameProvider>
          <AppRoutes />
        </GameProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
