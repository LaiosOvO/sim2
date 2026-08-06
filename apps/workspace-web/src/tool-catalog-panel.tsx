import { type CSSProperties, useMemo, useState } from 'react'
import catalog from '@sim/tool-catalog/generated/browser-summary'

interface ToolCatalogPanelProps {
  creationDisabled?: boolean
  onAdvanced: () => void
  onCreate: (type: string) => void
  onClose: () => void
}

export function ToolCatalogPanel({
  creationDisabled = false,
  onAdvanced,
  onClose,
  onCreate,
}: ToolCatalogPanelProps) {
  const [query, setQuery] = useState('')
  const items = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return catalog.items
      .filter((item) => !item.visibility.hideFromToolbar)
      .filter(
        (item) =>
          !normalized ||
          item.id.toLocaleLowerCase().includes(normalized) ||
          item.provider.toLocaleLowerCase().includes(normalized) ||
          item.display.name.toLocaleLowerCase().includes(normalized) ||
          item.display.description.toLocaleLowerCase().includes(normalized)
      )
      .slice(0, 80)
  }, [query])

  return (
    <aside className='catalog-panel' aria-label='Tool Catalog'>
      <header>
        <div>
          <strong>Tool Catalog</strong>
          <small>
            {catalog.items.length} entries ·{' '}
            {catalog.items.filter((item) => item.visibility.editorCreatable).length} safe templates
          </small>
        </div>
        <button aria-label='Close Tool Catalog' onClick={onClose} type='button'>
          ×
        </button>
      </header>
      <input
        aria-label='Search tools'
        onChange={(event) => setQuery(event.target.value)}
        placeholder='Search tools and integrations'
        value={query}
      />
      <div className='catalog-results'>
        {items.map((item) => (
          <article key={item.id}>
            <span
              style={
                {
                  '--catalog-color': item.display.bgColor || '#667085',
                } as CSSProperties
              }
            >
              {item.display.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{item.display.name}</strong>
              <small>
                {item.provider} · {item.display.category}
              </small>
              <p>{item.display.description}</p>
            </div>
            <button
              className='catalog-add'
              disabled={item.visibility.editorCreatable && creationDisabled}
              onClick={() => (item.visibility.editorCreatable ? onCreate(item.id) : onAdvanced())}
              title={
                item.visibility.editorCreatable
                  ? `Add ${item.display.name}`
                  : 'Open the advanced editor for this block type'
              }
              type='button'
            >
              {item.visibility.editorCreatable ? 'Add' : 'Advanced'}
            </button>
          </article>
        ))}
      </div>
    </aside>
  )
}
