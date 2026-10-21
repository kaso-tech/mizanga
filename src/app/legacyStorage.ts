// L’application s’appelait Mizanga : ses données locales étaient enregistrées sous des clés « mizanga.* ».
// Au premier lancement sous le nom Gilli, elles sont reprises sous « gilli.* » pour que personne ne perde
// son historique, ses préférences ou ses consignes.

const LEGACY_PREFIX = 'mizanga.'
const PREFIX = 'gilli.'
const KEYS = ['conversations.v1', 'preferences.v1', 'prompts.v1', 'evaluation.v1', 'engine.v1']

/** Reprend les anciennes données sans jamais écraser une donnée déjà enregistrée sous le nouveau nom. */
export function migrateLegacyStorage(storage: Storage | undefined = globalThis.localStorage) {
  if (!storage) return
  for (const key of KEYS) {
    try {
      const legacy = storage.getItem(LEGACY_PREFIX + key)
      if (legacy === null) continue
      if (storage.getItem(PREFIX + key) === null) storage.setItem(PREFIX + key, legacy)
      storage.removeItem(LEGACY_PREFIX + key)
    } catch {
      // Stockage indisponible ou plein : l’ancienne donnée reste en place et sera reprise plus tard.
    }
  }
}
