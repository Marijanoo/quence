'use client'

import { Mail, Check, X, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { WorkspaceInvite, Workspace, WorkspaceMember } from '@/lib/db/types'
import { useMyInvites, buildMemberFromInvite } from '@/hooks/use-collaboration'
import { useAuth } from '@/lib/auth/auth-context'

interface Props {
  onAccepted: (workspace: Workspace) => void
  updateWorkspace: (id: string, data: Partial<Workspace>) => Promise<void>
  getWorkspace: (id: string) => Workspace | undefined
}

export function InvitesPanel({ onAccepted, updateWorkspace, getWorkspace }: Props) {
  const { state } = useAuth()
  const { invites, accept, decline } = useMyInvites()

  async function handleAccept(invite: WorkspaceInvite) {
    if (state.status !== 'authenticated') return
    const { user } = state.session

    await accept(invite.id, async (accepted) => {
      const workspace = getWorkspace(accepted.workspaceId)
      if (!workspace) return
      const newMember: WorkspaceMember = buildMemberFromInvite(accepted, user.id, user.name)
      const updatedMembers = [...workspace.members.filter(m => m.userId !== user.id), newMember]
      await updateWorkspace(workspace.id, { members: updatedMembers })
      onAccepted({ ...workspace, members: updatedMembers })
    })
  }

  if (invites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground py-16">
        <Inbox className="h-10 w-10 opacity-30" />
        <p className="text-sm">No pending invites</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      {invites.map(invite => (
        <div
          key={invite.id}
          className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card"
        >
          <div className="mt-0.5 p-1.5 rounded-md bg-primary/10 text-primary shrink-0">
            <Mail className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="text-sm font-medium truncate">{invite.workspaceName}</p>
            <p className="text-xs text-muted-foreground">
              Invited by <span className="text-foreground">{invite.ownerName}</span> ({invite.ownerEmail})
            </p>
            <p className="text-xs text-muted-foreground">
              Permission:{' '}
              <span className="text-foreground">
                {invite.permission === 'read' ? 'Read only' : 'Read & write'}
              </span>
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              title="Decline"
              onClick={() => decline(invite.id)}
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              size="icon-sm"
              className="bg-primary/10 text-primary hover:bg-primary/20"
              title="Accept"
              onClick={() => handleAccept(invite)}
            >
              <Check className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
