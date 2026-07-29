import { Component } from 'react'

/*
 * App-wide safety net. Without this, any render-time throw unmounts the whole
 * React tree and leaves a blank page with no clue as to why. This catches the
 * error, shows it, and offers a reload — so a crash is diagnosable instead of
 * silent.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Surfaced in the console with the component stack for debugging.
    console.error('[PetQuest] Render crash:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#06061a', color: '#e2e2ff', fontFamily: 'Nunito, sans-serif', padding: 24,
      }}>
        <div style={{
          maxWidth: 640, width: '100%', background: '#141a2e', border: '1px solid #26314e',
          borderRadius: 12, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
        }}>
          <h1 style={{ fontFamily: 'Cinzel, serif', color: '#ffd166', fontSize: 22, marginBottom: 8 }}>
            Something broke
          </h1>
          <p style={{ color: '#8f8fb8', fontSize: 14, marginBottom: 16 }}>
            The page hit a render error. Details below — please share them if it keeps happening.
          </p>
          <pre style={{
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#0d1120',
            border: '1px solid #26314e', borderRadius: 8, padding: 12, fontSize: 12,
            color: '#fb7185', maxHeight: 240, overflow: 'auto', marginBottom: 16,
          }}>
            {String(this.state.error?.message || this.state.error)}
            {this.state.error?.stack ? '\n\n' + this.state.error.stack : ''}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.assign('/') }}
            style={{
              background: 'linear-gradient(135deg, #f5a31a, #ffd166)', color: '#1a0d00',
              fontWeight: 700, border: 'none', borderRadius: 10, padding: '10px 18px', cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
