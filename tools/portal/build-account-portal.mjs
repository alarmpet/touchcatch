import console from 'node:console';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

/**
 * Renders the public account portal from the legal sources.
 *
 * Google Play will not accept the app without a privacy-policy URL and a data-deletion URL that
 * work for someone who has not installed it and is not signed in. Those pages have to say the
 * same thing the app does, and the way that stays true is to have one source: the markdown in
 * docs/legal, the machine-derived data inventory next to it, and the human-decided facts in
 * operator-identity.v1.json. This renders them; the gate checks the rendered output has not
 * drifted from the sources.
 *
 * Deliberately dependency-free. A markdown library would be a new supply-chain edge on the one
 * artifact that has to be reviewable line by line, and the input is our own prose in a subset we
 * control. The renderer therefore refuses anything it does not understand instead of guessing --
 * a silently mangled clause in a privacy policy is worse than a failed build.
 *
 * Modes:
 *   (none)         write the site
 *   --check        fail if the written site differs from the sources (gate stage)
 *   --publishable  additionally fail while any human-decided fact is still UNRESOLVED
 */

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const legalDir = path.join(repoRoot, 'docs', 'legal');
const outDir = path.join(repoRoot, 'apps', 'account-portal', 'public');

const UNRESOLVED = 'UNRESOLVED';

/** One page per Play requirement, plus the index that links them. */
const pages = [
  { slug: '', source: null, title: 'TouchCatch', nav: null },
  { slug: 'privacy', source: 'privacy-policy.md', title: '개인정보처리방침', nav: '개인정보처리방침' },
  { slug: 'terms', source: 'terms-of-service.md', title: '이용약관', nav: '이용약관' },
  {
    slug: 'account-deletion',
    source: 'account-deletion-notice.md',
    title: '계정 및 데이터 삭제',
    nav: '계정 삭제',
  },
  { slug: 'support', source: 'support.md', title: '문의', nav: '문의' },
];

function fail(message) {
  console.error(`account-portal: ${message}`);
  process.exit(1);
}

/** Reads `a.b.c` out of the identity document. Missing paths are a bug, not a placeholder. */
function readPath(root, dotted) {
  let node = root;
  for (const key of dotted.split('.')) {
    if (node === null || typeof node !== 'object' || !(key in node)) return undefined;
    node = node[key];
  }
  return node;
}

/**
 * An unresolved fact renders as a marker a human cannot miss rather than as an empty string.
 *
 * A blank where the retention period should be reads as "we did not think about it"; a loud
 * placeholder reads as "this is not finished", which is the truth while it is unfilled.
 */
function placeholder(dotted) {
  return `<mark class="unresolved">[미정: ${escapeHtml(dotted)}]</mark>`;
}

const unresolvedSeen = new Set();

function resolveToken(identity, dotted) {
  if (dotted === 'processors') return renderProcessors(identity);

  // urls.absoluteX is origin + urls.x, so a page can link to a sibling without the source
  // markdown repeating the host.
  const absolute = /^urls\.absolute(?<name>[A-Za-z]+)$/u.exec(dotted);
  if (absolute) {
    const key = absolute.groups.name[0].toLowerCase() + absolute.groups.name.slice(1);
    const origin = readPath(identity, 'urls.origin');
    const suffix = readPath(identity, `urls.${key}`);
    if (suffix === undefined) fail(`unknown url token urls.${key}`);
    if (origin === UNRESOLVED) {
      unresolvedSeen.add('urls.origin');
      return placeholder('urls.origin');
    }
    return escapeHtml(String(origin).replace(/\/$/u, '') + suffix);
  }

  const value = readPath(identity, dotted);
  if (value === undefined) fail(`unknown token {{${dotted}}} in a legal source`);
  if (value === UNRESOLVED) {
    unresolvedSeen.add(dotted);
    return placeholder(dotted);
  }
  if (value === null) fail(`token {{${dotted}}} resolves to null; give it a value or stop using it`);
  return escapeHtml(String(value));
}

