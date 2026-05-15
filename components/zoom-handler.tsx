'use client'

import { useEffect } from 'react'

const STORAGE_KEY = 'postman-lite-zoom'
const MIN = 0.5
const MAX = 2.0
const STEP = 0.1

function getZoom(): number {
  try {
    const v = parseFloat(localStorage.getItem(STORAGE_KEY) ?? '')
    if (!isNaN(v)) return Math.min(MAX, Math.max(MIN, v))
  } catch {}
  return 1
}

function applyZoom(z: number) {
  document.documentElement.style.fontSize = `${z * 16}px`
}

export function ZoomHandler() {
  useEffect(() => {
    applyZoom(getZoom())

    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const current = getZoom()
      const delta = e.deltaY < 0 ? STEP : -STEP
      const next = Math.min(MAX, Math.max(MIN, Math.round((current + delta) * 10) / 10))
      localStorage.setItem(STORAGE_KEY, String(next))
      applyZoom(next)
    }

    window.addEventListener('wheel', handler, { passive: false })
    return () => window.removeEventListener('wheel', handler)
  }, [])

  return null
}
