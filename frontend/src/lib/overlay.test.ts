import { describe, expect, it } from 'vitest'
import { applyTransform, computeAutoFit, containRect, DEFAULT_OVERLAY_TRANSFORM, projectPlane } from './overlay'

describe('projectPlane', () => {
  it('picks the two axes for each plane', () => {
    expect(projectPlane('front', 1, 2, 3)).toEqual([1, 2])
    expect(projectPlane('side', 1, 2, 3)).toEqual([3, 2])
    expect(projectPlane('top', 1, 2, 3)).toEqual([1, 3])
  })
})

describe('applyTransform', () => {
  it('is the identity (plus pan) with default transform', () => {
    expect(applyTransform(2, 3, { ...DEFAULT_OVERLAY_TRANSFORM, scale: 1 })).toEqual([2, -3])
  })
  it('mirrors each axis independently', () => {
    const t = { ...DEFAULT_OVERLAY_TRANSFORM, scale: 1, mirrorX: true }
    expect(applyTransform(2, 3, t)).toEqual([-2, -3])
  })
  it('rotates 90 degrees', () => {
    const t = { ...DEFAULT_OVERLAY_TRANSFORM, scale: 1, rotationDeg: 90 }
    const [x, y] = applyTransform(1, 0, t)
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(-1)
  })
  it('scales and pans', () => {
    const t = { ...DEFAULT_OVERLAY_TRANSFORM, scale: 10, offsetX: 5, offsetY: -5 }
    expect(applyTransform(1, 0, t)).toEqual([15, -5])
  })
})

describe('computeAutoFit', () => {
  it('centres points and fills the rect', () => {
    const points: [number, number][] = [
      [0, 0],
      [2, 1],
    ]
    const fit = computeAutoFit(points, { mirrorX: false, mirrorY: false, rotationDeg: 0 }, 200, 200, 1)
    // centre of bbox (1, 0.5) should map to the rect centre (0, 0)
    const [px, py] = applyTransform(1, 0.5, { ...DEFAULT_OVERLAY_TRANSFORM, ...fit })
    expect(px).toBeCloseTo(0)
    expect(py).toBeCloseTo(0)
    expect(fit.scale).toBeGreaterThan(0)
  })
  it('falls back to a default when there are no points', () => {
    expect(computeAutoFit([], { mirrorX: false, mirrorY: false, rotationDeg: 0 }, 200, 200)).toEqual({
      scale: DEFAULT_OVERLAY_TRANSFORM.scale,
      offsetX: 0,
      offsetY: 0,
    })
  })
})

describe('containRect', () => {
  it('letterboxes a wider video inside a taller container', () => {
    expect(containRect(200, 200, 100, 50)).toEqual({ x: 0, y: 50, w: 200, h: 100 })
  })
  it('fills the container when media size is unknown', () => {
    expect(containRect(200, 100, 0, 0)).toEqual({ x: 0, y: 0, w: 200, h: 100 })
  })
})
