import assert from 'node:assert/strict'
import test from 'node:test'
import { canUndo, findLatestUserStrokeIndex, normalizeRoomId } from './roomLogic.js'

test('normalizes room ids consistently', () => {
  assert.equal(normalizeRoomId(' wb-a1b2c3 '), 'WB-A1B2C3')
  assert.equal(normalizeRoomId('WB a1!b2'), 'WBA1B2')
})

test('undo targets the latest stroke by the requesting user', () => {
  const strokes = [{ userId: 'a' }, { userId: 'b' }, { userId: 'a' }]
  assert.equal(canUndo(strokes, 'a'), true)
  assert.equal(findLatestUserStrokeIndex(strokes, 'a'), 2)
  assert.equal(findLatestUserStrokeIndex(strokes, 'c'), -1)
})