function renderProcessors(identity) {
  const rows = identity.processors.map((processor) => {
    const region =
      processor.regionStatus === UNRESOLVED
        ? placeholder(`processors.${processor.name}.regionStatus`)
        : escapeHtml(processor.regionStatus);
    if (processor.regionStatus === UNRESOLVED) {
      unresolvedSeen.add(`processors.${processor.name}.regionStatus`);
    }
    return `<tr><td>${escapeHtml(processor.name)}</td><td>${escapeHtml(processor.role)}</td><td>${processor.dataCategories
      .map((c) => escapeHtml(c))
      .join(', ')}</td><td>${region}</td></tr>`;
  });
  return [
    '<table><thead><tr><th>수탁자</th><th>위탁 업무</th><th>이전 항목</th><th>처리 지역</th></tr></thead><tbody>',
    ...rows,
    '</tbody></table>',
  ].join('\n');
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Inline markdown: links, bold, code. Applied after escaping, so it never re-opens injection. */
function renderInline(text) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/gu, (_, code) => `<code>${code}</code>`);
  html = html.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/gu,
    (_, label, href) => `<a href="${href}">${label}</a>`,
  );
  html = html.replace(/\*\*([^*]+)\*\*/gu, (_, bold) => `<strong>${bold}</strong>`);
  return html;
}

/**
 * The markdown subset these documents use. Anything else stops the build.
 *
 * Supported: HTML comments, ATX headings, unordered and ordered lists, pipe tables, blockquotes,
 * paragraphs, and a bare `{{token}}` line that expands to a block (the processor table).
 */
