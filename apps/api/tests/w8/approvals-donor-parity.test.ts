import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { approvalRoutesV1 } from '@sim/api-contracts/approvals'
import { describe, expect, it } from 'vitest'

const donorRoot = 'D:/polaris/apps/sim/app/api'
const donors = [
  [
    'API-0002',
    'approvals/[approvalId]/decisions/route.ts',
    'efd05c703434b23952f08b4d144a996c54094eefb21cd6de84c6cdccf8288c1a',
  ],
  [
    'API-0003',
    'approvals/[approvalId]/resume/route.ts',
    '03e84d8820947edcbb4121c41306cd731639a8be97591d638d7c60e97348fa79',
  ],
  [
    'API-0004',
    'approvals/audit-logs/route.ts',
    '221fa91297c2393f5eccb3660483fc24d69aced708cc5dd07428435788d32ecc',
  ],
  [
    'API-0005',
    'approvals/definitions/[definitionId]/versions/[versionId]/publish/route.ts',
    '9876ca2737c9dc3c562d326921ffc33c7d19b36fd705d1dfba95339b1496df58',
  ],
  [
    'API-0006',
    'approvals/definitions/[definitionId]/versions/route.ts',
    '0a164dfd2a2d3121c42d8043f12e2bdf25f1d6db695f202583bc98a8bd22adc1',
  ],
  [
    'API-0007',
    'approvals/definitions/route.ts',
    'e85a12fa2cc8b99e06550ad4c85d4424794713f964e912270c978439d2ddc687',
  ],
  [
    'API-0009',
    'approvals/route.ts',
    '02ed35c742721d8dba21b4ff505c5ec7123854a12e353d582aa6ec046b29619e',
  ],
  [
    'API-0010',
    'approvals/start/route.ts',
    'b857325babd1314d883391eec2750d9e17a6c6e59532010193fd82578d29c449',
  ],
] as const

describe('W8 Polaris donor parity anchors', () => {
  it('keeps every selected donor route pinned by SHA-256', async () => {
    for (const [inventoryId, path, expected] of donors) {
      const source = await readFile(`${donorRoot}/${path}`)
      expect(createHash('sha256').update(source).digest('hex'), inventoryId).toBe(expected)
    }
  })

  it('keeps the selected inventory ordered and exact', () => {
    expect(approvalRoutesV1.map((route) => route.inventoryId)).toEqual(
      donors.map(([inventoryId]) => inventoryId)
    )
  })
})
