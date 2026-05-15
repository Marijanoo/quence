'use client'

import { useState, useCallback, useEffect } from 'react'
import type { WorkspaceInvite, WorkspaceMember, WorkspacePermission, Workspace } from '@/lib/db/types'
import {
  sendInvite,
  getInvitesForEmail,
  getInvitesForWorkspace,
  acceptInvite,
  declineInvite,
  revokeInvite,
  buildMemberFromInvite,
} from '@/lib/collaboration/store'
import { useAuth } from '@/lib/auth/auth-context'

export function useMyInvites() {
  const { state } = useAuth()
  const [invites, setInvites] = useState<WorkspaceInvite[]>([])

  const refresh = useCallback(async () => {
    if (state.status !== 'authenticated') return
    const data = await getInvitesForEmail(state.session.user.email)
    setInvites(data)
  }, [state])

  useEffect(() => { refresh() }, [refresh])

  const accept = useCallback(
    async (inviteId: string, onAccepted: (invite: WorkspaceInvite) => Promise<void>) => {
      const invite = await acceptInvite(inviteId, invites)
      await onAccepted(invite)
      await refresh()
    },
    [invites, refresh]
  )

  const decline = useCallback(
    async (inviteId: string) => {
      await declineInvite(inviteId)
      await refresh()
    },
    [refresh]
  )

  return { invites, refresh, accept, decline }
}

export function useWorkspaceMembers(workspace: Workspace | null) {
  const { state } = useAuth()
  const [pendingInvites, setPendingInvites] = useState<WorkspaceInvite[]>([])

  const refresh = useCallback(async () => {
    if (!workspace) return
    const data = await getInvitesForWorkspace(workspace.id)
    setPendingInvites(data)
  }, [workspace])

  useEffect(() => { refresh() }, [refresh])

  const invite = useCallback(
    async (inviteeEmail: string, permission: WorkspacePermission) => {
      if (!workspace || state.status !== 'authenticated') return
      const { user } = state.session
      await sendInvite({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        ownerEmail: user.email,
        ownerName: user.name,
        inviteeEmail,
        permission,
      })
      await refresh()
    },
    [workspace, state, refresh]
  )

  const revoke = useCallback(
    async (inviteId: string) => {
      await revokeInvite(inviteId)
      await refresh()
    },
    [refresh]
  )

  const updateMemberPermission = useCallback(
    async (
      memberId: string,
      permission: WorkspacePermission,
      updateWorkspace: (id: string, data: Partial<Workspace>) => Promise<void>
    ) => {
      if (!workspace) return
      const updated = workspace.members.map(m =>
        m.userId === memberId ? { ...m, permission } : m
      )
      await updateWorkspace(workspace.id, { members: updated })
    },
    [workspace]
  )

  const removeMember = useCallback(
    async (
      memberId: string,
      updateWorkspace: (id: string, data: Partial<Workspace>) => Promise<void>
    ) => {
      if (!workspace) return
      const updated = workspace.members.filter(m => m.userId !== memberId)
      await updateWorkspace(workspace.id, { members: updated })
    },
    [workspace]
  )

  const isOwner = state.status === 'authenticated' && workspace?.ownerId === state.session.user.id

  return {
    members: workspace?.members ?? [],
    pendingInvites,
    isOwner,
    invite,
    revoke,
    updateMemberPermission,
    removeMember,
    refresh,
  }
}

export { buildMemberFromInvite }
