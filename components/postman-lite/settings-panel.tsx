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
  // Global
  accent:      OklchColor
  bgL:         number
  bgC:         number
  bgH:         number
  fgL:         number
  mutedL:      number
  destructive: OklchColor
  // API view
  jsonKey:     OklchColor
  jsonString:  OklchColor
  jsonNumber:  OklchColor
  jsonBoolean: OklchColor
  // DB view
  dbKeyword:   OklchColor
  dbString:    OklchColor
  dbNumber:    OklchColor
  dbType:      OklchColor
  dbComment:   OklchColor
  dbOperator:  OklchColor
  // Terminal view
  termBg:      string  // hex
  termFg:      string
  termCursor:  string
  termRed:     string
  termGreen:   string
  termYellow:  string
  termBlue:    string
  termMagenta: string
  termCyan:    string
}

export const DEFAULTS: Settings = {
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
  dbKeyword:   { l: 0.90, c: 0.11, h: 98  },
  dbString:    { l: 0.76, c: 0.15, h: 160 },
  dbNumber:    { l: 0.90, c: 0.13, h: 246 },
  dbType:      { l: 0.90, c: 0.10, h: 100 },
  dbComment:   { l: 0.55, c: 0.01, h: 282 },
  dbOperator:  { l: 0.75, c: 0.08, h: 282 },
  termBg:      '#0f0f0f',
  termFg:      '#e4e4e7',
  termCursor:  '#a1a1aa',
  termRed:     '#f87171',
  termGreen:   '#4ade80',
  termYellow:  '#facc15',
  termBlue:    '#60a5fa',
  termMagenta: '#c084fc',
  termCyan:    '#22d3ee',
}

const STORAGE_KEY = 'quence-theme'

function clampL(l: number) { return Math.min(0.90, Math.max(0.35, l)) }
function clampColor(c: OklchColor) { return { ...c, l: clampL(c.l) } }

function clampSettings(s: Settings): Settings {
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
    fgL, mutedL,
    accent:      clampColor(s.accent),
    destructive: clampColor(s.destructive),
    jsonKey:     clampColor(s.jsonKey),
    jsonString:  clampColor(s.jsonString),
    jsonNumber:  clampColor(s.jsonNumber),
    jsonBoolean: clampColor(s.jsonBoolean),
    dbKeyword:   clampColor(s.dbKeyword),
    dbString:    clampColor(s.dbString),
    dbNumber:    clampColor(s.dbNumber),
    dbType:      clampColor(s.dbType),
    dbComment:   clampColor(s.dbComment),
    dbOperator:  clampColor(s.dbOperator),
  }
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return clampSettings({ ...DEFAULTS, ...JSON.parse(raw) })
  } catch {}
  return DEFAULTS
}

export function applySettings(s: Settings) {
  const el = document.documentElement
  const set = (v: string, color: OklchColor) => el.style.setProperty(v, fmt(color))
  const setRaw = (v: string, val: string) => el.style.setProperty(v, val)

  const bg: OklchColor = { l: s.bgL, c: s.bgC, h: s.bgH }
  const fg: OklchColor = { l: s.fgL, c: 0, h: 0 }

  set('--primary', s.accent)
  set('--accent', s.accent)
  set('--ring', s.accent)
  set('--sidebar-primary', s.accent)
  set('--sidebar-ring', s.accent)
  set('--chart-1', s.accent)
  set('--primary-foreground', bg)
  set('--accent-foreground', bg)
  set('--sidebar-primary-foreground', bg)

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

  set('--foreground', fg)
  set('--card-foreground', fg)
  set('--popover-foreground', fg)
  set('--sidebar-foreground', fg)
  set('--destructive-foreground', fg)
  set('--secondary-foreground', { ...fg, l: Math.max(0, fg.l - 0.10) })
  set('--sidebar-accent-foreground', fg)
  set('--muted-foreground', { l: s.mutedL, c: 0, h: 0 })

  set('--destructive', s.destructive)

  // API JSON syntax
  setRaw('--json-key',     fmt(s.jsonKey))
  setRaw('--json-string',  fmt(s.jsonString))
  setRaw('--json-number',  fmt(s.jsonNumber))
  setRaw('--json-boolean', fmt(s.jsonBoolean))

  // DB SQL syntax
  setRaw('--db-keyword',  fmt(s.dbKeyword))
  setRaw('--db-string',   fmt(s.dbString))
  setRaw('--db-number',   fmt(s.dbNumber))
  setRaw('--db-type',     fmt(s.dbType))
  setRaw('--db-comment',  fmt(s.dbComment))
  setRaw('--db-operator', fmt(s.dbOperator))

  // Terminal colors
  setRaw('--term-bg',      s.termBg)
  setRaw('--term-fg',      s.termFg)
  setRaw('--term-cursor',  s.termCursor)
  setRaw('--term-red',     s.termRed)
  setRaw('--term-green',   s.termGreen)
  setRaw('--term-yellow',  s.termYellow)
  setRaw('--term-blue',    s.termBlue)
  setRaw('--term-magenta', s.termMagenta)
  setRaw('--term-cyan',    s.termCyan)
}

