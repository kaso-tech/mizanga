// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { checkListingRules, looksLikeGibberish, normalize } from './rules.mjs'

describe('contrôle automatique des annonces (mots interdits, texte incompréhensible)', () => {
  it('laisse passer les annonces ordinaires', () => {
    const ordinary = [
      { title: 'Tecno Spark 20 neuf', description: 'Android 13, 8 Go de RAM, 256 Go, double SIM, garantie 6 mois.' },
      { title: 'Riz parfumé 25 kg', description: 'Riz de qualité, livraison possible à Ouagadougou.' },
      { title: 'Climatiseur LG 1,5 CV', description: 'Neuf, faible consommation.' },
      { title: 'Pagne wax hollandais 6 yards' },
      { title: 'Moto Sanili 125 cm3 avec papiers', description: 'Carte grise à jour.' },
      { title: 'Cartouche d’encre HP 305' },
      { title: 'Machette agricole', description: 'Pour le jardin et les champs.' },
      { title: 'Pompe à injection pour moteur diesel' },
      { title: 'Beurre de karité pur', description: 'Production locale, 1 kg.' },
    ]
    for (const listing of ordinary) expect(checkListingRules(listing), listing.title).toEqual({ suspicious: false, reasons: [] })
  })

  it('repère les produits interdits, même déguisés', () => {
    const cases = [
      ['Pistolet automatique', 'armes'],
      ['Vente de c0ca1ne pure', 'drogues'],
      ['T R A M A D O L 225 mg', 'médicaments'],
      ['Kalach neuve', 'armes'],
      ['Bébé à vendre', 'êtres humains'],
      ['Ivoire sculpté', 'espèces protégées'],
      ['Moto Jakarta sans papiers', 'volés'],
      ['Multiplication de billets garantie', 'faux documents'],
      ['Vente de dr0gue', 'drogues'], ['Kit de 4rme a feu', 'armes'],
    ]
    for (const [title, group] of cases) {
      const result = checkListingRules({ title })
      expect(result.suspicious, title).toBe(true)
      expect(result.reasons.join(' '), title).toContain(group)
    }
  })

  it('regarde aussi la description et les caractéristiques', () => {
    expect(checkListingRules({ title: 'Boîte cadeau', description: 'Contient du cannabis' }).suspicious).toBe(true)
    expect(checkListingRules({ title: 'Article', attributes: { modele: 'kalachnikov' } }).suspicious).toBe(true)
  })

  it('repère les textes incompréhensibles', () => {
    expect(looksLikeGibberish(normalize('xkcdqwrtz bvnmlkjh'))).toBe(true)
    expect(looksLikeGibberish(normalize('aaaaaaa tres bon produit'))).toBe(true)
    expect(looksLikeGibberish(normalize('Samsung Galaxy A15 SM-A155F 128 Go'))).toBe(false)
    expect(checkListingRules({ title: 'qsdfghjklm wxcvbnpq' }).reasons).toContain('Texte en partie incompréhensible.')
    expect(checkListingRules({ title: '!!! ??' }).reasons).toContain('Titre sans mot lisible.')
  })
})
