import manifest from '../../../../config/public-guest-samples.v1.json';
export type PublicGuestSample = Readonly<{ contentKey: string; contentRevision: string; category: 'ENGLISH' | 'PROVERB' | 'IDIOM'; theme: string }>;
export const publicGuestSamples = manifest.samples as readonly PublicGuestSample[];
