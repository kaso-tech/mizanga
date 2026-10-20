interface BrandMarkProps {
  size?: number
}

/** Signe de marque : le robot-bulle de Mizanga sur fond argile (public/brand/mark.png). */
export function BrandMark({ size = 32 }: BrandMarkProps) {
  return <img className="brand-mark" src="/brand/mark.png" width={size} height={size} alt="" aria-hidden="true" />
}

export function Brand() {
  return (
    <span className="brand">
      <BrandMark />
      <span className="brand-name">Mizanga</span>
    </span>
  )
}
