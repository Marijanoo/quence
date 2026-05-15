import { Pool } from 'pg'
import * as path from 'path'
import * as fs from 'fs'

function loadEnv() {
  // Load .env from project root (two levels up from dist-electron/)
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

export const pool = new Pool({
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DB ?? 'postlite',
  user: process.env.POSTGRES_USER ?? 'postgres',
  password: process.env.POSTGRES_PASSWORD,
})

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function dbRegister(id: string, email: string, name: string, password: string) {
  const now = Date.now()
  const { rows } = await pool.query(
    'INSERT INTO users (id, email, name, password, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name',
    [id, email, name, password, now]
  )
  return rows[0]
}

export async function dbLogin(email: string, password: string) {
  const { rows } = await pool.query(
    'SELECT id, email, name, password FROM users WHERE email = $1',
    [email]
  )
  if (!rows[0]) throw new Error('Invalid email or password')
  if (rows[0].password !== password) throw new Error('Invalid email or password')
  return { id: rows[0].id as string, email: rows[0].email as string, name: rows[0].name as string }
}

export async function dbUserExists(id: string): Promise<boolean> {
  const { rows } = await pool.query('SELECT 1 FROM users WHERE id=$1', [id])
  return rows.length > 0
}

// ── Workspaces ───────────────────────────────────────────────────────────────

export async function dbGetWorkspace(id: string) {
  const { rows } = await pool.query('SELECT * FROM workspaces WHERE id=$1', [id])
  return rows[0] ? toWorkspace(rows[0]) : undefined
}

export async function dbGetWorkspaces(userId: string) {
  const { rows } = await pool.query(
    `SELECT * FROM workspaces
     WHERE owner_id = $1
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(members) m
          WHERE m->>'userId' = $1
        )
     ORDER BY created_at ASC`,
    [userId]
  )
  return rows.map(toWorkspace)
}

export async function dbCreateWorkspace(ws: any) {
  await pool.query(
    `INSERT INTO workspaces (id, name, owner_id, owner_name, owner_email, members, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [ws.id, ws.name, ws.ownerId, ws.ownerName, ws.ownerEmail, JSON.stringify(ws.members ?? []), ws.createdAt, ws.updatedAt]
  )
}

export async function dbUpdateWorkspace(id: string, data: any) {
  const fields: string[] = []
  const values: any[] = []
  let i = 1
  if (data.name !== undefined)       { fields.push(`name=$${i++}`);        values.push(data.name) }
  if (data.members !== undefined)    { fields.push(`members=$${i++}`);     values.push(JSON.stringify(data.members)) }
  if (data.ownerName !== undefined)  { fields.push(`owner_name=$${i++}`);  values.push(data.ownerName) }
  if (data.ownerEmail !== undefined) { fields.push(`owner_email=$${i++}`); values.push(data.ownerEmail) }
  if (!fields.length) return
  fields.push(`updated_at=$${i++}`)
  values.push(Date.now())
  values.push(id)
  await pool.query(`UPDATE workspaces SET ${fields.join(',')} WHERE id=$${i}`, values)
}

export async function dbDeleteWorkspace(id: string) {
  await pool.query('DELETE FROM workspaces WHERE id=$1', [id])
}

// ── Collections ──────────────────────────────────────────────────────────────

export async function dbGetCollections(workspaceId?: string) {
  const { rows } = workspaceId
    ? await pool.query('SELECT * FROM collections WHERE workspace_id=$1 ORDER BY "order" ASC, created_at ASC', [workspaceId])
    : await pool.query('SELECT * FROM collections ORDER BY created_at ASC')
  return rows.map(toCollection)
}

export async function dbGetCollection(id: string) {
  const { rows } = await pool.query('SELECT * FROM collections WHERE id=$1', [id])
  return rows[0] ? toCollection(rows[0]) : undefined
}

export async function dbCreateCollection(c: any) {
  await pool.query(
    `INSERT INTO collections (id, name, description, folders, workspace_id, "order", created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [c.id, c.name, c.description ?? null, JSON.stringify(c.folders ?? []), c.workspaceId ?? null, c.order ?? null, c.createdAt, c.updatedAt]
  )
}

export async function dbUpdateCollection(id: string, data: any) {
  const fields: string[] = []
  const values: any[] = []
  let i = 1
  if (data.name !== undefined)        { fields.push(`name=$${i++}`);         values.push(data.name) }
  if (data.description !== undefined) { fields.push(`description=$${i++}`);  values.push(data.description) }
  if (data.folders !== undefined)     { fields.push(`folders=$${i++}`);      values.push(JSON.stringify(data.folders)) }
  if (data.workspaceId !== undefined) { fields.push(`workspace_id=$${i++}`); values.push(data.workspaceId) }
  if (data.order !== undefined)       { fields.push(`"order"=$${i++}`);      values.push(data.order) }
  if (!fields.length) return
  fields.push(`updated_at=$${i++}`)
  values.push(Date.now())
  values.push(id)
  await pool.query(`UPDATE collections SET ${fields.join(',')} WHERE id=$${i}`, values)
}

export async function dbDeleteCollection(id: string) {
  await pool.query('DELETE FROM collections WHERE id=$1', [id])
}

// ── Requests ─────────────────────────────────────────────────────────────────

export async function dbGetRequests(collectionId?: string) {
  const { rows } = collectionId
    ? await pool.query('SELECT * FROM requests WHERE collection_id=$1 ORDER BY "order" ASC, created_at ASC', [collectionId])
    : await pool.query('SELECT * FROM requests ORDER BY created_at ASC')
  return rows.map(toRequest)
}

export async function dbGetRequest(id: string) {
  const { rows } = await pool.query('SELECT * FROM requests WHERE id=$1', [id])
  return rows[0] ? toRequest(rows[0]) : undefined
}

export async function dbCreateRequest(r: any) {
  await pool.query(
    `INSERT INTO requests (id, name, method, url, params, headers, body, auth, collection_id, folder_id, "order", created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [r.id, r.name, r.method, r.url, JSON.stringify(r.params ?? []), JSON.stringify(r.headers ?? []),
     JSON.stringify(r.body ?? {}), JSON.stringify(r.auth ?? {}), r.collectionId ?? null,
     r.folderId ?? null, r.order ?? null, r.createdAt, r.updatedAt]
  )
}

export async function dbUpdateRequest(id: string, data: any) {
  const fields: string[] = []
  const values: any[] = []
  let i = 1
  const jsonFields: Record<string, string> = { params: 'params', headers: 'headers', body: 'body', auth: 'auth' }
  const scalarFields: Record<string, string> = { name: 'name', method: 'method', url: 'url', collectionId: 'collection_id', folderId: 'folder_id', order: '"order"' }
  for (const [k, col] of Object.entries(scalarFields)) {
    if (data[k] !== undefined) { fields.push(`${col}=$${i++}`); values.push(data[k]) }
  }
  for (const [k, col] of Object.entries(jsonFields)) {
    if (data[k] !== undefined) { fields.push(`${col}=$${i++}`); values.push(JSON.stringify(data[k])) }
  }
  if (!fields.length) return
  fields.push(`updated_at=$${i++}`)
  values.push(Date.now())
  values.push(id)
  await pool.query(`UPDATE requests SET ${fields.join(',')} WHERE id=$${i}`, values)
}

export async function dbDeleteRequest(id: string) {
  await pool.query('DELETE FROM requests WHERE id=$1', [id])
}

// ── Socket configs ────────────────────────────────────────────────────────────

export async function dbGetSocketConfigs(collectionId?: string) {
  const { rows } = collectionId
    ? await pool.query('SELECT * FROM socket_configs WHERE collection_id=$1 ORDER BY "order" ASC, created_at ASC', [collectionId])
    : await pool.query('SELECT * FROM socket_configs ORDER BY created_at ASC')
  return rows.map(toSocketConfig)
}

export async function dbCreateSocketConfig(c: any) {
  await pool.query(
    `INSERT INTO socket_configs (id, name, url, protocol, params, headers, auth, events, message_type, message_event, message_content, collection_id, folder_id, "order", created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [c.id, c.name, c.url, c.protocol, JSON.stringify(c.params ?? []), JSON.stringify(c.headers ?? []),
     JSON.stringify(c.auth ?? {}), JSON.stringify(c.events ?? []), c.messageType ?? 'text',
     c.messageEvent ?? 'message', c.messageContent ?? '', c.collectionId ?? null,
     c.folderId ?? null, c.order ?? null, c.createdAt, c.updatedAt]
  )
}

export async function dbUpdateSocketConfig(id: string, data: any) {
  const fields: string[] = []
  const values: any[] = []
  let i = 1
  const scalars: Record<string, string> = { name: 'name', url: 'url', protocol: 'protocol', messageType: 'message_type', messageEvent: 'message_event', messageContent: 'message_content', collectionId: 'collection_id', folderId: 'folder_id', order: '"order"' }
  const jsons: Record<string, string> = { params: 'params', headers: 'headers', auth: 'auth', events: 'events' }
  for (const [k, col] of Object.entries(scalars)) {
    if (data[k] !== undefined) { fields.push(`${col}=$${i++}`); values.push(data[k]) }
  }
  for (const [k, col] of Object.entries(jsons)) {
    if (data[k] !== undefined) { fields.push(`${col}=$${i++}`); values.push(JSON.stringify(data[k])) }
  }
  if (!fields.length) return
  fields.push(`updated_at=$${i++}`)
  values.push(Date.now())
  values.push(id)
  await pool.query(`UPDATE socket_configs SET ${fields.join(',')} WHERE id=$${i}`, values)
}

export async function dbDeleteSocketConfig(id: string) {
  await pool.query('DELETE FROM socket_configs WHERE id=$1', [id])
}

// ── Sequences ─────────────────────────────────────────────────────────────────

export async function dbGetSequences(collectionId?: string) {
  const { rows } = collectionId
    ? await pool.query('SELECT * FROM sequences WHERE collection_id=$1 ORDER BY created_at ASC', [collectionId])
    : await pool.query('SELECT * FROM sequences ORDER BY created_at ASC')
  return rows.map(toSequence)
}

export async function dbCreateSequence(s: any) {
  await pool.query(
    'INSERT INTO sequences (id, name, collection_id, steps, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)',
    [s.id, s.name, s.collectionId ?? null, JSON.stringify(s.steps ?? []), s.createdAt, s.updatedAt]
  )
}

export async function dbUpdateSequence(id: string, data: any) {
  const fields: string[] = []
  const values: any[] = []
  let i = 1
  if (data.name !== undefined)         { fields.push(`name=$${i++}`);          values.push(data.name) }
  if (data.collectionId !== undefined) { fields.push(`collection_id=$${i++}`); values.push(data.collectionId) }
  if (data.steps !== undefined)        { fields.push(`steps=$${i++}`);         values.push(JSON.stringify(data.steps)) }
  if (!fields.length) return
  fields.push(`updated_at=$${i++}`)
  values.push(Date.now())
  values.push(id)
  await pool.query(`UPDATE sequences SET ${fields.join(',')} WHERE id=$${i}`, values)
}

export async function dbDeleteSequence(id: string) {
  await pool.query('DELETE FROM sequences WHERE id=$1', [id])
}

// ── History ───────────────────────────────────────────────────────────────────

export async function dbGetHistory(workspaceId?: string, limit = 100) {
  const { rows } = workspaceId
    ? await pool.query('SELECT * FROM history WHERE workspace_id=$1 ORDER BY timestamp DESC LIMIT $2', [workspaceId, limit])
    : await pool.query('SELECT * FROM history ORDER BY timestamp DESC LIMIT $1', [limit])
  return rows.map(toHistory)
}

export async function dbAddToHistory(entry: any) {
  await pool.query(
    'INSERT INTO history (id, request, response, workspace_id, timestamp) VALUES ($1,$2,$3,$4,$5)',
    [entry.id, JSON.stringify(entry.request), entry.response ? JSON.stringify(entry.response) : null, entry.workspaceId ?? null, entry.timestamp]
  )
  // Keep only 100 most recent per workspace
  if (entry.workspaceId) {
    await pool.query(
      `DELETE FROM history WHERE workspace_id=$1 AND id NOT IN (
         SELECT id FROM history WHERE workspace_id=$1 ORDER BY timestamp DESC LIMIT 100
       )`,
      [entry.workspaceId]
    )
  }
}

export async function dbClearHistory(workspaceId?: string) {
  if (workspaceId) {
    await pool.query('DELETE FROM history WHERE workspace_id=$1', [workspaceId])
  } else {
    await pool.query('DELETE FROM history')
  }
}

export async function dbDeleteHistoryEntry(id: string) {
  await pool.query('DELETE FROM history WHERE id=$1', [id])
}

// ── Environments ──────────────────────────────────────────────────────────────

export async function dbGetEnvironments(workspaceId?: string) {
  const { rows } = workspaceId
    ? await pool.query('SELECT * FROM environments WHERE workspace_id=$1 ORDER BY name ASC', [workspaceId])
    : await pool.query('SELECT * FROM environments ORDER BY name ASC')
  return rows.map(toEnvironment)
}

export async function dbGetEnvironment(id: string) {
  const { rows } = await pool.query('SELECT * FROM environments WHERE id=$1', [id])
  return rows[0] ? toEnvironment(rows[0]) : undefined
}

export async function dbCreateEnvironment(env: any) {
  await pool.query(
    'INSERT INTO environments (id, name, variables, is_active, workspace_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [env.id, env.name, JSON.stringify(env.variables ?? []), env.isActive ?? false, env.workspaceId ?? null, env.createdAt, env.updatedAt]
  )
}

export async function dbUpdateEnvironment(id: string, data: any) {
  const fields: string[] = []
  const values: any[] = []
  let i = 1
  if (data.name !== undefined)        { fields.push(`name=$${i++}`);        values.push(data.name) }
  if (data.variables !== undefined)   { fields.push(`variables=$${i++}`);   values.push(JSON.stringify(data.variables)) }
  if (data.isActive !== undefined)    { fields.push(`is_active=$${i++}`);   values.push(data.isActive) }
  if (data.workspaceId !== undefined) { fields.push(`workspace_id=$${i++}`);values.push(data.workspaceId) }
  if (!fields.length) return
  fields.push(`updated_at=$${i++}`)
  values.push(Date.now())
  values.push(id)
  await pool.query(`UPDATE environments SET ${fields.join(',')} WHERE id=$${i}`, values)
}

export async function dbDeleteEnvironment(id: string) {
  await pool.query('DELETE FROM environments WHERE id=$1', [id])
}

export async function dbSetActiveEnvironment(id: string | null, workspaceId?: string) {
  if (workspaceId) {
    await pool.query('UPDATE environments SET is_active=FALSE WHERE workspace_id=$1', [workspaceId])
  } else {
    await pool.query('UPDATE environments SET is_active=FALSE')
  }
  if (id) {
    await pool.query('UPDATE environments SET is_active=TRUE WHERE id=$1', [id])
  }
}

// ── Workspace state ───────────────────────────────────────────────────────────

export async function dbGetWorkspaceState(workspaceId: string) {
  const { rows } = await pool.query('SELECT state FROM workspace_states WHERE workspace_id=$1', [workspaceId])
  return rows[0]?.state ?? undefined
}

export async function dbSaveWorkspaceState(workspaceId: string, state: any) {
  await pool.query(
    'INSERT INTO workspace_states (workspace_id, state) VALUES ($1,$2) ON CONFLICT (workspace_id) DO UPDATE SET state=$2',
    [workspaceId, JSON.stringify(state)]
  )
}

// ── Invites ───────────────────────────────────────────────────────────────────

export async function dbGetInvitesForEmail(email: string) {
  const { rows } = await pool.query(
    'SELECT * FROM workspace_invites WHERE invitee_email=$1 ORDER BY created_at DESC',
    [email.toLowerCase()]
  )
  return rows.map(toInvite)
}

export async function dbGetInvitesForWorkspace(workspaceId: string) {
  const { rows } = await pool.query(
    'SELECT * FROM workspace_invites WHERE workspace_id=$1 ORDER BY created_at DESC',
    [workspaceId]
  )
  return rows.map(toInvite)
}

export async function dbSendInvite(invite: any) {
  await pool.query(
    `INSERT INTO workspace_invites (id, workspace_id, workspace_name, owner_email, owner_name, invitee_email, permission, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [invite.id, invite.workspaceId, invite.workspaceName, invite.ownerEmail, invite.ownerName, invite.inviteeEmail.toLowerCase(), invite.permission, invite.createdAt]
  )
}

export async function dbDeleteInvite(id: string) {
  await pool.query('DELETE FROM workspace_invites WHERE id=$1', [id])
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function toWorkspace(r: any) {
  return {
    id: r.id, name: r.name,
    ownerId: r.owner_id, ownerName: r.owner_name, ownerEmail: r.owner_email,
    members: r.members ?? [],
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  }
}

function toCollection(r: any) {
  return {
    id: r.id, name: r.name, description: r.description,
    folders: r.folders ?? [],
    workspaceId: r.workspace_id, order: r.order,
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  }
}

function toRequest(r: any) {
  return {
    id: r.id, name: r.name, method: r.method, url: r.url,
    params: r.params ?? [], headers: r.headers ?? [],
    body: r.body ?? { type: 'none', content: '' },
    auth: r.auth ?? { type: 'none' },
    collectionId: r.collection_id, folderId: r.folder_id, order: r.order,
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  }
}

function toSocketConfig(r: any) {
  return {
    id: r.id, name: r.name, url: r.url, protocol: r.protocol,
    params: r.params ?? [], headers: r.headers ?? [],
    auth: r.auth ?? { type: 'none' }, events: r.events ?? [],
    messageType: r.message_type, messageEvent: r.message_event, messageContent: r.message_content,
    collectionId: r.collection_id, folderId: r.folder_id, order: r.order,
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  }
}

function toSequence(r: any) {
  return {
    id: r.id, name: r.name, collectionId: r.collection_id,
    steps: r.steps ?? [],
    createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  }
}

function toHistory(r: any) {
  return {
    id: r.id, request: r.request, response: r.response,
    workspaceId: r.workspace_id, timestamp: Number(r.timestamp),
  }
}

function toEnvironment(r: any) {
  return {
    id: r.id, name: r.name, variables: r.variables ?? [],
    isActive: r.is_active, workspaceId: r.workspace_id,
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
