// Unit tests for the from-scratch markdown engine.  Run:  node mnemo/tests/markdown.test.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const md = require(path.join(here, '..', 'js', 'markdown.js'));

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message.split('\n').join('\n       ')); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || 'expected equal') + '\n  got:      ' + JSON.stringify(a) + '\n  expected: ' + JSON.stringify(b)); };
const has = (h, s) => { if (!h.includes(s)) throw new Error('missing ' + JSON.stringify(s) + ' in\n' + h); };
const lacks = (h, s) => { if (h.includes(s)) throw new Error('unexpected ' + JSON.stringify(s) + ' in\n' + h); };
const resolve = name => ({ zettelkasten: { id: 'z' }, 'spaced repetition': { id: 's' } })[name.toLowerCase()] || null;
const R = (s, o) => md.render(s, Object.assign({ resolve }, o));

/* Structural HTML validator: only our own tags/attributes may appear; no event handlers; no script-ish URLs. */
const TAGS = new Set('p h1 h2 h3 h4 h5 h6 a strong em del mark code pre br hr ul ol li blockquote table thead tbody tr th td div span section sup img input label button svg path circle'.split(' '));
const ATTR = /^(class|href|id|src|alt|title|target|rel|loading|type|checked|start|data-[a-z-]+|viewBox|aria-hidden|aria-label|d|cx|cy|r)$/;
function validate(html) {
  const re = /<(\/?)([a-zA-Z0-9]+)((?:\s+[^\s=>]+(?:="[^"]*")?)*)\s*\/?>/g;
  let last = 0, m;
  const stripped = html.replace(re, (all, slash, tag, attrs) => {
    if (!TAGS.has(tag)) throw new Error('disallowed tag <' + tag + '> in ' + all);
    const ar = /\s+([^\s=>]+)(?:="([^"]*)")?/g; let a;
    while ((a = ar.exec(attrs))) {
      if (/^on/i.test(a[1]) || !ATTR.test(a[1])) throw new Error('disallowed attribute ' + a[1] + ' in ' + all);
      if ((a[1] === 'href' || a[1] === 'src') && a[2]) {
        const v = a[2].replace(/&[a-z#0-9]+;/g, '').trim().toLowerCase();
        if (/^(javascript|vbscript|data):/.test(v) && !(a[1] === 'src' && /^data:image\//.test(v))) throw new Error('unsafe URL ' + a[2]);
      }
    }
    return '';
  });
  if (/[<>]/.test(stripped.replace(/&[lg]t;/g, ''))) throw new Error('raw angle bracket left in text: ' + stripped.match(/.{0,20}[<>].{0,20}/)[0]);
}

console.log('Block structure');
t('headings get ids, levels and source lines', () => { const h = []; const out = R('# One\n\n## Two words\n\n## Two words', { headings: h }); has(out, '<h1 id="h-one" data-line="0">'); has(out, 'id="h-two-words-2"'); eq(h.length, 3); eq(h[1].line, 2); });
t('hash-tag at line start is not a heading', () => { const out = R('#tag is not a heading'); lacks(out, '<h1'); has(out, 'class="tag"'); });
t('emphasis, strike, highlight, code', () => eq(R('**b** *i* ~~s~~ ==m== `c` ***bi***'), '<p data-line="0"><strong>b</strong> <em>i</em> <del>s</del> <mark>m</mark> <code>c</code> <strong><em>bi</em></strong></p>'));
t('snake_case and spaced asterisks stay literal', () => { const out = R('snake_case_word and 2 * 3 * 4'); lacks(out, '<em>'); has(out, 'snake_case_word'); });
t('nested unordered lists', () => { const out = R('- a\n  - b\n    - c\n- d'); eq((out.match(/<ul>/g) || []).length, 3); has(out, '<li>a<ul><li>b<ul><li>c</li></ul></li></ul></li><li>d</li>'); });
t('ordered list start and mixed nesting', () => { const out = R('3. three\n4. four\n   - nested bullet\n5. five'); has(out, '<ol start="3">'); has(out, '<li>four<ul><li>nested bullet</li></ul></li>'); });
t('loose list wraps items in paragraphs', () => { const out = R('- a\n\n- b'); has(out, '<li><p data-line="0">a</p></li>'); });
t('task list carries source line numbers', () => { const out = R('intro\n\n- [ ] one\n- [x] two\n  - [ ] nested'); has(out, 'data-line="2"'); has(out, 'data-line="3" checked'); has(out, 'data-line="4"'); eq((out.match(/type="checkbox"/g) || []).length, 3); });
t('table with alignment and escaped pipe', () => { const out = R('| A | B | C |\n|:--|:-:|--:|\n| 1 | `x|y` | 3 \\| 4 |'); has(out, '<th>A</th><th class="al-c">B</th><th class="al-r">C</th>'); has(out, '<td class="al-c"><code>x|y</code></td>'); has(out, '3 | 4'); });
t('table ragged rows are padded', () => { const out = R('a | b\n--|--\n1'); has(out, '<td>1</td><td></td>'); });
t('blockquote nests and contains blocks', () => { const out = R('> quote\n> > inner\n>\n> - item'); has(out, '<blockquote><p data-line="0">quote</p><blockquote>'); has(out, '<ul><li>item</li></ul>'); });
t('callouts (+ aliases, custom title)', () => { const out = R('> [!idea] Bright thought\n> body **text**\n\n> [!danger]\n> careful'); has(out, 'callout callout-idea'); has(out, '<span>Bright thought</span>'); has(out, 'callout callout-warning'); has(out, '<span>Danger</span>'); });
t('horizontal rules', () => eq(R('---\n\n***\n\n- - -'), '<hr><hr><hr>'));
t('footnotes are numbered by first reference', () => { const out = R('B[^b] then A[^a].\n\n[^a]: Alpha note\n[^b]: Beta note'); has(out, 'data-fn="1"'); has(out, '<li id="fn-1" data-fnid="1">Beta note'); has(out, '<li id="fn-2" data-fnid="2">Alpha note'); });
t('undefined footnote reference stays literal', () => has(R('x[^nope]'), '[^nope]'));
t('hard breaks and escapes', () => { const out = R('a  \nb\\\nc \\*not em\\*'); eq((out.match(/<br>/g) || []).length, 2); has(out, '*not em*'); });

console.log('Code');
t('fenced code shields markdown, wikilinks and html', () => {
  const out = R('```js\nconst a = "[[Zettelkasten]]"; // **no**\n<script>alert(1)</script>\n```');
  lacks(out, '<strong>'); lacks(out, 'wikilink'); lacks(out, '<script'); has(out, '&lt;script&gt;'); has(out, 'tok-k'); has(out, 'tok-s'); has(out, 'tok-c');
});
t('fence inside a list item and tilde fences', () => { const out = R('- item\n\n  ~~~py\n  def f(): pass\n  ~~~'); has(out, 'tok-k">def'); });
t('longer fence can contain a shorter fence', () => { const out = R('````md\n```js\nx\n```\n````'); eq((out.match(/<div class="codeblock">/g) || []).length, 1); has(out, '```js'); });
t('inline code shields wikilinks and tags', () => { const out = R('`[[Zettelkasten]]` and `#nope`'); lacks(out, 'wikilink'); lacks(out, 'class="tag"'); });
t('json + css + python highlighting', () => {
  has(R('```json\n{"a": 1, "ok": true}\n```'), 'tok-p">&quot;a&quot;');
  has(R('```css\na { color: #fff; margin: 4px; }\n```'), 'tok-n">#fff');
  has(R('```python\nclass A:\n  # hi\n  pass\n```'), 'tok-c"># hi');
});
t('unterminated fence swallows the rest without throwing', () => has(R('```\nopen forever\n# not heading'), 'not heading'));

console.log('Links, wikilinks, tags');
t('resolved wikilink, alias, heading anchor', () => {
  const out = R('[[Zettelkasten]] [[zettelkasten|the box]] [[Spaced Repetition#Intervals]]');
  has(out, 'data-id="z" data-target="Zettelkasten">Zettelkasten</a>'); has(out, '>the box</a>'); has(out, 'data-heading="Intervals"');
});
t('unresolved wikilink is marked distinctly', () => has(R('[[Nonexistent Idea]]'), 'class="wikilink unresolved"'));
t('wikilinks inside tables and links', () => has(R('| a |\n|---|\n| [[Zettelkasten]] |'), 'wikilink'));
t('tags need a leading boundary and a letter', () => { const out = R('#a/b-c, (#paren) mid#no 100 #1 [x](http://h/#frag)'); has(out, 'data-tag="a/b-c"'); has(out, 'data-tag="paren"'); eq((out.match(/class="tag"/g) || []).length, 2); });
t('external links open safely; autolinks', () => { const out = R('[s](https://example.com "T") <https://a.b/c> and https://x.y/z.'); has(out, 'rel="noopener noreferrer"'); has(out, 'title="T"'); has(out, '>https://a.b/c</a>'); has(out, 'href="https://x.y/z"'); });
t('link text still gets emphasis', () => has(R('[**bold** link](https://e.com)'), '<a href="https://e.com" target="_blank" rel="noopener noreferrer" class="ext"><strong>bold</strong> link</a>'));
t('data: images allowed, remote images blocked', () => {
  const ok = R('![dot](data:image/png;base64,iVBORw0KGgo=)'); has(ok, '<img src="data:image/png;base64,iVBORw0KGgo="');
  const bad = R('![x](https://tracker.example/pixel.png)'); lacks(bad, '<img'); has(bad, 'img-blocked');
});

console.log('Security (structural allow-list validator runs on every output)');
const evil = [
  '<img src=x onerror=alert(1)>', '<script>alert(1)</script>', '<svg/onload=alert(1)>', '"><img src=x onerror=alert(1)>', '<a href="javascript:alert(1)">x</a>',
  '[x](javascript:alert(1))', '[x](JaVaScRiPt:alert(1))', '[x](java&#115;cript:alert(1))', '[x](  javascript:alert(1))', '[x](data:text/html;base64,PHNjcmlwdD4=)', '[x](vbscript:msgbox(1))',
  '![x](javascript:alert(1))', '![x](data:text/html,<script>alert(1)</script>)', '[[<img src=x onerror=alert(1)>]]', '[[a|<b onmouseover=alert(1)>]]', '#<img src=x onerror=alert(1)>',
  '[x](https://a.com" onmouseover="alert(1))', '[x](https://a.com "t\\" onclick=alert(1) x=\\"")', '> [!note] <img src=x onerror=alert(1)>', '| <img src=x onerror=1> |\n|---|\n| <b onclick=1> |',
  '```<img src=x onerror=1>\nx\n```', '`<img src=x onerror=1>`', '[^1]: <img src=x onerror=1>\n\nx[^1]', '<a href=\'javascript:alert(1)\'>k</a>', '[x]( <javascript:alert(1)> )', '<<script>script>alert(1)<</script>/script>'
];
for (const e of evil) t('XSS neutralised: ' + JSON.stringify(e).slice(0, 62), () => {
  const out = R(e); validate(out);
  lacks(out.toLowerCase(), 'href="javascript'); lacks(out.toLowerCase(), '<script'); lacks(out.toLowerCase(), '<img src=x');
});
t('javascript: links render as blocked, inert anchors', () => has(R('[x](javascript:alert(1))'), 'href="#" class="blocked"'));
t('note titles in wikilinks are escaped in attributes', () => { const out = R('[[a"b<c]]'); validate(out); has(out, 'data-target="a&quot;b&lt;c"'); });

console.log('Extraction and source highlighting');
t('extract ignores code (fenced + inline) for links and tags', () => {
  const x = md.extract('# T\n[[A]] `[[B]]` #t1\n```\n[[C]] #t2\n```\n[[D|alias]] [[E#h]] #t3');
  eq(x.links.map(l => l.target).join(','), 'A,D,E'); eq(x.tags.join(','), 't1,t3'); eq(x.headings.length, 1);
});
t('highlightSource preserves text exactly (round trip through tag stripping)', () => {
  const samples = ['# H **b** [[x|y]] #tag `c`\n> [!note] hi\n- [ ] t *i* ~~s~~\n1. o\n| a | b |\n---\n```js\nx<y && "z"\n```\n[^1]: fn & <b>\n\n', '<img onerror=alert(1)> & "q" \'s\'', '', '\n\n', '* * *\n   - deep\n> > nested'];
  for (const s of samples) { const h = md.highlightSource(s); const back = h.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'); eq(back, s, 'round trip failed'); }
});
t('wordCount skips fenced code', () => eq(md.wordCount('one two\n```\nthree four\n```\nfive'), 3));

console.log('Robustness');
t('hostile inputs do not throw or hang', () => {
  const nasty = ['*'.repeat(5000), '['.repeat(3000), '`'.repeat(999), '- '.repeat(2000), '> '.repeat(300) + 'x', '|'.repeat(4000), '[[' + 'a'.repeat(5000), '_a_'.repeat(3000), '\u0001\u0002 [x](\u0001 0 \u0002)'];
  const t0 = Date.now(); for (const s of nasty) validate(R(s)); if (Date.now() - t0 > 3000) throw new Error('too slow: ' + (Date.now() - t0) + 'ms');
});
t('large document renders quickly', () => { const doc = Array.from({ length: 1500 }, (_, i) => '## Heading ' + i + '\n\nSome **bold** and [[Zettelkasten]] text with #tag and `code`.\n\n- a\n- b\n').join('\n'); const t0 = Date.now(); const out = R(doc); const ms = Date.now() - t0; console.log('       (' + (doc.length / 1024 | 0) + ' KB rendered in ' + ms + ' ms)'); if (ms > 1500) throw new Error('slow'); has(out, 'Heading 1499'); });

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
