import type { Stroke } from './drawing'

export type SocketMessage =
  | { type: 'JOIN_ROOM'; roomId: string; userId: string; token: string }
  | { type: 'ROOM_STATE'; roomId: string; strokes: Stroke[]; users: RemoteUser[] }
  | { type: 'STROKE'; roomId: string; stroke: Stroke }
  | { type: 'STROKE_UPDATE'; roomId: string; userId: string; strokeId: string; color: string; width: number; points: { x: number; y: number }[] }
  | { type: 'CURSOR'; roomId: string; userId: string; name: string; x: number; y: number }
  | { type: 'USER_JOINED'; user: RemoteUser }
  | { type: 'USER_LEFT'; userId: string }
  | { type: 'CLEAR'; roomId: string; userId: string }
  | { type: 'UNDO'; roomId: string; userId: string; strokeId: string }
  | { type: 'REDO'; roomId: string; userId: string; stroke: Stroke }
  | { type: 'SYNC_REQUEST'; roomId: string; userId: string }

export type RemoteUser = { userId: string; name: string; x?: number; y?: number }
