'use client';

import { useState, type ChangeEvent } from 'react';

type Stage = 'INTAKE' | 'READY_TO_VALIDATE' | 'VALIDATING' | 'VALIDATED';

export function PublishConsole() {
  const [stage, setStage] = useState<Stage>('INTAKE');
  const [filename, setFilename] = useState('');
  function selected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setFilename(file?.name ?? '');
    setStage(file ? 'READY_TO_VALIDATE' : 'INTAKE');
  }
  return <section className="panel" aria-labelledby="workflow-title">
    <h2 id="workflow-title">1. Intake · 2. Validate · 3. Preview · 4. Publish</h2>
    <label>콘텐츠 bundle (.json, 최대 1 MiB)<input type="file" accept="application/json,.json" onChange={selected} /></label>
    <p aria-live="polite">{filename ? `${filename} 선택됨` : '파일을 선택하세요.'}</p>
    <button type="button" disabled={stage !== 'READY_TO_VALIDATE'} onClick={() => setStage('VALIDATING')}>서버 검증 요청</button>
    <button type="button" disabled={stage !== 'VALIDATED'}>검증된 preview 열기</button>
    <button type="button" disabled>새 attestation 확인 후 게시</button>
    <p className="notice">{stage === 'VALIDATING' ? '인증된 운영 API 연결이 필요합니다. 로컬 화면은 승인을 모의하지 않습니다.' : '게시 버튼은 인증된 운영 API가 연결되고 fresh validation을 다시 통과할 때만 활성화됩니다.'}</p>
  </section>;
}
