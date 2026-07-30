'use client'

import { type ComponentType, useEffect, useState } from 'react'
import { getCatalogSummaryItem } from '@/lib/catalog/client'

interface CatalogIconProps {
  id: string
  className?: string
}

type IconComponent = ComponentType<{ className?: string }>

let iconModulePromise: Promise<typeof import('@/components/icons')> | undefined

/**
 * Resolves a presentation-only integration icon from the generated catalog.
 * The icon module is loaded only when an integration chip is actually shown;
 * the Runtime Registry remains outside the workspace-home initial graph.
 */
export function CatalogIcon({ id, className }: CatalogIconProps) {
  const iconName = getCatalogSummaryItem(id)?.display.icon
  const [Icon, setIcon] = useState<IconComponent | null>(null)

  useEffect(() => {
    let active = true
    if (!iconName) {
      setIcon(null)
      return () => {
        active = false
      }
    }

    iconModulePromise ??= import('@/components/icons')
    void iconModulePromise.then((iconModule) => {
      const candidate = Reflect.get(iconModule, iconName)
      if (active && typeof candidate === 'function') {
        setIcon(() => candidate as IconComponent)
      }
    })

    return () => {
      active = false
    }
  }, [iconName])

  return Icon ? <Icon className={className} /> : null
}
