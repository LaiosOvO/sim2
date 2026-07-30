import { describe, expect, it } from 'vitest'
import {
  forkWorkspaceBodySchema,
  forkWorkspaceContract,
} from '@/lib/api/contracts/workspace-fork-create'
import {
  type GetForkResourcesResponse,
  getForkResourcesContract,
} from '@/lib/api/contracts/workspace-fork-resources'

const resources: GetForkResourcesResponse = {
  files: [
    {
      id: 'file-1',
      label: 'Input.csv',
      folderId: 'folder-1',
      folderName: 'Inputs',
    },
  ],
  tables: [{ id: 'table-1', label: 'Customers' }],
  knowledgeBases: [],
  customTools: [],
  skills: [],
  mcpServers: [],
  workflowMcpServers: [],
  deployedWorkflowCount: 2,
}

describe('focused workspace-fork resource client contracts', () => {
  it('uses the versioned resource response and strips fields outside the browser projection', () => {
    expect(
      getForkResourcesContract.response.schema.parse({
        ...resources,
        mcpSecret: 'must-not-cross',
        files: [{ ...resources.files[0], storageKey: 'must-not-cross' }],
      })
    ).toEqual(resources)
  })

  it('keeps the create-fork request compatible without loading the promote/diff contract graph', () => {
    expect(forkWorkspaceContract.path).toBe('/api/workspaces/[id]/fork')
    expect(
      forkWorkspaceBodySchema.parse({
        name: 'Fork',
        copy: {
          files: ['file-1'],
          tables: ['table-1'],
        },
      })
    ).toEqual({
      name: 'Fork',
      copy: {
        files: ['file-1'],
        tables: ['table-1'],
      },
    })
    expect(() =>
      forkWorkspaceBodySchema.parse({
        copy: {
          files: Array.from({ length: 2001 }, (_, index) => `file-${index}`),
        },
      })
    ).toThrow()
  })
})
