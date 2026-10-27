import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutosave } from './autosave.ts';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** A save whose completion the test controls. */
function controlledSave() {
  const calls: { value: string; resolve: () => void; reject: () => void }[] = [];
  const save = vi.fn(
    (value: string) =>
      new Promise<void>((resolve, reject) => {
        calls.push({ value, resolve, reject: () => reject(new Error('offline')) });
      }),
  );
  return { save, calls };
}

describe('useAutosave', () => {
  it('waits for a pause in typing, then saves only the latest text', async () => {
    const { save, calls } = controlledSave();
    const { result } = renderHook(() => useAutosave(save, 800));

    act(() => result.current.change('S'));
    await act(() => vi.advanceTimersByTimeAsync(500));
    act(() => result.current.change('Sh'));
    act(() => result.current.change('Shibuya'));
    expect(result.current.state).toBe('pending');
    await act(() => vi.advanceTimersByTimeAsync(799));
    expect(save).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(calls.map((c) => c.value)).toEqual(['Shibuya']);
    expect(result.current.state).toBe('saving');
    await act(async () => calls[0]?.resolve());
    expect(result.current.state).toBe('saved');
  });

  it('never runs two saves at once, and saves the newest text last', async () => {
    const { save, calls } = controlledSave();
    const { result } = renderHook(() => useAutosave(save, 800));

    act(() => result.current.change('one'));
    await act(async () => void result.current.flush());
    act(() => result.current.change('two'));
    act(() => result.current.change('three'));
    await act(async () => void result.current.flush());
    expect(calls.map((c) => c.value)).toEqual(['one']);

    await act(async () => calls[0]?.resolve());
    expect(calls.map((c) => c.value)).toEqual(['one', 'three']);
    await act(async () => calls[1]?.resolve());
    expect(result.current.state).toBe('saved');
  });

  it('keeps unsaved text after a failure and saves it on retry', async () => {
    const { save, calls } = controlledSave();
    const { result } = renderHook(() => useAutosave(save, 800));

    act(() => result.current.change('Kyoto'));
    await act(async () => void result.current.flush());
    await act(async () => calls[0]?.reject());
    expect(result.current.state).toBe('error');

    await act(async () => void result.current.flush());
    expect(calls.map((c) => c.value)).toEqual(['Kyoto', 'Kyoto']);
    await act(async () => calls[1]?.resolve());
    expect(result.current.state).toBe('saved');
  });

  it('asks before leaving the page while text is unsaved', () => {
    const { save } = controlledSave();
    const { result } = renderHook(() => useAutosave(save, 800));
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(leave()).toBe(false);
    act(() => result.current.change('half a thought'));
    expect(leave()).toBe(true);
  });
});
