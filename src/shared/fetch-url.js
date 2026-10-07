/**
 * fetchUrl — retrieve and text-extract a web page.
 *
 * searchWeb gives the model titles and snippets; this gives it the page body
 * when a snippet is not enough. Extraction strips scripts, styles, nav, and
 * boilerplate, then collapses whitespace so a 300KB HTML page becomes a few
 * KB of readable prose. That reduction is the main token lever here: sending
 * raw HTML would spend most of the budget on markup.
 */

const DEFAULT_MAX_CHARS = 8000;
const TIMEOUT_MS = 20_000;
const MAX_RAW_BYTES = 3_000_000;

const STRIP_ELEMENTS = [
  'script', 'style', 'noscript', 'svg', 'canvas', 'iframe', 'object', 'embed',
  'nav', 'header', 'footer', 'aside', 'form', 'button', 'template',
];

/** Elements whose content is never prose. Stripped together with their text. */
const BOILERPLATE = /^\s*<[^>]*(comment|ad|advert|sidebar|footer|nav|cookie|consent|subscribe|newsletter|social|share|related|breadcrumb|pagination)[^>]*>/i;

function decodeEntities(text) {
  // The quote and apostrophe entities are written as escapes rather than as
  // `'"'` / `"'"`: this repo's `quotes` rule is plain `single` with no
  // `avoidEscape`, so a literal quote inside a single-quoted literal is
  // reported. Same approach as risk-ledger.js's DOUBLE_QUOTE.
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '\u0022', apos: '\u0027', nbsp: ' ', ndash: '–',
    mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  };
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => named[name.toLowerCase()] ?? m);
}

function safeCodePoint(code) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

function stripBoilerplate(html) {
  let out = html;
  for (const tag of STRIP_ELEMENTS) {
    out = out.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}\\s*>`, 'gi'), ' ');
    // Unclosed / self-closing variants.
    out = out.replace(new RegExp(`<${tag}\\b[^>]*/?>`, 'gi'), ' ');
  }
  out = out.replace(/<!--[\s\S]*?-->/g, ' ');
  return out;
}

/** Crude but effective: drop class/id hints for known boilerplate containers. */
function dropBoilerplateContainers(html) {
  let out = html;
  const re = /<(\w+)([^>]*(?:class|id)\s*=\s*["'][^"']*(?:sidebar|footer|header|nav|menu|comment|share|related|advert|banner|promo|cookie)[^"']*["'][^>]*)>/gi;
  let match;
  while ((match = re.exec(out)) !== null) {
    const tag = match[1];
    const rest = out.slice(re.lastIndex);
    const close = rest.search(new RegExp(`</${tag}\\s*>`, 'i'));
    if (close === -1) continue;
    const end = re.lastIndex + close;
    out = out.slice(0, match.index) + ' ' + out.slice(end + match[0].length - match[0].length + tag.length + 3);
    re.lastIndex = match.index + 1;
  }
  return out;
}

export function htmlToText(html) {
  if (typeof html !== 'string') return '';
  let text = stripBoilerplate(html);
  text = text.replace(BOILERPLATE, ' ');
  // Preserve paragraph and list boundaries so the model sees structure.
  text = text.replace(/<\/(p|div|section|article|h[1-6]|li|tr|blockquote|pre)\s*>/gi, '\n\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<li\b[^>]*>/gi, '\n- ');
  text = text.replace(/<[^>]+>/g, ' ');
  text = decodeEntities(text);
  // The last character in the class is U+00A0 (non-breaking space), not a plain
  // space. That is the point: `&nbsp;` decodes to one, and without collapsing it
  // every word on a scraped page arrives glued to its neighbour. eslint's
  // `no-irregular-whitespace` flags it, so it is suppressed with the reason
  // rather than "fixed" into a bug.
  // eslint-disable-next-line no-irregular-whitespace
  text = text.replace(/[ \t\f\v ]+/g, ' ');
  text = text.replace(/ *\n */g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

/**
 * Extract the main content region when the page advertises one (article,
 * main, [role=main], or the largest of several article elements). Falls back to
 * the whole cleaned body.
 */
function extractMain(html) {
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (article?.[1]) return article[1];
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (main?.[1]) return main[1];
  const roleMain = html.match(/<(\w+)[^>]*role\s*=\s*["']main["'][^>]*>([\s\S]*?)<\/\1>/i);
  if (roleMain?.[2]) return roleMain[2];
  return html;
}

/**
 * @param {{url: string, maxChars?: number}} input
 * @returns {Promise<{url: string, title: string, text: string, truncated: boolean}>}
 */
export async function fetchUrl(input = {}) {
  const raw = typeof input.url === 'string' ? input.url.trim() : '';
  if (!raw) throw new Error('url is required');
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }
  const maxChars = Number.isInteger(input.maxChars) ? Math.min(Math.max(input.maxChars, 500), 40000) : DEFAULT_MAX_CHARS;

  const res = await fetch(parsed.toString(), {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'follow',
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; sentinel-cli/3.3.0; +https://github.com/KunjShah95/SENTINEL-CLI)',
      accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

  const contentType = res.headers.get('content-type') || '';
  const body = (await res.text()).slice(0, MAX_RAW_BYTES);

  if (contentType.includes('application/json')) {
    let text = body;
    try {
      text = JSON.stringify(JSON.parse(body), null, 0);
    } catch {
      /* keep raw */
    }
    return finish(parsed.toString(), '', text, maxChars);
  }

  const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].replace(/<[^>]+>/g, '')).trim() : '';

  let text = htmlToText(extractMain(dropBoilerplateContainers(body)));
  if (text.length < 200) {
    // The container heuristics may have stripped too much (or the page may be
    // JS-rendered). Retry against the whole cleaned body before giving up.
    text = htmlToText(body);
  }
  return finish(parsed.toString(), title, text, maxChars);
}

function finish(url, title, text, maxChars) {
  const truncated = text.length > maxChars;
  return {
    url,
    title,
    text: truncated ? `${text.slice(0, maxChars)}\n…[truncated ${text.length - maxChars} chars]` : text,
    truncated,
  };
}
