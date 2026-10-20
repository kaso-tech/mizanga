import type { Components } from 'react-markdown'
import { CodeBlock } from './CodeBlock'

// Le HTML brut reste désactivé (comportement par défaut de react-markdown) : seul le Markdown est interprété.
export const markdownComponents: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  table: ({ node: _node, ...props }) => <div className="table-scroll"><table {...props} /></div>,
  pre: ({ node: _node, children }) => <CodeBlock>{children}</CodeBlock>,
}

