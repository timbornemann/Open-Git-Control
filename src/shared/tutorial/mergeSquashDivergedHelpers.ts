import type { TutorialText } from './types';
import { mergeRecipe, mergeField } from './mergeLessonHelpers';
export const squashDivergedMessage: TutorialText = ['Projekthinweis übernehmen', 'combine the project note'];
export const squashDivergedDescription: TutorialText = [
  'Unabhängigen Lizenzhinweis übernehmen und vorhandene Begrüßung erhalten.',
  'Combine the independent license note and retain the existing greeting.',
];
export const squashDivergedFields: Readonly<Record<string, TutorialText>> = {
  type: ['docs', 'docs'],
  prefix: ['lernen', 'lernen'],
  message: squashDivergedMessage,
  description: squashDivergedDescription,
};
export function squashDivergedRecipe(options: Parameters<typeof mergeRecipe>[0] = {}) {
  const recipe = mergeRecipe({ diverged: true, mode: 'squash', ...options });
  return {
    ...recipe,
    actions: recipe.actions!.map((action) => {
      if (!('fill' in action)) return action;
      const field = Object.keys(squashDivergedFields).find((name) => action.fill.selector === mergeField(name));
      return field ? { fill: { ...action.fill, value: squashDivergedFields[field] } } : action;
    }),
  };
}
