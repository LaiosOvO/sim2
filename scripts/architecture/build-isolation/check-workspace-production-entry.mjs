import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..', '..', '..')
const files = {
  compose: await readFile(path.join(root, 'docker-compose.prod.yml'), 'utf8'),
  nextImage: await readFile(path.join(root, 'docker', 'app.Dockerfile'), 'utf8'),
  gateway: await readFile(path.join(root, 'docker', 'workspace-gateway.conf'), 'utf8'),
  gatewayImage: await readFile(path.join(root, 'docker', 'workspace-gateway.Dockerfile'), 'utf8'),
  nodeServiceImage: await readFile(path.join(root, 'docker', 'node-service.Dockerfile'), 'utf8'),
  realtimeImage: await readFile(path.join(root, 'docker', 'realtime.Dockerfile'), 'utf8'),
}
const failures = []

function serviceBlock(name) {
  const match = files.compose.match(
    new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z][a-z0-9-]*:\\n|\\nvolumes:)`)
  )
  return match?.[1] ?? ''
}

for (const [name, source] of Object.entries(files)) {
  if (source.includes('5173')) failures.push(`${name} exposes the Vite development port`)
}
for (const service of ['workspace-gateway:', 'api:', 'worker:', 'realtime:']) {
  if (!files.compose.includes(service)) failures.push(`production compose is missing ${service}`)
}
for (const route of ['/api/workspace-bootstrap', '/api/', '/socket.io/', '/workspace/']) {
  if (!files.gateway.includes(route)) failures.push(`gateway is missing ${route}`)
}
if (!files.compose.includes("'3000:8080'")) {
  failures.push('only the Workspace gateway may publish production port 3000')
}
for (const service of ['simstudio', 'api', 'worker', 'realtime']) {
  const block = serviceBlock(service)
  if (!block.includes('expose:')) failures.push(`${service} must remain internal with expose`)
  if (block.includes('ports:')) failures.push(`${service} must not publish a host port`)
  if (!block.includes('healthcheck:'))
    failures.push(`${service} is missing a production healthcheck`)
}
if (!serviceBlock('workspace-gateway').includes("      - '3000:8080'")) {
  failures.push('Workspace gateway is not the public production entry')
}
if (!files.gateway.includes('WORKSPACE_NEXT_FALLBACK')) {
  failures.push('gateway is missing the explicit Next Workspace exit gate')
}
if (!/WORKSPACE_NEXT_FALLBACK=\$\{WORKSPACE_NEXT_FALLBACK:-1\}/.test(files.compose)) {
  failures.push('Next Workspace fallback must default to enabled')
}
if (
  [serviceBlock('simstudio'), serviceBlock('realtime')].some((block) => block.includes(':latest'))
) {
  failures.push('production application services must not use latest images')
}
if (!files.gatewayImage.includes('node:22.20.0')) {
  failures.push('Workspace builder is not pinned to Node 22.20.0')
}
if (!files.nodeServiceImage.includes('node:22.20.0')) {
  failures.push('API/Worker runtime image is not pinned to Node 22.20.0')
}
if (
  !files.nextImage.includes('node:22.20.0') ||
  !files.nextImage.includes('CMD ["node", "--import"') ||
  !files.nextImage.includes('--target=node')
) {
  failures.push('Next production runtime is not pinned to Node 22.20.0')
}
if (
  !files.realtimeImage.includes('node:22.20.0') ||
  !files.realtimeImage.includes('CMD ["node", "--import"')
) {
  failures.push('Realtime production runtime is not pinned to Node 22.20.0')
}
for (const dockerfile of [
  'docker/app.Dockerfile',
  'docker/realtime.Dockerfile',
  'docker/node-service.Dockerfile',
]) {
  if (!files.compose.includes(`dockerfile: ${dockerfile}`)) {
    failures.push(`production compose does not build ${dockerfile} from this source`)
  }
}

if (failures.length > 0) {
  process.stderr.write(
    `Workspace production entry violations:\n${failures.map((item) => `- ${item}`).join('\n')}\n`
  )
  process.exit(1)
}

process.stdout.write('Workspace production gateway check passed\n')
