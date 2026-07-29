import { createLogger } from '@sim/logger'
import type { SandboxAuditSink } from '@/sandbox/interface/types'

const logger = createLogger('SandboxAudit')

export function createLoggerSandboxAudit(): SandboxAuditSink {
  return {
    record(record) {
      logger.info('Sandbox policy audit', {
        executionId: record.executionId,
        attempt: record.attempt,
        phase: record.phase,
        operation: record.operation,
        errorCode: record.errorCode,
        network: record.policy.network,
        filesystemMode: record.policy.filesystem.mode,
        readOnlyMountCount: record.policy.filesystem.readOnlyMounts.length,
        writableRoot: record.policy.filesystem.writableRoot,
        cpuTimeMs: record.policy.cpuTimeMs,
        memoryMiB: record.policy.memoryMiB,
        wallClockMs: record.policy.wallClockMs,
        maxInputBytes: record.policy.maxInputBytes,
        credentialRefs: record.policy.secrets.credentialRefs,
      })
    },
  }
}
