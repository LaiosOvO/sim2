import type {
  ApprovalDecisionActionV1,
  ApprovalDefinitionNodeV1,
  ApprovalDefinitionSpecV1,
  ApprovalModeV1,
} from '@sim/api-contracts/approvals'

export type ApprovalVote = 'approve' | 'reject' | 'return'
export type ApprovalOutcome = ApprovalVote | 'pending'

export interface ApprovalDefinitionValidation {
  valid: boolean
  errors: string[]
}

export function validateApprovalDefinition(
  spec: ApprovalDefinitionSpecV1
): ApprovalDefinitionValidation {
  const errors: string[] = []
  const nodeIds = new Set<string>()
  const starts = spec.nodes.filter((node) => node.type === 'start')
  const ends = spec.nodes.filter((node) => node.type === 'end')

  if (starts.length !== 1) errors.push('Approval definition must contain exactly one start node')
  if (ends.length !== 1) errors.push('Approval definition must contain exactly one end node')

  for (const node of spec.nodes) {
    if (nodeIds.has(node.id)) errors.push(`Duplicate approval node id: ${node.id}`)
    nodeIds.add(node.id)
  }
  for (const edge of spec.edges) {
    if (!nodeIds.has(edge.from)) errors.push(`Approval edge source does not exist: ${edge.from}`)
    if (!nodeIds.has(edge.to)) errors.push(`Approval edge target does not exist: ${edge.to}`)
    if (ends.some((node) => node.id === edge.from)) {
      errors.push('Approval end node cannot have outgoing edges')
    }
  }

  if (starts.length === 1) {
    const startEdges = spec.edges.filter((edge) => edge.from === starts[0].id)
    if (startEdges.length !== 1 || startEdges[0]?.condition !== undefined) {
      errors.push('Approval start node must contain exactly one unconditional edge')
    }
  }

  for (const node of spec.nodes) {
    if (node.type !== 'approval') continue
    const edges = spec.edges.filter((edge) => edge.from === node.id)
    const conditions = edges.map((edge) => edge.condition)
    if (conditions.filter((condition) => condition === 'approve').length !== 1) {
      errors.push(`Approval node must contain exactly one approve edge: ${node.id}`)
    }
    if (conditions.filter((condition) => condition === 'reject').length !== 1) {
      errors.push(`Approval node must contain exactly one reject edge: ${node.id}`)
    }
    if (new Set(conditions).size !== conditions.length) {
      errors.push(`Approval node contains an ambiguous edge condition: ${node.id}`)
    }
    if (
      node.isDecision &&
      node.timeout &&
      (node.timeout.action === 'approve' || node.timeout.action === 'reject')
    ) {
      errors.push(`Decision node timeout cannot auto decide: ${node.id}`)
    }
    if (
      node.timeout?.action === 'escalate' &&
      (!node.timeout.escalationCandidates || node.timeout.escalationCandidates.length === 0)
    ) {
      errors.push(`Escalation timeout requires candidates: ${node.id}`)
    }
  }

  const outgoing = new Map<string, string[]>()
  for (const edge of spec.edges) {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to])
  }
  const reachable = new Set<string>()
  const queue = starts[0] ? [starts[0].id] : []
  while (queue.length > 0) {
    const id = queue.shift()
    if (!id || reachable.has(id)) continue
    reachable.add(id)
    queue.push(...(outgoing.get(id) ?? []))
  }
  for (const node of spec.nodes) {
    if (!reachable.has(node.id)) errors.push(`Approval node is unreachable: ${node.id}`)
  }

  return { valid: errors.length === 0, errors }
}

export function findInitialApprovalNode(
  spec: ApprovalDefinitionSpecV1
): Extract<ApprovalDefinitionNodeV1, { type: 'approval' }> {
  const validation = validateApprovalDefinition(spec)
  if (!validation.valid) throw new Error(validation.errors.join('; '))
  const start = spec.nodes.find((node) => node.type === 'start')
  const targetId = spec.edges.find((edge) => edge.from === start?.id)?.to
  const target = spec.nodes.find((node) => node.id === targetId)
  if (!target || target.type !== 'approval') {
    throw new Error('Approval start node must lead to an approval node')
  }
  return target
}

export function findNextApprovalNode(
  spec: ApprovalDefinitionSpecV1,
  nodeId: string,
  outcome: ApprovalVote
): ApprovalDefinitionNodeV1 {
  const candidates = spec.edges.filter((edge) => edge.from === nodeId)
  let matching = candidates.filter((candidate) => candidate.condition === outcome)
  if (outcome === 'return' && matching.length === 0) {
    matching = candidates.filter((candidate) => candidate.condition === 'reject')
  }
  if (matching.length !== 1) {
    throw new Error(`Approval node ${nodeId} does not have one ${outcome} transition`)
  }
  const [edge] = matching
  const node = spec.nodes.find((candidate) => candidate.id === edge.to)
  if (!node) throw new Error(`Approval transition target does not exist: ${edge.to}`)
  return node
}

export function aggregateApprovalVotes(
  mode: ApprovalModeV1,
  votes: readonly ApprovalVote[],
  expectedReviewerCount: number
): ApprovalOutcome {
  if (votes.includes('reject')) return 'reject'
  if (votes.includes('return')) return 'return'
  const approvals = votes.filter((vote) => vote === 'approve').length
  if (mode === 'any' && approvals > 0) return 'approve'
  if (mode === 'all' && expectedReviewerCount > 0 && approvals >= expectedReviewerCount) {
    return 'approve'
  }
  return 'pending'
}

export function approvalOutcomeForAction(
  action: ApprovalDecisionActionV1,
  node?: Extract<ApprovalDefinitionNodeV1, { type: 'approval' }>
): ApprovalVote | null {
  if (action === 'approve' || action === 'reject' || action === 'return') return action
  if (action === 'timeout') {
    if (!node?.timeout || node.timeout.action === 'remind') return null
    if (node.timeout.action === 'escalate') return null
    if (node.isDecision) {
      throw new Error(`Decision node timeout cannot auto decide: ${node.id}`)
    }
    return node.timeout.action
  }
  return null
}
