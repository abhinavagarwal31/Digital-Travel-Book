/**
 * How much text fits on a page, measured in lines of the book's diary type.
 * Pages are a fixed 3:4 and scale as a whole, so a budget measured once holds
 * at every screen size. The numbers are deliberately cautious: text that runs
 * short leaves white space, text that runs long would be cut off.
 */
export interface TextBudget {
  charsPerLine: number;
  /** Lines on a page that also carries the day's heading. */
  firstPageLines: number;
  linesPerPage: number;
}

// Measured in the reader: about 53 characters a line and 21 lines a page, and
// two lines fewer under a day's heading. One line and a few characters spare.
export const DIARY_BUDGET: TextBudget = { charsPerLine: 50, firstPageLines: 17, linesPerPage: 20 };

/** A wrapped line, and what joins it to the next: a space, or nothing inside a broken word. */
interface Line {
  text: string;
  join: ' ' | '';
}

/** Greedy word wrap. A word longer than a line is broken across lines. */
function wrap(paragraph: string, width: number): Line[] {
  const lines: Line[] = [];
  let line = '';
  for (let word of paragraph.split(/\s+/).filter(Boolean)) {
    while (word.length > width) {
      if (line) lines.push({ text: line, join: ' ' });
      lines.push({ text: word.slice(0, width), join: '' });
      word = word.slice(width);
      line = '';
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      lines.push({ text: line, join: ' ' });
      line = word;
    }
  }
  if (line) lines.push({ text: line, join: ' ' });
  return lines;
}

const joinLines = (lines: Line[]) =>
  lines.map((l, i) => (i < lines.length - 1 ? l.text + l.join : l.text)).join('');

export interface TextPage {
  paragraphs: string[];
  /** The first paragraph carries on from the page before. */
  continued: boolean;
}

/**
 * Splits text into pages of paragraphs. A paragraph that does not fit is
 * continued on the next page; the gap between paragraphs costs one line,
 * except at the top of a page. Empty text gives no pages.
 */
export function paginateText(text: string, budget: TextBudget = DIARY_BUDGET): TextPage[] {
  const paragraphs = text
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const pages: TextPage[] = [];
  let page: string[] = [];
  let continued = false;
  let room = budget.firstPageLines;

  const turn = (midParagraph: boolean) => {
    pages.push({ paragraphs: page, continued });
    page = [];
    continued = midParagraph;
    room = budget.linesPerPage;
  };

  for (const paragraph of paragraphs) {
    let lines = wrap(paragraph, budget.charsPerLine);
    if (page.length > 0) {
      // The gap before a paragraph; a paragraph never starts on a page's last line.
      if (room < 2) turn(false);
      else room -= 1;
    }
    let started = false;
    while (lines.length > 0) {
      if (room === 0) turn(started);
      started = true;
      const fits = lines.slice(0, room);
      page.push(joinLines(fits));
      room -= fits.length;
      lines = lines.slice(fits.length);
    }
  }
  if (page.length > 0) pages.push({ paragraphs: page, continued });
  return pages;
}
