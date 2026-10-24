import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { mockMatchMedia } from '../test/setup'
import type { Attachment } from '../domain/types'
import { Composer } from './Composer'

function renderComposer(initialValue = '', attachments: Attachment[] = []) {
  const onSend = vi.fn()
  const onAddFiles = vi.fn()
  function Harness() {
    const [value, setValue] = useState(initialValue)
    return (
      <Composer
        value={value}
        isGenerating={false}
        isDemonstration
        stopLabel="Arrêter"
        focusToken={0}
        attachments={attachments}
        isPreparingFiles={false}
        onAddFiles={onAddFiles}
        onRemoveAttachment={vi.fn()}
        onValueChange={setValue}
        onSend={onSend}
        onStop={vi.fn()}
        onNotify={vi.fn()}
      />
    )
  }
  render(<Harness />)
  return { onSend, onAddFiles, textarea: screen.getByRole('textbox', { name: 'Votre message' }) as HTMLTextAreaElement }
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

  it('ne propose plus de clavier de caractères spéciaux et invite à chercher un produit', () => {
    renderComposer('')
    expect(screen.queryByRole('button', { name: /Caractères/ })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Votre message' })).toHaveAttribute('placeholder', 'Que cherchez-vous ? Produit, budget, ville…')
  })

  it('permet d’envoyer une pièce jointe seule et transmet les fichiers collés', async () => {
    const photo: Attachment = { id: 'f1', name: 'photo.jpg', mimeType: 'image/jpeg', size: 2048, data: 'AAAA' }
    const { onSend, onAddFiles, textarea } = renderComposer('', [photo])
    expect(screen.getByRole('list', { name: 'Fichiers joints' })).toHaveTextContent('photo.jpg')
    const send = screen.getByRole('button', { name: 'Envoyer' })
    expect(send).toBeEnabled()
    await userEvent.click(send)
    expect(onSend).toHaveBeenCalledWith('')

    const file = new File(['bonjour'], 'notes.txt', { type: 'text/plain' })
    fireEvent.paste(textarea, { clipboardData: { files: [file], getData: () => '' } })
    expect(onAddFiles).toHaveBeenCalledWith([file])
  })
})
