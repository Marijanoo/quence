'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface HelpPanelProps {
  open: boolean
  onClose: () => void
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center px-1.5 py-0.5 rounded border border-border bg-secondary text-xs font-mono text-foreground">
      {children}
    </kbd>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">{title}</h3>
      {children}
    </div>
  )
}

function Row({ keys, description }: { keys: React.ReactNode; description: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{description}</span>
      <div className="flex items-center gap-1 shrink-0 ml-4">{keys}</div>
    </div>
  )
}

export function HelpPanel({ open, onClose }: HelpPanelProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg shadow-xl w-full max-w-[640px] flex flex-col overflow-hidden"
        style={{ maxHeight: '80vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-semibold text-foreground">Help & Reference</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Keyboard shortcuts, features, and how things work</p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="overflow-y-auto flex-1">
          <div className="px-5 py-4">

          <Section title="Keyboard Shortcuts">
            <Row keys={<><Kbd>Ctrl</Kbd><span className="text-muted-foreground text-xs">+</span><Kbd>T</Kbd></>} description="New request tab" />
            <Row keys={<><Kbd>Ctrl</Kbd><span className="text-muted-foreground text-xs">+</span><Kbd>W</Kbd></>} description="Close current tab" />
            <Row keys={<><Kbd>Ctrl</Kbd><span className="text-muted-foreground text-xs">+</span><Kbd>S</Kbd></>} description="Save current request or socket" />
            <Row keys={<><Kbd>Ctrl</Kbd><span className="text-muted-foreground text-xs">+</span><Kbd>Enter</Kbd></>} description="Send request" />
            <Row keys={<><Kbd>Ctrl</Kbd><span className="text-muted-foreground text-xs">+</span><Kbd>Tab</Kbd></>} description="Next tab" />
            <Row keys={<><Kbd>Ctrl</Kbd><span className="text-muted-foreground text-xs">+</span><Kbd>Shift</Kbd><span className="text-muted-foreground text-xs">+</span><Kbd>Tab</Kbd></>} description="Previous tab" />
            <Row keys={<span className="text-muted-foreground text-xs">Middle click tab</span>} description="Close tab" />
          </Section>

          <Section title="Requests">
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              Build and send HTTP requests. Choose a method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS), enter a URL, and hit <strong className="text-foreground">Send</strong> or <Kbd>Ctrl+Enter</Kbd>.
            </p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li><span className="text-foreground font-medium">Params</span> — query string key/value pairs, appended to the URL automatically.</li>
              <li><span className="text-foreground font-medium">Headers</span> — custom HTTP headers sent with the request.</li>
              <li><span className="text-foreground font-medium">Body</span> — JSON, raw text, form-data, or URL-encoded data.</li>
              <li><span className="text-foreground font-medium">Auth</span> — Bearer token, Basic, or API key (header or query).</li>
            </ul>
          </Section>

          <Section title="Collections & Saving">
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              Requests and socket connections can be saved into collections for reuse. Press <Kbd>Ctrl+S</Kbd> or click <strong className="text-foreground">Save</strong> to save the current tab.
            </p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>Unsaved tabs show a <span className="text-primary">●</span> dot — they are remembered across refreshes.</li>
              <li>Right-click (or use the <strong className="text-foreground">···</strong> menu) to rename or delete saved items.</li>
              <li>Drag requests within a collection to reorder them.</li>
              <li>Import Postman v2.1 collections via the collection menu.</li>
            </ul>
          </Section>

          <Section title="Environments & Variables">
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              Environments let you store key/value variables and switch between them (e.g. dev vs. production). Reference them anywhere using <Kbd>{'{{variableName}}'}</Kbd> syntax.
            </p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>Select the active environment from the dropdown in the top-right.</li>
              <li>Manage environments in the <strong className="text-foreground">⚙ Environments</strong> sidebar tab.</li>
              <li>Variables resolve in URLs, headers, body, auth, and socket params.</li>
            </ul>
          </Section>

          <Section title="WebSocket & Socket.IO">
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              Open a socket tab via the <Kbd>⌁▾</Kbd> button in the tab bar. Supports raw WebSocket (<strong className="text-foreground">WS</strong>) and Socket.IO (<strong className="text-foreground">SIO</strong>).
            </p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>Enter the server URL and click <strong className="text-foreground">Connect</strong>.</li>
              <li>Send text, JSON, or binary messages. For Socket.IO, set an event name.</li>
              <li><strong className="text-foreground">Events</strong> tab — subscribe to specific Socket.IO events to filter incoming messages.</li>
              <li>Socket tabs are saved and restored across refreshes, just like request tabs.</li>
            </ul>
          </Section>

          <Section title="Sequences">
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              Chain requests together and run them in order. Switch to <strong className="text-foreground">Sequences</strong> in the bottom bar.
            </p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>Add request steps by dragging from the collections panel.</li>
              <li><strong className="text-foreground">Extract JSON</strong> action steps pull a value from a response and write it into an environment variable.</li>
              <li>Nest sequences inside sequences for reusable sub-flows.</li>
              <li>Each step shows its status code and duration after a run.</li>
            </ul>
          </Section>

          <Section title="Tools">
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li><span className="text-foreground font-medium">JWT</span> — decode or encode JSON Web Tokens. Supports HS256 signing with a secret.</li>
              <li><span className="text-foreground font-medium">JSON</span> — format and validate raw JSON, with syntax highlighting and line numbers.</li>
              <li><span className="text-foreground font-medium">Diff</span> — compare two text blocks side-by-side.</li>
            </ul>
          </Section>

          <Section title="Workspaces">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Workspaces keep collections, requests, environments, and history separate. Switch between them from the workspace dropdown in the top-left. Owners can invite members with read or read-write access.
            </p>
          </Section>

          </div>
        </div>
      </div>
    </div>
  )
}
