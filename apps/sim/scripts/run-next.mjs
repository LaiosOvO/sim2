import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const nextCli = require.resolve('next/dist/bin/next')

process.env.SIM_RUNTIME_SERVICE = 'next'
await import('../../../scripts/runtime/assert-node-22.mjs')
process.argv = [process.execPath, nextCli, ...process.argv.slice(2)]

await import(pathToFileURL(nextCli).href)
