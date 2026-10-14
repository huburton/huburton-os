import { describe, expect, test } from 'bun:test';
import { addDays, localYmd } from '../src/dates.ts';
import { renderDatePlaceholders } from '../src/demo.ts';
import { staleLocalEvents } from '../src/google-calendar.ts';

describe('date helpers', () => {
  test('localYmd uses local time, not UTC', () => {
    expect(localYmd(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
  test('addDays moves by calendar days across month and year ends', () => {
    expect(localYmd(addDays(new Date(2026, 11, 30, 12), 3))).toBe('2027-01-02');
    expect(localYmd(addDays(new Date(2026, 2, 1, 12), -1))).toBe('2026-02-28');
  });
  test('addDays is not fooled by a DST change (23 h day)', () => {
    // last Sunday of March 2026 in Europe: midnight + 24 h would land on 01:00 of the next day elsewhere
    expect(localYmd(addDays(new Date(2026, 2, 28, 0, 0), 1))).toBe('2026-03-29');
    expect(localYmd(addDays(new Date(2026, 2, 29, 0, 0), 1))).toBe('2026-03-30');
  });
});

describe('demo vault placeholders', () => {
  const today = new Date(2026, 9, 14, 10);
  test('renders today and relative days', () => {
    expect(renderDatePlaceholders('start: "{{day}}T09:00:00", end: "{{day+1}}", was: {{day-14}}', today))
      .toBe('start: "2026-10-14T09:00:00", end: "2026-10-15", was: 2026-09-30');
  });
  test('leaves other braces alone', () => {
    expect(renderDatePlaceholders('{{week}} {day+1}', today)).toBe('{{week}} {day+1}');
  });
});

describe('Google Calendar sync: staleLocalEvents', () => {
  const min = Date.parse('2026-10-01T00:00:00Z');
  const max = Date.parse('2026-11-01T00:00:00Z');
  const local = [
    { id: 'a', start: '2026-10-10T10:00:00Z', googleEventId: 'g-a' },               // still on Google
    { id: 'b', start: '2026-10-11T10:00:00Z', googleEventId: 'g-b' },               // cancelled on Google
    { id: 'c', start: '2026-10-12T10:00:00Z', googleEventId: 'g-c' },               // missing, inside the window
    { id: 'd', start: '2026-12-01T10:00:00Z', googleEventId: 'g-d' },               // missing, outside the window
    { id: 'e', start: '2026-10-13T10:00:00Z' },                                      // never pushed
  ];
  test('classifies cancelled vs missing, never touches local-only events', () => {
    const { cancelled, missing } = staleLocalEvents(local, [{ id: 'g-a' }, { id: 'g-b', status: 'cancelled' }], min, max);
    expect(cancelled.map(e => e.id)).toEqual(['b']);
    expect(missing.map(e => e.id)).toEqual(['c']);
  });
});
