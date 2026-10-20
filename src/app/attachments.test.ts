import { describe, expect, it } from 'vitest'
import { MAX_ATTACHMENTS, formatSize, prepareAttachments } from './attachments'

const fileOf = (name: string, type: string, size = 10) => new File([new Uint8Array(size).fill(65)], name, { type })

describe('prepareAttachments', () => {
  it('encode les fichiers acceptés et reconnaît les .md sans type', async () => {
    const { attachments, problems } = await prepareAttachments([fileOf('cours.pdf', 'application/pdf', 3), fileOf('notes.md', '')], [])
    expect(problems).toEqual([])
    expect(attachments.map(({ name, mimeType, size, data }) => ({ name, mimeType, size, data }))).toEqual([
      { name: 'cours.pdf', mimeType: 'application/pdf', size: 3, data: 'QUFB' },
      { name: 'notes.md', mimeType: 'text/markdown', size: 10, data: 'QUFBQUFBQUFBQQ==' },
    ])
  })

  it('refuse les formats non pris en charge, les fichiers trop lourds et l’excédent', async () => {
    const { attachments, problems } = await prepareAttachments([
      fileOf('setup.exe', 'application/x-msdownload'),
      fileOf('scan.pdf', 'application/pdf', 5 * 1024 * 1024),
    ], [])
    expect(attachments).toEqual([])
    expect(problems[0]).toContain('format non pris en charge')
    expect(problems[1]).toContain('dépasse 4 Mo')

    const full = Array.from({ length: MAX_ATTACHMENTS }, (_, index) => ({ id: `${index}`, name: 'a.txt', mimeType: 'text/plain', size: 1 }))
    const result = await prepareAttachments([fileOf('b.txt', 'text/plain')], full)
    expect(result.attachments).toEqual([])
    expect(result.problems[0]).toContain('4 fichiers au plus')
  })

  it('affiche les tailles en français', () => {
    expect(formatSize(512)).toBe('512 o')
    expect(formatSize(2048)).toBe('2 Ko')
    expect(formatSize(1.5 * 1024 * 1024)).toBe('1,5 Mo')
  })
})
