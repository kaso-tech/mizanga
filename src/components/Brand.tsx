interface BrandProps {
  compact?: boolean
}

export function Brand({ compact = false }: BrandProps) {
  return (
    <div className="brand" aria-label="Mooré AI">
      <span className="brand-mark" aria-hidden="true">
        <i />
        <b />
      </span>
      {!compact && (
        <span className="brand-name">
          Mooré <strong>AI</strong>
        </span>
      )}
    </div>
  )
}
