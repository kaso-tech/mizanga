import { useEffect, useRef, useState } from 'react'

/** Durée maximale d’un message vocal : 2 min en WAV 16 kHz mono ≈ 3,8 Mo, sous la limite par fichier. */
export const MAX_RECORDING_SECONDS = 120
const TARGET_SAMPLE_RATE = 16_000

export const isVoiceRecordingSupported = () =>
  typeof window !== 'undefined' && typeof window.MediaRecorder === 'function' && !!navigator.mediaDevices?.getUserMedia

/** Encode des échantillons mono en WAV PCM 16 bits, format accepté par Gemini (contrairement au WebM des navigateurs). */
export function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeText = (offset: number, text: string) => [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)))
  writeText(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  })
  return new Blob([buffer], { type: 'audio/wav' })
}

/** Convertit l’enregistrement du navigateur (WebM/Opus, MP4/AAC…) en WAV mono 16 kHz. */
async function toWav(recording: Blob) {
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await recording.arrayBuffer())
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE)), TARGET_SAMPLE_RATE)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    return encodeWav(rendered.getChannelData(0), TARGET_SAMPLE_RATE)
  } finally {
    void context.close()
  }
}

export const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

/**
 * Enregistrement d’un message vocal. `onRecorded` reçoit un fichier WAV prêt à être joint ;
 * `onError` reçoit une explication en français (micro refusé, indisponible…).
 */
export function useVoiceRecording({ onRecorded, onError }: { onRecorded: (file: File) => void; onError: (message: string) => void }) {
  const [state, setState] = useState<'idle' | 'recording' | 'processing'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const cancelledRef = useRef(false)
  const timerRef = useRef<number>()
  const callbacks = useRef({ onRecorded, onError })
  callbacks.current = { onRecorded, onError }

  const cleanup = () => {
    window.clearInterval(timerRef.current)
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop())
    recorderRef.current = null
  }

  useEffect(() => () => {
    cancelledRef.current = true
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    cleanup()
  }, [])

  const start = async () => {
    if (state !== 'idle') return
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
      callbacks.current.onError(denied
        ? 'Accès au micro refusé. Autorisez le micro pour ce site dans les réglages du navigateur.'
        : 'Aucun micro utilisable n’a été trouvé sur cet appareil.')
      return
    }
    const chunks: Blob[] = []
    const recorder = new MediaRecorder(stream)
    recorderRef.current = recorder
    cancelledRef.current = false
    const startedAt = Date.now()
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = async () => {
      const seconds = (Date.now() - startedAt) / 1000
      cleanup()
      if (cancelledRef.current || chunks.length === 0) {
        setState('idle')
        return
      }
      setState('processing')
      try {
        const wav = await toWav(new Blob(chunks, { type: recorder.mimeType }))
        callbacks.current.onRecorded(new File([wav], `Message vocal (${formatDuration(seconds)}).wav`, { type: 'audio/wav' }))
      } catch {
        callbacks.current.onError('L’enregistrement n’a pas pu être converti. Réessayez ou envoyez un fichier audio.')
      } finally {
        setState('idle')
      }
    }
    recorder.start(250)
    setElapsed(0)
    setState('recording')
    timerRef.current = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000)
      setElapsed(seconds)
      if (seconds >= MAX_RECORDING_SECONDS && recorder.state === 'recording') recorder.stop()
    }, 250)
  }

  const stop = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  const cancel = () => {
    cancelledRef.current = true
    stop()
  }

  return { state, elapsed, start, stop, cancel }
}
