import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'node:http'
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { normalizeRoomId } from './roomLogic.js'

type Point = { x: number; y: number }
type Stroke = { id: string; userId: string; color: string; width: number; points: Point[] }
type User = { id: string; name: string; email: string; passwordHash?: string; salt?: string }
type PublicUser = { id: string; name: string; email: string }
type JsonBody = Record<string, unknown>
type RoomSnapshot = { ownerId: string; strokes: Stroke[] }

const DATA_DIR = join(process.cwd(), 'data')
const USERS_FILE = join(DATA_DIR, 'users.json')
const ROOMS_FILE = join(DATA_DIR, 'rooms.json')
mkdirSync(DATA_DIR, { recursive: true })

let usersStore: User[] = []
if (existsSync(USERS_FILE)) {
  try { usersStore = JSON.parse(readFileSync(USERS_FILE, 'utf8')) as User[] } catch { usersStore = [] }
}

const roomStrokes = new Map<string, Stroke[]>()
const roomOwners = new Map<string, string>()
const roomRedo = new Map<string, Map<string, Stroke[]>>()
if (existsSync(ROOMS_FILE)) {
  try {
    const saved = JSON.parse(readFileSync(ROOMS_FILE, 'utf8')) as Record<string, RoomSnapshot>
    for (const [id, room] of Object.entries(saved)) {
      roomOwners.set(id, room.ownerId)
      roomStrokes.set(id, Array.isArray(room.strokes) ? room.strokes : [])
      roomRedo.set(id, new Map())
    }
  } catch { /* start with an empty room store if the file is corrupt */ }
}

const rooms = new Map<string, Set<WebSocket>>()
const users = new Map<WebSocket, { roomId: string; userId: string; name: string }>()
const SESSION_SECRET = process.env.SESSION_SECRET || 'syncan-local-session-secret-change-me'

