const MINIMUM_NODE_VERSION = [22, 19, 0]

function parseVersion(version) {
  return version.split('.').map((part) => Number.parseInt(part, 10))
}

function isSupported(version) {
  const actual = parseVersion(version)
  for (let index = 0; index < MINIMUM_NODE_VERSION.length; index += 1) {
    if ((actual[index] ?? 0) > MINIMUM_NODE_VERSION[index]) return true
    if ((actual[index] ?? 0) < MINIMUM_NODE_VERSION[index]) return false
  }
  return true
}

if (!isSupported(process.versions.node)) {
  process.stderr.write(
    `[runtime] Node.js >=${MINIMUM_NODE_VERSION.join('.')} is required; received ${process.versions.node} (${process.execPath})\n`
  )
  process.exit(1)
}

const service = process.env.SIM_RUNTIME_SERVICE ?? process.cwd().split(/[\\/]/).at(-1) ?? 'unknown'
process.stdout.write(
  `[runtime] service=${service} runtime=node version=${process.versions.node} execPath=${process.execPath}\n`
)
