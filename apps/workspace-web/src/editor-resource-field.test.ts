import type { EditorBlockTemplateFieldV1 } from '@sim/tool-catalog'
import { describe, expect, it } from 'vitest'
import type { EditorWorkflow } from './editor-api'
import { resourceRequest } from './editor-resource-field'

function workflow(subBlocks: Record<string, unknown> = {}): EditorWorkflow {
  return {
    id: 'workflow-current',
    workspaceId: 'workspace-1',
    name: 'Current',
    description: null,
    isDeployed: false,
    locked: false,
    state: {
      blocks: {
        'block-1': {
          id: 'block-1',
          type: 'mcp',
          name: 'MCP',
          enabled: true,
          position: { x: 0, y: 0 },
          outputs: {},
          subBlocks,
        },
      },
      edges: [],
    },
  }
}

function field(type: string, extra: Partial<EditorBlockTemplateFieldV1> = {}) {
  return {
    id: 'resource',
    title: 'Resource',
    type,
    required: false,
    mode: 'basic' as const,
    initialValue: '',
    ...extra,
  }
}

describe('resourceRequest', () => {
  it('loads native workflows without offering the current workflow', () => {
    const request = resourceRequest(field('workflow-selector'), workflow(), 'block-1')
    expect(request?.path).toContain('/api/workflows?workspaceId=workspace-1')
    expect(
      request?.select({
        data: [
          { id: 'workflow-current', name: 'Current' },
          { id: 'workflow-child', name: 'Child' },
        ],
      })
    ).toEqual([{ id: 'workflow-child', label: 'Child' }])
  })

  it('loads provider credentials and preserves the Gmail provider mapping', () => {
    const request = resourceRequest(
      field('oauth-input', { serviceId: 'gmail', credentialKind: 'service-account' }),
      workflow(),
      'block-1'
    )

    expect(request?.path).toBe('/api/credentials?workspaceId=workspace-1&providerId=google-email')
    expect(
      request?.select({
        credentials: [
          { id: 'oauth-1', displayName: 'Personal Gmail', type: 'oauth' },
          { id: 'service-1', displayName: 'Workspace Gmail', type: 'service_account' },
        ],
      })
    ).toEqual([{ id: 'service-1', label: 'Workspace Gmail' }])
  })

  it('uses the MCP runtime tool ID expected by existing workflows', () => {
    const request = resourceRequest(
      field('mcp-tool-selector'),
      workflow({ server: { value: 'server-1' } }),
      'block-1'
    )
    expect(
      request?.select({
        data: { tools: [{ name: 'search', description: 'Search documents' }] },
      })
    ).toEqual([{ id: 'mcp-server-1-search', label: 'search — Search documents' }])
  })

  it('resolves dependent table columns from their stable IDs', () => {
    const request = resourceRequest(
      field('column-selector', { selectorKey: 'table.columns', dependsOn: ['tableSelector'] }),
      workflow({ tableSelector: { value: 'table-1' } }),
      'block-1'
    )
    expect(request?.path).toContain('/api/table/table-1')
    expect(
      request?.select({
        data: { table: { schema: { columns: [{ id: 'column-1', name: 'Email' }] } } },
      })
    ).toEqual([{ id: 'column-1', label: 'Email' }])
  })

  it('builds a provider gateway request from canonical dependency context', () => {
    const credential = field('oauth-input', {
      id: 'credential',
      canonicalParamId: 'oauthCredential',
      serviceId: 'slack',
    })
    const channel = field('channel-selector', {
      id: 'channel',
      selectorKey: 'slack.channels',
      serviceId: 'slack',
      dependsOn: { all: ['authMethod'], any: ['credential', 'botToken'] },
    })
    const request = resourceRequest(
      channel,
      workflow({ authMethod: { value: 'oauth' }, credential: { value: 'credential-1' } }),
      'block-1',
      [credential, channel, field('dropdown', { id: 'authMethod' })],
      'general'
    )

    expect(request?.path).toBe('/api/selectors/query')
    expect(request?.init?.method).toBe('POST')
    expect(JSON.parse(String(request?.init?.body))).toEqual({
      selectorKey: 'slack.channels',
      context: {
        workspaceId: 'workspace-1',
        workflowId: 'workflow-current',
        serviceId: 'slack',
        oauthCredential: 'credential-1',
      },
      search: 'general',
    })
  })

  it('does not call the provider gateway until all dependency gates are satisfied', () => {
    const request = resourceRequest(
      field('file-selector', {
        selectorKey: 'airtable.tables',
        serviceId: 'airtable',
        dependsOn: ['credential', 'baseSelector'],
      }),
      workflow({ credential: { value: 'credential-1' } }),
      'block-1',
      [
        field('oauth-input', {
          id: 'credential',
          canonicalParamId: 'oauthCredential',
        }),
        field('project-selector', { id: 'baseSelector', canonicalParamId: 'baseId' }),
      ]
    )

    expect(request).toBeNull()
  })
})