// ── Sub-components ─────────────────────────────────────────────────────────────

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

function Swatch({ color, label }: { color: OklchColor | string; label?: string }) {
  const bg = typeof color === 'string' ? color : fmt(color)
  return (
    <div className="flex flex-col items-center gap-1" style={{ flex: 1 }}>
      <div className="h-5 rounded-sm w-full" style={{ background: bg }} />
      {label && <span className="text-[10px] text-muted-foreground">{label}</span>}
    </div>
  )
}

function ColorSection({ label, color, onChange, showSwatch = true }: {
  label: string; color: OklchColor; onChange: (c: OklchColor) => void; showSwatch?: boolean
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

function HexColorRow({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground flex-1">{label}</span>
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 rounded-sm border border-border shrink-0" style={{ background: value }} />
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="h-6 w-12 rounded cursor-pointer border-0 bg-transparent p-0"
        />
      </div>
    </div>
  )
}

function JsonPreview({ s }: { s: Settings }) {
  const k = fmt(s.jsonKey), str = fmt(s.jsonString), num = fmt(s.jsonNumber), bool = fmt(s.jsonBoolean)
  const muted = `oklch(${s.mutedL.toFixed(3)} 0 0)`
  return (
    <pre className="font-mono text-[11px] leading-relaxed rounded-md border border-border bg-background p-3 overflow-x-auto">
      <span style={{ color: muted }}>{'{'}</span>{'\n'}
      <span>{'  '}<span style={{ color: k }}>"name"</span><span style={{ color: muted }}>: </span><span style={{ color: str }}>"value"</span><span style={{ color: muted }}>,</span></span>{'\n'}
      <span>{'  '}<span style={{ color: k }}>"count"</span><span style={{ color: muted }}>: </span><span style={{ color: num }}>42</span><span style={{ color: muted }}>,</span></span>{'\n'}
      <span>{'  '}<span style={{ color: k }}>"active"</span><span style={{ color: muted }}>: </span><span style={{ color: bool }}>true</span><span style={{ color: muted }}>,</span></span>{'\n'}
      <span>{'  '}<span style={{ color: k }}>"tag"</span><span style={{ color: muted }}>: </span><span style={{ color: muted }}>null</span></span>{'\n'}
      <span style={{ color: muted }}>{'}'}</span>
    </pre>
  )
}

function SqlPreview({ s }: { s: Settings }) {
  const kw  = fmt(s.dbKeyword), str = fmt(s.dbString), num = fmt(s.dbNumber)
  const typ = fmt(s.dbType),    op  = fmt(s.dbOperator), cm = fmt(s.dbComment)
  const fg  = `oklch(${(s.fgL).toFixed(3)} 0 0)`
  return (
    <pre className="font-mono text-[11px] leading-relaxed rounded-md border border-border p-3 overflow-x-auto" style={{ background: 'oklch(0.16 0.01 282)', color: fg }}>
      <span style={{ color: cm }}>{'-- fetch recent orders'}</span>{'\n'}
      <span><span style={{ color: kw }}>SELECT</span>{' '}<span style={{ color: typ }}>o</span><span style={{ color: op }}>.</span>id<span style={{ color: op }}>,</span></span>{'\n'}
      <span>{'       '}<span style={{ color: typ }}>o</span><span style={{ color: op }}>.</span>total<span style={{ color: op }}>,</span></span>{'\n'}
      <span>{'       '}<span style={{ color: str }}>'active'</span>{' '}<span style={{ color: kw }}>AS</span>{' '}status</span>{'\n'}
      <span><span style={{ color: kw }}>FROM</span>{' '}<span style={{ color: typ }}>orders</span>{' '}<span style={{ color: typ }}>o</span></span>{'\n'}
      <span><span style={{ color: kw }}>WHERE</span>{' '}o<span style={{ color: op }}>.</span>id <span style={{ color: op }}>&gt;</span>{' '}<span style={{ color: num }}>1000</span></span>{'\n'}
      <span><span style={{ color: kw }}>LIMIT</span>{' '}<span style={{ color: num }}>50</span><span style={{ color: op }}>;</span></span>
    </pre>
  )
}

function TermPreview({ s }: { s: Settings }) {
  return (
    <pre className="font-mono text-[11px] leading-relaxed rounded-md border border-border p-3 overflow-x-auto" style={{ background: s.termBg, color: s.termFg }}>
      <span style={{ color: s.termGreen }}>user@host</span><span style={{ color: s.termFg }}>:</span><span style={{ color: s.termBlue }}>~/projects</span><span style={{ color: s.termFg }}>$ </span><span>npm run dev</span>{'\n'}
      <span style={{ color: s.termCyan }}>&gt; quence@0.2.6 dev</span>{'\n'}
      <span style={{ color: s.termYellow }}>warn</span><span style={{ color: s.termFg }}> - ready on http://localhost:3000</span>{'\n'}
      <span style={{ color: s.termRed }}>error</span><span style={{ color: s.termFg }}> - build failed</span>{'\n'}
      <span style={{ color: s.termMagenta }}>info</span><span style={{ color: s.termFg }}> - compiling...</span>{'\n'}
      <span style={{ color: s.termCursor }}>█</span>
    </pre>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────────

type ViewTab = 'api' | 'db' | 'terminal'

interface Props { open: boolean; onClose: () => void }

export function SettingsPanel({ open, onClose }: Props) {
  const [s, setS] = useState<Settings>(DEFAULTS)
  const [viewTab, setViewTab] = useState<ViewTab>('api')

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

          {/* ── Accent ──────────────────────────────────────────────────────── */}
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

          {/* ── Background ──────────────────────────────────────────────────── */}
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

          {/* ── Text ────────────────────────────────────────────────────────── */}
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

          {/* ── Destructive ─────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Destructive / Error</p>
            <ColorSection label="" color={s.destructive} showSwatch={false}
              onChange={c => update(prev => ({ ...prev, destructive: c }))} />
            <Swatch color={s.destructive} />
          </section>

          <div className="border-t border-border" />

          {/* ── View-specific ────────────────────────────────────────────────── */}
          <section className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">View Colors</p>

            {/* Tab switcher */}
            <div className="flex rounded-md border border-border overflow-hidden text-xs">
              {(['api', 'db', 'terminal'] as ViewTab[]).map(tab => (
                <button key={tab}
                  onClick={() => setViewTab(tab)}
                  className={`flex-1 py-1.5 transition-colors capitalize ${
                    viewTab === tab
                      ? 'bg-primary/20 text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/10'
                  }`}
                >
                  {tab === 'api' ? 'API' : tab === 'db' ? 'Database' : 'Terminal'}
                </button>
              ))}
            </div>

            {viewTab === 'api' && (
              <div className="space-y-4">
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
              </div>
            )}

            {viewTab === 'db' && (
              <div className="space-y-4">
                <SqlPreview s={s} />
                <ColorSection label="Keywords" color={s.dbKeyword}
                  onChange={c => update(prev => ({ ...prev, dbKeyword: c }))} />
                <ColorSection label="Strings" color={s.dbString}
                  onChange={c => update(prev => ({ ...prev, dbString: c }))} />
                <ColorSection label="Numbers" color={s.dbNumber}
                  onChange={c => update(prev => ({ ...prev, dbNumber: c }))} />
                <ColorSection label="Types / Tables" color={s.dbType}
                  onChange={c => update(prev => ({ ...prev, dbType: c }))} />
                <ColorSection label="Operators" color={s.dbOperator}
                  onChange={c => update(prev => ({ ...prev, dbOperator: c }))} />
                <div className="space-y-2">
                  <ColorSection label="Comments" color={s.dbComment} showSwatch={false}
                    onChange={c => update(prev => ({ ...prev, dbComment: c }))} />
                  <Swatch color={s.dbComment} />
                </div>
              </div>
            )}

            {viewTab === 'terminal' && (
              <div className="space-y-3">
                <TermPreview s={s} />
                <HexColorRow label="Background" value={s.termBg}
                  onChange={v => update(prev => ({ ...prev, termBg: v }))} />
                <HexColorRow label="Foreground" value={s.termFg}
                  onChange={v => update(prev => ({ ...prev, termFg: v }))} />
                <HexColorRow label="Cursor" value={s.termCursor}
                  onChange={v => update(prev => ({ ...prev, termCursor: v }))} />
                <div className="border-t border-border pt-3 space-y-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">ANSI Colors</p>
                  <HexColorRow label="Red" value={s.termRed}
                    onChange={v => update(prev => ({ ...prev, termRed: v }))} />
                  <HexColorRow label="Green" value={s.termGreen}
                    onChange={v => update(prev => ({ ...prev, termGreen: v }))} />
                  <HexColorRow label="Yellow" value={s.termYellow}
                    onChange={v => update(prev => ({ ...prev, termYellow: v }))} />
                  <HexColorRow label="Blue" value={s.termBlue}
                    onChange={v => update(prev => ({ ...prev, termBlue: v }))} />
                  <HexColorRow label="Magenta" value={s.termMagenta}
                    onChange={v => update(prev => ({ ...prev, termMagenta: v }))} />
                  <HexColorRow label="Cyan" value={s.termCyan}
                    onChange={v => update(prev => ({ ...prev, termCyan: v }))} />
                </div>
              </div>
            )}

          </section>

        </div>
      </div>
    </>
  )
}
