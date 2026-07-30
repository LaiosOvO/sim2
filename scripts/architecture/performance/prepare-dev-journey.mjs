import { access } from 'node:fs/promises'
import { chromium } from 'playwright'
import {
  ensurePerformanceDirectories,
  readJourneyConfig,
  storageStatePath,
} from './dev-performance-config.mjs'

const config = readJourneyConfig()
const email = process.env.PERF_EMAIL?.trim()
const password = process.env.PERF_PASSWORD

if (!email || !password) {
  throw new Error('PERF_EMAIL and PERF_PASSWORD are required and are never written to the report')
}

await ensurePerformanceDirectories()

const health = await fetch(`${config.baseUrl}/api/health`)
if (!health.ok) {
  throw new Error(`Health check failed with HTTP ${health.status}`)
}

const browser = await chromium.launch()
try {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${config.baseUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL((url) => url.pathname.startsWith('/workspace/'), { timeout: 30_000 })
  await context.storageState({ path: storageStatePath })
  await access(storageStatePath)
  process.stdout.write(`[perf] browser storage state saved to ${storageStatePath}\n`)
} finally {
  await browser.close()
}
