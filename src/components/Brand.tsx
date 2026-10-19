interface BrandProps {
  compact?: boolean
}

export function Brand({ compact = false }: BrandProps) {
  return (
    <div className="brand" aria-label="Mizanga">
      <span className="brand-mark" aria-hidden="true">
        <i />
        <b />
      </span>
      {!compact && <span className="brand-name">Mizanga</span>}
    </div>
  )
}
