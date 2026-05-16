'use client'

import { useEffect } from 'react'

const STORAGE_KEY = 'quence-zoom'

function getZoom(): number {
  try {
    const v = parseFloat(localStorage.getItem(STORAGE_KEY) ?? '')
    if (!isNaN(v)) return v
  } catch {}
  return 1
}

function applyZoom(z: number) {
  document.documentElement.style.fontSize = `${z * 16}px`
}

export function ZoomHandler() {
  useEffect(() => {
    applyZoom(getZoom())

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const api = (window as any).electronAPI
      if (e.deltaY < 0) {
        api?.zoomIn()
      } else {
        api?.zoomOut()
      }
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  return null
}
