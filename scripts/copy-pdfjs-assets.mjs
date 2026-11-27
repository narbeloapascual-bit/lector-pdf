// Copia los recursos de PDF.js (fuentes, CMaps, WASM, ICC) a public/pdfjs
import { cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = dirname(require.resolve('pdfjs-dist/package.json'))
const dest = join(import.meta.dirname, '..', 'public', 'pdfjs')
mkdirSync(dest, { recursive: true })
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  cpSync(join(root, dir), join(dest, dir), { recursive: true })
}
console.log('Recursos de PDF.js copiados en public/pdfjs')
