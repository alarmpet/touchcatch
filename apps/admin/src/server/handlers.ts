import 'server-only';
import type { ContentValidationResult } from '../../../../packages/contracts/src/index.js';
import type { AdminPublishResultDto } from '../client/public-dto.js';
import type { VerifiedAdminSession } from './auth.js';
import type { intakeMultipart } from './intake.js';

type Submission = Awaited<ReturnType<typeof intakeMultipart>>;
type Dependencies = Readonly<{
  authenticate(request: Request): Promise<VerifiedAdminSession>;
  intake(form: FormData): Promise<Submission>;
  validate(submission: Submission): Promise<ContentValidationResult>;
  issueAttestation(validation: Extract<ContentValidationResult, { ok: true }>, session: VerifiedAdminSession, submission: Submission): Promise<string>;
  publish(input: Readonly<{ submission: Submission; session: VerifiedAdminSession; attestation: string; idempotencyKey: string }>): Promise<AdminPublishResultDto>;
  audit(event: Readonly<{ action: string; session: VerifiedAdminSession; outcome: string; submission?: Submission; contentRevisionId?: string }>): Promise<void>;
}>;

function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
  const status = message.includes('UNAUTHORIZED') ? 401 : message.includes('FORBIDDEN') || message.includes('CSRF') || message.includes('ORIGIN') ? 403 : 400;
  return Response.json({ ok: false, error: { code: message.split(':')[0] } }, { status });
}
export function createAdminHandlers(dependencies: Dependencies) {
  return {
    async validate(request: Request): Promise<Response> {
      let session: VerifiedAdminSession | undefined;
      try {
        session = await dependencies.authenticate(request);
        const submission = await dependencies.intake(await request.formData());
        const validation = await dependencies.validate(submission);
        if (!validation.ok) { await dependencies.audit({ action: 'VALIDATION_FAILED', session, outcome: 'REJECTED', submission }); return Response.json({ ok: false, errors: validation.errors }, { status: 422 }); }
        const attestation = await dependencies.issueAttestation(validation, session, submission);
        await dependencies.audit({ action: 'VALIDATION_SUCCEEDED', session, outcome: 'VALIDATED', submission, contentRevisionId: validation.value.publicContent.contentRevisionId });
        const { publicContent } = validation.value;
        const preview = { contentRevisionId: publicContent.contentRevisionId, contentId: publicContent.contentId, version: publicContent.version, theme: publicContent.theme, language: publicContent.language, difficulty: publicContent.difficulty, imageA: publicContent.imageA, imageB: publicContent.imageB };
        return Response.json({ ok: true, preview, attestation });
      } catch (error) { return errorResponse(error); }
    },
    async publish(request: Request): Promise<Response> {
      let session: VerifiedAdminSession | undefined;
      let submission: Submission | undefined;
      try {
        session = await dependencies.authenticate(request);
        submission = await dependencies.intake(await request.formData());
        const attestation = request.headers.get('x-validator-attestation') ?? '';
        const idempotencyKey = request.headers.get('idempotency-key') ?? '';
        try {
          const result = await dependencies.publish({ submission, session, attestation, idempotencyKey });
          return Response.json({ ok: true, result });
        } catch (error) {
          if (!(error instanceof Error && error.message.startsWith('OUTCOME_UNKNOWN'))) {
            try { await dependencies.audit({ action: 'PUBLISH_FAILED', session, outcome: 'ZERO_EFFECT', submission }); } catch { /* audit availability never changes publish outcome */ }
          }
          throw error;
        }
      } catch (error) { return errorResponse(error); }
    },
  };
}
