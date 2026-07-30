'use client'

import { useParams } from 'next/navigation'
import { useApprovals, useDecideApproval } from '@/hooks/queries/approvals'

export default function ApprovalsPage() {
  const params = useParams<{ workspaceId: string }>()
  const workspaceId = params.workspaceId
  const approvals = useApprovals(workspaceId, undefined, 'pending_for_me')
  const decide = useDecideApproval()

  return (
    <main className='mx-auto flex w-full max-w-5xl flex-col gap-6 p-6'>
      <header>
        <h1 className='font-semibold text-2xl'>Approvals</h1>
        <p className='text-muted-foreground text-sm'>Pending approval tasks assigned to you.</p>
      </header>
      {approvals.isLoading ? <p>Loading approvals…</p> : null}
      {approvals.error ? (
        <p role='alert' className='text-red-600'>
          {approvals.error.message}
        </p>
      ) : null}
      <section className='grid gap-3'>
        {approvals.data?.map((approval) => {
          const task = approval.tasks.find((candidate) => candidate.canAct)
          return (
            <article key={approval.id} className='rounded-lg border p-4'>
              <div className='flex items-start justify-between gap-4'>
                <div>
                  <h2 className='font-medium'>{approval.title}</h2>
                  <p className='mt-1 text-muted-foreground text-sm'>{approval.content}</p>
                </div>
                <span className='rounded bg-muted px-2 py-1 text-xs'>{approval.status}</span>
              </div>
              {task ? (
                <div className='mt-4 flex gap-2'>
                  <button
                    type='button'
                    className='rounded bg-foreground px-3 py-2 text-background text-sm'
                    disabled={decide.isPending}
                    onClick={() =>
                      decide.mutate({
                        approvalId: approval.id,
                        taskId: task.id,
                        action: 'approve',
                      })
                    }
                  >
                    Approve
                  </button>
                  <button
                    type='button'
                    className='rounded border px-3 py-2 text-sm'
                    disabled={decide.isPending}
                    onClick={() =>
                      decide.mutate({
                        approvalId: approval.id,
                        taskId: task.id,
                        action: 'reject',
                        comment: 'Rejected from approval center',
                      })
                    }
                  >
                    Reject
                  </button>
                </div>
              ) : null}
            </article>
          )
        })}
        {!approvals.isLoading && approvals.data?.length === 0 ? (
          <p className='rounded-lg border border-dashed p-8 text-center text-muted-foreground'>
            No pending approvals.
          </p>
        ) : null}
      </section>
    </main>
  )
}