function renderMarkdown(markdown, expand) {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n');
  const out = [];
  let index = 0;

  const inline = (text) => renderInline(text).replace(/\{\{([^}]+)\}\}/gu, (_, token) => expand(token.trim()));

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    if (line.startsWith('<!--')) {
      while (index < lines.length && !lines[index].includes('-->')) index += 1;
      index += 1;
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/u.exec(line);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    // A line that is only a token expands to whatever block that token renders.
    const soleToken = /^\{\{([^}]+)\}\}$/u.exec(line.trim());
    if (soleToken) {
      out.push(expand(soleToken[1].trim()));
      index += 1;
      continue;
    }

    if (line.startsWith('| ')) {
      const table = [];
      while (index < lines.length && lines[index].startsWith('|')) {
        table.push(lines[index]);
        index += 1;
      }
      out.push(renderTable(table, inline));
      continue;
    }

    if (line.startsWith('> ')) {
      const quote = [];
      while (index < lines.length && lines[index].startsWith('>')) {
        quote.push(lines[index].replace(/^>\s?/u, ''));
        index += 1;
      }
      out.push(`<blockquote>${inline(quote.join(' ').trim())}</blockquote>`);
      continue;
    }

    if (/^[-*]\s+/u.test(line) || /^\d+\.\s+/u.test(line)) {
      const ordered = /^\d+\.\s+/u.test(line);
      const items = [];
      while (index < lines.length && (/^[-*]\s+/u.test(lines[index]) || /^\d+\.\s+/u.test(lines[index]))) {
        let item = lines[index].replace(/^([-*]|\d+\.)\s+/u, '');
        index += 1;
        // Continuation lines are indented under their item.
        while (index < lines.length && /^\s{2,}\S/u.test(lines[index])) {
          item += ' ' + lines[index].trim();
          index += 1;
        }
        items.push(`<li>${inline(item)}</li>`);
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>\n${items.join('\n')}\n</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }

    if (line.startsWith('#') || line.startsWith('```') || line.startsWith('    ')) {
      fail(`unsupported markdown construct: ${line.slice(0, 60)}`);
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim() !== '' && !/^[#>|]|^[-*]\s|^\d+\.\s/u.test(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    out.push(`<p>${inline(paragraph.join(' '))}</p>`);
  }

  return out.join('\n');
}

function renderTable(rows, inline) {
  const cells = (row) =>
    row
      .replace(/^\|/u, '')
      .replace(/\|$/u, '')
      .split('|')
      .map((cell) => cell.trim());
  const header = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  return [
    '<table>',
    `<thead><tr>${header.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`,
    '<tbody>',
    ...body.map((row) => `<tr>${row.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`),
    '</tbody>',
    '</table>',
  ].join('\n');
}

function layout({ title, body, nav, activeSlug }) {
  const links = pages
    .filter((page) => page.nav)
    .map((page) => {
      const href = `/${page.slug}/`;
      const current = page.slug === activeSlug ? ' aria-current="page"' : '';
      return `<a href="${href}"${current}>${escapeHtml(page.nav)}</a>`;
    })
    .join('\n        ');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · TouchCatch</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header>
    <a class="brand" href="/">TouchCatch</a>
    <nav>
        ${links}
    </nav>
  </header>
  <main>
${body}
  </main>
  <footer>
    <p>${escapeHtml(nav ?? 'TouchCatch')}</p>
  </footer>
</body>
</html>
`;
}

const styles = `:root {
  color-scheme: light dark;
  --bg: #fdfcfa;
  --fg: #1d1b18;
  --muted: #5f5b54;
  --line: #e3ded6;
  --accent: #b4522a;
  --mark-bg: #ffe8b0;
  --mark-fg: #6b4b00;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #171614;
    --fg: #ece8e1;
    --muted: #a29c92;
    --line: #33302b;
    --accent: #e6884f;
    --mark-bg: #5c4300;
    --mark-fg: #ffe9b8;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 16px/1.75 -apple-system, "Segoe UI", "Noto Sans KR", system-ui, sans-serif;
  word-break: keep-all;
}
header {
  display: flex; flex-wrap: wrap; gap: 1rem 1.5rem; align-items: baseline;
  padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--line);
}
.brand { font-weight: 700; font-size: 1.05rem; color: var(--fg); text-decoration: none; }
nav { display: flex; flex-wrap: wrap; gap: 1rem; }
nav a { color: var(--muted); text-decoration: none; font-size: 0.9rem; }
nav a:hover, nav a[aria-current] { color: var(--accent); }
main { max-width: 46rem; margin: 0 auto; padding: 2rem 1.5rem 4rem; }
h1 { font-size: 1.7rem; line-height: 1.3; margin: 0 0 1.5rem; }
h2 { font-size: 1.2rem; margin: 2.5rem 0 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--line); }
h3 { font-size: 1.02rem; margin: 1.75rem 0 0.5rem; }
p, li { color: var(--fg); }
a { color: var(--accent); }
ul, ol { padding-left: 1.3rem; }
li { margin: 0.35rem 0; }
code { background: var(--line); padding: 0.1em 0.35em; border-radius: 3px; font-size: 0.88em; }
blockquote { margin: 1.5rem 0; padding: 0.75rem 1rem; border-left: 3px solid var(--accent); background: color-mix(in srgb, var(--accent) 7%, transparent); }
blockquote p { margin: 0; }
.table-scroll, main > table { display: block; overflow-x: auto; }
table { border-collapse: collapse; width: 100%; margin: 1.25rem 0; font-size: 0.92rem; }
th, td { border: 1px solid var(--line); padding: 0.5rem 0.7rem; text-align: left; vertical-align: top; }
th { background: color-mix(in srgb, var(--fg) 5%, transparent); font-weight: 600; }
mark.unresolved { background: var(--mark-bg); color: var(--mark-fg); font-weight: 600; padding: 0.05em 0.3em; border-radius: 3px; }
footer { border-top: 1px solid var(--line); padding: 1.5rem; color: var(--muted); font-size: 0.85rem; }
footer p { margin: 0; }
.cards { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); list-style: none; padding: 0; }
.cards li { margin: 0; }
.cards a { display: block; padding: 1rem 1.1rem; border: 1px solid var(--line); border-radius: 8px; text-decoration: none; }
.cards a:hover { border-color: var(--accent); }
.cards strong { display: block; color: var(--fg); }
.cards span { color: var(--muted); font-size: 0.87rem; }
`;

function renderIndex(identity, expand) {
  const cards = pages
    .filter((page) => page.nav)
    .map(
      (page) =>
        `<li><a href="/${page.slug}/"><strong>${escapeHtml(page.title)}</strong><span>/${page.slug}/</span></a></li>`,
    )
    .join('\n      ');
  const contact = expand('contact.supportEmail');
  return `    <h1>TouchCatch</h1>
    <p>안드로이드 학습 게임 <code>com.touchcatch.mobile</code>의 이용자 안내 페이지입니다.</p>
    <ul class="cards">
      ${cards}
    </ul>
    <h2>문의</h2>
    <p>${contact}</p>
