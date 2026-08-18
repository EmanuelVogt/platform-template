import {
  effectiveWindowsByDay,
  intersectSpans,
  isAvailabilitySlot,
  SLOT_TYPES,
  subtractSpans,
  validateWeeklySlots,
  type WeeklySlot,
} from './weekly-slot';

const slot = (over: Partial<WeeklySlot> = {}): WeeklySlot => ({
  type: 'available',
  dayOfWeek: 0,
  startMinute: 480,
  endMinute: 1200,
  ...over,
});

describe('weekly-slot', () => {
  it('lista os 5 tipos e deriva disponibilidade', () => {
    expect(SLOT_TYPES).toEqual([
      'available',
      'lunch',
      'break',
      'meeting',
      'administrative',
    ]);
    expect(isAvailabilitySlot('available')).toBe(true);
    expect(isAvailabilitySlot('lunch')).toBe(false);
  });

  it('aceita slots válidos', () => {
    expect(validateWeeklySlots([slot()])).toEqual([]);
  });

  it('acusa tipo, dia e janela inválidos', () => {
    expect(
      validateWeeklySlots([slot({ type: 'x' as WeeklySlot['type'] })]),
    ).toEqual([
      { index: 0, slot: expect.anything(), reason: 'invalid-type' },
    ]);
    expect(validateWeeklySlots([slot({ dayOfWeek: 7 })])).toEqual([
      { index: 0, slot: expect.anything(), reason: 'invalid-day' },
    ]);
    expect(
      validateWeeklySlots([slot({ startMinute: 600, endMinute: 600 })]),
    ).toEqual([
      { index: 0, slot: expect.anything(), reason: 'invalid-window' },
    ]);
  });

  it('acusa overlap dentro da mesma classe, mas não entre classes', () => {
    expect(
      validateWeeklySlots([
        slot({ startMinute: 480, endMinute: 720 }),
        slot({ startMinute: 600, endMinute: 900 }),
      ]),
    ).toEqual([{ index: 1, slot: expect.anything(), reason: 'overlap' }]);
    expect(
      validateWeeklySlots([
        slot({ type: 'available', startMinute: 480, endMinute: 1200 }),
        slot({ type: 'lunch', startMinute: 720, endMinute: 780 }),
      ]),
    ).toEqual([]);
  });

  it('subtractSpans recorta janelas', () => {
    expect(
      subtractSpans(
        [{ startMinute: 480, endMinute: 1200 }],
        [{ startMinute: 720, endMinute: 780 }],
      ),
    ).toEqual([
      { startMinute: 480, endMinute: 720 },
      { startMinute: 780, endMinute: 1200 },
    ]);
  });

  it('intersectSpans cruza janelas mantendo semântica semiaberta', () => {
    expect(
      intersectSpans(
        [{ startMinute: 480, endMinute: 720 }],
        [{ startMinute: 600, endMinute: 900 }],
      ),
    ).toEqual([{ startMinute: 600, endMinute: 720 }]);
    expect(
      intersectSpans(
        [
          { startMinute: 480, endMinute: 600 },
          { startMinute: 700, endMinute: 900 },
        ],
        [
          { startMinute: 540, endMinute: 750 },
          { startMinute: 800, endMinute: 1000 },
        ],
      ),
    ).toEqual([
      { startMinute: 540, endMinute: 600 },
      { startMinute: 700, endMinute: 750 },
      { startMinute: 800, endMinute: 900 },
    ]);
    expect(
      intersectSpans(
        [{ startMinute: 480, endMinute: 600 }],
        [{ startMinute: 600, endMinute: 720 }],
      ),
    ).toEqual([]);
    expect(intersectSpans([{ startMinute: 480, endMinute: 600 }], [])).toEqual(
      [],
    );
  });

  it('effectiveWindowsByDay = disponibilidade menos bloqueios', () => {
    const map = effectiveWindowsByDay([
      slot({
        dayOfWeek: 1,
        type: 'available',
        startMinute: 480,
        endMinute: 1200,
      }),
      slot({ dayOfWeek: 1, type: 'lunch', startMinute: 720, endMinute: 780 }),
    ]);
    expect(map.get(1)).toEqual([
      { startMinute: 480, endMinute: 720 },
      { startMinute: 780, endMinute: 1200 },
    ]);
  });
});
