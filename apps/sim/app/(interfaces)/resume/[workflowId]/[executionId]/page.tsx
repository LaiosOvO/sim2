import { pausedExecutionDetailV1Schema } from '@sim/api-contracts/execution-read'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { proxyW6ExecutionReadRequest } from '@/lib/api-proxy/w6-execution-read'
import ResumeExecutionPage from '@/app/(interfaces)/resume/[workflowId]/[executionId]/resume-page-client'

export const metadata: Metadata = {
  title: 'Resume Execution',
  robots: { index: false },
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PageParams {
  workflowId: string
  executionId: string
}

export default async function ResumeExecutionPageWrapper({
  params,
  searchParams,
}: {
  params: Promise<PageParams>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const resolvedParams = await params
  const resolvedSearchParams = await searchParams

  const { workflowId, executionId } = resolvedParams
  const initialContextIdParam = resolvedSearchParams?.contextId
  const initialContextId = Array.isArray(initialContextIdParam)
    ? initialContextIdParam[0]
    : initialContextIdParam

  const incomingHeaders = await headers()
  const response = await proxyW6ExecutionReadRequest(
    new Request(
      `http://sim-page.local/api/resume/${encodeURIComponent(workflowId)}/${encodeURIComponent(executionId)}`,
      { headers: incomingHeaders }
    ),
    'API-0282'
  )
  const detail = response.ok
    ? pausedExecutionDetailV1Schema.safeParse(await response.json()).data
    : undefined

  return (
    <ResumeExecutionPage
      params={resolvedParams}
      initialExecutionDetail={detail ?? null}
      initialContextId={initialContextId}
    />
  )
}
