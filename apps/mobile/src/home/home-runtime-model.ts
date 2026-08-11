import { buildHomeModel } from './home-model';

export type HomeRuntimeStatus = 'LOADING' | 'READY' | 'CONFIG_ERROR';

/**
 * Runtime readiness only controls whether a destination can be opened.
 * Pet policy and category admission remain authoritative in each live route,
 * where the server response can be evaluated without guessing on the home screen.
 */
export function buildRuntimeHomeModel(status: HomeRuntimeStatus) {
  const runtimeReady = status === 'READY';
  return buildHomeModel({
    hasAdmittedContent: true,
    serverAvailable: runtimeReady,
    rewardPolicy: runtimeReady ? 'APPROVED' : 'DRAFT',
    rankingEnabled: runtimeReady,
  });
}
