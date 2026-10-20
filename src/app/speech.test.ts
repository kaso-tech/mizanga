import { describe, expect, it } from 'vitest'
import { splitForSpeech, toSpeechText } from './speech'

describe('toSpeechText', () => {
  it('retire la mise en forme Markdown sans toucher au texte', () => {
    expect(toSpeechText('## Titre\n\n- **Premier** point\n- *second* avec `code` et [lien](https://exemple.org)')).toBe('Titre\nPremier point\nsecond avec code et lien')
  })

  it('annonce les blocs de code et les formules au lieu de les lire', () => {
    expect(toSpeechText('Voici :\n```js\nconst a = 1\n```\nEt $$E = mc^2$$ fin.')).toBe('Voici :\n(bloc de code)\nEt (formule) fin.')
  })

  it('lit les tableaux ligne par ligne', () => {
    expect(toSpeechText('| Mot | Sens |\n| --- | --- |\n| a | b |')).toBe('Mot, Sens\na, b')
  })

  it('conserve les lettres du mooré', () => {
    expect(toSpeechText('Lettres ɛ, ɩ, ʋ et ã.')).toBe('Lettres ɛ, ɩ, ʋ et ã.')
  })
})

describe('splitForSpeech', () => {
  it('regroupe les phrases en morceaux courts coupés aux fins de phrase', () => {
    const chunks = splitForSpeech('Une phrase. Une autre phrase ! Encore une ?', 25)
    expect(chunks).toEqual(['Une phrase.', 'Une autre phrase !', 'Encore une ?'])
  })

  it('coupe une phrase trop longue', () => {
    expect(splitForSpeech('a'.repeat(50), 20)).toEqual(['a'.repeat(20), 'a'.repeat(20), 'a'.repeat(10)])
  })
})
