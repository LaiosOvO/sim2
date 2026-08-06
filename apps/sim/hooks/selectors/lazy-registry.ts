import type { SelectorDefinition, SelectorKey } from '@/hooks/selectors/types'

type SelectorGroup = Partial<Record<SelectorKey, SelectorDefinition>>

async function loadSelectorGroup(key: string): Promise<SelectorGroup | null> {
  const provider = key.split('.')[0]
  switch (provider) {
    case 'airtable':
      return (await import('@/hooks/selectors/providers/airtable/selectors')).airtableSelectors
    case 'asana':
      return (await import('@/hooks/selectors/providers/asana/selectors')).asanaSelectors
    case 'attio':
      return (await import('@/hooks/selectors/providers/attio/selectors')).attioSelectors
    case 'bigquery':
      return (await import('@/hooks/selectors/providers/bigquery/selectors')).bigquerySelectors
    case 'calcom':
      return (await import('@/hooks/selectors/providers/calcom/selectors')).calcomSelectors
    case 'clickup':
      return (await import('@/hooks/selectors/providers/clickup/selectors')).clickupSelectors
    case 'cloudwatch':
      return (await import('@/hooks/selectors/providers/cloudwatch/selectors')).cloudwatchSelectors
    case 'confluence':
      return (await import('@/hooks/selectors/providers/confluence/selectors')).confluenceSelectors
    case 'gmail':
    case 'google':
      return (await import('@/hooks/selectors/providers/google/selectors')).googleSelectors
    case 'jira':
      return (await import('@/hooks/selectors/providers/jira/selectors')).jiraSelectors
    case 'jsm':
      return (await import('@/hooks/selectors/providers/jsm/selectors')).jsmSelectors
    case 'knowledge':
      return (await import('@/hooks/selectors/providers/knowledge/selectors')).knowledgeSelectors
    case 'linear':
      return (await import('@/hooks/selectors/providers/linear/selectors')).linearSelectors
    case 'microsoft':
    case 'onedrive':
    case 'outlook':
      return (await import('@/hooks/selectors/providers/microsoft/selectors')).microsoftSelectors
    case 'monday':
      return (await import('@/hooks/selectors/providers/monday/selectors')).mondaySelectors
    case 'notion':
      return (await import('@/hooks/selectors/providers/notion/selectors')).notionSelectors
    case 'pipedrive':
      return (await import('@/hooks/selectors/providers/pipedrive/selectors')).pipedriveSelectors
    case 'sharepoint':
      return (await import('@/hooks/selectors/providers/sharepoint/selectors')).sharepointSelectors
    case 'slack':
      return (await import('@/hooks/selectors/providers/slack/selectors')).slackSelectors
    case 'trello':
      return (await import('@/hooks/selectors/providers/trello/selectors')).trelloSelectors
    case 'wealthbox':
      return (await import('@/hooks/selectors/providers/wealthbox/selectors')).wealthboxSelectors
    case 'webflow':
      return (await import('@/hooks/selectors/providers/webflow/selectors')).webflowSelectors
    case 'zoom':
      return (await import('@/hooks/selectors/providers/zoom/selectors')).zoomSelectors
    default:
      return null
  }
}

export async function loadSelectorDefinition(key: string): Promise<SelectorDefinition | null> {
  const group = await loadSelectorGroup(key)
  return group?.[key as SelectorKey] ?? null
}
