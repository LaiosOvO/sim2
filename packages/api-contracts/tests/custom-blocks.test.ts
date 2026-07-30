import { describe, expect, it } from 'vitest'
import {
  customBlockRoutesV1,
  customBlockRouteV1Schema,
  publishCustomBlockBodyV1Schema,
  updateCustomBlockBodyV1Schema,
} from '../src/custom-blocks'

describe('custom-block v1 contracts', () => {
  it('covers the complete W5 route batch', () => {
    expect(customBlockRoutesV1.map((route) => customBlockRouteV1Schema.parse(route))).toHaveLength(
      4
    )
    expect(customBlockRoutesV1.flatMap((route) => route.methods)).toEqual([
      'GET',
      'PATCH',
      'DELETE',
      'GET',
      'GET',
      'POST',
    ])
  })

  it('rejects server-reserved output names and unsafe icon schemes', () => {
    expect(
      publishCustomBlockBodyV1Schema.safeParse({
        workspaceId: 'ws-1',
        workflowId: 'wf-1',
        name: 'Child',
        iconUrl: 'data:image/svg+xml;base64,abc',
      }).success
    ).toBe(false)
    expect(
      publishCustomBlockBodyV1Schema.safeParse({
        workspaceId: 'ws-1',
        workflowId: 'wf-1',
        name: 'Child',
        exposedOutputs: [{ blockId: 'b1', path: 'result', name: ' Cost ' }],
      }).success
    ).toBe(false)
  })

  it('requires a non-empty update patch and strips additive fields', () => {
    expect(updateCustomBlockBodyV1Schema.safeParse({}).success).toBe(false)
    expect(updateCustomBlockBodyV1Schema.safeParse({ enabled: false }).success).toBe(true)
    expect(updateCustomBlockBodyV1Schema.parse({ enabled: false, extra: true })).toEqual({
      enabled: false,
    })
    expect(
      publishCustomBlockBodyV1Schema.parse({
        workspaceId: 'ws-1',
        workflowId: 'wf-1',
        name: 'Child',
        additive: true,
        inputs: [{ id: 'city', required: true, additive: true }],
      })
    ).toEqual({
      workspaceId: 'ws-1',
      workflowId: 'wf-1',
      name: 'Child',
      description: '',
      inputs: [{ id: 'city', required: true }],
    })
  })
})
