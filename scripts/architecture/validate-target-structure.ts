#!/usr/bin/env bun
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

interface PackageManifest {
  name?: string
  engines?: {
    node?: string
  }
  scripts?: {
    start?: string
    'start:sandbox'?: string
  }
  workspaces?: string[]
}

const root = path.resolve(import.meta.dir, '..', '..')

const requiredDirectories = [
  'apps/api',
  'apps/content-processor',
  'apps/desktop',
  'apps/docs',
  'apps/pii',
  'apps/realtime',
  'apps/sim',
  'apps/worker',
  'apps/api/src/infrastructure/postgres/repositories',
  'apps/api/src/modules/identity/application',
  'apps/api/src/modules/identity/interface',
  'apps/api/src/modules/identity/ports',
  'scripts/architecture/import-boundaries',
  'apps/api/src/modules/invitations/application',
  'apps/api/src/modules/invitations/interface',
  'apps/api/src/modules/invitations/ports',
  'apps/api/src/modules/organizations/application',
  'apps/api/src/modules/organizations/interface',
  'apps/api/src/modules/organizations/ports',
  'apps/api/src/modules/workspaces/application',
  'apps/api/src/modules/workspaces/interface',
  'apps/api/src/modules/workspaces/ports',
  'packages/api-contracts',
  'packages/execution-contracts',
  'packages/polaris-extension-sdk',
  'packages/tool-catalog',
  'extensions/biz/approval',
  'extensions/biz/delivery',
  'extensions/biz/hr',
  'extensions/biz/identity',
  'extensions/biz/operations',
  'extensions/biz/pm',
  'extensions/biz/risk',
  'extensions/infra/code-host',
  'extensions/infra/feishu-channel',
  'extensions/infra/llm-providers',
  'extensions/infra/meegle-connector',
  'extensions/infra/object-storage',
  'extensions/infra/sandbox',
  'extensions/infra/vector-search',
  'docs/architecture',
  'docs/goals',
  'docs/migration',
  'docs/specs',
  'docker',
  'helm/sim',
  'scripts/architecture',
] as const

const requiredFiles = [
  'AGENTS.md',
  'package.json',
  'tsconfig.json',
  'turbo.json',
  'apps/api/package.json',
  'apps/api/tsconfig.json',
  'apps/api/src/config/enterprise-runtime.ts',
  'apps/api/src/index.ts',
  'apps/api/src/infrastructure/postgres/repositories/drizzle-invitation-read-repository.ts',
  'apps/api/src/infrastructure/postgres/repositories/drizzle-organization-access-control-entitlement-reader.ts',
  'apps/api/src/infrastructure/postgres/repositories/drizzle-organization-workspace-read-repository.ts',
  'apps/api/src/infrastructure/postgres/repositories/drizzle-personal-identity-profile-repository.ts',
  'apps/api/src/infrastructure/postgres/repositories/drizzle-workspace-member-read-repository.ts',
  'apps/api/src/middleware/authentication/composition/create-production-request-authenticator.ts',
  'apps/api/src/modules/identity/index.ts',
  'apps/api/src/modules/invitations/index.ts',
  'apps/api/src/modules/invitations/application/list-workspace-invitations.ts',
  'apps/api/src/modules/invitations/interface/create-list-workspace-invitations-handler.ts',
  'apps/api/src/modules/organizations/index.ts',
  'apps/api/src/modules/organizations/application/list-organization-workspaces.ts',
  'apps/api/src/modules/organizations/interface/create-list-organization-workspaces-handler.ts',
  'apps/api/src/modules/workspaces/index.ts',
  'apps/api/src/modules/tenant-read/application/create-tenant-read-module.ts',
  'apps/api/src/modules/tenant-read/application/create-routed-tenant-read-backend.ts',
  'apps/api/src/modules/tenant-read/infrastructure/http-legacy-tenant-read-backend.ts',
  'apps/api/src/modules/tenant-read/infrastructure/native/github-stars-handler.ts',
  'apps/sim/lib/api-proxy/w2-tenant-read.ts',
  'apps/worker/package.json',
  'apps/worker/tsconfig.json',
  'apps/worker/src/index.ts',
  'apps/worker/src/roles/execution/start-execution-role.ts',
  'apps/worker/src/roles/sandbox/start-sandbox-role.ts',
  'apps/content-processor/package.json',
  'packages/api-contracts/src/index.ts',
  'packages/api-contracts/src/organizations.ts',
  'packages/db/migrations/0275_polaris_external_identity_read_model.sql',
  'extensions/biz/identity/src/personal-profile.ts',
  'scripts/architecture/import-boundaries/check-identity-module-boundary.ts',
  'packages/auth/src/request-context.ts',
  'packages/auth/src/authorization.ts',
  'packages/execution-contracts/src/index.ts',
  'packages/polaris-extension-sdk/src/index.ts',
  'packages/tool-catalog/src/index.ts',
] as const

const forbiddenSynonymDirectories = [
  'apps/web',
  'apps/mothership',
  'apps/operations-agent',
] as const

const expectedWorkspaces = [
  'apps/*',
  'packages/*',
  'extensions/biz/*',
  'extensions/infra/*',
] as const

async function exists(relativePath: string): Promise<boolean> {
  try {
    await access(path.join(root, relativePath))
    return true
  } catch {
    return false
  }
}

async function readManifest(relativePath: string): Promise<PackageManifest> {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8')) as PackageManifest
}

async function validateNodeRuntime(relativePath: string): Promise<string[]> {
  const manifest = await readManifest(relativePath)
  const failures: string[] = []
  if (manifest.engines?.node !== '>=22.19.0') {
    failures.push(`${relativePath}: engines.node must be >=22.19.0`)
  }
  if (!manifest.scripts?.start?.startsWith('node ')) {
    failures.push(`${relativePath}: production start script must invoke node`)
  }
  if (
    relativePath === 'apps/worker/package.json' &&
    !manifest.scripts?.['start:sandbox']?.startsWith('node ')
  ) {
    failures.push(`${relativePath}: production Sandbox start script must invoke node`)
  }
  return failures
}

async function main(): Promise<void> {
  const failures: string[] = []

  for (const relativePath of requiredDirectories) {
    if (!(await exists(relativePath))) failures.push(`missing directory: ${relativePath}`)
  }
  for (const relativePath of requiredFiles) {
    if (!(await exists(relativePath))) failures.push(`missing file: ${relativePath}`)
  }
  for (const relativePath of forbiddenSynonymDirectories) {
    if (await exists(relativePath)) failures.push(`forbidden synonym directory: ${relativePath}`)
  }

  const rootManifest = await readManifest('package.json')
  const actualWorkspaces = new Set(rootManifest.workspaces ?? [])
  for (const workspace of expectedWorkspaces) {
    if (!actualWorkspaces.has(workspace)) failures.push(`missing workspace glob: ${workspace}`)
  }

  failures.push(...(await validateNodeRuntime('apps/api/package.json')))
  failures.push(...(await validateNodeRuntime('apps/worker/package.json')))

  if (failures.length > 0) {
    for (const failure of failures) console.error(`- ${failure}`)
    throw new Error(`Target structure validation failed with ${failures.length} violation(s)`)
  }

  console.log(
    `Target structure OK: ${requiredDirectories.length} module roots, ${requiredFiles.length} required files, Node runtime contracts verified`
  )
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
