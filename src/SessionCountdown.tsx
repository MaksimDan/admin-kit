'use client'

import { useCallback, useEffect, useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import type { Session } from 'next-auth'
import { Clock } from 'lucide-react'

// Re-style + warn when this much time (or less) remains before re-auth.
const WARNING_THRESHOLD_MS = 2 * 60 * 1000

/**
 * Resolve the session's ABSOLUTE expiry as epoch-milliseconds.
 *
 * Prefer `session.expiresAt` — a login-anchored timestamp injected by the auth
 * `session` callback (see src/lib/auth.ts + types/next-auth.d.ts). Do NOT depend
 * on the built-in `session.expires`: next-auth (v4, JWT strategy) recomputes it
 * as `now + maxAge` on every session fetch, so it rolls forward and the timer
 * would never tick down. We deliberately do NOT fall back to it.
 */
function getExpiryMs(session: Session | null): number | null {
  if (!session) return null

  const raw = session.expiresAt
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Defensive: normalize accidental epoch-seconds to ms.
    return raw < 1e12 ? raw * 1000 : raw
  }

  // Fail closed: with no absolute deadline, render nothing rather than fall back
  // to session.expires (which next-auth rolls forward into an immortal timer).
  return null
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

interface SessionCountdownProps {
  loginPath?: string
}

export function SessionCountdown({ loginPath = '/admin/login' }: SessionCountdownProps = {}) {
  const { data: session, status } = useSession()
  // Absolute, refetch-stable expiry. null while loading / unauthenticated.
  const expiry = status === 'authenticated' ? getExpiryMs(session) : null

  const [remainingMs, setRemainingMs] = useState<number | null>(null)

  const reLogin = useCallback(() => {
    // Clears the cookie server-side, then routes to the login page.
    void signOut({ callbackUrl: loginPath })
  }, [loginPath])

  useEffect(() => {
    if (expiry == null) {
      setRemainingMs(null)
      return
    }

    let signedOut = false

    const tick = () => {
      // Clamp at 0: clock skew or an already-past expiry must never go negative.
      const left = Math.max(0, expiry - Date.now())
      setRemainingMs(left)
      if (left <= 0 && !signedOut) {
        signedOut = true
        reLogin()
      }
    }

    tick() // paint immediately instead of waiting one second
    const id = setInterval(tick, 1000)
    return () => clearInterval(id) // no setInterval leak across unmount / expiry change
  }, [expiry, reLogin])

  // Don't render before the session (and a usable expiry) are available.
  if (expiry == null || remainingMs == null) return null

  const isWarning = remainingMs <= WARNING_THRESHOLD_MS

  return (
    <div className="flex items-center gap-2 mr-4">
      <span
        title="Time left before you must re-authenticate"
        className={[
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums',
          isWarning ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-gray-100 text-gray-700',
        ].join(' ')}
      >
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">Session expires in </span>
        {formatRemaining(remainingMs)}
      </span>
      <button
        type="button"
        onClick={reLogin}
        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
      >
        Re-login
      </button>
    </div>
  )
}
