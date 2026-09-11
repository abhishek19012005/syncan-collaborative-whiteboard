import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { FormEvent, PointerEvent as ReactPointerEvent } from 'react'
import { Toolbar } from './components/Toolbar'
import { SyncanLogo } from './components/SyncanLogo'
import { useCanvas } from './hooks/useCanvas'
import { useWebSocket } from './hooks/useWebSocket'
import type { Point, Stroke, Tool } from './types/drawing'
import type { RemoteUser, SocketMessage } from './types/socket'
import { getCanvasPoint, drawStroke } from './utils/drawing'
import { createThrottle } from './utils/throttle'
import { exportCanvasPng, printCanvasAsPdf } from './utils/export'
import './styles.css'

const API_URL = import.meta.env.VITE_API_URL || ''
type Account = { id: string; name: string; email: string }
type AuthResponse = { token: string; user: Account }

async function api<T>(path: string, options: RequestInit = {}, token = ''): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Something went wrong.')
  return data as T
}
function saveSession(result: AuthResponse) { localStorage.setItem('whiteboard_token', result.token); localStorage.setItem('whiteboard_user', JSON.stringify(result.user)) }
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  const paths: Record<string, JSX.Element> = {
    spark: <><path d="M4 20l4.2-1.1 9.7-9.7-3.1-3.1-9.7 9.7L4 20Z"/><path d="M13.8 6.2l2-2c.8-.8 2.1-.8 2.9 0l1.1 1.1c.8.8.8 2.1 0 2.9l-2 2"/><path d="M16.1 4.4l3.5 3.5"/><path d="M8.2 18.9l-1.1-3.1"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    users: <><path d="M16 21v-1.8a4.2 4.2 0 0 0-4.2-4.2H7.2A4.2 4.2 0 0 0 3 19.2V21"/><circle cx="9.5" cy="7.5" r="3.5"/><path d="M17 4.5a3.4 3.4 0 0 1 0 6.6M21 21v-1.8a4.1 4.1 0 0 0-3.1-4"/></>,
    share: <><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3"/><path d="M21 3v18"/></>,
    bolt: <path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/></>,
    keyboard: <><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M19 10h.01M7 14h10"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
    arrow: <><path d="M5 12h13M13 6l6 6-6 6"/></>,
  }
  return <svg {...common}>{paths[name] || paths.spark}</svg>
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('whiteboard_token') || '')
  const [account, setAccount] = useState<Account | null>(() => { try { return JSON.parse(localStorage.getItem('whiteboard_user') || 'null') } catch { return null } })
  const [authError, setAuthError] = useState(''); const [authLoading, setAuthLoading] = useState(false); const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authName, setAuthName] = useState(''); const [authEmail, setAuthEmail] = useState(''); const [authPassword, setAuthPassword] = useState(''); const [showPassword, setShowPassword] = useState(false)
  const params = new URLSearchParams(window.location.search); const initialRoom = (params.get('room') || '').toUpperCase()
  const [room, setRoom] = useState(''); const [roomInput, setRoomInput] = useState(initialRoom); const [joined, setJoined] = useState(false); const [roomError, setRoomError] = useState(''); const [creatingRoom, setCreatingRoom] = useState(false)
  const [strokes, setStrokes] = useState<Stroke[]>([]); const [redoStack, setRedoStack] = useState<Stroke[]>([]); const [tool, setTool] = useState<Tool>('pen'); const [color, setColor] = useState('#6d5dfc'); const [width, setWidth] = useState(5)
  const [users, setUsers] = useState<RemoteUser[]>([]); const [remoteCursors, setRemoteCursors] = useState<RemoteUser[]>([]); const [copied, setCopied] = useState(false); const [toast, setToast] = useState(''); const [showTips, setShowTips] = useState(true); const [showShortcuts, setShowShortcuts] = useState(false); const [showPeople, setShowPeople] = useState(true)
  const currentUserId = account?.id || ''; const drawingRef = useRef<Stroke | null>(null); const sentPointCountRef = useRef(0); const strokeFrameRef = useRef<number | null>(null); const remoteStrokeLastPointRef = useRef(new Map<string, Point>()); const canvasRef = useCanvas(strokes)
  const notify = useCallback((message: string) => { setToast(message); window.setTimeout(() => setToast(''), 1800) }, [])
  const logout = useCallback(() => { localStorage.removeItem('whiteboard_token'); localStorage.removeItem('whiteboard_user'); setToken(''); setAccount(null); setJoined(false); setRoom('') }, [])
  const finishLogin = (result: AuthResponse) => { saveSession(result); setToken(result.token); setAccount(result.user); setAuthError('') }
  useEffect(() => { if (!token) return; api<{ user: Account }>('/api/me', {}, token).then(result => { setAccount(result.user); localStorage.setItem('whiteboard_user', JSON.stringify(result.user)) }).catch(logout) }, [token, logout])
  const submitManualAuth = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setAuthLoading(true); setAuthError(''); try { const path = authMode === 'login' ? '/api/login' : '/api/register'; const body = authMode === 'login' ? { email: authEmail, password: authPassword } : { name: authName, email: authEmail, password: authPassword }; finishLogin(await api<AuthResponse>(path, { method: 'POST', body: JSON.stringify(body) })) } catch (error) { setAuthError(error instanceof Error ? error.message : 'Authentication failed.') } finally { setAuthLoading(false) } }
  const handleMessage = useCallback((message: SocketMessage) => {
    const canvas = canvasRef.current
    if (message.type === 'ROOM_STATE') { setStrokes(message.strokes); setUsers(message.users.filter(u => u.userId !== currentUserId)); return }
    if (message.type === 'STROKE_UPDATE') { if (message.userId === currentUserId || !canvas || !message.points.length) return; const ctx = canvas.getContext('2d'); if (!ctx) return; let last = remoteStrokeLastPointRef.current.get(message.strokeId); for (const point of message.points) { if (last) drawStroke(ctx, { id: message.strokeId, userId: message.userId, color: message.color, width: message.width, points: [last, point] }); last = point } if (last) remoteStrokeLastPointRef.current.set(message.strokeId, last); return }
    if (message.type === 'STROKE') { remoteStrokeLastPointRef.current.delete(message.stroke.id); setStrokes(prev => prev.some(s => s.id === message.stroke.id) ? prev : [...prev, message.stroke]); return }
    if (message.type === 'CLEAR') { remoteStrokeLastPointRef.current.clear(); setStrokes([]); setRedoStack([]); return }
    if (message.type === 'UNDO') { remoteStrokeLastPointRef.current.delete(message.strokeId); setStrokes(prev => prev.filter(stroke => stroke.id !== message.strokeId)); return }
    if (message.type === 'REDO') { setStrokes(prev => prev.some(stroke => stroke.id === message.stroke.id) ? prev : [...prev, message.stroke]); if (message.userId === currentUserId) setRedoStack(prev => prev.filter(stroke => stroke.id !== message.stroke.id)); return }
    if (message.type === 'USER_JOINED' && message.user.userId !== currentUserId) { setUsers(prev => [...prev.filter(u => u.userId !== message.user.userId), message.user]); notify(`${message.user.name} joined the room`); return }
    if (message.type === 'USER_LEFT') { setUsers(prev => prev.filter(u => u.userId !== message.userId)); setRemoteCursors(prev => prev.filter(u => u.userId !== message.userId)); return }
    if (message.type === 'CURSOR' && message.userId !== currentUserId) setRemoteCursors(prev => [...prev.filter(u => u.userId !== message.userId), { userId: message.userId, name: message.name, x: message.x, y: message.y }])
  }, [canvasRef, currentUserId, notify])
  const { connected, connectionError, send, sendStroke, sendStrokeUpdate, sendCursor } = useWebSocket(joined ? room : '', currentUserId, token, account?.name || '', handleMessage)
  useEffect(() => { if (connectionError.includes('Authentication failed') || connectionError.includes('Authentication required')) logout() }, [connectionError, logout])
  const throttledCursor = useRef(createThrottle((x: number, y: number) => sendCursor(x, y), 33)).current
  const scheduleStrokeBatch = () => { if (strokeFrameRef.current !== null) return; strokeFrameRef.current = requestAnimationFrame(() => { strokeFrameRef.current = null; const stroke = drawingRef.current; if (!stroke || !joined) return; const points = stroke.points.slice(sentPointCountRef.current); if (points.length) { sendStrokeUpdate(stroke, points); sentPointCountRef.current = stroke.points.length } }) }
  const createRoom = async () => { setCreatingRoom(true); setRoomError(''); try { const result = await api<{ roomId: string }>('/api/rooms', { method: 'POST' }, token); setRoomInput(result.roomId); await joinRoom(result.roomId) } catch (error) { setRoomError(error instanceof Error ? error.message : 'Could not create room.') } finally { setCreatingRoom(false) } }
  const joinRoom = async (requestedRoom = roomInput) => { const nextRoom = requestedRoom.trim().toUpperCase(); if (!nextRoom) { setRoomError('Enter a room ID.'); return }; setRoomError(''); try { await api(`/api/rooms/${encodeURIComponent(nextRoom)}`, {}, token); setStrokes([]); setRedoStack([]); setUsers([]); setRemoteCursors([]); remoteStrokeLastPointRef.current.clear(); setRoom(nextRoom); setRoomInput(nextRoom); setJoined(true); const url = new URL(window.location.href); url.searchParams.set('room', nextRoom); window.history.replaceState({}, '', url); notify('Room joined — you are live!') } catch (error) { setRoomError(error instanceof Error ? error.message : 'Room not found.') } }
  const leaveRoom = () => { setJoined(false); setRoom(''); setUsers([]); setRemoteCursors([]); setStrokes([]); const url = new URL(window.location.href); url.searchParams.delete('room'); window.history.replaceState({}, '', url) }
  const copyRoomLink = async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); notify('Room link copied to clipboard') } catch { notify('Copy failed — share the room ID instead') } window.setTimeout(() => setCopied(false), 1500) }
  const startDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => { const canvas = canvasRef.current; if (!canvas) return; canvas.setPointerCapture(event.pointerId); const point = getCanvasPoint(canvas, event.nativeEvent); sentPointCountRef.current = 0; drawingRef.current = { id: crypto.randomUUID(), userId: currentUserId, color: tool === 'eraser' ? 'eraser' : color, width: tool === 'eraser' ? width * 2 : width, points: [point] } }
  const draw = (event: ReactPointerEvent<HTMLCanvasElement>) => { const current = drawingRef.current, canvas = canvasRef.current; if (!current || !canvas) return; const point = getCanvasPoint(canvas, event.nativeEvent), previous = current.points[current.points.length - 1]; current.points.push(point); const ctx = canvas.getContext('2d'); if (ctx) drawStroke(ctx, { ...current, points: [previous, point] }); if (joined) { throttledCursor(point.x, point.y); scheduleStrokeBatch() } }
  const finishDrawing = () => { const current = drawingRef.current; if (!current) return; if (strokeFrameRef.current !== null) { cancelAnimationFrame(strokeFrameRef.current); strokeFrameRef.current = null }; if (current.points.length > 1) { if (joined && sentPointCountRef.current < current.points.length) sendStrokeUpdate(current, current.points.slice(sentPointCountRef.current)); setStrokes(prev => [...prev, current]); setRedoStack([]); if (joined) sendStroke(current) }; drawingRef.current = null; sentPointCountRef.current = 0 }
  const undo = () => {
    const ownStrokes = strokes.filter(stroke => stroke.userId === currentUserId)
    const target = ownStrokes[ownStrokes.length - 1]
    if (!target) return
    setStrokes(prev => prev.filter(stroke => stroke.id !== target.id))
    setRedoStack(prev => [...prev, target])
    if (joined) send({ type: 'UNDO', roomId: room, userId: currentUserId, strokeId: target.id })
  }
  const redo = () => {
    const target = redoStack[redoStack.length - 1]
    if (!target) return
    setRedoStack(prev => prev.slice(0, -1))
    setStrokes(prev => prev.some(stroke => stroke.id === target.id) ? prev : [...prev, target])
    if (joined) send({ type: 'REDO', roomId: room, userId: currentUserId, stroke: target })
  }
  const clear = () => { setStrokes([]); setRedoStack([]); if (joined) send({ type: 'CLEAR', roomId: room, userId: currentUserId }); notify('Canvas cleared for everyone') }
  const exportPng = () => { if (canvasRef.current) { exportCanvasPng(canvasRef.current, `syncan-${room || 'canvas'}.png`); notify('PNG export started') } }
  const exportPdf = () => { notify('Print dialog opened — choose Save as PDF'); window.setTimeout(printCanvasAsPdf, 80) }
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return; if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo() } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo() } else if (event.key.toLowerCase() === 'p') setTool('pen'); else if (event.key.toLowerCase() === 'e') setTool('eraser'); else if (event.key === '?') setShowShortcuts(v => !v) }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) })

  if (!token || !account) return (
    <main className="auth-page"><div className="mesh mesh-one"/><div className="mesh mesh-two"/><div className="noise"/>
      <section className="auth-shell">
        <div className="auth-visual"><div className="brand-lockup"><SyncanLogo size={52} className="glow-logo"/><div><b>SYNCAN</b><span>REAL-TIME CANVAS</span></div></div><div className="eyebrow light">COLLABORATION, WITHOUT THE CLUTTER</div><h1>One canvas.<br/><span>Infinite directions.</span></h1><p>Sketch, map ideas and build together in a workspace designed to feel alive.</p>
          <div className="hero-stage"><div className="stage-grid"/><div className="stage-cursor cursor-a"><i/>Ramesh</div><div className="stage-cursor cursor-b"><i/>Priya</div><div className="stage-stroke stroke-a"/><div className="stage-stroke stroke-b"/><div className="stage-stroke stroke-c"/><div className="stage-node node-a"><Icon name="spark" size={15}/></div><div className="stage-node node-b"><Icon name="users" size={15}/></div><div className="stage-caption"><span>LIVE</span><b>Ideas syncing in real time</b></div></div>
          <div className="feature-row"><span><Icon name="bolt" size={13}/> Live sync</span><span><Icon name="users" size={13}/> Shared rooms</span><span><Icon name="spark" size={13}/> Infinite ideas</span></div>
        </div>
        <div className="auth-card"><div className="auth-mobile-brand"><SyncanLogo size={42}/><b>SYNCAN</b></div><div className="auth-heading"><div className="app-badge"><Icon name="spark" size={22}/></div><div className="eyebrow">YOUR WORKSPACE AWAITS</div><h2>{authMode === 'login' ? 'Welcome back.' : 'Start something great.'}</h2><p>{authMode === 'login' ? 'Sign in and jump back into your shared canvas.' : 'Create your account and invite your first collaborator.'}</p></div>
          <div className="auth-tabs"><button type="button" className={authMode === 'login' ? 'auth-tab active' : 'auth-tab'} onClick={() => { setAuthMode('login'); setAuthError('') }}>Sign in</button><button type="button" className={authMode === 'register' ? 'auth-tab active' : 'auth-tab'} onClick={() => { setAuthMode('register'); setAuthError('') }}>Create account</button></div>
          <form className="manual-auth-form" onSubmit={submitManualAuth}>{authMode === 'register' && <label><span>Full name</span><input autoComplete="name" value={authName} onChange={e => setAuthName(e.target.value)} placeholder="Your name" required minLength={2}/></label>}<label><span>Email address</span><input type="email" autoComplete="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="you@example.com" required/></label><label><span>Password</span><div className="password-wrap"><input type={showPassword ? 'text' : 'password'} autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="At least 6 characters" minLength={6} required/><button type="button" onClick={() => setShowPassword(v => !v)}>{showPassword ? 'Hide' : 'Show'}</button></div></label><button className="gradient-btn full auth-submit" disabled={authLoading}>{authLoading ? <><span className="spinner"/> Working…</> : <>{authMode === 'login' ? 'Enter workspace' : 'Create my workspace'} <Icon name="arrow" size={17}/></>}</button></form>
          {authError && <div className="error-box">⚠ {authError}</div>}<div className="auth-security"><span><Icon name="check" size={14}/> Secure session</span><span><Icon name="check" size={14}/> Live collaboration</span></div>
        </div>
      </section>
    </main>
  )

  if (!joined) return (
    <main className="lobby-page"><div className="mesh mesh-one"/><div className="mesh mesh-two"/>
      <header className="lobby-header"><div className="lobby-brand"><SyncanLogo size={46}/><div><div className="eyebrow">SYNCAN / HOME</div><h1>Hey, {account.name.split(' ')[0]} <span>✦</span></h1><p>Your creative desk is ready. Start a room or jump into a shared idea.</p></div></div><div className="profile-pill"><div className="profile-avatar">{account.name.slice(0,1).toUpperCase()}</div><div><b>{account.name}</b><span>{account.email}</span></div><button className="icon-ghost" onClick={logout} title="Sign out"><Icon name="logout" size={17}/></button></div></header>
      <section className="lobby-hero"><div><div className="eyebrow">WORKSPACE CONTROL CENTER</div><h2>Where ideas become <span>shared.</span></h2><p>Every room is a private real-time space. Invite friends with one link.</p></div><div className="lobby-orbit"><div className="orbit-ring ring-one"/><div className="orbit-ring ring-two"/><div className="orbit-core"><Icon name="spark" size={24}/></div></div></section>
      <section className="lobby-grid"><button className="lobby-card create-card interactive-card" onClick={createRoom} disabled={creatingRoom}><div className="card-top"><div className="card-icon gradient-icon"><Icon name="plus" size={25}/></div><span>01 / QUICK START</span></div><h3>Create a room</h3><p>Generate a fresh space, then send the room link to your team.</p><div className="card-action">{creatingRoom ? 'Creating…' : 'Launch new room'} <Icon name="arrow" size={17}/></div><div className="card-decoration"><span/><span/><span/></div></button>
        <div className="lobby-card join-card interactive-card"><div className="card-top"><div className="card-icon blue-icon"><Icon name="arrow" size={25}/></div><span>02 / INVITE CODE</span></div><h3>Join a room</h3><p>Have a room ID? Enter it below and land directly in the shared canvas.</p><div className="join-row"><input value={roomInput} onChange={e => setRoomInput(e.target.value.toUpperCase())} placeholder="WB-A1B2C3" onKeyDown={e => { if (e.key === 'Enter') joinRoom() }}/><button className="gradient-btn" onClick={() => joinRoom()}>Join <Icon name="arrow" size={16}/></button></div>{roomError && <div className="error-box">⚠ {roomError}</div>}</div></section>
      <section className="lobby-bottom"><div><span className="live-dot"/> System ready <b>•</b> real-time sync enabled</div><button className="shortcut-link" onClick={() => setShowShortcuts(true)}><Icon name="keyboard" size={15}/> Keyboard shortcuts <kbd>?</kbd></button></section>
      {showShortcuts && <div className="modal-backdrop" onClick={() => setShowShortcuts(false)}><div className="shortcut-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setShowShortcuts(false)}><Icon name="close"/></button><div className="eyebrow">POWER USER MODE</div><h3>Shortcuts</h3><div className="shortcut-list"><div><span>Pen</span><kbd>P</kbd></div><div><span>Eraser</span><kbd>E</kbd></div><div><span>Undo</span><kbd>Ctrl / ⌘ Z</kbd></div><div><span>Redo</span><kbd>Ctrl / ⌘ Y</kbd></div><div><span>Show shortcuts</span><kbd>?</kbd></div></div></div></div>}
    </main>
  )

  return <main className="workspace"><div className="workspace-glow"/>{toast && <div className="toast"><span><Icon name="check" size={15}/></span>{toast}</div>}
    <header className="workspace-header"><div className="app-brand"><SyncanLogo size={36} showGesture={false}/><div><div className="eyebrow">SYNCAN</div><h1>Live canvas</h1></div></div><div className="room-center"><span>ROOM</span><b>{room}</b><button onClick={copyRoomLink} title="Copy room link"><Icon name={copied ? 'check' : 'copy'} size={15}/></button></div><div className="header-actions"><div className="presence-stack">{users.slice(0,4).map((user, i) => <div key={user.userId} className={`presence-avatar p${i}`}>{user.name.slice(0,1).toUpperCase()}</div>)}<div className="presence-count"><Icon name="users" size={14}/>{users.length + 1}</div></div><button className="gradient-btn share-btn" onClick={copyRoomLink}>{copied ? 'Copied' : 'Share room'} <Icon name="share" size={16}/></button><button className="icon-ghost" onClick={leaveRoom} title="Leave room">Leave</button></div></header>
    <div className="workspace-body"><aside className="left-rail"><button className="rail-btn active" title="Canvas"><Icon name="spark"/></button><button className="rail-btn" onClick={() => setShowPeople(v => !v)} title="People"><Icon name="users"/></button><button className="rail-btn" onClick={() => setShowTips(v => !v)} title="Tips"><Icon name="info"/></button><div className="rail-spacer"/><button className="rail-btn" onClick={() => setShowShortcuts(true)} title="Shortcuts"><Icon name="keyboard"/></button><button className="rail-btn" onClick={logout} title="Sign out"><Icon name="logout"/></button></aside>
      <section className="canvas-column"><div className="workspace-banner"><div><span className="live-dot"/><b>{connected ? 'Live collaboration' : 'Connecting to room'}</b><span>{connected ? 'Every stroke is synced instantly.' : connectionError || 'Reconnecting…'}</span></div>{showTips && <button onClick={() => setShowTips(false)}>Got it</button>}</div><Toolbar tool={tool} color={color} width={width} canUndo={strokes.some(stroke => stroke.userId === currentUserId)} canRedo={redoStack.length > 0} setTool={setTool} setColor={setColor} setWidth={setWidth} undo={undo} redo={redo} clear={clear} exportPng={exportPng} exportPdf={exportPdf}/><section className="canvas-wrap"><div className="canvas-hint">{strokes.length ? '' : <><span className="hint-orb"><Icon name="spark" size={18}/></span><b>Your shared canvas is waiting</b><span>Draw something. Your team will see it as you move.</span></>} </div><canvas ref={canvasRef} onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={finishDrawing} onPointerCancel={finishDrawing}/>{remoteCursors.map(cursor => <div key={cursor.userId} className="remote-cursor" style={{ left: `${(cursor.x! / (canvasRef.current?.width || 1)) * 100}%`, top: `${(cursor.y! / (canvasRef.current?.height || 1)) * 100}%` }}><span>↖</span>{cursor.name}</div>)}</section><footer className="canvas-footer"><span><i className={connected ? 'online' : ''}/>{connected ? 'Synced' : 'Offline'}</span><span>{strokes.length} objects</span><span>Pen {width}px</span><button onClick={() => setShowShortcuts(true)}>Press <kbd>?</kbd> for shortcuts</button></footer></section>
      {showPeople && <aside className="people-panel"><div className="panel-head"><div><div className="eyebrow">ROOM PRESENCE</div><h3>People here</h3></div><span className="online-count">{users.length + 1} online</span></div><div className="self-person"><div className="person-avatar you">{account.name.slice(0,1).toUpperCase()}</div><div><b>{account.name}</b><span>You · host session</span></div><i className="online-dot"/></div><div className="people-divider"/>{users.length ? users.map((user, i) => <div className="person" key={user.userId}><div className={`person-avatar hue-${i % 4}`}>{user.name.slice(0,1).toUpperCase()}</div><div><b>{user.name}</b><span>Collaborating now</span></div><i className="online-dot"/></div>) : <div className="empty-people"><div><Icon name="users" size={22}/></div><b>You're first in</b><span>Share the room and watch collaborators appear here.</span><button className="text-btn" onClick={copyRoomLink}>Invite someone <Icon name="arrow" size={14}/></button></div>}<div className="panel-footer"><div className="mini-metric"><span>SYNC</span><b>~30 FPS</b></div><div className="mini-metric"><span>ROOM</span><b>{room.slice(-6)}</b></div></div></aside>}
    </div>
    {showShortcuts && <div className="modal-backdrop" onClick={() => setShowShortcuts(false)}><div className="shortcut-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setShowShortcuts(false)}><Icon name="close"/></button><div className="eyebrow">POWER USER MODE</div><h3>Shortcuts</h3><div className="shortcut-list"><div><span>Pen</span><kbd>P</kbd></div><div><span>Eraser</span><kbd>E</kbd></div><div><span>Undo</span><kbd>Ctrl / ⌘ Z</kbd></div><div><span>Redo</span><kbd>Ctrl / ⌘ Y</kbd></div><div><span>Show shortcuts</span><kbd>?</kbd></div></div></div></div>}
  </main>
}
