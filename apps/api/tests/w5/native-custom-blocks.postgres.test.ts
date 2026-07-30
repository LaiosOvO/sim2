import { describe, expect, it } from 'vitest'

const disposableDatabaseEnabled =
  process.env.SIM_TEST_DATABASE_DISPOSABLE === '1' && Boolean(process.env.DATABASE_URL)

if (process.env.SIM_REQUIRE_POSTGRES_TEST === '1' && !disposableDatabaseEnabled) {
  throw new Error('PostgreSQL integration requires DATABASE_URL and SIM_TEST_DATABASE_DISPOSABLE=1')
}

describe.runIf(disposableDatabaseEnabled)('native W5 custom-block PostgreSQL adapter', () => {
  it('enforces tenant bindings, projects every donor trigger, and holds query-count ratchets', async () => {
    const [
      { db },
      { sql },
      { drizzle },
      { default: postgres },
      databaseSchema,
      { createDrizzleCustomBlockRepository },
    ] = await Promise.all([
      import('@sim/db'),
      import('drizzle-orm'),
      import('drizzle-orm/postgres-js'),
      import('postgres'),
      import('@sim/db/schema'),
      import('@/infrastructure/postgres/repositories/drizzle-custom-block-repository'),
    ])

    for (const statement of [
      `create table workspace (
        id text primary key,
        name text not null,
        organization_id text,
        archived_at timestamp
      )`,
      `create table workflow (
        id text primary key,
        user_id text not null,
        workspace_id text,
        name text not null,
        is_deployed boolean not null default false,
        archived_at timestamp
      )`,
      `create table custom_block (
        id text primary key,
        organization_id text not null,
        workflow_id text not null,
        type text not null,
        name text not null,
        description text not null default '',
        icon_url text,
        inputs json,
        outputs json,
        enabled boolean not null default true,
        created_by text,
        created_at timestamp not null default now(),
        updated_at timestamp not null default now()
      )`,
      `create table workflow_deployment_version (
        id text primary key,
        workflow_id text not null,
        version integer not null,
        state json not null,
        is_active boolean not null default false
      )`,
      `create table workflow_blocks (
        id text primary key,
        workflow_id text not null,
        type text not null
      )`,
      `insert into workspace (id, name, organization_id) values
        ('workspace-1', 'Workspace one', 'org-1'),
        ('workspace-2', 'Workspace two', 'org-2')`,
      `insert into workflow (id, user_id, workspace_id, name, is_deployed) values
        ('workflow-starter', 'user-1', 'workspace-1', 'Starter child', true),
        ('workflow-start', 'user-1', 'workspace-1', 'Start child', true),
        ('workflow-start-trigger', 'user-1', 'workspace-1', 'Start trigger child', true),
        ('workflow-api-trigger', 'user-1', 'workspace-1', 'API trigger child', true),
        ('workflow-input-trigger', 'user-1', 'workspace-1', 'Input trigger child', true),
        ('workflow-publish', 'user-1', 'workspace-1', 'Publish child', true),
        ('workflow-live', 'user-1', 'workspace-1', 'Live consumer', true),
        ('workflow-deployed', 'user-1', 'workspace-1', 'Deployed consumer', true),
        ('workflow-both', 'user-1', 'workspace-1', 'Both consumer', true),
        ('workflow-other-org', 'user-2', 'workspace-2', 'Other tenant', true)`,
      `insert into custom_block (
        id, organization_id, workflow_id, type, name, description, inputs, outputs, enabled
      ) values
        (
          'block-starter', 'org-1', 'workflow-starter', 'custom_block_target', 'Starter', '',
          '[{"id":"starter-field","placeholder":"Paris","required":true}]',
          '[{"blockId":"answer","path":"result","name":"answer"}]',
          true
        ),
        (
          'block-start', 'org-1', 'workflow-start', 'custom_block_start', 'Start', '',
          '[]', '[]', true
        ),
        (
          'block-start-trigger', 'org-1', 'workflow-start-trigger',
          'custom_block_start_trigger', 'Start trigger', '', '[]', '[]', true
        ),
        (
          'block-api-trigger', 'org-1', 'workflow-api-trigger',
          'custom_block_api_trigger', 'API trigger', '', '[]', '[]', true
        ),
        (
          'block-input-trigger', 'org-1', 'workflow-input-trigger',
          'custom_block_input_trigger', 'Input trigger', '', '[]', '[]', true
        ),
        (
          'block-mismatch', 'org-1', 'workflow-other-org',
          'custom_block_mismatch', 'Must not leak', 'private description', '[]', '[]', true
        )`,
      `insert into workflow_deployment_version (id, workflow_id, version, state, is_active) values
        (
          'deployment-starter', 'workflow-starter', 1,
          '{"blocks":{"trigger":{"type":"starter","subBlocks":{"inputFormat":{"value":[{"id":"starter-field","name":"Starter field","type":"string","description":"Destination"}]}}}}}',
          true
        ),
        (
          'deployment-start', 'workflow-start', 1,
          '{"blocks":{"trigger":{"type":"start","config":{"params":{"inputFormat":[{"id":"start-field","name":"Start field","type":"number"}]}}}}}',
          true
        ),
        (
          'deployment-start-trigger', 'workflow-start-trigger', 1,
          '{"blocks":{"trigger":{"type":"start_trigger","subBlocks":{"inputFormat":{"value":[{"id":"start-trigger-field","name":"Start trigger field","type":"boolean"}]}}}}}',
          true
        ),
        (
          'deployment-api-trigger', 'workflow-api-trigger', 1,
          '{"blocks":{"trigger":{"type":"api_trigger","config":{"params":{"inputFormat":[{"id":"api-trigger-field","name":"API trigger field","type":"json"}]}}}}}',
          true
        ),
        (
          'deployment-input-trigger', 'workflow-input-trigger', 1,
          '{"blocks":{"trigger":{"type":"input_trigger","subBlocks":{"inputFormat":{"value":[{"id":"input-trigger-field","name":"Input trigger field","type":"string"}]}}}}}',
          true
        ),
        (
          'deployment-publish', 'workflow-publish', 1,
          '{"blocks":{"trigger":{"type":"starter","subBlocks":{"inputFormat":{"value":[{"id":"publish-field","name":"Publish field","type":"string"}]}}}}}',
          true
        ),
        (
          'deployment-usage', 'workflow-deployed', 1,
          '{"blocks":{"placed":{"type":"custom_block_target"}}}',
          true
        ),
        (
          'deployment-both', 'workflow-both', 1,
          '{"blocks":{"placed":{"type":"custom_block_target"}}}',
          true
        ),
        (
          'deployment-other', 'workflow-other-org', 1,
          '{"blocks":{"placed":{"type":"custom_block_target"}}}',
          true
        )`,
      `insert into workflow_blocks (id, workflow_id, type) values
        ('live-1', 'workflow-live', 'custom_block_target'),
        ('both-1', 'workflow-both', 'custom_block_target'),
        ('other-1', 'workflow-other-org', 'custom_block_target')`,
    ]) {
      await db.execute(sql.raw(statement))
    }

    const repository = createDrizzleCustomBlockRepository()
    await expect(repository.findWorkspaceOrganization('workspace-1')).resolves.toBe('org-1')
    await expect(repository.findWorkspaceOrganization('missing')).resolves.toBeUndefined()

    const rows = await repository.listWithInputs('org-1')
    expect(rows).toHaveLength(5)
    expect(rows.map((row) => row.id).sort()).toEqual([
      'block-api-trigger',
      'block-input-trigger',
      'block-start',
      'block-start-trigger',
      'block-starter',
    ])
    expect(
      Object.fromEntries(
        rows.map((row) => [
          row.id,
          row.inputFields.map((field) => ({
            id: field.id,
            name: field.name,
            type: field.type,
          })),
        ])
      )
    ).toEqual({
      'block-api-trigger': [{ id: 'api-trigger-field', name: 'API trigger field', type: 'json' }],
      'block-input-trigger': [
        { id: 'input-trigger-field', name: 'Input trigger field', type: 'string' },
      ],
      'block-start': [{ id: 'start-field', name: 'Start field', type: 'number' }],
      'block-start-trigger': [
        { id: 'start-trigger-field', name: 'Start trigger field', type: 'boolean' },
      ],
      'block-starter': [{ id: 'starter-field', name: 'Starter field', type: 'string' }],
    })
    expect(rows.find((row) => row.id === 'block-starter')).toMatchObject({
      workspaceId: 'workspace-1',
      inputFields: [
        {
          id: 'starter-field',
          name: 'Starter field',
          type: 'string',
          description: 'Destination',
          placeholder: 'Paris',
          required: true,
        },
      ],
      exposedOutputs: [{ blockId: 'answer', path: 'result', name: 'answer' }],
    })
    expect(JSON.stringify(rows)).not.toContain('Must not leak')
    expect(JSON.stringify(rows)).not.toContain('private description')

    await expect(repository.findManageContext('block-mismatch')).resolves.toBeNull()
    await expect(
      repository.update('block-mismatch', 'org-1', { name: 'Attacker mutation' })
    ).resolves.toBe(false)
    await expect(repository.delete('block-mismatch', 'org-1')).resolves.toBe(false)
    const mismatchRows = await db.execute(
      sql`select name from custom_block where id = 'block-mismatch'`
    )
    expect(mismatchRows).toEqual([{ name: 'Must not leak' }])

    await expect(repository.countUsages('org-1', 'custom_block_target')).resolves.toEqual({
      usageCount: 3,
      deployedUsageCount: 2,
    })
    await expect(repository.countUsages('org-2', 'custom_block_target')).resolves.toEqual({
      usageCount: 1,
      deployedUsageCount: 1,
    })

    const observedQueries: string[] = []
    const countedClient = postgres(process.env.DATABASE_URL!, {
      prepare: false,
      fetch_types: false,
      max: 4,
      debug(_connection, query) {
        observedQueries.push(query)
      },
    })
    const countedDatabase = drizzle(countedClient, { schema: databaseSchema }) as typeof db
    const countedRepository = createDrizzleCustomBlockRepository({ database: countedDatabase })
    try {
      let offset = observedQueries.length
      await countedRepository.listWithInputs('org-1')
      expect(observedQueries.slice(offset)).toHaveLength(1)

      await db.execute(
        sql.raw(`insert into workflow (id, user_id, workspace_id, name, is_deployed)
          select 'workflow-scale-' || candidate, 'user-1', 'workspace-1',
            'Scale ' || candidate, true
          from generate_series(1, 25) candidate`)
      )
      await db.execute(
        sql.raw(`insert into custom_block (
          id, organization_id, workflow_id, type, name, description, inputs, outputs, enabled
        )
          select 'block-scale-' || candidate, 'org-1', 'workflow-scale-' || candidate,
            'custom_block_scale_' || candidate, 'Scale ' || candidate, '', '[]', '[]', true
          from generate_series(1, 25) candidate`)
      )
      offset = observedQueries.length
      await expect(countedRepository.listWithInputs('org-1')).resolves.toHaveLength(30)
      expect(observedQueries.slice(offset)).toHaveLength(1)

      offset = observedQueries.length
      await countedRepository.countUsages('org-1', 'custom_block_target')
      expect(observedQueries.slice(offset)).toHaveLength(2)

      await db.execute(
        sql.raw(`insert into workflow (id, user_id, workspace_id, name, is_deployed)
          select 'workflow-usage-scale-' || candidate, 'user-1', 'workspace-1',
            'Usage Scale ' || candidate, true
          from generate_series(1, 25) candidate`)
      )
      await db.execute(
        sql.raw(`insert into workflow_blocks (id, workflow_id, type)
          select 'usage-scale-' || candidate, 'workflow-usage-scale-' || candidate,
            'custom_block_target'
          from generate_series(1, 25) candidate`)
      )
      offset = observedQueries.length
      await expect(countedRepository.countUsages('org-1', 'custom_block_target')).resolves.toEqual({
        usageCount: 28,
        deployedUsageCount: 2,
      })
      expect(observedQueries.slice(offset)).toHaveLength(2)
      expect(
        observedQueries
          .slice(offset)
          .every((query) => query.trimStart().toLowerCase().startsWith('select'))
      ).toBe(true)
    } finally {
      await countedClient.end({ timeout: 1 })
    }

    await expect(
      repository.update('block-starter', 'org-1', { enabled: false, name: 'Renamed' })
    ).resolves.toBe(true)
    await expect(repository.findManageContext('block-starter')).resolves.toMatchObject({
      name: 'Renamed',
    })

    await expect(
      repository.publish({
        id: 'bad',
        type: 'custom_block_bad',
        organizationId: 'org-1',
        workspaceId: 'workspace-2',
        workflowId: 'workflow-starter',
        userId: 'user-1',
        name: 'Bad',
        description: '',
      })
    ).rejects.toThrow('own workspace')

    await expect(repository.delete('block-starter', 'org-1')).resolves.toBe(true)
    await expect(repository.findManageContext('block-starter')).resolves.toBeNull()
  })

  it('publishes an eligible deployed workflow and hydrates its active snapshot', async () => {
    const { createDrizzleCustomBlockRepository } = await import(
      '@/infrastructure/postgres/repositories/drizzle-custom-block-repository'
    )
    const repository = createDrizzleCustomBlockRepository()
    const published = await repository.publish({
      id: 'block-new',
      type: 'custom_block_new',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      workflowId: 'workflow-publish',
      userId: 'user-1',
      name: 'New',
      description: 'Description',
    })
    expect(published).toMatchObject({
      id: 'block-new',
      organizationId: 'org-1',
      workflowId: 'workflow-publish',
      workspaceId: 'workspace-1',
      inputFields: [
        expect.objectContaining({
          id: 'publish-field',
          name: 'Publish field',
        }),
      ],
    })
  })
})
