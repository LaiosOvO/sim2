import type { ResumePollCommandV1, ResumePollResultV1 } from '@sim/execution-contracts/resume-poll'

export interface ResumePoller {
  run(command: ResumePollCommandV1): Promise<ResumePollResultV1>
}
