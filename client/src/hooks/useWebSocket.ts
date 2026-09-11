import { useCallback, useEffect, useRef, useState } from 'react'
import type { Stroke } from '../types/drawing'
import type { SocketMessage } from '../types/socket'

const WS_URL = import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`

export function useWebSocket(
  roomId: string,
  userId: string,
  token: string,
  name: string,
  onMessage: (message: SocketMessage) => void,
) {
  const socketRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [connectionError, setConnectionError] = useState('')

  useEffect(() => {
    if (!roomId || !token) return

    let disposed = false
    let reconnectTimer: number | null = null
    let timeout: number | null = null
    let attempts = 0

    const connect = () => {
      if (disposed) return
      setConnectionError(attempts ? `Reconnecting… (${attempts})` : '')
      const socket = new WebSocket(WS_URL)
      socketRef.current = socket

      timeout = window.setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) {
          socket.close()
          setConnected(false)
          setConnectionError('Connection timed out. Make sure the collaboration server is running on port 8080.')
        }
      }, 5000)

      socket.onopen = () => {
        if (timeout !== null) window.clearTimeout(timeout)
        attempts = 0
        setConnected(true)
        setConnectionError('')
        socket.send(JSON.stringify({ type: 'JOIN_ROOM', roomId, userId, token }))
      }

      socket.onmessage = event => {
        try { onMessage(JSON.parse(event.data) as SocketMessage) } catch {}
      }

      socket.onclose = event => {
        if (timeout !== null) window.clearTimeout(timeout)
        setConnected(false)
        if (disposed) return
        if (event.code === 1008) {
          setConnectionError(event.reason || 'Authentication failed. Please sign in again.')
          return
        }
        attempts += 1
        setConnectionError('Connection lost. Reconnecting…')
        reconnectTimer = window.setTimeout(connect, Math.min(1000 * 2 ** Math.min(attempts - 1, 4), 8000))
      }

      socket.onerror = () => {
        if (!disposed) setConnectionError('Unable to reach the collaboration server. Retrying…')
      }
    }

    connect()

    return () => {
      disposed = true
      if (timeout !== null) window.clearTimeout(timeout)
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      const socket = socketRef.current
      socketRef.current = null
      if (socket && socket.readyState !== WebSocket.CLOSED) socket.close(1000, 'Room changed')
      setConnected(false)
    }
  }, [roomId, userId, token, name, onMessage])

  const send = useCallback((message: SocketMessage) => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }, [])

  const sendStroke = useCallback((stroke: Stroke) => send({ type: 'STROKE', roomId, stroke }), [roomId, send])
  const sendStrokeUpdate = useCallback((stroke: Stroke, points: Stroke['points']) => {
    if (!points.length) return
    send({ type: 'STROKE_UPDATE', roomId, userId, strokeId: stroke.id, color: stroke.color, width: stroke.width, points })
  }, [roomId, userId, send])
  const sendCursor = useCallback((x: number, y: number) => send({ type: 'CURSOR', roomId, userId, name, x, y }), [roomId, userId, name, send])
  const requestSync = useCallback(() => send({ type: 'SYNC_REQUEST', roomId, userId }), [roomId, userId, send])

  return { connected, connectionError, send, sendStroke, sendStrokeUpdate, sendCursor, requestSync }
}
