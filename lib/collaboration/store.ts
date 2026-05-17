import type { WorkspaceInvite, WorkspaceMember, WorkspacePermission, Workspace } from '@/lib/db/types'
import { generateId } from '@/lib/utils'
import { getDatabase } from '@/lib/db'

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'https://quence.kolaj.fun'
}

function getToken(): string {
  try {
    const raw = localStorage.getItem('quence-session')
    if (raw) return JSON.parse(raw).token ?? ''
  } catch {}
  return ''
}

async function api<T>(method: string, path: string, body?: object): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error ?? `API error ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function sendInvite(
  params: {
    workspaceId: string
    workspaceName: string
    ownerEmail: string
    ownerName: string
    inviteeEmail: string
    permission: WorkspacePermission
  },
  workspace?: Workspace
): Promise<WorkspaceInvite> {
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

  // If this is the first invite, push all local workspace data to the server first
  if (workspace && (workspace.members?.length ?? 0) === 0) {
    const db = await getDatabase()
    if ('syncWorkspaceToRemote' in db) {
      await (db as any).syncWorkspaceToRemote(params.workspaceId)
    }
  }

  await api('POST', `/workspaces/${params.workspaceId}/invites`, invite)
  return invite
}

export async function getInvitesForEmail(email: string): Promise<WorkspaceInvite[]> {
  return api('GET', `/workspaces/invites/me`)
}

export async function getInvitesForWorkspace(workspaceId: string): Promise<WorkspaceInvite[]> {
  return api('GET', `/workspaces/${workspaceId}/invites`)
}

export async function acceptInvite(inviteId: string, allInvites: WorkspaceInvite[]): Promise<WorkspaceInvite> {
  const invite = allInvites.find(i => i.id === inviteId)
  if (!invite) throw new Error('Invite not found')
  await api('POST', `/workspaces/invites/${inviteId}/accept`)
  return invite
}

export async function declineInvite(inviteId: string): Promise<void> {
  await api('DELETE', `/workspaces/invites/${inviteId}`)
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await api('DELETE', `/workspaces/invites/${inviteId}`)
}

export async function leaveWorkspace(workspaceId: string): Promise<void> {
  await api('DELETE', `/workspaces/${workspaceId}/members/me`)
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
