import { describe, expect, it } from 'vitest';
import { colourCountries, routeCurve, visitedCountries } from './worldMap.ts';

describe('colourCountries', () => {
  it('never gives two neighbours the same colour', () => {
    // A ring of five countries, each touching the next, plus one touching all.
    const neighbours = [
      [1, 4, 5],
      [0, 2, 5],
      [1, 3, 5],
      [2, 4, 5],
      [3, 0, 5],
      [0, 1, 2, 3, 4],
    ];
    const colours = colourCountries(neighbours, 6);
    neighbours.forEach((around, i) => {
      for (const n of around) expect(colours[n]).not.toBe(colours[i]);
    });
  });
});

describe('routeCurve', () => {
  it('runs from one point to the other, bowed upwards, more for longer routes', () => {
    const short = routeCurve([0, 100], [20, 100]);
    const long = routeCurve([0, 100], [400, 100]);
    expect(short.startsWith('M0.0 100.0')).toBe(true);
    expect(long.endsWith('400.0 100.0')).toBe(true);
    const controlY = (d: string) => Number(d.split('Q')[1]?.trim().split(' ')[1]);
    expect(controlY(long)).toBeLessThan(controlY(short));
    expect(controlY(short)).toBeLessThan(100);
    // Drawn right to left it still bows upwards.
    expect(controlY(routeCurve([400, 100], [0, 100]))).toBeLessThan(100);
  });
});

describe('visitedCountries', () => {
  const square = (x: number, y: number) => ({
    type: 'Polygon' as const,
    coordinates: [
      [
        [x, y],
        [x, y + 10],
        [x + 10, y + 10],
        [x + 10, y],
        [x, y],
      ],
    ],
  });
  it('finds the countries the places are in', () => {
    const countries = [square(0, 0), square(20, 0), square(40, 0)];
    expect([
      ...visitedCountries(countries, [
        { lat: 5, lng: 25 },
        { lat: 4, lng: 26 },
      ]),
    ]).toEqual([1]);
    expect(visitedCountries(countries, [{ lat: -50, lng: -50 }]).size).toBe(0);
  });
});
