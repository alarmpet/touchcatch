import { buildHomeModel } from './home-model';

export type HomeRuntimeStatus = 'LOADING' | 'READY' | 'CONFIG_ERROR';

/**
 * Runtime readiness only controls whether a destination can be opened.
 * Pet policy and category admission remain authoritative in each live route,
 * where the server response can be evaluated without guessing on the home screen.
 */
export function buildRuntimeHomeModel(status: HomeRuntimeStatus, input: Readonly<{
  hasAdmittedContent: boolean;
  /** Pet/ranking CTAs. Android closed beta keeps these off until WP-6 approvals exist. */
  rewardSurfacesEnabled?: boolean;
}>) {
  const runtimeReady = status === 'READY';
  const rewards = input.rewardSurfacesEnabled === true;
  return buildHomeModel({
    hasAdmittedContent: input.hasAdmittedContent,
    serverAvailable: runtimeReady,
    rewardPolicy: runtimeReady && rewards ? 'APPROVED' : 'DRAFT',
    rankingEnabled: runtimeReady && rewards,
  });
}
