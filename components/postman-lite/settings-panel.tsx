'use client'

import { useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'

type OklchColor = { l: number; c: number; h: number }

function fmt(c: OklchColor) {
  return `oklch(${c.l.toFixed(3)} ${c.c.toFixed(3)} ${Math.round(c.h)})`
}

const ACCENT_PRESETS = [
  { name: 'Teal',   l: 0.72, c: 0.19, h: 160 },
  { name: 'Blue',   l: 0.65, c: 0.20, h: 230 },
  { name: 'Violet', l: 0.68, c: 0.20, h: 280 },
  { name: 'Pink',   l: 0.70, c: 0.20, h: 330 },
  { name: 'Orange', l: 0.75, c: 0.18, h: 55  },
  { name: 'Red',    l: 0.62, c: 0.22, h: 20  },
  { name: 'Cyan',   l: 0.73, c: 0.16, h: 195 },
  { name: 'Lime',   l: 0.75, c: 0.20, h: 130 },
]

interface Settings {
  accent: OklchColor
  bgL: number
  bgH: number
  fgL: number
  mutedL: number
  destructive: OklchColor
}

const DEFAULTS: Settings = {
  accent:      { l: 0.72, c: 0.19, h: 160 },
  bgL: 0.12,
  bgH: 260,
  fgL: 0.95,
  mutedL: 0.6,
  destructive: { l: 0.55, c: 0.22, h: 25 },
}

const STORAGE_KEY = 'postman-lite-theme'

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {}
  return DEFAULTS
}

function applySettings(s: Settings) {
  const el = document.documentElement
  const set = (v: string, color: OklchColor) => el.style.setProperty(v, fmt(color))

  const bg: OklchColor = { l: s.bgL, c: 0.01, h: s.bgH }
  const fg: OklchColor = { l: s.fgL, c: 0, h: 0 }

  // Accent + mirrors
  set('--primary', s.accent)
  set('--accent', s.accent)
  set('--ring', s.accent)
  set('--sidebar-primary', s.accent)
  set('--sidebar-ring', s.accent)
  set('--chart-1', s.accent)

  // Accent foreground = background
  set('--primary-foreground', bg)
  set('--accent-foreground', bg)
  set('--sidebar-primary-foreground', bg)

  // Background family (stepped lightness)
  set('--background', bg)
  set('--sidebar',        { ...bg, l: bg.l + 0.02 })
  set('--card',           { ...bg, l: bg.l + 0.04 })
  set('--popover',        { ...bg, l: bg.l + 0.06 })
  set('--muted',          { ...bg, l: bg.l + 0.08 })
  set('--input',          { ...bg, l: bg.l + 0.08 })
  set('--secondary',      { ...bg, l: bg.l + 0.10 })
  set('--sidebar-accent', { ...bg, l: bg.l + 0.10 })
  set('--border',         { ...bg, l: bg.l + 0.14 })
  set('--sidebar-border', { ...bg, l: bg.l + 0.14 })

  // Foreground family
  set('--foreground', fg)
  set('--card-foreground', fg)
  set('--popover-foreground', fg)
  set('--sidebar-foreground', fg)
  set('--destructive-foreground', fg)
  set('--secondary-foreground', { ...fg, l: Math.max(0, fg.l - 0.10) })
  set('--sidebar-accent-foreground', fg)
  set('--muted-foreground', { l: s.mutedL, c: 0, h: 0 })

  // Destructive
  set('--destructive', s.destructive)
}

function Slider({
  label, value, min, max, step, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void
}) {
  const decimals = step >= 1 ? 0 : 2
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{value.toFixed(decimals)}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full accent-primary cursor-pointer"
      />
    </div>
  )
}

function Swatch({ color, style }: { color: OklchColor; style?: React.CSSProperties }) {
  return <div className="h-5 rounded-sm" style={{ background: fmt(color), ...style }} />
}

interface Props {
  open: boolean
  onClose: () => void
}

