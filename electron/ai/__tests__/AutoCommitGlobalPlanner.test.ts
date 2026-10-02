import { describe, expect, it, vi } from 'vitest';
import { AutoCommitGlobalPlanner } from '../AutoCommitGlobalPlanner';
import type { AiProviderClient, AiTextRequest } from '../AiProviderClient';
import { validateAutoCommitPlan, fallbackAutoCommitPlan } from '../AutoCommitPlanValidator';
import { validatePlannedMessage } from '../AutoCommitMessagePolicy';
import { change, contextFor, policy, responseFor } from './autoCommitFixtures';
import type { AppSettings } from '../../settings';

const makePlanner = (generateText: (request: AiTextRequest) => Promise<string>, settings: AppSettings = policy, cancelled = () => false) =>
  new AutoCommitGlobalPlanner(
    { generateText } as AiProviderClient,
    settings,
    () => 'key',
    () => 'key',
    () => {
      if (cancelled()) throw new Error('cancelled');
    },
    cancelled,
  );

describe('global AI commit planning', () => {
  it('uses one request for a complete cross-directory plan and messages without file or line splitting', async () => {
    const files = Array.from({ length: 12 }, (_, index) => change(`w${index}`, `layer-${index}/feature.ts`));
    const provider = vi.fn(async () => responseFor([files.map((file) => file.id)]));
    const result = await makePlanner(provider).plan(contextFor(...files));
    expect(result).toHaveLength(1);
    expect(result[0].changeIds).toHaveLength(12);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider.mock.calls[0]).toBeDefined();
  });

  it('repairs a plan that separates strongly related changes once', async () => {
    const context = contextFor(change('w1', 'api/request.ts'), change('w2', 'tests/flow.spec.ts'));
    context.relationships = [{ from: 'w1', to: 'w2', reason: 'implementation and test', strong: true }];
    const provider = vi
      .fn()
      .mockResolvedValueOnce(responseFor([['w1'], ['w2']]))
      .mockResolvedValueOnce(responseFor([['w1', 'w2']]));
    const result = await makePlanner(provider).plan(context);
    expect(result).toHaveLength(1);
    expect(provider).toHaveBeenCalledTimes(2);
    expect(provider.mock.calls[1][0].userPrompt).toContain('Related changes');
  });

  it('allows independent changes in the same folder to remain separate', () => {
    const context = contextFor(change('w1', 'src/login.ts'), change('w2', 'src/export.ts'));
    expect(validateAutoCommitPlan(responseFor([['w1'], ['w2']]), context, policy)).toHaveLength(2);
  });

  it.each([[['s1', 'w1']], [['w1'], ['s1']], [['s1'], ['w1', 'w1']], [['s1']], [['s1'], ['unknown']]])(
    'rejects missing, duplicate or mixed snapshot membership: %j',
    (...groups) => {
      const context = contextFor(change('s1', 'same.ts', 'staged'), change('w1', 'same.ts'));
      expect(() => validateAutoCommitPlan(responseFor(groups as string[][]), context, policy)).toThrow();
    },
  );

  it('accepts a path containing significant whitespace because models only return IDs', () => {
    const context = contextFor(change('w1', ' leading\ntrailing '));
    expect(validateAutoCommitPlan(responseFor([['w1']]), context, policy)[0].changeIds).toEqual(['w1']);
  });

  it.each(['conventional', 'plain', 'detailed'] as const)('uses configured %s style and language in fallback commits', (style) => {
    for (const language of ['de', 'en', 'auto'] as const) {
      const settings = { ...policy, aiCommitMessageStyle: style, aiCommitMessageLanguage: language };
      const context = contextFor(change('s1', 'same.ts', 'staged'), change('w1', 'same.ts'), change('w2', 'other.ts'));
      const groups = fallbackAutoCommitPlan(context, settings);
      expect(groups.map((group) => group.changeIds)).toEqual([['s1'], ['w1', 'w2']]);
      groups.forEach((group) => expect(() => validatePlannedMessage(group, settings)).not.toThrow());
      expect(groups[0].title).toContain(language === 'de' ? 'aktualisiere' : 'update');
    }
  });

  it('stops after one correction attempt', async () => {
    const provider = vi.fn(async () => 'invalid');
    await expect(makePlanner(provider).plan(contextFor(change('w1')))).rejects.toThrow();
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it('bounds summarization concurrency, retains IDs and merges across context chunks', async () => {
    const files = Array.from({ length: 60 }, (_, index) => ({
      ...change(`w${index}`),
      hunks: [Array(100).fill('a detailed changed implementation line').join('\n')],
    }));
    let concurrent = 0;
    let maximum = 0;
    const provider = vi.fn(async (request: AiTextRequest) => {
      concurrent += 1;
      maximum = Math.max(maximum, concurrent);
      await new Promise((resolve) => {
        setTimeout(resolve, 1);
      });
      concurrent -= 1;
      if (request.systemPrompt.startsWith('Summarize'))
        return JSON.stringify({
          summaries: JSON.parse(request.userPrompt).map((item: { id: string }) => ({ id: item.id, summary: 'Updates the shared operation' })),
        });
      return responseFor([files.map((file) => file.id)]);
    });
    const result = await makePlanner(provider).plan(contextFor(...files));
    expect(result).toHaveLength(1);
    expect(result[0].changeIds).toHaveLength(60);
    expect(maximum).toBe(2);
    maximum = 0;
    await makePlanner(provider, { ...policy, aiProvider: 'ollama', ollamaModel: 'local' }).plan(contextFor(...files));
    expect(maximum).toBe(1);
  });

  it('does not start another request after the total budget expires', async () => {
    let now = 1000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const provider = vi.fn(async () => {
      now += 120001;
      return 'invalid';
    });
    try {
      await expect(makePlanner(provider).plan(contextFor(change('w1')))).rejects.toThrow('budget');
      expect(provider).toHaveBeenCalledTimes(1);
    } finally {
      clock.mockRestore();
    }
  });

  it('repairs an incomplete large-context summary once without losing cross-chunk relationships', async () => {
    const files = Array.from({ length: 30 }, (_, index) => ({ ...change(`w${index}`), hunks: ['implementation '.repeat(150)] }));
    let summaryCalls = 0;
    const provider = vi.fn(async (request: AiTextRequest) => {
      if (request.systemPrompt.startsWith('Summarize')) {
        summaryCalls += 1;
        if (summaryCalls === 1) return '{"summaries":[]}';
        const data = JSON.parse(request.userPrompt.split('\nThe previous')[0]) as Array<{ id: string }>;
        return JSON.stringify({ summaries: data.map(({ id }) => ({ id, summary: 'Updates the contract' })) });
      }
      expect(JSON.parse(request.userPrompt).relationships).toHaveLength(1);
      return responseFor([files.map((file) => file.id)]);
    });
    const context = contextFor(...files);
    context.relationships = [{ from: 'w0', to: 'w29', strong: true, reason: 'shared contract' }];
    const planner = makePlanner(provider, { ...policy, aiProvider: 'ollama' });
    expect((await planner.plan(context))[0].changeIds).toHaveLength(30);
    expect(planner.retries).toBe(1);
  });
});