function createSessionToken(userId: string) {
  const payload = Buffer.from(JSON.stringify({ userId, iat: Date.now() })).toString('base64url')
  const signature = createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url')
  return `${payload}.${signature}`
}
function verifySessionToken(token: string) {
  const [payload, signature] = String(token || '').split('.')
  if (!payload || !signature) return null
  const expected = createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url')
  try {
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { userId?: string; iat?: number }
    if (!parsed.userId || !parsed.iat || Date.now() - parsed.iat > 1000 * 60 * 60 * 24 * 30) return null
    return parsed.userId
  } catch { return null }
}
function saveJsonAtomic(path: string, value: unknown) {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2))
  renameSync(tmp, path)
}
function saveUsers() { saveJsonAtomic(USERS_FILE, usersStore) }
function saveRooms() {
  const data: Record<string, RoomSnapshot> = {}
  for (const [roomId, strokes] of roomStrokes) data[roomId] = { ownerId: roomOwners.get(roomId) || '', strokes }
  saveJsonAtomic(ROOMS_FILE, data)
}
function publicUser(user: User): PublicUser { return { id: user.id, name: user.name, email: user.email } }
function hashPassword(password: string, salt = randomBytes(16).toString('hex')) { return { salt, hash: scryptSync(password, salt, 64).toString('hex') } }
function verifyPassword(password: string, user: User) {
  if (!user.passwordHash || !user.salt) return false
  const expected = Buffer.from(user.passwordHash, 'hex')
  const actual = scryptSync(password, user.salt, 64)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
function authToken(req: any) {
  const header = String(req.headers.authorization || '')
  return header.startsWith('Bearer ') ? header.slice(7) : ''
}
function authenticate(token: string) {
  const userId = verifySessionToken(token)
  return userId ? usersStore.find(u => u.id === userId) || null : null
}
function json(res: any, status: number, payload: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': process.env.CLIENT_ORIGIN || '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' })
  res.end(JSON.stringify(payload))
}
function readBody(req: any): Promise<JsonBody> {
  return new Promise(resolve => {
    let data = ''
    req.on('data', (chunk: Buffer) => { data += chunk.toString(); if (data.length > 100_000) req.destroy() })
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')) } catch { resolve({}) } })
  })
}
function generateRoomId() {
  let id = ''
  do { id = `WB-${randomBytes(3).toString('hex').toUpperCase()}` } while (roomOwners.has(id))
  return id
}
function validStroke(stroke: any, userId: string) {
  return stroke && stroke.userId === userId && typeof stroke.id === 'string' && stroke.id.length <= 100 && Array.isArray(stroke.points) && stroke.points.length >= 2 && stroke.points.length <= 20000
}
function broadcast(roomId: string, payload: unknown, except?: WebSocket) {
  const peers = rooms.get(roomId); if (!peers) return
  const data = JSON.stringify(payload)
  for (const peer of peers) if (peer !== except && peer.readyState === WebSocket.OPEN) peer.send(data)
}

const httpServer = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {})
  if (req.url === '/health') return json(res, 200, { service: 'syncan', status: 'ok', persistedRooms: roomStrokes.size })
  if (req.method === 'POST' && req.url === '/api/register') {
    const body = await readBody(req), name = String(body.name || '').trim().slice(0, 40), email = String(body.email || '').trim().toLowerCase().slice(0, 120), password = String(body.password || '')
    if (name.length < 2 || !email.includes('@') || password.length < 6) return json(res, 400, { error: 'Enter a name, valid email, and password of at least 6 characters.' })
    if (usersStore.some(u => u.email === email)) return json(res, 409, { error: 'An account with that email already exists.' })
    const { salt, hash } = hashPassword(password), user: User = { id: randomUUID(), name, email, passwordHash: hash, salt }
    usersStore.push(user); saveUsers(); return json(res, 201, { token: createSessionToken(user.id), user: publicUser(user) })
  }
  if (req.method === 'POST' && req.url === '/api/login') {
    const body = await readBody(req), email = String(body.email || '').trim().toLowerCase(), password = String(body.password || ''), user = usersStore.find(u => u.email === email)
    if (!user || !verifyPassword(password, user)) return json(res, 401, { error: 'Invalid email or password.' })
    return json(res, 200, { token: createSessionToken(user.id), user: publicUser(user) })
  }
  if (req.method === 'GET' && req.url === '/api/me') {
    const user = authenticate(authToken(req)); if (!user) return json(res, 401, { error: 'Unauthorized' }); return json(res, 200, { user: publicUser(user) })
  }
  if (req.method === 'POST' && req.url === '/api/rooms') {
    const user = authenticate(authToken(req)); if (!user) return json(res, 401, { error: 'Unauthorized' })
    const roomId = generateRoomId(); roomOwners.set(roomId, user.id); roomStrokes.set(roomId, []); roomRedo.set(roomId, new Map()); saveRooms(); return json(res, 201, { roomId })
  }
  if (req.method === 'GET' && req.url?.startsWith('/api/rooms/')) {
    const user = authenticate(authToken(req)); if (!user) return json(res, 401, { error: 'Unauthorized' })
    const roomId = normalizeRoomId(req.url.split('/').pop()); if (!roomStrokes.has(roomId)) return json(res, 404, { error: 'Room not found.' })
    return json(res, 200, { roomId, online: rooms.get(roomId)?.size || 0, strokes: roomStrokes.get(roomId)!.length })
  }
  return json(res, 404, { error: 'Not found' })
})

