'use client'

import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Accessibility for modal dialogs. While `active`:
 *  - moves keyboard focus into the dialog (an optional `initialFocusRef`
 *    target if given, otherwise the first focusable element),
 *  - keeps Tab / Shift+Tab cycling within it (a focus trap), pulling focus
 *    back in if it ever escapes the container,
 *  - closes on Escape,
 *  - and restores focus to whatever opened the dialog once it closes.
 *
 * Returns a ref to attach to the dialog container. Call it unconditionally
 * (before any early return) to respect the Rules of Hooks.
 *
 * `initialFocusRef` is optional and backward-compatible: callers that omit it
 * get the original "focus the first focusable element" behaviour.
 */
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  onClose?: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  const containerRef = useRef<T>(null)
  // Keep the latest onClose without re-running the effect (and re-stealing
  // focus) when a parent passes a fresh inline callback each render.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  // Mirror the initial-focus target the same way so the effect's dependency
  // list stays `[active]` — callers that omit it keep the exact prior behaviour.
  const initialFocusRef_ = useRef(initialFocusRef)
  initialFocusRef_.current = initialFocusRef

  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    // A focusable is visible when it renders at least one client rect. This is
    // more robust than `offsetParent !== null`, which is always null for
    // `position: fixed` elements and would wrongly exclude them.
    const focusable = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.getClientRects().length > 0,
      )

    // Move focus into the dialog: a caller-provided target if present, else the
    // first focusable element, else the container itself.
    const initialTarget = initialFocusRef_.current?.current
    if (initialTarget) {
      initialTarget.focus()
    } else {
      const first = focusable()[0]
      if (first) first.focus()
      else container.focus()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab') return

      const items = focusable()
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      const activeEl = document.activeElement

      // If focus has escaped the container entirely, pull it back in: Tab lands
      // on the first focusable, Shift+Tab on the last.
      if (!activeEl || !container.contains(activeEl)) {
        event.preventDefault()
        ;(event.shiftKey ? lastEl : firstEl).focus()
        return
      }

      if (event.shiftKey && activeEl === firstEl) {
        event.preventDefault()
        lastEl.focus()
      } else if (!event.shiftKey && activeEl === lastEl) {
        event.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [active])

  return containerRef
}
