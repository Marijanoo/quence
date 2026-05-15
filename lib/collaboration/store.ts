import type { WorkspaceInvite, WorkspaceMember, WorkspacePermission } from '@/lib/db/types'
import { generateId } from '@/lib/utils'

function db() {
  return window.electronAPI!.db.invites
}

export async function sendInvite(params: {
  workspaceId: string
  workspaceName: string
  ownerEmail: string
  ownerName: string
  inviteeEmail: string
  permission: WorkspacePermission
}): Promise<WorkspaceInvite> {
  const invite: WorkspaceInvite = {
    id: generateId(),
    workspaceId: params.workspaceId,
    workspaceName: params.workspaceName,
    ownerEmail: params.ownerEmail,
    ownerName: params.ownerName,
    inviteeEmail: params.inviteeEmail.toLowerCase(),
    permission: params.permission,
    createdAt: Date.now(),
  }
  await db().send(invite)
  return invite
}

export async function getInvitesForEmail(email: string): Promise<WorkspaceInvite[]> {
  return db().forEmail(email)
}

export async function getInvitesForWorkspace(workspaceId: string): Promise<WorkspaceInvite[]> {
  return db().forWorkspace(workspaceId)
}

export async function acceptInvite(inviteId: string, allInvites: WorkspaceInvite[]): Promise<WorkspaceInvite> {
  const invite = allInvites.find(i => i.id === inviteId)
  if (!invite) throw new Error('Invite not found')
  await db().delete(inviteId)
  return invite
}

export async function declineInvite(inviteId: string): Promise<void> {
  await db().delete(inviteId)
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await db().delete(inviteId)
}

export function buildMemberFromInvite(invite: WorkspaceInvite, userId: string, name: string): WorkspaceMember {
  return {
    userId,
    email: invite.inviteeEmail,
    name,
    permission: invite.permission,
    joinedAt: Date.now(),
  }
}
