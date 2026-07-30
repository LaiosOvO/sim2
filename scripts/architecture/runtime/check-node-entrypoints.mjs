import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..', '..', '..')
const minimumNode = '>=22.19.0'

async function readPackage(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath, 'package.json'), 'utf8'))
}

const packages = {
  root: await readPackage('.'),
  next: await readPackage('apps/sim'),
  realtime: await readPackage('apps/realtime'),
  api: await readPackage('apps/api'),
  worker: await readPackage('apps/worker'),
}
const realtimeDockerfile = await readFile(path.join(root, 'docker', 'realtime.Dockerfile'), 'utf8')
const apiIndex = await readFile(path.join(root, 'apps', 'api', 'src', 'index.ts'), 'utf8')
const workerExecutionRole = await readFile(
  path.join(root, 'apps', 'worker', 'src', 'roles', 'execution', 'start-execution-role.ts'),
  'utf8'
)
const nextApiProxies = await Promise.all(
  ['w1.ts', 'w2-tenant-read.ts', 'w6-execution-read.ts'].map((file) =>
    readFile(path.join(root, 'apps', 'sim', 'lib', 'api-proxy', file), 'utf8')
  )
)

const failures = []
for (const [name, packageJson] of Object.entries(packages)) {
  if (packageJson.engines?.node !== minimumNode) {
    failures.push(`${name}: engines.node must be ${minimumNode}`)
  }
}

for (const service of ['realtime', 'api', 'worker']) {
  for (const scriptName of ['dev', 'start']) {
    const script = packages[service].scripts?.[scriptName] ?? ''
    if (!/\bnode\b/.test(script)) failures.push(`${service}:${scriptName} does not invoke Node`)
    if (/\bbun(?:\.exe)?\s+(?:--watch\s+)?(?:src|dist)\//.test(script)) {
      failures.push(`${service}:${scriptName} invokes application code through Bun`)
    }
    if (!script.includes('assert-node-22.mjs')) {
      failures.push(`${service}:${scriptName} does not preload the Node 22 runtime guard`)
    }
  }
}

for (const scriptName of ['dev', 'dev:minimal', 'dev:webpack', 'start']) {
  const script = packages.next.scripts?.[scriptName] ?? ''
  if (!script.includes('node scripts/run-next.mjs')) {
    failures.push(`next:${scriptName} does not use the explicit Node launcher`)
  }
}

if (!nextApiProxies.every((source) => source.includes("'http://127.0.0.1:3012'"))) {
  failures.push('next API proxies do not default to the isolated development API port 3012')
}
if (!apiIndex.includes("process.env.API_PORT ?? '3012'")) {
  failures.push('api:dev does not default to the isolated development port 3012')
}
if (!workerExecutionRole.includes("process.env.WORKER_PORT ?? '3013'")) {
  failures.push('worker:dev does not default to the isolated development port 3013')
}
for (const service of ['next', 'api', 'worker']) {
  if (packages[service].scripts.dev.includes('${')) {
    failures.push(`${service}:dev uses a shell-specific parameter expansion`)
  }
}
if (!realtimeDockerfile.includes('FROM node:22.20.0-alpine AS runner')) {
  failures.push('realtime Docker runner is not pinned to Node 22')
}
if (
  !realtimeDockerfile.includes(
    'CMD ["node", "--import", "./scripts/runtime/assert-node-22.mjs", "apps/realtime/dist/bootstrap.js"]'
  )
) {
  failures.push('realtime Docker CMD does not run the guarded Node build artifact')
}

for (const scriptName of ['dev:full', 'dev:full:minimal-registry', 'dev:full:webpack']) {
  const script = packages.root.scripts?.[scriptName] ?? ''
  for (const application of ['apps/sim', 'apps/realtime', 'apps/api', 'apps/worker']) {
    if (!script.includes(application)) failures.push(`${scriptName} does not start ${application}`)
  }
}

if (failures.length > 0) {
  process.stderr.write(
    `Node runtime entrypoint violations:\n${failures.map((item) => `- ${item}`).join('\n')}\n`
  )
  process.exit(1)
}

process.stdout.write(
  'Node 22 runtime entrypoint check passed for Next, Realtime, API, and Worker\n'
)
