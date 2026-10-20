import { describe, expect, it } from 'vitest'
import { prepareAttachments } from './attachments'
import { encodeWav, formatDuration } from './voiceRecording'

const readBytes = (blob: Blob) => new Promise<Uint8Array>((resolve) => {
  const reader = new FileReader()
  reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
  reader.readAsArrayBuffer(blob)
})

describe('voiceRecording', () => {
  it('encode un WAV PCM 16 bits mono valide', async () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 0.5]), 16_000)
    expect(wav.type).toBe('audio/wav')
    const bytes = await readBytes(wav)
    const view = new DataView(bytes.buffer)
    const text = (offset: number, length: number) => String.fromCharCode(...bytes.slice(offset, offset + length))
    expect(text(0, 4)).toBe('RIFF')
    expect(text(8, 4)).toBe('WAVE')
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(16_000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(8)
    expect([1, 2, 3].map((index) => view.getInt16(44 + index * 2, true))).toEqual([32767, -32768, 16383])
  })

  it('formate les durées et accepte les fichiers audio sous leurs différents noms', async () => {
    expect(formatDuration(75)).toBe('1:15')
    const { attachments } = await prepareAttachments([
      new File(['x'], 'chanson.mp3', { type: 'audio/mpeg' }),
      new File(['x'], 'note.m4a', { type: '' }),
    ], [])
    expect(attachments.map((attachment) => attachment.mimeType)).toEqual(['audio/mp3', 'audio/aac'])
  })
})
