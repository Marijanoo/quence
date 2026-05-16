'use client'

import { useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { useDebouncedCallback } from '@/hooks/use-debounce'

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
  accent:      OklchColor
  bgL:         number
  bgC:         number
  bgH:         number
  fgL:         number
  mutedL:      number
  destructive: OklchColor
  jsonKey:     OklchColor
  jsonString:  OklchColor
  jsonNumber:  OklchColor
  jsonBoolean: OklchColor
}

const DEFAULTS: Settings = {
  accent:      { l: 0.9,  c: 0.11, h: 98  },
  bgL:         0.28,
  bgC:         0.01,
  bgH:         282,
  fgL:         0.97,
  mutedL:      0.85,
  destructive: { l: 0.55, c: 0.22, h: 25 },
  jsonKey:     { l: 0.90, c: 0.10, h: 100 },
  jsonString:  { l: 0.76, c: 0.15, h: 160 },
  jsonNumber:  { l: 0.90, c: 0.13, h: 246 },
  jsonBoolean: { l: 0.89, c: 0.19, h: 15  },
}

const STORAGE_KEY = 'quence-theme'

function clampSettings(s: Settings): Settings {
  const clampL = (l: number) => Math.min(0.90, Math.max(0.35, l))
  const clampColor = (c: OklchColor) => ({ ...c, l: clampL(c.l) })
  const dark = s.bgL <= 0.5
  const fgMin = dark ? Math.min(1, s.bgL + 0.4) : 0
  const fgMax = dark ? 1 : Math.max(0, s.bgL - 0.4)
  const fgL = Math.min(fgMax, Math.max(fgMin, s.fgL))
  const mutedMin = s.bgL + 0.15
  const mutedMax = fgL - 0.1
  const mutedL = Math.min(Math.max(mutedMin, mutedMax), Math.max(Math.min(mutedMin, mutedMax), s.mutedL))
  return {
    ...s,
    bgL: Math.min(0.95, Math.max(0.05, s.bgL)),
    fgL,
    mutedL,
    accent: clampColor(s.accent),
    destructive: clampColor(s.destructive),
    jsonKey: clampColor(s.jsonKey),
    jsonString: clampColor(s.jsonString),
    jsonNumber: clampColor(s.jsonNumber),
    jsonBoolean: clampColor(s.jsonBoolean),
  }
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return clampSettings({ ...DEFAULTS, ...JSON.parse(raw) })
  } catch {}
  return DEFAULTS
}

