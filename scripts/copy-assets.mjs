// Copia a public/ los recursos que la app sirve desde su propio dominio
// (nada se descarga de CDNs de terceros en tiempo de ejecución).
import { cpSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`))
const publicDir = join(import.meta.dirname, '..', 'public')

// PDF.js: fuentes, CMaps, WASM e ICC
const pdfjs = pkgDir('pdfjs-dist')
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  cpSync(join(pdfjs, dir), join(publicDir, 'pdfjs', dir), { recursive: true })
}

// Tesseract.js: worker, motor WASM (solo variantes LSTM) y modelo de español
const tess = join(publicDir, 'tesseract')
mkdirSync(join(tess, 'core'), { recursive: true })
mkdirSync(join(tess, 'lang'), { recursive: true })
cpSync(join(pkgDir('tesseract.js'), 'dist', 'worker.min.js'), join(tess, 'worker.min.js'))
const core = pkgDir('tesseract.js-core')
for (const f of readdirSync(core).filter((f) => f.endsWith('-lstm.wasm.js'))) {
  cpSync(join(core, f), join(tess, 'core', f))
}
cpSync(join(pkgDir('@tesseract.js-data/spa'), '4.0.0_best_int', 'spa.traineddata.gz'), join(tess, 'lang', 'spa.traineddata.gz'))

console.log('Recursos de PDF.js y Tesseract copiados en public/')
