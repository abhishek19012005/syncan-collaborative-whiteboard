export function normalizeRoomId(value: unknown) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32)
}

export function canUndo(strokes: Array<{ userId: string }>, userId: string) {
  return strokes.some(stroke => stroke.userId === userId)
}

export function findLatestUserStrokeIndex(strokes: Array<{ userId: string }>, userId: string) {
  for (let i = strokes.length - 1; i >= 0; i -= 1) if (strokes[i].userId === userId) return i
  return -1
}
