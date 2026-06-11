import { resolveDirectTargetSelectionClick } from '../src/lib/directTargetSelection';

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const assertResult = (
  actual: ReturnType<typeof resolveDirectTargetSelectionClick>,
  expectedSelectionIds: string[],
  expectedShouldSubmit: boolean,
  label: string
) => {
  assert(
    actual.selectionIds.join('|') === expectedSelectionIds.join('|'),
    `${label}: expected selections ${expectedSelectionIds.join(',')}, got ${actual.selectionIds.join(',')}`
  );
  assert(
    actual.shouldSubmit === expectedShouldSubmit,
    `${label}: expected shouldSubmit=${expectedShouldSubmit}, got ${actual.shouldSubmit}`
  );
};

assertResult(
  resolveDirectTargetSelectionClick([], 'A', 2, 2, 'DECLARE_EFFECT_TARGETS'),
  ['A'],
  false,
  'fixed multi target waits before max'
);

assertResult(
  resolveDirectTargetSelectionClick(['A'], 'B', 2, 2, 'DECLARE_EFFECT_TARGETS'),
  ['A', 'B'],
  true,
  'fixed multi target submits at max'
);

assertResult(
  resolveDirectTargetSelectionClick(['A'], 'A', 2, 2, 'DECLARE_EFFECT_TARGETS'),
  [],
  false,
  'clicking selected target cancels without submit'
);

assertResult(
  resolveDirectTargetSelectionClick(['A', 'B'], 'C', 2, 2, 'DECLARE_EFFECT_TARGETS'),
  ['A', 'B'],
  false,
  'full selection ignores extra target without submit'
);

assertResult(
  resolveDirectTargetSelectionClick(['A', 'B'], 'C', 1, 3, 'DECLARE_EFFECT_TARGETS'),
  ['A', 'B', 'C'],
  false,
  'variable multi target does not auto submit at max'
);

assertResult(
  resolveDirectTargetSelectionClick(['A'], 'B', 2, 2, 'EFFECT_RESOLVE'),
  ['A', 'B'],
  false,
  'non target declaration query does not auto submit'
);

console.log('direct target selection scenarios passed');
