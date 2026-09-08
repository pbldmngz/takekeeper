// Vite plugin: the landing in Spanish at /es/, and the JSON-LD (app + FAQ) regenerated from the visible FAQ on both pages.
// English is index.html itself; Spanish is index.html with the hero, <main> and head metadata swapped from landing/es.html + es.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const SITE = 'https://takekeeper.com';
const DIR = path.dirname(fileURLToPath(import.meta.url));

interface Meta {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  appDescription: string;
  audience: string;
  ogImage?: string;
}

const EN: Meta = {
  title: 'Takekeeper: sort voice-over takes in your browser',
  description:
    'Drop an hour-long WAV of voice-over takes. Takekeeper cuts it at the silences, transcribes every take on your own GPU, matches each one to your script, and lets you keep the good ones line by line with the keyboard. Multi-pass lanes, junk detection, split, merge, trim, export straight into FL Studio or any DAW. Free, private, nothing uploaded.',
  ogTitle: 'Takekeeper: the takes worth keeping',
  ogDescription:
    'Take triage for voice actors. Split a session at the silences, transcribe on your GPU, sort takes line by line into passes with the keyboard, export the keepers. Runs in your browser, nothing uploaded.',
  appDescription:
    'Take triage for voice actors: split a long voice-over recording at the silences, transcribe every take with Whisper on your own GPU, match takes to script lines, sort them line by line into passes with the keyboard, fix cuts, and export the keepers as numbered WAV files. Runs entirely in the browser; nothing is uploaded.',
  audience: 'Voice actors, audiobook narrators, dubbing and ADR performers',
};

const read = (f: string) => fs.readFileSync(path.join(DIR, f), 'utf8');

function esParts() {
  const html = read('es.html');
  const hero = html.split('<!-- @hero -->')[1].split('<!-- @landing -->')[0].trim();
  const landing = html.split('<!-- @landing -->')[1].trim();
  return { hero, landing, meta: JSON.parse(read('es.json')) as Meta };
}

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const text = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
const cap = (s: string) => s.replace(/^([¿¡]?)(\p{L})/u, (_, p, c) => p + c.toUpperCase());

/** SoftwareApplication + FAQPage, the FAQ read from the page's <details> so it can never drift. */
function jsonLd(html: string, lang: 'en' | 'es', meta: Meta): string {
  const faq: Array<{ q: string; a: string }> = [];
  const re = /<details>\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>\s*<\/details>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) faq.push({ q: cap(text(m[1])), a: cap(text(m[2])) });
  const url = lang === 'es' ? `${SITE}/es/` : `${SITE}/`;
  const graph = [
    {
      '@type': 'SoftwareApplication',
      name: 'Takekeeper',
      url,
      inLanguage: lang,
      applicationCategory: 'MultimediaApplication',
      operatingSystem: 'Web browser (Chrome, Edge)',
      description: meta.appDescription,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      audience: { '@type': 'Audience', audienceType: meta.audience },
    },
    {
      '@type': 'FAQPage',
      inLanguage: lang,
      mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
  ];
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
}

function setTag(html: string, pattern: RegExp, replacement: string): string {
  if (!pattern.test(html)) throw new Error(`landing plugin: could not find ${pattern}`);
  return html.replace(pattern, replacement);
}

/** English index.html → the page in `lang`. Idempotent, so dev and build can both run it. */
export function localize(html: string, lang: 'en' | 'es'): string {
  const es = lang === 'es' ? esParts() : null;
  const meta = es ? es.meta : EN;
  const url = lang === 'es' ? `${SITE}/es/` : `${SITE}/`;

  if (es) {
    html = setTag(html, /<html lang="[a-z-]+">/, '<html lang="es">');
    html = setTag(html, /<title>[^<]*<\/title>/, `<title>${meta.title}</title>`);
    html = setTag(html, /<meta\s+name="description"\s+content="[^"]*"\s*\/>/, `<meta name="description" content="${attr(meta.description)}" />`);
    html = setTag(html, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`);
    html = setTag(html, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${attr(meta.ogTitle)}" />`);
    html = setTag(html, /<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${attr(meta.ogDescription)}" />`);
    html = setTag(html, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`);
    if (meta.ogImage) {
      html = setTag(html, /<meta property="og:image" content="[^"]*" \/>/, `<meta property="og:image" content="${meta.ogImage}" />`);
      html = setTag(html, /<meta name="twitter:image" content="[^"]*" \/>/, `<meta name="twitter:image" content="${meta.ogImage}" />`);
    }
    html = setTag(html, /<meta property="og:locale" content="[^"]*" \/>/, '<meta property="og:locale" content="es_ES" />');
    html = setTag(html, /<meta property="og:locale:alternate" content="[^"]*" \/>/, '<meta property="og:locale:alternate" content="en_US" />');
    html = setTag(html, /<!-- hero -->[\s\S]*?<!-- \/hero -->/, `<!-- hero -->\n${es.hero}\n      <!-- /hero -->`);
    html = setTag(html, /<main id="landing">[\s\S]*?<\/main>/, es.landing);
  }

  const ld = `<script type="application/ld+json">\n${jsonLd(html, lang, meta)}\n    </script>`;
  html = /<script type="application\/ld\+json">[\s\S]*?<\/script>/.test(html)
    ? html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, ld)
    : html.replace('</head>', `    ${ld}\n  </head>`);
  return html;
}

export function landingI18n(): Plugin {
  let root = '';
  let outDir = 'dist';
  return {
    name: 'takekeeper-landing-i18n',
    configResolved(c) {
      root = c.root;
      outDir = c.build.outDir;
    },
    // English page: keep the JSON-LD in sync with the FAQ.
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const lang = /<html lang="es">/.test(html) ? 'es' : 'en';
        return localize(html, lang);
      },
    },
    // Dev: /es/ served from index.html + landing/es.html, through Vite's own HTML pipeline.
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url !== '/es' && url !== '/es/' && url !== '/es/index.html') return next();
        try {
          const raw = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
          const html = await server.transformIndexHtml('/es/index.html', localize(raw, 'es'));
          res.setHeader('Content-Type', 'text/html');
          res.end(html);
        } catch (e) {
          next(e);
        }
      });
    },
    // Build: dist/es/index.html from the built dist/index.html (same asset URLs, they are absolute).
    closeBundle() {
      const built = path.join(root, outDir, 'index.html');
      if (!fs.existsSync(built)) return;
      const html = fs.readFileSync(built, 'utf8');
      const dir = path.join(root, outDir, 'es');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), localize(html, 'es'));
    },
  };
}
