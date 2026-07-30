import { describe, expect, it } from 'vitest'
import {
  aggregateApprovalVotes,
  approvalOutcomeForAction,
  findInitialApprovalNode,
  findNextApprovalNode,
  validateApprovalDefinition,
} from './state-machine'

const spec = {
  nodes: [
    { id: 'start', type: 'start' as const },
    {
      id: 'review',
      type: 'approval' as const,
      name: 'Review',
      mode: 'all' as const,
      candidates: [
        { kind: 'user' as const, userId: 'u1' },
        { kind: 'user' as const, userId: 'u2' },
      ],
      isDecision: true,
    },
    { id: 'end', type: 'end' as const },
  ],
  edges: [
    { from: 'start', to: 'review' },
    { from: 'review', to: 'end', condition: 'approve' as const },
    { from: 'review', to: 'end', condition: 'reject' as const },
  ],
}

describe('approval state machine', () => {
  it('validates and resolves the graph without infrastructure imports', () => {
    expect(validateApprovalDefinition(spec)).toEqual({ valid: true, errors: [] })
    expect(findInitialApprovalNode(spec).id).toBe('review')
    expect(findNextApprovalNode(spec, 'review', 'reject').id).toBe('end')
  })

  it('preserves any/all and reject fail-fast semantics', () => {
    expect(aggregateApprovalVotes('any', ['approve'], 2)).toBe('approve')
    expect(aggregateApprovalVotes('all', ['approve'], 2)).toBe('pending')
    expect(aggregateApprovalVotes('all', ['approve', 'approve'], 2)).toBe('approve')
    expect(aggregateApprovalVotes('all', ['approve', 'reject'], 2)).toBe('reject')
  })

  it('reports duplicate and unreachable nodes', () => {
    const invalid = {
      ...spec,
      nodes: [...spec.nodes, { id: 'orphan', type: 'end' as const }],
    }
    expect(validateApprovalDefinition(invalid).errors).toContain(
      'Approval node is unreachable: orphan'
    )
  })

  it('requires the frozen donor graph invariants', () => {
    const invalidCases = [
      {
        expected: 'exactly one end node',
        value: { ...spec, nodes: spec.nodes.filter((node) => node.type !== 'end') },
      },
      {
        expected: 'exactly one unconditional edge',
        value: {
          ...spec,
          edges: [...spec.edges, { from: 'start', to: 'review' }],
        },
      },
      {
        expected: 'exactly one reject edge',
        value: {
          ...spec,
          edges: spec.edges.filter((edge) => edge.condition !== 'reject'),
        },
      },
      {
        expected: 'cannot have outgoing edges',
        value: {
          ...spec,
          edges: [...spec.edges, { from: 'end', to: 'review' }],
        },
      },
      {
        expected: 'ambiguous edge condition',
        value: {
          ...spec,
          edges: [...spec.edges, { from: 'review', to: 'end', condition: 'reject' as const }],
        },
      },
    ]
    for (const invalid of invalidCases) {
      expect(validateApprovalDefinition(invalid.value).errors.join('; ')).toContain(
        invalid.expected
      )
    }
  })

  it('uses the reject branch as the donor-compatible return fallback', () => {
    expect(findNextApprovalNode(spec, 'review', 'return').id).toBe('end')
  })

  it('enforces immutable decision timeout and escalation policies', () => {
    const approval = spec.nodes[1]
    if (approval.type !== 'approval') throw new Error('fixture is invalid')
    expect(
      validateApprovalDefinition({
        ...spec,
        nodes: [
          spec.nodes[0],
          { ...approval, isDecision: true, timeout: { afterMinutes: 5, action: 'approve' } },
          ...spec.nodes.slice(2),
        ],
      }).errors.join('; ')
    ).toContain('Decision node timeout cannot auto decide')
    expect(
      validateApprovalDefinition({
        ...spec,
        nodes: [
          spec.nodes[0],
          { ...approval, timeout: { afterMinutes: 5, action: 'escalate' } },
          ...spec.nodes.slice(2),
        ],
      }).errors.join('; ')
    ).toContain('Escalation timeout requires candidates')
    expect(
      approvalOutcomeForAction('timeout', {
        ...approval,
        isDecision: false,
        timeout: { afterMinutes: 5, action: 'reject' },
      })
    ).toBe('reject')
    expect(
      approvalOutcomeForAction('timeout', {
        ...approval,
        isDecision: false,
        timeout: {
          afterMinutes: 5,
          action: 'escalate',
          escalationCandidates: [{ kind: 'user', userId: 'u3' }],
        },
      })
    ).toBeNull()
  })
})