const wss = new WebSocketServer({ server: httpServer, maxPayload: 512 * 1024 })
wss.on('connection', socket => {
  socket.on('message', raw => {
    let message: any; try { message = JSON.parse(raw.toString()) } catch { return }
    if (message.type === 'JOIN_ROOM') {
      const roomId = normalizeRoomId(message.roomId), authenticatedUser = authenticate(String(message.token || ''))
      if (!roomId || !authenticatedUser || !roomStrokes.has(roomId)) { socket.close(1008, 'Authentication or room validation failed'); return }
      const existing = users.get(socket)
      if (existing) { rooms.get(existing.roomId)?.delete(socket); broadcast(existing.roomId, { type: 'USER_LEFT', userId: existing.userId }, socket) }
      if (!rooms.has(roomId)) rooms.set(roomId, new Set())
      rooms.get(roomId)!.add(socket); users.set(socket, { roomId, userId: authenticatedUser.id, name: authenticatedUser.name })
      const currentUsers = [...rooms.get(roomId)!].map(peer => users.get(peer)).filter(Boolean).map(u => ({ userId: u!.userId, name: u!.name }))
      socket.send(JSON.stringify({ type: 'ROOM_STATE', roomId, strokes: roomStrokes.get(roomId)!, users: currentUsers }))
      broadcast(roomId, { type: 'USER_JOINED', user: { userId: authenticatedUser.id, name: authenticatedUser.name } }, socket)
      return
    }
    const current = users.get(socket); if (!current) return
    const { roomId, userId } = current
    if (message.type === 'STROKE' && validStroke(message.stroke, userId)) {
      const stroke = message.stroke as Stroke; const strokes = roomStrokes.get(roomId)!
      if (!strokes.some(s => s.id === stroke.id)) { strokes.push(stroke); roomRedo.get(roomId)!.set(userId, []); saveRooms(); broadcast(roomId, { type: 'STROKE', roomId, stroke }) }
    } else if (message.type === 'STROKE_UPDATE') {
      if (!Array.isArray(message.points) || message.points.length > 120) return
      broadcast(roomId, { type: 'STROKE_UPDATE', roomId, userId, strokeId: String(message.strokeId || '').slice(0, 100), color: String(message.color || '#111111').slice(0, 20), width: Math.min(Math.max(Number(message.width) || 1, 1), 100), points: message.points.map((p: Point) => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 })) }, socket)
    } else if (message.type === 'CURSOR') {
      broadcast(roomId, { type: 'CURSOR', roomId, userId, name: current.name, x: Number(message.x) || 0, y: Number(message.y) || 0 }, socket)
    } else if (message.type === 'UNDO') {
      const strokes = roomStrokes.get(roomId)!, index = [...strokes].map((s, i) => ({ s, i })).reverse().find(({ s }) => s.userId === userId)?.i
      if (index === undefined) return
      const [removed] = strokes.splice(index, 1); const redo = roomRedo.get(roomId)!; redo.set(userId, [...(redo.get(userId) || []), removed]); saveRooms()
      broadcast(roomId, { type: 'UNDO', roomId, userId, strokeId: removed.id })
    } else if (message.type === 'REDO') {
      const redo = roomRedo.get(roomId)!, stack = redo.get(userId) || [], requested = String(message.strokeId || '')
      const index = requested ? stack.findIndex(s => s.id === requested) : stack.length - 1
      if (index < 0) return
      const [stroke] = stack.splice(index, 1); const strokes = roomStrokes.get(roomId)!; if (!strokes.some(s => s.id === stroke.id)) strokes.push(stroke)
      redo.set(userId, stack); saveRooms(); broadcast(roomId, { type: 'REDO', roomId, userId, stroke })
    } else if (message.type === 'CLEAR') {
      roomStrokes.set(roomId, []); roomRedo.set(roomId, new Map()); saveRooms(); broadcast(roomId, { type: 'CLEAR', roomId, userId })
    } else if (message.type === 'SYNC_REQUEST') {
      socket.send(JSON.stringify({ type: 'ROOM_STATE', roomId, strokes: roomStrokes.get(roomId)!, users: [...rooms.get(roomId)!].map(peer => users.get(peer)).filter(Boolean).map(u => ({ userId: u!.userId, name: u!.name })) }))
    }
  })
  socket.on('close', () => { const current = users.get(socket); if (!current) return; rooms.get(current.roomId)?.delete(socket); users.delete(socket); broadcast(current.roomId, { type: 'USER_LEFT', userId: current.userId }, socket); if (!rooms.get(current.roomId)?.size) rooms.delete(current.roomId) })
})

const port = Number(process.env.PORT || 8080)
httpServer.listen(port, () => console.log(`SYNCAN API/WebSocket server listening on ${port}`))
