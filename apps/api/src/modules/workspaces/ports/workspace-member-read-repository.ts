export interface WorkspaceMemberProfile {
  userId: string
  name: string
  image: string | null
}

export interface WorkspaceMemberReadRepository {
  listActiveMembers(workspaceId: string): Promise<readonly WorkspaceMemberProfile[]>
}
