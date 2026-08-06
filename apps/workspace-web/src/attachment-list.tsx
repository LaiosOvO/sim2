import type { ChatAttachment } from './api'

interface AttachmentListProps {
  attachments: ChatAttachment[]
  onRemove?: (id: string) => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`
}

export function AttachmentList({ attachments, onRemove }: AttachmentListProps) {
  return (
    <div className='attachment-list' aria-label='Attachments'>
      {attachments.map((attachment) => {
        const content = (
          <>
            <span className='attachment-icon' aria-hidden='true'>
              {attachment.mediaType.startsWith('image/') ? '▧' : '⌑'}
            </span>
            <span className='attachment-copy'>
              <strong>{attachment.filename}</strong>
              <small>{formatSize(attachment.size)}</small>
            </span>
          </>
        )
        return (
          <div className='attachment' key={attachment.id}>
            {attachment.path ? (
              <a href={attachment.path} rel='noreferrer' target='_blank'>
                {content}
              </a>
            ) : (
              <span>{content}</span>
            )}
            {onRemove ? (
              <button
                aria-label={`Remove ${attachment.filename}`}
                onClick={() => onRemove(attachment.id)}
                type='button'
              >
                ×
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
