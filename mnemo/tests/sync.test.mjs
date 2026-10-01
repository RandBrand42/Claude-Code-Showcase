// Unit tests for the pure parts of folder sync (file names, file format, parsing). Run:  node mnemo/tests/sync.test.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const Y = require(path.join(here, '..', 'js', 'sync.js'));

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message.split('\n').join('\n       ')); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'expected equal') + '\n  got:      ' + JSON.stringify(a) + '\n  expected: ' + JSON.stringify(b)); };

console.log('file names');
t('illegal characters are replaced', () => eq(Y.safeName('What/is: a "note"?*'), 'What-is- a -note-'));
t('empty and dot-only titles become Untitled', () => { eq(Y.safeName(''), 'Untitled'); eq(Y.safeName('...'), 'Untitled'); eq(Y.safeName(' / '), 'Untitled'); });
t('reserved Windows names are changed', () => { eq(Y.safeName('CON'), 'CON_'); eq(Y.safeName('lpt1'), 'lpt1_'); });
t('long titles are cut', () => { const n = Y.safeName('x'.repeat(300)); eq(n.length, 120); });
t('trailing dots and spaces are removed (Windows and OneDrive reject them)', () => eq(Y.safeName('Notes. '), 'Notes'));
t('unique names, case-insensitively, stable under reordering', () => {
  const a = [{ id: 'n2', title: 'Plan' }, { id: 'n1', title: 'plan' }, { id: 'n3', title: 'A:B' }, { id: 'n4', title: 'A-B' }];
  const m1 = Y.assignNames(a, '.md'), m2 = Y.assignNames(a.slice().reverse(), '.md');
  eq([...m1.entries()].sort(), [...m2.entries()].sort(), 'order-independent');
  const names = [...m1.values()].map(s => s.toLowerCase());
  eq(new Set(names).size, names.length, 'all unique');
});

console.log('file format round trip');
const note = { id: 'n1abc', title: 'Spaced "repetition" & more', body: '# Heading\n\nSee [[Zettelkasten]] and #learning.\n\n```js\nconst a = 1; // ---\n```\n', created: Date.UTC(2026, 0, 2, 3, 4, 5), updated: Date.UTC(2026, 5, 7, 8, 9, 10), pinned: true };
t('toFile then parseFile restores every field', () => {
  const f = Y.parseFile(Y.toFile(note, ['learning']), 'ignored.md');
  eq(f.id, note.id); eq(f.title, note.title); eq(f.created, note.created); eq(f.updated, note.updated); eq(f.pinned, true); eq(f.body, note.body);
});
t('the written file starts with front matter and keeps the body verbatim', () => {
  const s = Y.toFile(note, ['learning', 'ideas']);
  if (!s.startsWith('---\nmnemo-id: "n1abc"\ntitle: ')) throw new Error(s.slice(0, 80));
  if (!s.includes('tags: [learning, ideas]')) throw new Error('tags line missing');
  if (!s.endsWith(note.body)) throw new Error('body changed');
});
t('a body line of --- does not end the front matter early', () => {
  const f = Y.parseFile(Y.toFile({ ...note, body: 'a\n\n---\n\nb\n' }, []), 'x.md');
  eq(f.body, 'a\n\n---\n\nb\n');
});

console.log('files written by other tools');
t('a plain file with no front matter takes its title from the file name', () => { const f = Y.parseFile('Hello [[World]]\n', 'My idea.md'); eq(f.title, 'My idea'); eq(f.id, null); eq(f.body, 'Hello [[World]]\n'); });
t('CRLF and a BOM are handled', () => { const f = Y.parseFile('﻿---\r\ntitle: Crlf\r\n---\r\n\r\nbody\r\n', 'a.md'); eq(f.title, 'Crlf'); eq(f.body, 'body\n'); });
t('unquoted and single-quoted values work', () => { const f = Y.parseFile("---\ntitle: 'It''s fine'\nupdated: 2026-03-04T05:06:07Z\npinned: true\n---\nx", 'a.md'); eq(f.title, "It's fine"); eq(f.updated, Date.UTC(2026, 2, 4, 5, 6, 7)); eq(f.pinned, true); });
t('a bad date is ignored rather than turning into NaN', () => { const f = Y.parseFile('---\nupdated: not a date\n---\nx', 'a.md'); eq(f.updated, null); });
t('an odd id from outside is rejected', () => { const f = Y.parseFile('---\nmnemo-id: "../../etc/passwd"\n---\nx', 'a.md'); eq(f.id, null); });
t('script-like text is kept as plain text (rendering escapes it)', () => { const f = Y.parseFile('<script>alert(1)</script>\n', 'a.md'); eq(f.body, '<script>alert(1)</script>\n'); });
t('only note files are read; generated index and hidden files are skipped', () => {
  eq(['a.md', 'b.markdown', 'c.TXT', '_Mnemo index.md', '.hidden.md', 'pic.png', 'd.docx'].map(Y.isNoteFile), [true, true, true, false, false, false, false]);
});

console.log('index file');
t('the index lists every note and says it is generated', () => {
  const s = Y.indexFile([{ id: 'a', title: 'One', updated: 2e12 }, { id: 'b', title: 'Two', updated: 1e12 }], id => (id === 'a' ? ['x'] : []), '.md');
  if (!s.includes('[[One]]') || !s.includes('[[Two]]') || !s.includes('#x') || !s.includes('Notes (2)')) throw new Error(s);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
