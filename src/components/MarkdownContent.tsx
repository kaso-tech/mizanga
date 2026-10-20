import { lazy, Suspense } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { hasMath, normalizeMath } from '../app/markdownMath'
import { markdownComponents } from './markdownComponents'

// KaTeX (formules) est chargé seulement quand une réponse contient une formule : le démarrage reste léger.
const MathMarkdown = lazy(() => import('./MathMarkdown'))

function PlainMarkdown({ content }: { content: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{content}</ReactMarkdown>
}

export function MarkdownContent({ content }: { content: string }) {
  if (!hasMath(content)) return <PlainMarkdown content={content} />
  return (
    <Suspense fallback={<PlainMarkdown content={content} />}>
      <MathMarkdown content={normalizeMath(content)} />
    </Suspense>
  )
}
