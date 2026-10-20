import 'katex/dist/katex.min.css'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { markdownComponents } from './markdownComponents'

/** Markdown avec formules (KaTeX). Le dollar simple reste du texte : « 5 $ » n’est pas une formule. */
export default function MathMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
      rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
      components={markdownComponents}
    >
      {content}
    </ReactMarkdown>
  )
}
