import path from 'node:path'

const generatedRoots = [
  path.resolve('packages/api-contracts/generated'),
  path.resolve('packages/tool-catalog/generated'),
  path.resolve('apps/sim/app/_styles/tailwind.generated.css'),
]

function isGeneratedArtifact(file) {
  const absolute = path.resolve(file)
  return generatedRoots.some((root) => {
    const relative = path.relative(root, absolute)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
  })
}

export default {
  '*.{js,jsx,ts,tsx,json,css,scss}': (files) => {
    const inputs = files.filter((file) => !isGeneratedArtifact(file))
    if (inputs.length === 0) return []
    const quotedInputs = inputs.map((file) => JSON.stringify(file)).join(' ')
    return `biome check --write --no-errors-on-unmatched --files-ignore-unknown=true ${quotedInputs}`
  },
}
