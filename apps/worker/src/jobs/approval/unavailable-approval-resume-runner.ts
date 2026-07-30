import type { ApprovalResumeRunner } from '@/jobs/approval/types'

export function createUnavailableApprovalResumeRunner(reason: string): ApprovalResumeRunner {
  return {
    async execute() {
      throw new Error(reason)
    },
  }
}
