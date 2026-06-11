export const resolveDirectTargetSelectionClick = (
  previousSelectionIds: string[],
  selectedOptionId: string,
  minSelections: number,
  maxSelections: number,
  callbackKey?: string
) => {
  const alreadySelected = previousSelectionIds.includes(selectedOptionId);
  if (alreadySelected) {
    return {
      selectionIds: previousSelectionIds.filter(id => id !== selectedOptionId),
      shouldSubmit: false,
    };
  }

  if (previousSelectionIds.length >= maxSelections) {
    return {
      selectionIds: previousSelectionIds,
      shouldSubmit: false,
    };
  }

  const selectionIds = [...previousSelectionIds, selectedOptionId];
  const shouldSubmit =
    callbackKey === 'DECLARE_EFFECT_TARGETS' &&
    minSelections === maxSelections &&
    maxSelections > 1 &&
    selectionIds.length === maxSelections;

  return {
    selectionIds,
    shouldSubmit,
  };
};
