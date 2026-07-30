import { createInternalExecutionObjectReadHandler } from '@/lib/api/server/internal-execution-object-read'
import { createSimTraceExecutionObjectReader } from '@/lib/api/server/sim-trace-execution-object-reader'
import { env } from '@/lib/core/config/env'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const handler = createInternalExecutionObjectReadHandler({
  internalToken: env.INTERNAL_EXECUTION_TOKEN || env.INTERNAL_API_SECRET,
  objects: createSimTraceExecutionObjectReader(),
})

export const POST = handler
