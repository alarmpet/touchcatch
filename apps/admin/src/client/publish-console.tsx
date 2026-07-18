'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import type { AdminPreviewDto, AdminPublishResultDto } from './public-dto.js';
import { rotateAfterValidation } from './idempotency-key.js';
import { bootstrapBrowserSession, supabaseBrowserAuthShell } from './session-bootstrap.js';

type ApiError = Readonly<{ path?: string; ruleId?: string; message?: string; code?: string }>;
export function PublishConsole() {
  const [files, setFiles] = useState<{ artifact?: File; imageA?: File; imageB?: File }>({});
  const [preview, setPreview] = useState<AdminPreviewDto>();
  const [attestation, setAttestation] = useState('');
  const [errors, setErrors] = useState<readonly ApiError[]>([]);
  const [published, setPublished] = useState<AdminPublishResultDto>();
  const [busy, setBusy] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [csrfToken, setCsrfToken] = useState('');
  const [sessionState, setSessionState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => { void bootstrapBrowserSession(supabaseBrowserAuthShell()).then((state) => {
    setSessionState(state.status); if (state.status === 'ready') setCsrfToken(state.csrfToken);
  }); }, []);
  function selected(field: 'artifact' | 'imageA' | 'imageB') { return (event: ChangeEvent<HTMLInputElement>) => { setFiles((current) => ({ ...current, [field]: event.target.files?.[0] })); setPreview(undefined); setAttestation(''); setIdempotencyKey(''); }; }
  function body() { const form = new FormData(); for (const field of ['artifact', 'imageA', 'imageB'] as const) { const file = files[field]; if (file) form.set(field, file); } return form; }
  async function validate() {
    setBusy(true); setErrors([]); setPreview(undefined); setAttestation('');
    try {
      const response = await fetch('/api/admin/validate', { method: 'POST', body: body(), credentials: 'same-origin', headers: { 'x-csrf-token': csrfToken } });
      const value = await response.json() as { ok: boolean; preview?: AdminPreviewDto; attestation?: string; errors?: ApiError[]; error?: ApiError };
      if (!response.ok || !value.ok || !value.preview || !value.attestation) { setErrors(value.errors ?? [value.error ?? { code: 'VALIDATION_FAILED' }]); return; }
      setPreview(value.preview); setAttestation(value.attestation); setIdempotencyKey(rotateAfterValidation());
    } finally { setBusy(false); }
  }
  async function publish() {
    setBusy(true); setErrors([]);
    try {
      const response = await fetch('/api/admin/publish', { method: 'POST', body: body(), credentials: 'same-origin', headers: { 'x-csrf-token': csrfToken, 'x-validator-attestation': attestation, 'idempotency-key': idempotencyKey } });
      const value = await response.json() as { ok: boolean; result?: AdminPublishResultDto; error?: ApiError };
      if (!response.ok || !value.ok || !value.result) { setErrors([value.error ?? { code: 'PUBLISH_FAILED' }]); return; }
      setPublished(value.result);
    } finally { setBusy(false); }
  }
  const complete = Boolean(files.artifact && files.imageA && files.imageB);
  return <section className="panel" aria-labelledby="workflow-title">
    <p role="status">{sessionState === 'loading' ? '관리자 세션 연결 중' : sessionState === 'ready' ? '관리자 세션 연결됨' : '관리자 인증이 필요합니다'}</p>
    <h2 id="workflow-title">1. Intake · 2. Validate · 3. Preview · 4. Publish</h2>
    <label>콘텐츠 bundle<input type="file" accept="application/json,.json" onChange={selected('artifact')} /></label>
    <label>Image A<input type="file" accept="image/png,image/jpeg,image/webp" onChange={selected('imageA')} /></label>
    <label>Image B<input type="file" accept="image/png,image/jpeg,image/webp" onChange={selected('imageB')} /></label>
    <button type="button" disabled={!complete || busy || sessionState !== 'ready'} onClick={() => void validate()}>서버 검증 요청</button>
    <button type="button" disabled={!preview || !attestation || busy} onClick={() => void publish()}>fresh attestation으로 게시</button>
    <div aria-live="polite">{errors.map((error, index) => <p key={`${error.ruleId ?? error.code}-${index}`}>{error.path} {error.ruleId ?? error.code}: {error.message}</p>)}</div>
    {preview && <article data-testid="validated-preview"><h3>{preview.theme}</h3><p>{preview.contentRevisionId} · {preview.language} · {preview.difficulty}</p><img src={preview.imageA.url} width={preview.imageA.width} height={preview.imageA.height} alt="검증된 A 이미지" /><img src={preview.imageB.url} width={preview.imageB.width} height={preview.imageB.height} alt="검증된 B 이미지" /></article>}
    {published && <p role="status">게시 완료: {published.contentRevisionId}</p>}
  </section>;
}
