import type { Attachment } from '../domain/types'

export const MAX_ATTACHMENTS = 4
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024
export const MAX_TOTAL_ATTACHMENT_BYTES = 8 * 1024 * 1024
/** Les photos sont réduites à cette dimension avant l’envoi : moins de données mobiles, mêmes réponses. */
const MAX_IMAGE_SIDE = 1600

const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const documentTypes = ['application/pdf', 'text/plain', 'text/markdown', 'text/csv']
/** Formats audio acceptés par Gemini. */
const audioTypes = ['audio/wav', 'audio/mp3', 'audio/aac', 'audio/ogg', 'audio/flac']
export const acceptedTypes = [...imageTypes, ...documentTypes, ...audioTypes]
export const acceptAttribute = [...acceptedTypes, 'audio/mpeg', '.md', '.csv', '.txt', '.mp3', '.wav', '.m4a', '.ogg', '.flac'].join(',')

export const isImage = (attachment: Pick<Attachment, 'mimeType'>) => attachment.mimeType.startsWith('image/')
export const isAudio = (attachment: Pick<Attachment, 'mimeType'>) => attachment.mimeType.startsWith('audio/')

/** Noms de types audio que les navigateurs emploient pour les formats acceptés par Gemini. */
const audioAliases: Record<string, string> = {
  'audio/mpeg': 'audio/mp3',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/x-flac': 'audio/flac',
  'audio/x-aac': 'audio/aac',
  'audio/mp4': 'audio/aac',
  'audio/x-m4a': 'audio/aac',
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toLocaleString('fr', { maximumFractionDigits: 1 })} Mo`
}

/** Type MIME fiable : certains navigateurs laissent vide le type des fichiers .md ou .csv. */
function mimeTypeOf(file: File) {
  if (file.type) return file.type === 'image/jpg' ? 'image/jpeg' : audioAliases[file.type] ?? file.type
  const extension = file.name.split('.').pop()?.toLowerCase()
  const byExtension: Record<string, string> = { md: 'text/markdown', csv: 'text/csv', txt: 'text/plain', mp3: 'audio/mp3', wav: 'audio/wav', m4a: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac' }
  return byExtension[extension ?? ''] ?? ''
}

/** Contenu en base64, via FileReader (pris en charge partout, y compris par les navigateurs anciens). */
const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(blob)
})

/** Réduit une photo trop grande (JPEG qualité 0,85) ; les petites images et les GIF sont gardés tels quels. */
async function shrinkImage(file: File, mimeType: string): Promise<{ blob: Blob; mimeType: string }> {
  if (mimeType === 'image/gif' || typeof createImageBitmap !== 'function') return { blob: file, mimeType }
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.size <= 1024 * 1024) {
    bitmap.close()
    return { blob: file, mimeType }
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) return { blob: file, mimeType }
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  return blob && blob.size < file.size ? { blob, mimeType: 'image/jpeg' } : { blob: file, mimeType }
}

/**
 * Prépare les fichiers choisis. Renvoie les pièces jointes acceptées et, pour les autres,
 * une explication à montrer à l’utilisateur.
 */
export async function prepareAttachments(files: File[], current: Attachment[]): Promise<{ attachments: Attachment[]; problems: string[] }> {
  const attachments: Attachment[] = []
  const problems: string[] = []
  let total = current.reduce((sum, attachment) => sum + attachment.size, 0)

  for (const file of files) {
    if (current.length + attachments.length >= MAX_ATTACHMENTS) {
      problems.push(`${MAX_ATTACHMENTS} fichiers au plus par message.`)
      break
    }
    const mimeType = mimeTypeOf(file)
    if (!acceptedTypes.includes(mimeType)) {
      problems.push(`« ${file.name} » : format non pris en charge (photos, PDF, texte ou audio).`)
      continue
    }
    const { blob, mimeType: finalType } = isImage({ mimeType }) ? await shrinkImage(file, mimeType) : { blob: file, mimeType }
    if (blob.size > MAX_ATTACHMENT_BYTES) {
      problems.push(`« ${file.name} » dépasse ${formatSize(MAX_ATTACHMENT_BYTES)}.`)
      continue
    }
    if (total + blob.size > MAX_TOTAL_ATTACHMENT_BYTES) {
      problems.push(`Les fichiers joints ne peuvent pas dépasser ${formatSize(MAX_TOTAL_ATTACHMENT_BYTES)} au total.`)
      continue
    }
    total += blob.size
    attachments.push({
      id: `file-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`,
      name: file.name,
      mimeType: finalType,
      size: blob.size,
      data: await toBase64(blob),
    })
  }
  return { attachments, problems }
}
