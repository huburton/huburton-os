import { describe, expect, test } from 'bun:test';
import matter from 'gray-matter';
import { slug, toFrontmatter } from '../src/vault-fs.ts';
import { parseBrief } from '../src/morning-brief.ts';

describe('slug', () => {
  test('strips accents and punctuation', () => {
    expect(slug('Café crème : à emporter !')).toBe('cafe-creme-a-emporter');
  });
  test('is capped at 60 characters', () => {
    expect(slug('x'.repeat(100))).toHaveLength(60);
  });
});

describe('toFrontmatter', () => {
  test('round-trips through gray-matter, including YAML-hostile strings', () => {
    const data = {
      type: 'task', title: 'Fix: "quotes", colons # and hashes', done: false, order: 1720000000000,
      tags: ['CODE', 'A,B'], project: undefined, nothing: null,
    };
    const parsed = matter(`${toFrontmatter(data)}\n# body\n`);
    expect(parsed.data).toEqual({ type: 'task', title: data.title, done: false, order: 1720000000000, tags: ['CODE', 'A,B'] });
    expect(parsed.content.trim()).toBe('# body');
  });

  test('drops empty strings only when asked', () => {
    expect(toFrontmatter({ a: '' })).toContain('a: ""');
    expect(toFrontmatter({ a: '', b: 1 }, { dropEmpty: true })).toBe('---\nb: 1\n---\n');
  });

  test('writes Date values as plain YYYY-MM-DD strings', () => {
    // gray-matter turns unquoted YAML dates into Date objects; writing them back must not produce "Tue Oct ..."
    const back = matter(toFrontmatter({ date_fin: new Date('2026-03-04T00:00:00Z') })).data;
    expect(back.date_fin).toBe('2026-03-04');
  });

  test('keeps arrays of objects (project milestones)', () => {
    const milestones = [{ title: 'API', done: true }];
    expect(matter(toFrontmatter({ milestones })).data.milestones).toEqual(milestones);
  });
});

describe('parseBrief', () => {
  test('splits the LLM output into sections', () => {
    const blocks = parseBrief('⌘ OVERNIGHT\nline 1\n\n⌘ PRIORITÉ J\n1. do it\n2. then this');
    expect(blocks).toEqual([
      { section: 'OVERNIGHT', body: 'line 1' },
      { section: 'PRIORITÉ J', body: '1. do it\n2. then this' },
    ]);
  });
  test('falls back to a single block without markers', () => {
    expect(parseBrief('just text')).toEqual([{ section: 'BRIEF', body: 'just text' }]);
    expect(parseBrief('   ')).toEqual([]);
  });
});
