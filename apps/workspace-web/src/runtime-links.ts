export function legacyHomeHref(
  nextOrigin: string,
  workspaceId: string,
  chatId: string | null
): string {
  const url = new URL(`/workspace/${encodeURIComponent(workspaceId)}/home`, nextOrigin)
  url.searchParams.set('runtime', 'next')
  if (chatId) url.searchParams.set('chatId', chatId)
  return url.toString()
}

export function legacyEditorHref(
  nextOrigin: string,
  workspaceId: string,
  workflowId: string
): string {
  const url = new URL(
    `/workspace/${encodeURIComponent(workspaceId)}/w/${encodeURIComponent(workflowId)}`,
    nextOrigin
  )
  url.searchParams.set('runtime', 'next')
  return url.toString()
}
