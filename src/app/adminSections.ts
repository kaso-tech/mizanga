import { BookOpenCheck, ClipboardCheck, Cpu, Flag, ShieldCheck, type LucideIcon } from 'lucide-react'

export type AdminSectionId = 'apercu' | 'moderation' | 'reference' | 'evaluation' | 'signalements'

/** Sections de la console d’administration (menu latéral de la console et onglets sur téléphone). */
export const adminSections: Array<{ id: AdminSectionId; label: string; icon: LucideIcon }> = [
  { id: 'apercu', label: 'Moteur', icon: Cpu },
  { id: 'moderation', label: 'Modération marketplace', icon: ShieldCheck },
  { id: 'reference', label: 'Référence du mooré', icon: BookOpenCheck },
  { id: 'evaluation', label: 'Évaluation', icon: ClipboardCheck },
  { id: 'signalements', label: 'Signalements', icon: Flag },
]

/** Section indiquée dans l’adresse (/admin#moderation), sinon la première. */
export function adminSectionFromHash(hash: string): AdminSectionId {
  const id = hash.replace(/^#/, '')
  return adminSections.find((section) => section.id === id)?.id ?? 'apercu'
}