function applySettings(s: Settings) {
  const el = document.documentElement
  const set = (v: string, color: OklchColor) => el.style.setProperty(v, fmt(color))
  const setRaw = (v: string, val: string) => el.style.setProperty(v, val)

  const bg: OklchColor = { l: s.bgL, c: s.bgC, h: s.bgH }
  const fg: OklchColor = { l: s.fgL, c: 0, h: 0 }

  // Accent
  set('--primary', s.accent)
  set('--accent', s.accent)
  set('--ring', s.accent)
  set('--sidebar-primary', s.accent)
  set('--sidebar-ring', s.accent)
  set('--chart-1', s.accent)
  set('--primary-foreground', bg)
  set('--accent-foreground', bg)
  set('--sidebar-primary-foreground', bg)

  // Background family
  set('--background', bg)
  set('--sidebar',        { ...bg, l: Math.min(1, bg.l + 0.02) })
  set('--card',           { ...bg, l: Math.min(1, bg.l + 0.04) })
  set('--popover',        { ...bg, l: Math.min(1, bg.l + 0.06) })
  set('--muted',          { ...bg, l: Math.min(1, bg.l + 0.08) })
  set('--input',          { ...bg, l: Math.min(1, bg.l + 0.08) })
  set('--secondary',      { ...bg, l: Math.min(1, bg.l + 0.10) })
  set('--sidebar-accent', { ...bg, l: Math.min(1, bg.l + 0.10) })
  set('--border',         { ...bg, l: Math.min(1, bg.l + 0.14) })
  set('--sidebar-border', { ...bg, l: Math.min(1, bg.l + 0.14) })

  // Foreground
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

  // JSON syntax colors
  setRaw('--json-key',     fmt(s.jsonKey))
  setRaw('--json-string',  fmt(s.jsonString))
  setRaw('--json-number',  fmt(s.jsonNumber))
  setRaw('--json-boolean', fmt(s.jsonBoolean))
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Slider({ label, value, min, max, step, onChange }: {
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
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full accent-primary cursor-pointer"
      />
    </div>
  )
}

function Swatch({ color, style, label }: { color: OklchColor | string; style?: React.CSSProperties; label?: string }) {
  const bg = typeof color === 'string' ? color : fmt(color)
  return (
    <div className="flex flex-col items-center gap-1" style={{ flex: 1 }}>
      <div className="h-5 rounded-sm w-full" style={{ background: bg, ...style }} />
      {label && <span className="text-[10px] text-muted-foreground">{label}</span>}
    </div>
  )
}

function ColorSection({
  label, color, onChange, showSwatch = true,
}: {
  label: string
  color: OklchColor
  onChange: (c: OklchColor) => void
  showSwatch?: boolean
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        {showSwatch && <div className="h-4 w-8 rounded-sm" style={{ background: fmt(color) }} />}
      </div>
      <Slider label="Lightness" value={color.l} min={0.35} max={0.90} step={0.01}
        onChange={v => onChange({ ...color, l: v })} />
      <Slider label="Chroma" value={color.c} min={0} max={0.4} step={0.01}
        onChange={v => onChange({ ...color, c: v })} />
      <Slider label="Hue" value={color.h} min={0} max={359} step={1}
        onChange={v => onChange({ ...color, h: v })} />
    </div>
  )
}

// Live JSON preview
function JsonPreview({ s }: { s: Settings }) {
  const keyColor   = fmt(s.jsonKey)
  const strColor   = fmt(s.jsonString)
  const numColor   = fmt(s.jsonNumber)
  const boolColor  = fmt(s.jsonBoolean)
  const mutedColor = `oklch(${s.mutedL.toFixed(3)} 0 0)`

  return (
    <pre className="font-mono text-[11px] leading-relaxed rounded-md border border-border bg-background p-3 overflow-x-auto">
      <span style={{ color: mutedColor }}>{'{'}</span>{'\n'}
      <span>{'  '}<span style={{ color: keyColor }}>"name"</span><span style={{ color: mutedColor }}>: </span><span style={{ color: strColor }}>"value"</span><span style={{ color: mutedColor }}>,</span></span>{'\n'}
      <span>{'  '}<span style={{ color: keyColor }}>"count"</span><span style={{ color: mutedColor }}>: </span><span style={{ color: numColor }}>42</span><span style={{ color: mutedColor }}>,</span></span>{'\n'}
      <span>{'  '}<span style={{ color: keyColor }}>"active"</span><span style={{ color: mutedColor }}>: </span><span style={{ color: boolColor }}>true</span><span style={{ color: mutedColor }}>,</span></span>{'\n'}
      <span>{'  '}<span style={{ color: keyColor }}>"tag"</span><span style={{ color: mutedColor }}>: </span><span style={{ color: mutedColor }}>null</span></span>{'\n'}
      <span style={{ color: mutedColor }}>{'}'}</span>
    </pre>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props { open: boolean; onClose: () => void }

export function SettingsPanel({ open, onClose }: Props) {
  const [s, setS] = useState<Settings>(DEFAULTS)

  useEffect(() => {
    const loaded = load()
    setS(loaded)
    applySettings(loaded)
  }, [])

  const [saveDebounced] = useDebouncedCallback((next: Settings) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }, 300)

  const update = useCallback((updater: (prev: Settings) => Settings) => {
    setS(prev => {
      const next = updater(prev)
      applySettings(next)
      saveDebounced(next)
      return next
    })
  }, [saveDebounced])

  if (!open) return null

  const bg: OklchColor = { l: s.bgL, c: s.bgC, h: s.bgH }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-card border-l border-border flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <span className="text-sm font-medium">Appearance</span>
          <div className="flex items-center gap-2">
            <button onClick={() => update(() => DEFAULTS)}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-accent/20 transition-colors">
              Reset
            </button>
            <button onClick={onClose}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-accent/20 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">

          {/* ── Accent ─────────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Accent Color</p>
            <div className="grid grid-cols-4 gap-2">
              {ACCENT_PRESETS.map(p => {
                const active = Math.abs(s.accent.h - p.h) < 6 && Math.abs(s.accent.c - p.c) < 0.05
                return (
                  <button key={p.name} title={p.name}
                    onClick={() => update(prev => ({ ...prev, accent: { l: p.l, c: p.c, h: p.h } }))}
                    className="flex flex-col items-center gap-1">
                    <div className={`w-8 h-8 rounded-full transition-all ${active ? 'ring-2 ring-offset-2 ring-offset-card ring-foreground/80 scale-110' : 'hover:scale-110'}`}
                      style={{ background: `oklch(${p.l} ${p.c} ${p.h})` }} />
                    <span className="text-[10px] text-muted-foreground">{p.name}</span>
                  </button>
                )
              })}
            </div>
            <ColorSection label="Custom accent" color={s.accent} showSwatch={false}
              onChange={c => update(prev => ({ ...prev, accent: c }))} />
            <Swatch color={s.accent} />
          </section>

          <div className="border-t border-border" />

          {/* ── Background ─────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Background</p>
            <Slider label="Lightness" value={s.bgL} min={0.05} max={0.95} step={0.01}
              onChange={v => update(prev => ({ ...prev, bgL: v }))} />
            <Slider label="Chroma (tint)" value={s.bgC} min={0} max={0.08} step={0.005}
              onChange={v => update(prev => ({ ...prev, bgC: v }))} />
            <Slider label="Hue" value={s.bgH} min={0} max={359} step={1}
              onChange={v => update(prev => ({ ...prev, bgH: v }))} />
            <div className="flex gap-1.5">
              <Swatch color={bg} label="BG" />
              <Swatch color={{ ...bg, l: Math.min(1, bg.l + 0.04) }} label="Card" />
              <Swatch color={{ ...bg, l: Math.min(1, bg.l + 0.10) }} label="Secondary" />
              <Swatch color={{ ...bg, l: Math.min(1, bg.l + 0.14) }} label="Border" />
            </div>
          </section>

          <div className="border-t border-border" />

          {/* ── Text ───────────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Text</p>
            <Slider label="Text Brightness" value={s.fgL} min={0} max={1} step={0.01}
              onChange={v => update(prev => ({ ...prev, fgL: v }))} />
            <Slider label="Muted Text" value={s.mutedL} min={0} max={1} step={0.01}
              onChange={v => update(prev => ({ ...prev, mutedL: v }))} />
            <div className="flex gap-1.5">
              <Swatch color={{ l: s.fgL, c: 0, h: 0 }} label="Text" />
              <Swatch color={{ l: s.mutedL, c: 0, h: 0 }} label="Muted" />
            </div>
          </section>

          <div className="border-t border-border" />

          {/* ── Destructive ────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Destructive / Error</p>
            <ColorSection label="" color={s.destructive} showSwatch={false}
              onChange={c => update(prev => ({ ...prev, destructive: c }))} />
            <Swatch color={s.destructive} />
          </section>

          <div className="border-t border-border" />

          {/* ── JSON Syntax Colors ──────────────────────────────────────────── */}
          <section className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">JSON Syntax Colors</p>

            <JsonPreview s={s} />

            <ColorSection label="Keys" color={s.jsonKey}
              onChange={c => update(prev => ({ ...prev, jsonKey: c }))} />

            <ColorSection label="Strings" color={s.jsonString}
              onChange={c => update(prev => ({ ...prev, jsonString: c }))} />

            <ColorSection label="Numbers" color={s.jsonNumber}
              onChange={c => update(prev => ({ ...prev, jsonNumber: c }))} />

            <div className="space-y-2">
              <ColorSection label="Booleans" color={s.jsonBoolean} showSwatch={false}
                onChange={c => update(prev => ({ ...prev, jsonBoolean: c }))} />
              <Swatch color={s.jsonBoolean} />
            </div>
          </section>

        </div>
      </div>
    </>
  )
}
