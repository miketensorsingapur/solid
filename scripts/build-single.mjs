// Собирает приложение в один файл dist/index.html (JS и CSS внутри) без Vite — только esbuild.
// Запуск: npm run build:single
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const result = await build({
  entryPoints: [join(root, 'src/main.tsx')],
  bundle: true,
  write: false,
  outdir: join(root, 'dist'),
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  minify: true,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
});

const js = result.outputFiles.find((f) => f.path.endsWith('.js'))?.text;
const css = result.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
if (!js) throw new Error('esbuild не вернул JS-бандл');

const template = await readFile(join(root, 'index.html'), 'utf8');
const entryTag = '<script type="module" src="/src/main.tsx"></script>';
if (!template.includes(entryTag)) throw new Error('В index.html не найден тег входной точки');

// «</script» внутри JS закрыло бы тег раньше времени.
const safeJs = js.replace(/<\/script/gi, '<\\/script');
const html = template
  .replace('</head>', () => `    <style>${css}</style>\n  </head>`)
  .replace(entryTag, () => `<script>${safeJs}</script>`);

await mkdir(join(root, 'dist'), { recursive: true });
await writeFile(join(root, 'dist/index.html'), html, 'utf8');
console.log(`dist/index.html — ${(Buffer.byteLength(html) / 1024).toFixed(0)} КБ`);
