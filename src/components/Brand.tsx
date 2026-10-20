interface BrandMarkProps {
  size?: number
}

/** Signe de marque : deux arcs et un point sur un carré arrondi couleur argile (même tracé que public/mizanga-mark.svg). */
export function BrandMark({ size = 32 }: BrandMarkProps) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4 18c3-8 13-8 16 0" strokeLinecap="round" />
        <path d="M7 18c2-4.5 8-4.5 10 0" strokeLinecap="round" />
        <circle cx="12" cy="7" r="2.2" fill="currentColor" stroke="none" />
      </svg>
    </span>
  )
}

export function Brand() {
  return (
    <span className="brand">
      <BrandMark />
      <span className="brand-name">Mizanga</span>
    </span>
  )
}
