import { startPlanningApiServer } from '../planningApiServer';
import type { PlanningApiServerHandle } from '../planningApiServer';

export const startFixtureServer = async (options: Parameters<typeof startPlanningApiServer>[0]): Promise<PlanningApiServerHandle> => {
  // An OS-assigned ephemeral port can be on fetch's forbidden-port list.
  // Retry only fixture allocation, never a failed API request under test.
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = await startPlanningApiServer(options);
    try {
      await fetch(`${candidate.url}/api/health`);
      return candidate;
    } catch (error) {
      await candidate.close();
      if ((error as { cause?: Error }).cause?.message !== 'bad port') throw error;
    }
  }
  throw new Error('Could not allocate a port accepted by fetch for the planning API fixture.');
};
