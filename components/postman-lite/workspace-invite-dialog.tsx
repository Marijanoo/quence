'use client'

import { useState } from 'react'
import { Loader2, UserPlus, Trash2, Eye, Shield } from 'lucide-react'
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

export function WorkspaceInviteDialog({ open, onOpenChange, workspace, onUpdateWorkspace }: Props) {
  const { members, pendingInvites, isOwner, invite, revoke, updateMemberPermission, removeMember } =
    useWorkspaceMembers(workspace)

  const [email, setEmail] = useState('')
  const [permission, setPermission] = useState<WorkspacePermission>('read')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const trimmed = email.trim()
    if (!trimmed) return
    setLoading(true)
    try {
      await invite(trimmed, permission)
      setEmail('')
      setPermission('read')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage access — {workspace.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Invite form (owner only) */}
          {isOwner && (
            <form onSubmit={handleInvite} className="space-y-3">
              <Label>Invite by email</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="colleague@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={loading}
                  className="flex-1"
                />
                <Select value={permission} onValueChange={v => setPermission(v as WorkspacePermission)}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">
                      <span className="flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" />Read only</span>
                    </SelectItem>
                    <SelectItem value="read-write">
                      <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" />Read & write</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button type="submit" size="icon" disabled={loading || !email.trim()}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                </Button>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </form>
          )}

          {/* Members */}
          {members.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Members</Label>
              <div className="space-y-1">
                {members.map(member => (
                  <div key={member.userId} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/10">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{member.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    </div>
                    {isOwner ? (
                      <>
                        <Select
                          value={member.permission}
                          onValueChange={v =>
                            updateMemberPermission(member.userId, v as WorkspacePermission, onUpdateWorkspace)
                          }
                        >
                          <SelectTrigger className="w-32 h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="read">Read only</SelectItem>
                            <SelectItem value="read-write">Read & write</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => removeMember(member.userId, onUpdateWorkspace)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {member.permission === 'read' ? 'Read only' : 'Read & write'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending invites */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Pending invites</Label>
            {pendingInvites.length === 0 ? (
              <p className="text-sm text-muted-foreground px-2">No pending invites</p>
            ) : (
              <div className="space-y-1">
                {pendingInvites.map(invite => (
                  <div key={invite.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/10">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{invite.inviteeEmail}</p>
                      <p className="text-xs text-muted-foreground">
                        {invite.permission === 'read' ? 'Read only' : 'Read & write'}
                      </p>
                    </div>
                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => revoke(invite.id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {members.length === 0 && pendingInvites.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No members yet. Invite someone above.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
