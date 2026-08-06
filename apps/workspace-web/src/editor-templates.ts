import type { EditorBlockTemplateDocumentV1, EditorBlockTemplateV1 } from '@sim/tool-catalog'

type TemplateLoader = () => Promise<{ default: unknown }>

const loaders: Record<string, TemplateLoader> = {
  '0': () => import('@sim/tool-catalog/generated/editor-block-templates/0'),
  '1': () => import('@sim/tool-catalog/generated/editor-block-templates/1'),
  '2': () => import('@sim/tool-catalog/generated/editor-block-templates/2'),
  '3': () => import('@sim/tool-catalog/generated/editor-block-templates/3'),
  '4': () => import('@sim/tool-catalog/generated/editor-block-templates/4'),
  '5': () => import('@sim/tool-catalog/generated/editor-block-templates/5'),
  '6': () => import('@sim/tool-catalog/generated/editor-block-templates/6'),
  '7': () => import('@sim/tool-catalog/generated/editor-block-templates/7'),
  '8': () => import('@sim/tool-catalog/generated/editor-block-templates/8'),
  '9': () => import('@sim/tool-catalog/generated/editor-block-templates/9'),
  a: () => import('@sim/tool-catalog/generated/editor-block-templates/a'),
  b: () => import('@sim/tool-catalog/generated/editor-block-templates/b'),
  c: () => import('@sim/tool-catalog/generated/editor-block-templates/c'),
  d: () => import('@sim/tool-catalog/generated/editor-block-templates/d'),
  e: () => import('@sim/tool-catalog/generated/editor-block-templates/e'),
  f: () => import('@sim/tool-catalog/generated/editor-block-templates/f'),
}

const documents = new Map<string, Promise<EditorBlockTemplateDocumentV1>>()

function templateBucket(type: string): string {
  let value = 0
  for (const character of type) value = (value * 31 + character.charCodeAt(0)) >>> 0
  return (value % 16).toString(16)
}

async function loadDocument(bucket: string): Promise<EditorBlockTemplateDocumentV1> {
  const loader = loaders[bucket]
  if (!loader) throw new Error(`Unknown editor template bucket: ${bucket}`)
  let document = documents.get(bucket)
  if (!document) {
    document = loader().then((module) => module.default as EditorBlockTemplateDocumentV1)
    documents.set(bucket, document)
  }
  return document
}

export async function loadEditorBlockTemplate(
  type: string
): Promise<EditorBlockTemplateV1 | undefined> {
  const document = await loadDocument(templateBucket(type))
  return document.templates.find((template) => template.type === type)
}
