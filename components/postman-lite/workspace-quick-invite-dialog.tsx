'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Workspace, WorkspacePermission } from '@/lib/db/types'
import { useWorkspaceMembers } from '@/hooks/use-collaboration'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspace: Workspace
  onUpdateWorkspace: (id: string, data: Partial<Workspace>) => Promise<void>
}

export function WorkspaceQuickInviteDialog({ open, onOpenChange, workspace, onUpdateWorkspace }: Props) {
  const { invite } = useWorkspaceMembers(workspace)
  const [email, setEmail] = useState('')
  const [permission, setPermission] = useState<WorkspacePermission>('read')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setEmail('')
      setPermission('read')
      setError('')
      setSent(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const trimmed = email.trim()
    if (!trimmed) return
    setLoading(true)
    try {
      await invite(trimmed, permission)
      setSent(true)
      setTimeout(() => onOpenChange(false), 800)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite to {workspace.name}</DialogTitle>
        </DialogHeader>

        {sent ? (
          <p className="text-sm text-muted-foreground py-2">Invite sent to {email}.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                ref={inputRef}
                id="invite-email"
                type="email"
                placeholder="colleague@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-permission">Permission</Label>
              <Select value={permission} onValueChange={v => setPermission(v as WorkspacePermission)}>
                <SelectTrigger id="invite-permission">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">Read only</SelectItem>
                  <SelectItem value="read-write">Read &amp; write</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading || !email.trim()}>
                {loading && <Loader2 className="animate-spin" />}
                Send invite
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
