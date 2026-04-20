import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { GameProvider, useGame } from './context/GameContext'
import LoginPage          from './pages/LoginPage'
import PetSelectPage      from './pages/PetSelectPage'
import GameModeSelectPage from './pages/GameModeSelectPage'
import DashboardPage      from './pages/DashboardPage'
import AccessoriesPage    from './pages/AccessoriesPage'
import AdminPage          from './pages/AdminPage'
import Notifications      from './components/Notifications'

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-deep)' }}>
      <div className="text-center">
        <div className="text-5xl mb-4 animate-bounce">🐾</div>
        <p className="font-cinzel gradient-text-gold text-lg">Loading Pet Quest...</p>
      </div>
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

  return (
    <>
      <Notifications />
      <Routes>
        <Route path="/"
          element={
            !loggedIn ? <LoginPage /> :
            !hasPet   ? <Navigate to="/select"      replace /> :
            !hasMode  ? <Navigate to="/mode-select" replace /> :
            <Navigate to="/dashboard" replace />
          }
        />
        <Route path="/select"
          element={
            !loggedIn ? <Navigate to="/" replace /> :
            hasPet    ? (hasMode ? <Navigate to="/dashboard" replace /> : <Navigate to="/mode-select" replace />) :
            <PetSelectPage />
          }
        />
        <Route path="/mode-select"
          element={
            !loggedIn ? <Navigate to="/"       replace /> :
            !hasPet   ? <Navigate to="/select" replace /> :
            <GameModeSelectPage />
          }
        />
        <Route path="/dashboard"
          element={
            !loggedIn ? <Navigate to="/"            replace /> :
            !hasPet   ? <Navigate to="/select"      replace /> :
            !hasMode  ? <Navigate to="/mode-select" replace /> :
            <DashboardPage />
          }
        />
        <Route path="/accessories"
          element={
            !loggedIn ? <Navigate to="/"            replace /> :
            !hasPet   ? <Navigate to="/select"      replace /> :
            !hasMode  ? <Navigate to="/mode-select" replace /> :
            <AccessoriesPage />
          }
        />
        <Route path="/admin"
          element={
            !loggedIn ? <Navigate to="/"          replace /> :
            !isAdmin  ? <Navigate to="/dashboard" replace /> :
            <AdminPage />
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
        <AppRoutes />
      </GameProvider>
    </BrowserRouter>
  )
}
