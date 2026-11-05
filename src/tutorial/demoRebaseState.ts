import type { DemoRebaseInstruction } from './demoRebaseInspection';
export type DemoRebaseState = {
  originalBranch: string;
  originalHead: string;
  expectedHead: string;
  phase: 'edit' | 'conflict';
  remaining: DemoRebaseInstruction[];
  instruction: DemoRebaseInstruction;
};
