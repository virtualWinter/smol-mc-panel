import { Component } from 'react'
import type { ReactNode } from 'react'
import { connectionError } from './transport'

export default class DocumentBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: unknown) { return { error: connectionError(error) } }
  render() {
    if (!this.state.error) return this.props.children
    return <html lang="en"><head><title>smol-mc-panel</title></head><body style={{ background: '#121212', color: '#fff', margin: 0, fontFamily: 'system-ui, sans-serif' }}>
      <main style={{ maxWidth: 480, margin: '80px auto', padding: 24 }}>
        <h1 style={{ fontSize: 20 }}>Could not load the panel</h1>
        <p role="alert" style={{ color: '#aaa', lineHeight: 1.6 }}>{this.state.error.message}</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </main>
    </body></html>
  }
}