`;
}

async function build() {
  const identityRaw = await fs.readFile(path.join(legalDir, 'operator-identity.v1.json'), 'utf8');
  const identity = JSON.parse(identityRaw);
  const expand = (token) => resolveToken(identity, token);

  const files = new Map();
  files.set('styles.css', styles);

  for (const page of pages) {
    const body = page.source
      ? renderMarkdown(await fs.readFile(path.join(legalDir, page.source), 'utf8'), expand)
          .split('\n')
          .map((line) => (line ? `    ${line}` : line))
          .join('\n')
      : renderIndex(identity, expand);
    const relative = page.slug ? `${page.slug}/index.html` : 'index.html';
    files.set(
      relative,
      layout({ title: page.title, body, nav: page.title, activeSlug: page.slug }),
    );
  }

  // An assetlinks.json listing no fingerprints does not leave App Links unverified -- it
  // actively answers "no app owns this host", which is worse than serving nothing. So it is
  // written only once Play App Signing has told us the certificate.
  const fingerprints = identity.appLinks?.sha256CertFingerprints ?? [];
  if (fingerprints.length > 0) {
    files.set(
      '.well-known/assetlinks.json',
      `${JSON.stringify(
        [
          {
            relation: ['delegate_permission/common.handle_all_urls'],
            target: {
              namespace: 'android_app',
              package_name: identity.appLinks.packageName,
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ],
        null,
        2,
      )}\n`,
    );
  }

  return files;
}

async function readExisting() {
  const existing = new Map();
  async function walk(dir, prefix) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), relative);
      else existing.set(relative, await fs.readFile(path.join(dir, entry.name), 'utf8'));
    }
  }
  await walk(outDir, '');
  return existing;
}

function digest(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 12);
}

const argv = new Set(process.argv.slice(2));
const files = await build();

if (argv.has('--check')) {
  const existing = await readExisting();
  const problems = [];
  for (const [relative, content] of files) {
    if (!existing.has(relative)) problems.push(`missing: ${relative}`);
    else if (existing.get(relative) !== content) {
      problems.push(`stale: ${relative} (have ${digest(existing.get(relative))}, want ${digest(content)})`);
    }
  }
  for (const relative of existing.keys()) {
    if (!files.has(relative)) problems.push(`orphan: ${relative}`);
  }
  if (problems.length > 0) {
    console.error('account portal is out of date with docs/legal:');
    for (const problem of problems) console.error(`  ${problem}`);
    console.error('run: pnpm portal:build');
    process.exit(1);
  }
  console.log(`account portal matches docs/legal (${files.size} files)`);
} else if (!argv.has('--publishable')) {
  await fs.rm(outDir, { recursive: true, force: true });
  for (const [relative, content] of files) {
    const target = path.join(outDir, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
  }
  console.log(`account portal written (${files.size} files)`);
}

if (argv.has('--publishable')) {
  const blockers = [...unresolvedSeen].sort();
  if (files.has('.well-known/assetlinks.json') === false) {
    blockers.push('appLinks.sha256CertFingerprints (empty; App Links stay unverified)');
  }
  if (blockers.length > 0) {
    console.error('account portal is not publishable yet. Unresolved in docs/legal/operator-identity.v1.json:');
    for (const blocker of blockers) console.error(`  ${blocker}`);
    process.exit(1);
  }
  console.log('account portal is publishable: every human-decided fact is filled in');
}
