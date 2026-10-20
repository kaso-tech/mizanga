import { Check, Copy } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'

/** Bloc de code avec son langage et un bouton de copie. */
export function CodeBlock({ children }: { children?: ReactNode }) {
  const preRef = useRef<HTMLPreElement | null>(null)
  const [copied, setCopied] = useState(false)
  const [language, setLanguage] = useState('')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(preRef.current?.innerText ?? '')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="code-block">
      <div className="code-block-bar">
        <span>{language}</span>
        <button type="button" onClick={copy} aria-label={copied ? 'Code copié' : 'Copier le code'}>
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
      <pre
        ref={(element) => {
          preRef.current = element
          const match = element?.querySelector('code')?.className.match(/language-([\w+#-]+)/)
          if (match && match[1] !== language) setLanguage(match[1])
        }}
      >
        {children}
      </pre>
    </div>
  )
}
