import { z } from 'zod';

export const oauthProviderSchema = z.enum(['google', 'kakao']);
export const authMethodSchema = z.enum(['email', 'google', 'kakao']);
export const authGateStateSchema = z.enum(['GUEST', 'VERIFICATION_PENDING', 'READY', 'ACCOUNT_SETUP_FAILED']);
export const authErrorCodeSchema = z.enum([
  'UNAUTHORIZED',
  'ANONYMOUS_FORBIDDEN',
  'EMAIL_UNVERIFIED',
  'ACCOUNT_SETUP_FAILED',
  'VALIDATION_FAILED',
  'IDEMPOTENCY_CONFLICT',
]);

const learningProgressEventSchema = z.strictObject({
  deviceEventId: z.uuidv4(),
  contentKey: z.string().trim().min(1).max(128),
  contentRevision: z.string().trim().min(1).max(128),
  completedAt: z.iso.datetime({ offset: false }),
});

export const learningProgressMergeRequestSchema = z.strictObject({
  schemaVersion: z.literal('1'),
  events: z.array(learningProgressEventSchema).min(1).max(100),
});

export type OAuthProvider = z.infer<typeof oauthProviderSchema>;
export type AuthMethod = z.infer<typeof authMethodSchema>;
export type AuthGateState = z.infer<typeof authGateStateSchema>;
export type AuthErrorCode = z.infer<typeof authErrorCodeSchema>;
export type LearningProgressMergeRequest = z.infer<typeof learningProgressMergeRequestSchema>;
