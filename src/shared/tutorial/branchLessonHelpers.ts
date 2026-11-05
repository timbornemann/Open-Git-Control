import type { TutorialCompletion, TutorialPreparationAction, TutorialStep, TutorialText } from './types';
import { step } from './catalogSteps';
export const branchControl = (name: string) => (name === 'dialog-cancel' ? '[data-dialog-action="cancel"]' : `[data-tutorial="${name}"]`);
export const branchPanel = branchControl('branches');
export const branchRow = (name: string, current?: boolean) =>
  `${branchPanel} [data-branch-name=${JSON.stringify(name)}]${current === undefined ? '' : `[data-branch-head="${current}"]`}`;
export const branchName = 'feature/lernen';
export const branchElement = (selector: string): TutorialCompletion => ({ kind: 'element', selector });
export const branchValue = (selector: string, value: string): TutorialCompletion => ({ kind: 'value', selector, value: [value, value] });
export const branchStep = (id: string, title: TutorialText, description: TutorialText, target: string, extra: Partial<TutorialStep> = {}) =>
  step(id, title, description, 'repo', target, { scenario: 'history', continue: true, ...extra });
type Options = {
  current?: string;
  created?: boolean;
  renamed?: string;
  collapsed?: boolean;
  query?: string;
  creating?: boolean;
  name?: string;
  publication?: boolean;
  sidebarCollapsed?: boolean;
};
export function branchRecipe(options: Options = {}): NonNullable<TutorialStep['prepare']> {
  const actions: TutorialPreparationAction[] = [
    options.sidebarCollapsed ? { collapse: branchControl('sidebar-toggle') } : { expand: branchControl('sidebar-toggle') },
  ];
  if (!options.sidebarCollapsed)
    actions.push(options.collapsed ? { collapse: `${branchPanel} .repo-card-toggle` } : { expand: `${branchPanel} .repo-card-toggle` });
  if (options.query) actions.push({ fill: { selector: branchControl('branch-filter'), value: [options.query, options.query] } });
  if (options.creating || options.publication) actions.push({ click: branchControl('create-branch') });
  if (options.name || options.publication) {
    const name = options.name || branchName;
    actions.push({ fill: { selector: branchControl('branch-name'), value: [name, name] } });
  }
  if (options.publication) actions.push({ pressKey: { selector: branchControl('branch-name'), key: 'Enter' } }, { waitFor: branchControl('dialog-cancel') });
  return {
    branches: {
      heads: [
        { name: 'main', commit: 4 },
        { name: 'feature/begruessung', commit: 3 },
        ...(options.created && !options.publication ? [{ name: options.renamed || branchName, commit: 4 }] : []),
      ],
      current: options.publication ? 'main' : options.current || 'main',
    },
    actions,
    ready: options.sidebarCollapsed
      ? `${branchControl('sidebar-toggle')}[aria-expanded="false"]`
      : options.publication
        ? branchControl('dialog-cancel')
        : options.creating
          ? branchControl('branch-name')
          : options.collapsed
            ? `${branchPanel} .repo-card-toggle[aria-expanded="false"]`
            : branchControl('branch-filter'),
  };
}
