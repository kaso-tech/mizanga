import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { mockMatchMedia } from '../test/setup'
import { Composer } from './Composer'

function renderComposer(initialValue = '') {
  const onSend = vi.fn()
  function Harness() {
    const [value, setValue] = useState(initialValue)
    return (
      <Composer
        value={value}
        isGenerating={false}
        isDemonstration
        stopLabel="Arrêter"
        focusToken={0}
        onValueChange={setValue}
        onSend={onSend}
        onStop={vi.fn()}
        onNotify={vi.fn()}
      />
    )
  }
  render(<Harness />)
  return { onSend, textarea: screen.getByRole('textbox', { name: 'Votre message' }) as HTMLTextAreaElement }
}

describe('Composer', () => {
  it('envoie avec Entrée et passe à la ligne avec Maj+Entrée', async () => {
    const { onSend, textarea } = renderComposer()
    await userEvent.type(textarea, 'Bonjour{Shift>}{Enter}{/Shift}ɛ')
    expect(textarea.value).toBe('Bonjour\nɛ')
    await userEvent.keyboard('{Enter}')
    expect(onSend).toHaveBeenCalledWith('Bonjour\nɛ')
  })

  it('n’envoie pas pendant la composition d’un caractère (touches mortes, IME)', () => {
    const { onSend, textarea } = renderComposer('ã')
    fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true })
    fireEvent.keyDown(textarea, { key: 'Enter', keyCode: 229 })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('n’envoie pas avec Entrée sur écran tactile', async () => {
    mockMatchMedia((query) => query === '(pointer: coarse)')
    const { onSend, textarea } = renderComposer('Bonjour')
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('désactive l’envoi quand le champ est vide', () => {
    renderComposer('   ')
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled()
  })

  it('insère les caractères du mooré à la position du curseur', async () => {
    const { textarea } = renderComposer('ab')
    await userEvent.click(screen.getByRole('button', { name: 'Caractères du mooré' }))
    textarea.setSelectionRange(1, 1)
    await userEvent.click(screen.getByRole('button', { name: 'Insérer ʋ' }))
    expect(textarea.value).toBe('aʋb')
  })
})
