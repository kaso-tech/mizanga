interface BrandMarkProps {
  size?: number
}

/**
 * Signe de marque vectoriel (même tracé que public/mizanga-mark.svg).
 * Anneau ouvert formant une bulle de dialogue, ponctué d'un point de
 * diacritique dans l'ouverture — le point « diacritique » du nom comme du
 * projet : une langue que les autres n'écrivent pas.
 */
export function BrandMark({ size = 26 }: BrandMarkProps) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 128 128" aria-hidden="true">
      <circle
        cx="64"
        cy="64"
        r="44"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="13"
        strokeLinecap="round"
        /* L'ouverture se situe en haut à droite : le motif se lit comme une
           bulle dont le sommet reste ouvert. */
        strokeDasharray="234 42"
      />
      <circle cx="100" cy="40" r="10" fill="var(--accent)" />
    </svg>
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