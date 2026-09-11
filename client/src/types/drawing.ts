export type Point = { x: number; y: number }

export type Stroke = {
  id: string
  userId: string
  color: string
  width: number
  points: Point[]
}

export type Tool = 'pen' | 'eraser'