import Database from 'better-sqlite3'
import * as path from 'path'
import { app } from 'electron'

// ── Database setup ────────────────────────────────────────────────────────────

let _db: Database.Database | null = null

function db(): Database.Database {
  if (_db) return _db
  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'postman-lite.db')
  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  migrate(_db)
  return _db
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      owner_email TEXT NOT NULL,
      members TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      folders TEXT NOT NULL DEFAULT '[]',
      workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
      "order" INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'GET',
      url TEXT NOT NULL DEFAULT '',
      params TEXT NOT NULL DEFAULT '[]',
      headers TEXT NOT NULL DEFAULT '[]',
      body TEXT NOT NULL DEFAULT '{}',
      auth TEXT NOT NULL DEFAULT '{}',
      collection_id TEXT REFERENCES collections(id) ON DELETE CASCADE,
      folder_id TEXT,
      "order" INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS socket_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL DEFAULT '',
      protocol TEXT NOT NULL DEFAULT 'ws',
      params TEXT NOT NULL DEFAULT '[]',
      headers TEXT NOT NULL DEFAULT '[]',
      auth TEXT NOT NULL DEFAULT '{}',
      events TEXT NOT NULL DEFAULT '[]',
      message_type TEXT NOT NULL DEFAULT 'text',
      message_event TEXT NOT NULL DEFAULT 'message',
      message_content TEXT NOT NULL DEFAULT '',
      collection_id TEXT REFERENCES collections(id) ON DELETE CASCADE,
      folder_id TEXT,
      "order" INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sequences (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      collection_id TEXT REFERENCES collections(id) ON DELETE CASCADE,
      steps TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS history (
      id TEXT PRIMARY KEY,
      request TEXT NOT NULL,
      response TEXT,
      workspace_id TEXT,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_history_workspace_time ON history(workspace_id, timestamp DESC);

    CREATE TABLE IF NOT EXISTS environments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      variables TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 0,
      workspace_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_states (
      workspace_id TEXT PRIMARY KEY,
      state TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_invites (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      workspace_name TEXT NOT NULL,
      owner_email TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      invitee_email TEXT NOT NULL,
      permission TEXT NOT NULL DEFAULT 'read',
      created_at INTEGER NOT NULL,
      UNIQUE(workspace_id, invitee_email)
    );
  `)
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function dbRegister(id: string, email: string, name: string, password: string) {
  const now = Date.now()
  const stmt = db().prepare('INSERT INTO users (id, email, name, password, created_at) VALUES (?, ?, ?, ?, ?)')
  stmt.run(id, email, name, password, now)
  return { id, email, name }
}

export async function dbLogin(email: string, password: string) {
  const row = db().prepare('SELECT id, email, name, password FROM users WHERE email = ?').get(email) as any
  if (!row) throw new Error('Invalid email or password')
  if (row.password !== password) throw new Error('Invalid email or password')
  return { id: row.id as string, email: row.email as string, name: row.name as string }
}

export async function dbUserExists(id: string): Promise<boolean> {
  const row = db().prepare('SELECT 1 FROM users WHERE id = ?').get(id)
  return !!row
}

// ── Workspaces ────────────────────────────────────────────────────────────────

export async function dbGetWorkspace(id: string) {
  const row = db().prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as any
  return row ? toWorkspace(row) : undefined
}

export async function dbGetWorkspaces(userId: string) {
  // Owner or member (members is a JSON array of objects with userId field)
  const rows = db().prepare(`
    SELECT * FROM workspaces
    WHERE owner_id = ?
       OR members LIKE ?
    ORDER BY created_at ASC
  `).all(userId, `%"userId":"${userId}"%`) as any[]
  return rows.map(toWorkspace)
}

export async function dbCreateWorkspace(ws: any) {
  db().prepare(
    `INSERT INTO workspaces (id, name, owner_id, owner_name, owner_email, members, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(ws.id, ws.name, ws.ownerId, ws.ownerName, ws.ownerEmail, JSON.stringify(ws.members ?? []), ws.createdAt, ws.updatedAt)
}

export async function dbUpdateWorkspace(id: string, data: any) {
  const sets: string[] = []
  const vals: any[] = []
  if (data.name !== undefined)       { sets.push('name = ?');        vals.push(data.name) }
  if (data.members !== undefined)    { sets.push('members = ?');     vals.push(JSON.stringify(data.members)) }
  if (data.ownerName !== undefined)  { sets.push('owner_name = ?');  vals.push(data.ownerName) }
  if (data.ownerEmail !== undefined) { sets.push('owner_email = ?'); vals.push(data.ownerEmail) }
  if (!sets.length) return
  sets.push('updated_at = ?')
  vals.push(Date.now(), id)
  db().prepare(`UPDATE workspaces SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

export async function dbDeleteWorkspace(id: string) {
  db().prepare('DELETE FROM workspaces WHERE id = ?').run(id)
}

// ── Collections ───────────────────────────────────────────────────────────────

export async function dbGetCollections(workspaceId?: string) {
  const rows = (workspaceId
    ? db().prepare('SELECT * FROM collections WHERE workspace_id = ? ORDER BY "order" ASC, created_at ASC').all(workspaceId)
    : db().prepare('SELECT * FROM collections ORDER BY created_at ASC').all()) as any[]
  return rows.map(toCollection)
}

export async function dbGetCollection(id: string) {
  const row = db().prepare('SELECT * FROM collections WHERE id = ?').get(id) as any
  return row ? toCollection(row) : undefined
}

export async function dbCreateCollection(c: any) {
  db().prepare(
    `INSERT INTO collections (id, name, description, folders, workspace_id, "order", created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(c.id, c.name, c.description ?? null, JSON.stringify(c.folders ?? []), c.workspaceId ?? null, c.order ?? null, c.createdAt, c.updatedAt)
}

export async function dbUpdateCollection(id: string, data: any) {
  const sets: string[] = []
  const vals: any[] = []
  if (data.name !== undefined)        { sets.push('name = ?');         vals.push(data.name) }
  if (data.description !== undefined) { sets.push('description = ?');  vals.push(data.description) }
  if (data.folders !== undefined)     { sets.push('folders = ?');      vals.push(JSON.stringify(data.folders)) }
  if (data.workspaceId !== undefined) { sets.push('workspace_id = ?'); vals.push(data.workspaceId) }
  if (data.order !== undefined)       { sets.push('"order" = ?');      vals.push(data.order) }
  if (!sets.length) return
  sets.push('updated_at = ?')
  vals.push(Date.now(), id)
  db().prepare(`UPDATE collections SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

export async function dbDeleteCollection(id: string) {
  db().prepare('DELETE FROM collections WHERE id = ?').run(id)
}

// ── Requests ──────────────────────────────────────────────────────────────────

export async function dbGetRequests(collectionId?: string) {
  const rows = (collectionId
    ? db().prepare('SELECT * FROM requests WHERE collection_id = ? ORDER BY "order" ASC, created_at ASC').all(collectionId)
    : db().prepare('SELECT * FROM requests ORDER BY created_at ASC').all()) as any[]
  return rows.map(toRequest)
}

export async function dbGetRequest(id: string) {
  const row = db().prepare('SELECT * FROM requests WHERE id = ?').get(id) as any
  return row ? toRequest(row) : undefined
}

export async function dbCreateRequest(r: any) {
  db().prepare(
    `INSERT INTO requests (id, name, method, url, params, headers, body, auth, collection_id, folder_id, "order", created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(r.id, r.name, r.method, r.url,
    JSON.stringify(r.params ?? []), JSON.stringify(r.headers ?? []),
    JSON.stringify(r.body ?? {}), JSON.stringify(r.auth ?? {}),
    r.collectionId ?? null, r.folderId ?? null, r.order ?? null, r.createdAt, r.updatedAt)
}

export async function dbUpdateRequest(id: string, data: any) {
  const sets: string[] = []
  const vals: any[] = []
  const scalars: Record<string, string> = { name: 'name', method: 'method', url: 'url', collectionId: 'collection_id', folderId: 'folder_id', order: '"order"' }
  const jsons: Record<string, string> = { params: 'params', headers: 'headers', body: 'body', auth: 'auth' }
  for (const [k, col] of Object.entries(scalars)) {
    if (data[k] !== undefined) { sets.push(`${col} = ?`); vals.push(data[k]) }
  }
  for (const [k, col] of Object.entries(jsons)) {
    if (data[k] !== undefined) { sets.push(`${col} = ?`); vals.push(JSON.stringify(data[k])) }
  }
  if (!sets.length) return
  sets.push('updated_at = ?')
  vals.push(Date.now(), id)
  db().prepare(`UPDATE requests SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

export async function dbDeleteRequest(id: string) {
  db().prepare('DELETE FROM requests WHERE id = ?').run(id)
}

// ── Socket configs ────────────────────────────────────────────────────────────

export async function dbGetSocketConfigs(collectionId?: string) {
  const rows = (collectionId
    ? db().prepare('SELECT * FROM socket_configs WHERE collection_id = ? ORDER BY "order" ASC, created_at ASC').all(collectionId)
    : db().prepare('SELECT * FROM socket_configs ORDER BY created_at ASC').all()) as any[]
  return rows.map(toSocketConfig)
}

export async function dbCreateSocketConfig(c: any) {
  db().prepare(
    `INSERT INTO socket_configs (id, name, url, protocol, params, headers, auth, events, message_type, message_event, message_content, collection_id, folder_id, "order", created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(c.id, c.name, c.url, c.protocol,
    JSON.stringify(c.params ?? []), JSON.stringify(c.headers ?? []),
    JSON.stringify(c.auth ?? {}), JSON.stringify(c.events ?? []),
    c.messageType ?? 'text', c.messageEvent ?? 'message', c.messageContent ?? '',
    c.collectionId ?? null, c.folderId ?? null, c.order ?? null, c.createdAt, c.updatedAt)
}

export async function dbUpdateSocketConfig(id: string, data: any) {
  const sets: string[] = []
  const vals: any[] = []
  const scalars: Record<string, string> = { name: 'name', url: 'url', protocol: 'protocol', messageType: 'message_type', messageEvent: 'message_event', messageContent: 'message_content', collectionId: 'collection_id', folderId: 'folder_id', order: '"order"' }
  const jsons: Record<string, string> = { params: 'params', headers: 'headers', auth: 'auth', events: 'events' }
  for (const [k, col] of Object.entries(scalars)) {
    if (data[k] !== undefined) { sets.push(`${col} = ?`); vals.push(data[k]) }
  }
  for (const [k, col] of Object.entries(jsons)) {
    if (data[k] !== undefined) { sets.push(`${col} = ?`); vals.push(JSON.stringify(data[k])) }
  }
  if (!sets.length) return
  sets.push('updated_at = ?')
  vals.push(Date.now(), id)
  db().prepare(`UPDATE socket_configs SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

export async function dbDeleteSocketConfig(id: string) {
  db().prepare('DELETE FROM socket_configs WHERE id = ?').run(id)
}

// ── Sequences ─────────────────────────────────────────────────────────────────

export async function dbGetSequences(collectionId?: string) {
  const rows = (collectionId
    ? db().prepare('SELECT * FROM sequences WHERE collection_id = ? ORDER BY created_at ASC').all(collectionId)
    : db().prepare('SELECT * FROM sequences ORDER BY created_at ASC').all()) as any[]
  return rows.map(toSequence)
}

export async function dbCreateSequence(s: any) {
  db().prepare(
    'INSERT INTO sequences (id, name, collection_id, steps, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(s.id, s.name, s.collectionId ?? null, JSON.stringify(s.steps ?? []), s.createdAt, s.updatedAt)
}

export async function dbUpdateSequence(id: string, data: any) {
  const sets: string[] = []
  const vals: any[] = []
  if (data.name !== undefined)         { sets.push('name = ?');          vals.push(data.name) }
  if (data.collectionId !== undefined) { sets.push('collection_id = ?'); vals.push(data.collectionId) }
  if (data.steps !== undefined)        { sets.push('steps = ?');         vals.push(JSON.stringify(data.steps)) }
  if (!sets.length) return
  sets.push('updated_at = ?')
  vals.push(Date.now(), id)
  db().prepare(`UPDATE sequences SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

export async function dbDeleteSequence(id: string) {
  db().prepare('DELETE FROM sequences WHERE id = ?').run(id)
}

// ── History ───────────────────────────────────────────────────────────────────

export async function dbGetHistory(workspaceId?: string, limit = 100) {
  const rows = (workspaceId
    ? db().prepare('SELECT * FROM history WHERE workspace_id = ? ORDER BY timestamp DESC LIMIT ?').all(workspaceId, limit)
    : db().prepare('SELECT * FROM history ORDER BY timestamp DESC LIMIT ?').all(limit)) as any[]
  return rows.map(toHistory)
}

export async function dbAddToHistory(entry: any) {
  db().prepare(
    'INSERT OR REPLACE INTO history (id, request, response, workspace_id, timestamp) VALUES (?, ?, ?, ?, ?)'
  ).run(entry.id, JSON.stringify(entry.request), entry.response ? JSON.stringify(entry.response) : null, entry.workspaceId ?? null, entry.timestamp)
  // Keep only 100 most recent per workspace
  if (entry.workspaceId) {
    db().prepare(`
      DELETE FROM history WHERE workspace_id = ? AND id NOT IN (
        SELECT id FROM history WHERE workspace_id = ? ORDER BY timestamp DESC LIMIT 100
      )
    `).run(entry.workspaceId, entry.workspaceId)
  }
}

export async function dbClearHistory(workspaceId?: string) {
  if (workspaceId) {
    db().prepare('DELETE FROM history WHERE workspace_id = ?').run(workspaceId)
  } else {
    db().prepare('DELETE FROM history').run()
  }
}

export async function dbDeleteHistoryEntry(id: string) {
  db().prepare('DELETE FROM history WHERE id = ?').run(id)
}

// ── Environments ──────────────────────────────────────────────────────────────

export async function dbGetEnvironments(workspaceId?: string) {
  const rows = (workspaceId
    ? db().prepare('SELECT * FROM environments WHERE workspace_id = ? ORDER BY name ASC').all(workspaceId)
    : db().prepare('SELECT * FROM environments ORDER BY name ASC').all()) as any[]
  return rows.map(toEnvironment)
}

export async function dbGetEnvironment(id: string) {
  const row = db().prepare('SELECT * FROM environments WHERE id = ?').get(id) as any
  return row ? toEnvironment(row) : undefined
}

export async function dbCreateEnvironment(env: any) {
  db().prepare(
    'INSERT INTO environments (id, name, variables, is_active, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(env.id, env.name, JSON.stringify(env.variables ?? []), env.isActive ? 1 : 0, env.workspaceId ?? null, env.createdAt, env.updatedAt)
}

export async function dbUpdateEnvironment(id: string, data: any) {
  const sets: string[] = []
  const vals: any[] = []
  if (data.name !== undefined)        { sets.push('name = ?');        vals.push(data.name) }
  if (data.variables !== undefined)   { sets.push('variables = ?');   vals.push(JSON.stringify(data.variables)) }
  if (data.isActive !== undefined)    { sets.push('is_active = ?');   vals.push(data.isActive ? 1 : 0) }
  if (data.workspaceId !== undefined) { sets.push('workspace_id = ?'); vals.push(data.workspaceId) }
  if (!sets.length) return
  sets.push('updated_at = ?')
  vals.push(Date.now(), id)
  db().prepare(`UPDATE environments SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

export async function dbDeleteEnvironment(id: string) {
  db().prepare('DELETE FROM environments WHERE id = ?').run(id)
}

export async function dbSetActiveEnvironment(id: string | null, workspaceId?: string) {
  if (workspaceId) {
    db().prepare('UPDATE environments SET is_active = 0 WHERE workspace_id = ?').run(workspaceId)
  } else {
    db().prepare('UPDATE environments SET is_active = 0').run()
  }
  if (id) {
    db().prepare('UPDATE environments SET is_active = 1 WHERE id = ?').run(id)
  }
}

// ── Workspace state ───────────────────────────────────────────────────────────

export async function dbGetWorkspaceState(workspaceId: string) {
  const row = db().prepare('SELECT state FROM workspace_states WHERE workspace_id = ?').get(workspaceId) as any
  if (!row) return undefined
  try { return JSON.parse(row.state) } catch { return undefined }
}

export async function dbSaveWorkspaceState(workspaceId: string, state: any) {
  db().prepare(
    'INSERT INTO workspace_states (workspace_id, state) VALUES (?, ?) ON CONFLICT(workspace_id) DO UPDATE SET state = excluded.state'
  ).run(workspaceId, JSON.stringify(state))
}

// ── Invites ───────────────────────────────────────────────────────────────────

export async function dbGetInvitesForEmail(email: string) {
  const rows = db().prepare(
    'SELECT * FROM workspace_invites WHERE invitee_email = ? ORDER BY created_at DESC'
  ).all(email.toLowerCase()) as any[]
  return rows.map(toInvite)
}

export async function dbGetInvitesForWorkspace(workspaceId: string) {
  const rows = db().prepare(
    'SELECT * FROM workspace_invites WHERE workspace_id = ? ORDER BY created_at DESC'
  ).all(workspaceId) as any[]
  return rows.map(toInvite)
}

export async function dbSendInvite(invite: any) {
  db().prepare(
    `INSERT INTO workspace_invites (id, workspace_id, workspace_name, owner_email, owner_name, invitee_email, permission, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(invite.id, invite.workspaceId, invite.workspaceName, invite.ownerEmail, invite.ownerName, invite.inviteeEmail.toLowerCase(), invite.permission, invite.createdAt)
}

export async function dbDeleteInvite(id: string) {
  db().prepare('DELETE FROM workspace_invites WHERE id = ?').run(id)
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function parse(val: any, fallback: any = null) {
  if (val === null || val === undefined) return fallback
  if (typeof val === 'object') return val
  try { return JSON.parse(val) } catch { return fallback }
}

function toWorkspace(r: any) {
  return {
    id: r.id, name: r.name,
    ownerId: r.owner_id, ownerName: r.owner_name, ownerEmail: r.owner_email,
    members: parse(r.members, []),
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  }
}

function toCollection(r: any) {
  return {
    id: r.id, name: r.name, description: r.description,
    folders: parse(r.folders, []),
    workspaceId: r.workspace_id, order: r.order,
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  }
}

function toRequest(r: any) {
  return {
    id: r.id, name: r.name, method: r.method, url: r.url,
    params: parse(r.params, []),
    headers: parse(r.headers, []),
    body: parse(r.body, { type: 'none', content: '' }),
    auth: parse(r.auth, { type: 'none' }),
    collectionId: r.collection_id, folderId: r.folder_id, order: r.order,
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  }
}

function toSocketConfig(r: any) {
  return {
    id: r.id, name: r.name, url: r.url, protocol: r.protocol,
    params: parse(r.params, []),
    headers: parse(r.headers, []),
    auth: parse(r.auth, { type: 'none' }),
    events: parse(r.events, []),
    messageType: r.message_type, messageEvent: r.message_event, messageContent: r.message_content,
    collectionId: r.collection_id, folderId: r.folder_id, order: r.order,
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  }
}

function toSequence(r: any) {
  return {
    id: r.id, name: r.name, collectionId: r.collection_id,
    steps: parse(r.steps, []),
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  }
}

function toHistory(r: any) {
  return {
    id: r.id,
    request: parse(r.request, {}),
    response: parse(r.response, null),
    workspaceId: r.workspace_id,
    timestamp: Number(r.timestamp),
  }
}

function toEnvironment(r: any) {
  return {
    id: r.id, name: r.name,
    variables: parse(r.variables, []),
    isActive: !!r.is_active,
    workspaceId: r.workspace_id,
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  }
}

function toInvite(r: any) {
  return {
    id: r.id, workspaceId: r.workspace_id, workspaceName: r.workspace_name,
    ownerEmail: r.owner_email, ownerName: r.owner_name,
    inviteeEmail: r.invitee_email, permission: r.permission,
    createdAt: Number(r.created_at),
  }
}
