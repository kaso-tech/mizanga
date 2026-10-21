// Identité de la version compilée (numéro, commit Git, date), pour savoir quel code est réellement déployé.
// Calculée à la compilation (vite.config.ts) et écrite dans dist/version.json, que le serveur relit.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * @typedef {{ version: string, commit: string, builtAt: string }} BuildInfo
 */

/** Lit un fichier texte, ou renvoie une chaîne vide. @param {string} path */
const readText = (path) => {
  try {
    return readFileSync(path, 'utf8').trim()
  } catch {
    return ''
  }
}

/**
 * Commit courant, lu directement dans .git (l’outil git n’est pas installé dans l’image de compilation).
 * À défaut, la variable SOURCE_COMMIT, sinon « inconnu ».
 * @param {string} root
 */
export function readGitCommit(root, env = process.env) {
  const head = readText(join(root, '.git', 'HEAD'))
  let commit = head
  if (head.startsWith('ref: ')) {
    const ref = head.slice(5)
    commit = readText(join(root, '.git', ref))
    if (!commit) {
      const packed = readText(join(root, '.git', 'packed-refs')).split('\n').find((line) => line.endsWith(` ${ref}`))
      commit = packed?.split(' ')[0] ?? ''
    }
  }
  return /^[0-9a-f]{7,40}$/.test(commit) ? commit.slice(0, 7) : (env.SOURCE_COMMIT?.slice(0, 7) || 'inconnu')
}

/** @param {string} root @param {Date} [now] @returns {BuildInfo} */
export function computeBuildInfo(root, now = new Date()) {
  const { version = '0.0.0' } = JSON.parse(readText(join(root, 'package.json')) || '{}')
  return { version, commit: readGitCommit(root), builtAt: now.toISOString() }
}

/** Version écrite dans dist/version.json lors de la compilation. @param {string} distDir @returns {BuildInfo | null} */
export function readBuildInfo(distDir) {
  try {
    const info = JSON.parse(readText(join(distDir, 'version.json')))
    return typeof info?.version === 'string' && typeof info.commit === 'string' && typeof info.builtAt === 'string' ? info : null
  } catch {
    return null
  }
}
