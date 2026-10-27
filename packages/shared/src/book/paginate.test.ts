import { describe, expect, it } from 'vitest';
import { paginateText, type TextBudget } from './paginate.ts';

const SMALL: TextBudget = { charsPerLine: 10, firstPageLines: 2, linesPerPage: 3 };

describe('paginateText', () => {
  it('gives no pages for empty or blank text', () => {
    expect(paginateText('')).toEqual([]);
    expect(paginateText(' \n\n  ')).toEqual([]);
  });

  it('keeps short text on one page, paragraph by paragraph', () => {
    expect(paginateText('A quiet morning.\n\nThen rain.')).toEqual([
      { paragraphs: ['A quiet morning.', 'Then rain.'], continued: false },
    ]);
  });

  it('continues a long paragraph on the next page, saying so', () => {
    // 5 lines of 10: "aaaa bbbb", "cccc dddd", "eeee ffff", "gggg hhhh", "iiii"
    const text = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii';
    expect(paginateText(text, SMALL)).toEqual([
      { paragraphs: ['aaaa bbbb cccc dddd'], continued: false },
      { paragraphs: ['eeee ffff gggg hhhh iiii'], continued: true },
    ]);
  });

  it('spends a line between paragraphs, but never starts one on the last line', () => {
    // Page 1 (2 lines): "one" + gap. Page 2 (3 lines) starts with "two".
    expect(paginateText('one\ntwo\nthree', SMALL)).toEqual([
      { paragraphs: ['one'], continued: false },
      { paragraphs: ['two', 'three'], continued: false },
    ]);
  });

  it('breaks a word too long for a line instead of overflowing', () => {
    const pages = paginateText('abcdefghijklmnopqrstuvwxyz', SMALL);
    expect(pages).toEqual([
      { paragraphs: ['abcdefghijklmnopqrst'], continued: false },
      { paragraphs: ['uvwxyz'], continued: true },
    ]);
  });

  it('never puts more lines on a page than its budget, and loses no words', () => {
    const words = Array.from({ length: 400 }, (_, i) => `w${i}`);
    const text = words.map((w, i) => (i % 37 === 36 ? `${w}\n\n` : `${w} `)).join('');
    const budget: TextBudget = { charsPerLine: 30, firstPageLines: 6, linesPerPage: 9 };
    const pages = paginateText(text, budget);

    pages.forEach((page, i) => {
      const lines = page.paragraphs.reduce(
        (n, p) => n + Math.ceil(p.length / budget.charsPerLine),
        page.paragraphs.length - 1,
      );
      expect(lines).toBeLessThanOrEqual(i === 0 ? budget.firstPageLines : budget.linesPerPage);
    });
    expect(pages.flatMap((p) => p.paragraphs.join(' ').split(' '))).toEqual(words);
  });
});