export function SettingsPanel({ open, onClose }: Props) {
  const [s, setS] = useState<Settings>(DEFAULTS)

  useEffect(() => {
    const loaded = load()
    setS(loaded)
    applySettings(loaded)
  }, [])

  const update = useCallback((updater: (prev: Settings) => Settings) => {
    setS(prev => {
      const next = updater(prev)
      applySettings(next)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  if (!open) return null

  const bg: OklchColor = { l: s.bgL, c: 0.01, h: s.bgH }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-72 bg-card border-l border-border flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <span className="text-sm font-medium">Appearance</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => update(() => DEFAULTS)}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-accent/20 transition-colors"
            >
              Reset
            </button>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-accent/20 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">

          {/* Accent color */}
          <section className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Accent Color</p>

            {/* Presets */}
            <div className="grid grid-cols-4 gap-2">
              {ACCENT_PRESETS.map(p => {
                const active = Math.abs(s.accent.h - p.h) < 6 &&
                               Math.abs(s.accent.c - p.c) < 0.05
                return (
                  <button
                    key={p.name}
                    title={p.name}
                    onClick={() => update(prev => ({ ...prev, accent: { l: p.l, c: p.c, h: p.h } }))}
                    className="flex flex-col items-center gap-1"
                  >
                    <div
                      className={`w-8 h-8 rounded-full transition-all ${
                        active
                          ? 'ring-2 ring-offset-2 ring-offset-card ring-foreground/80 scale-110'
                          : 'hover:scale-110'
                      }`}
                      style={{ background: `oklch(${p.l} ${p.c} ${p.h})` }}
                    />
                    <span className="text-[10px] text-muted-foreground">{p.name}</span>
                  </button>
                )
              })}
            </div>

            {/* Fine-tune sliders */}
            <div className="space-y-3 pt-1">
              <Slider label="Lightness" value={s.accent.l} min={0.3} max={0.9} step={0.01}
                onChange={v => update(prev => ({ ...prev, accent: { ...prev.accent, l: v } }))} />
              <Slider label="Chroma (Saturation)" value={s.accent.c} min={0} max={0.4} step={0.01}
                onChange={v => update(prev => ({ ...prev, accent: { ...prev.accent, c: v } }))} />
              <Slider label="Hue" value={s.accent.h} min={0} max={359} step={1}
                onChange={v => update(prev => ({ ...prev, accent: { ...prev.accent, h: v } }))} />
            </div>
            <Swatch color={s.accent} />
          </section>

          <div className="border-t border-border" />

          {/* Background */}
          <section className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Background</p>
            <Slider label="Lightness" value={s.bgL} min={0.06} max={0.30} step={0.01}
              onChange={v => update(prev => ({ ...prev, bgL: v }))} />
            <Slider label="Hue" value={s.bgH} min={0} max={359} step={1}
              onChange={v => update(prev => ({ ...prev, bgH: v }))} />
            <div className="flex gap-1.5">
              <Swatch color={bg} style={{ flex: 1 }} />
              <Swatch color={{ ...bg, l: bg.l + 0.04 }} style={{ flex: 1 }} />
              <Swatch color={{ ...bg, l: bg.l + 0.14 }} style={{ flex: 1 }} />
            </div>
            <div className="flex gap-1.5 text-[10px] text-muted-foreground -mt-1">
              <span className="flex-1 text-center">BG</span>
              <span className="flex-1 text-center">Card</span>
              <span className="flex-1 text-center">Border</span>
            </div>
          </section>

          <div className="border-t border-border" />

          {/* Text */}
          <section className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Text</p>
            <Slider label="Text Brightness" value={s.fgL} min={0.6} max={1.0} step={0.01}
              onChange={v => update(prev => ({ ...prev, fgL: v }))} />
            <Slider label="Muted Text" value={s.mutedL} min={0.3} max={0.8} step={0.01}
              onChange={v => update(prev => ({ ...prev, mutedL: v }))} />
          </section>

          <div className="border-t border-border" />

          {/* Destructive */}
          <section className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Destructive</p>
            <Slider label="Lightness" value={s.destructive.l} min={0.3} max={0.8} step={0.01}
              onChange={v => update(prev => ({ ...prev, destructive: { ...prev.destructive, l: v } }))} />
            <Slider label="Chroma" value={s.destructive.c} min={0} max={0.35} step={0.01}
              onChange={v => update(prev => ({ ...prev, destructive: { ...prev.destructive, c: v } }))} />
            <Slider label="Hue" value={s.destructive.h} min={0} max={359} step={1}
              onChange={v => update(prev => ({ ...prev, destructive: { ...prev.destructive, h: v } }))} />
            <Swatch color={s.destructive} />
          </section>

        </div>
      </div>
    </>
  )
}
