// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { computeBuildInfo, readBuildInfo, readGitCommit } from './build-info.mjs'
import { createApiHandler } from './chat-handler.mjs'

/** @type {string[]} */
const dirs = []
/** @type {import('node:http').Server[]} */
const servers = []
const makeDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'build-info-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  for (const server of servers.splice(0)) server.close()
})

const sha = '0123456789abcdef0123456789abcdef01234567'

describe('version déployée', () => {
  it('lit le commit dans .git, y compris dans packed-refs, sinon SOURCE_COMMIT', () => {
    const loose = makeDir()
    mkdirSync(join(loose, '.git', 'refs', 'heads'), { recursive: true })
    writeFileSync(join(loose, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    writeFileSync(join(loose, '.git', 'refs', 'heads', 'main'), `${sha}\n`)
    expect(readGitCommit(loose, {})).toBe('0123456')

    const packed = makeDir()
    mkdirSync(join(packed, '.git'))
    writeFileSync(join(packed, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    writeFileSync(join(packed, '.git', 'packed-refs'), `# pack-refs\n${sha} refs/heads/main\n`)
    expect(readGitCommit(packed, {})).toBe('0123456')

    expect(readGitCommit(makeDir(), { SOURCE_COMMIT: 'fedcba9876' })).toBe('fedcba9')
    expect(readGitCommit(makeDir(), {})).toBe('inconnu')
  })

  it('écrit puis relit la version de la compilation', () => {
    const root = makeDir()
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.2.3' }))
    const info = computeBuildInfo(root, new Date('2026-10-21T10:00:00Z'))
    expect(info).toMatchObject({ version: '1.2.3', builtAt: '2026-10-21T10:00:00.000Z' })
    writeFileSync(join(root, 'version.json'), JSON.stringify(info))
    expect(readBuildInfo(root)).toEqual(info)
    expect(readBuildInfo(makeDir())).toBeNull()
  })

  it('annonce la version par /api/health', async () => {
    const version = { version: '1.2.3', commit: 'abc1234', builtAt: '2026-10-21T10:00:00.000Z' }
    const handler = createApiHandler({ version })
    const server = createServer((req, res) => void handler(req, res))
    servers.push(server)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
    const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port
    expect(await (await fetch(`http://127.0.0.1:${port}/api/health`)).json()).toEqual({ engine: 'demo', liteModel: false, version })
  })
})
