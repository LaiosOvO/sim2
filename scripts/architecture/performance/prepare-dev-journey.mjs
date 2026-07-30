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
  await page.goto(`${config.baseUrl}/login`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  })
  const emailInput = page.locator('#email')
  const passwordInput = page.locator('#password')
  const signInButton = page.getByRole('button', { name: 'Sign in', exact: true })
  for (let attempt = 1; attempt <= 120; attempt += 1) {
    await emailInput.fill('')
    await passwordInput.fill('')
    await emailInput.fill(email)
    await passwordInput.fill(password)
    await page.waitForTimeout(250)
    if (await signInButton.isEnabled()) break
  }
  if (!(await signInButton.isEnabled())) {
    throw new Error('Sign in form did not become interactive after hydration')
  }
  await signInButton.click({ timeout: 120_000 })
  await page.waitForURL(
    (url) => url.pathname === '/workspace' || url.pathname.startsWith('/workspace/'),
    { timeout: 120_000, waitUntil: 'commit' }
  )
  await context.storageState({ path: storageStatePath })
  await access(storageStatePath)
  process.stdout.write(`[perf] browser storage state saved to ${storageStatePath}\n`)
} finally {
  await browser.close()
}
