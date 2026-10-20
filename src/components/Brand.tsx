interface BrandMarkProps {
  size?: number
}

/** Signe de marque vectoriel (même dessin que public/mizanga-mark.svg), coloré par --accent. */
export function BrandMark({ size = 26 }: BrandMarkProps) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 128 128" aria-hidden="true">
      <rect width="128" height="128" rx="32" fill="var(--accent)" />
      <path d="M35 42c0-9 7-16 16-16h20c9 0 16 7 16 16v18c0 9-7 16-16 16H57l-13 12V76c-5-3-9-9-9-16V42Z" fill="#F9FBFF" />
      <circle cx="89" cy="36" r="8" fill="#F9FBFF" />
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
