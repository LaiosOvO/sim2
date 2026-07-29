const startedAt = performance.now()
const rssBefore = process.memoryUsage().rss

const [{ createApiApplication }, { createProductionApiOptions }] = await Promise.all([
  import('@/bootstrap/application/create-api-application'),
  import('@/bootstrap/composition/create-production-api-options'),
])
const application = createApiApplication(await createProductionApiOptions())
const response = await application.handle(new Request('http://127.0.0.1/api/health'))
const metrics = {
  schemaVersion: 1,
  runtime: 'node',
  status: response.status,
  coldStartMs: Number((performance.now() - startedAt).toFixed(2)),
  rssBytes: process.memoryUsage().rss,
  rssDeltaBytes: process.memoryUsage().rss - rssBefore,
  heapUsedBytes: process.memoryUsage().heapUsed,
}
process.stdout.write(`${JSON.stringify(metrics)}\n`)
process.exit(metrics.status === 200 ? 0 : 1)
