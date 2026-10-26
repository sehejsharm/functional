import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Component, type ReactNode } from 'react'

/** Catches a crash inside one screen so the portal shell stays usable and offers a retry instead of a blank pane. */
export class RouteBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidUpdate(prev: { resetKey: string }) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }) }
  componentDidCatch(error: Error) { console.error('Screen failed to render', error) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="mx-auto mt-10 max-w-md rounded-card border border-danger/30 bg-white p-6 text-center shadow-card">
        <AlertTriangle className="mx-auto text-danger" size={28} />
        <h2 className="mt-3 text-lg font-semibold text-ink">This screen couldn't load</h2>
        <p className="mt-1 text-sm text-muted">Your work is saved. Try again, or go back to the previous screen.</p>
        <button onClick={() => this.setState({ error: null })} className="mt-4 inline-flex items-center gap-2 rounded-pill bg-forest-900 px-4 py-2 text-sm font-semibold text-white">
          <RotateCcw size={14} /> Try again
        </button>
      </div>
    )
  }
}
