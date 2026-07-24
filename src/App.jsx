import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { GameProvider, useGame } from './context/GameContext'
import PageTransition from './components/animations/PageTransition'
import PortalLoader from './components/animations/PortalLoader'
import ClickSpark from './components/reactbits/ClickSpark'
import DotCursor from './components/animations/DotCursor'
import LoginPage          from './pages/LoginPage'
import PetSelectPage      from './pages/PetSelectPage'
import GameModeSelectPage from './pages/GameModeSelectPage'
import DashboardPage      from './pages/DashboardPage'
import AccessoriesPage    from './pages/AccessoriesPage'
import LeaderboardPage    from './pages/LeaderboardPage'
import AdminPage          from './pages/AdminPage'
import Notifications      from './components/Notifications'

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-deep)' }}>
      <PortalLoader text="Loading Pet Quest..." />
    </div>
  )
}

function AppRoutes() {
  const { profile, authReady } = useGame()

  if (!authReady) return <LoadingScreen />

  const loggedIn = !!profile
  const hasPet   = !!profile?.selected_pet_id
  const hasMode  = !!profile?.game_mode
  const isAdmin  = profile?.role === 'admin'

  /* Pages animate IN on mount via PageTransition. We intentionally do NOT wrap
     Routes in AnimatePresence "wait": with redirect routes and the motion
     element nested inside each element, exit-complete never fires and the
     incoming page stays unmounted (blank screen). Enter-only is robust. */
  return (
    <>
      <Notifications />
      <Routes>
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
            <PageTransition variant="scaleFade"><PetSelectPage /></PageTransition>
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
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <GameProvider>
        {/* Gold sparks on every click, app-wide. The canvas is viewport-fixed
            and pointer-events:none, so it never intercepts a click meant for
            the UI underneath. */}
        <ClickSpark
          sparkColor="#f5a31a"
          sparkSize={9}
          sparkRadius={18}
          sparkCount={8}
          duration={420}
          className="min-h-screen"
        >
          <AppRoutes />
        </ClickSpark>

        {/* A gold dot in place of the system cursor. Nothing else. */}
        <DotCursor color="#f5a31a" size={7} />
      </GameProvider>
    </BrowserRouter>
  )
}
