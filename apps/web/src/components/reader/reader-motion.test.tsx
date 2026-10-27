import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uncoveredPage } from './useFlipBook.ts';
import { CHROME_IDLE_MS, useReaderChrome } from './useReaderChrome.ts';

describe('uncoveredPage', () => {
  it('is the next right-hand page going forward and the left-hand one going back', () => {
    // 10 pages as spreads: turning to spread 2 (pages 3–4) uncovers page 4…
    expect(uncoveredPage(2, 1, 10, 'double')).toBe(4);
    // …and turning back to spread 1 (pages 1–2) uncovers page 1, under the returning sheet.
    expect(uncoveredPage(1, -1, 10, 'double')).toBe(1);
  });

  it('is nothing past the ends, or when a phone page comes back over the current one', () => {
    expect(uncoveredPage(5, 1, 10, 'double')).toBeNull();
    expect(uncoveredPage(0, -1, 10, 'double')).toBeNull();
    expect(uncoveredPage(3, 1, 10, 'single')).toBe(3);
    expect(uncoveredPage(3, -1, 10, 'single')).toBeNull();
  });
});

function Bars() {
  const chrome = useReaderChrome();
  return (
    <div data-chrome={chrome.visible ? 'shown' : 'hidden'}>
      <button type="button" {...chrome.holdProps}>
        Next page
      </button>
    </div>
  );
}

describe('the reader controls', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const state = () => screen.getByRole('button').parentElement?.dataset.chrome;

  it('step aside while you read and come back when you move', () => {
    vi.useFakeTimers();
    render(<Bars />);
    expect(state()).toBe('shown');
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS + 10));
    expect(state()).toBe('hidden');
    act(() => {
      window.dispatchEvent(new Event('pointermove'));
    });
    expect(state()).toBe('shown');
  });

  it('stay while pointed at or focused', () => {
    vi.useFakeTimers();
    render(<Bars />);
    fireEvent.focus(screen.getByRole('button'));
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS * 3));
    expect(state()).toBe('shown');
    fireEvent.blur(screen.getByRole('button'));
    act(() => vi.advanceTimersByTime(CHROME_IDLE_MS + 10));
    expect(state()).toBe('hidden');
  });
});
