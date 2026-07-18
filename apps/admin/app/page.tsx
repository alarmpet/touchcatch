import { PublishConsole } from '../src/client/publish-console';

export default function Page() {
  return (
    <main>
      <header>
        <p className="eyebrow">TOUCHCATCH CONTENT OPS</p>
        <h1>검증된 콘텐츠 게시</h1>
        <p>검증을 통과한 revision만 preview와 게시 단계로 이동합니다.</p>
      </header>
      <PublishConsole />
      <aside>
        <strong>외부 승인 필요</strong>
        <p>법률 승인, CDN 자격증명과 실제 운영 게시 권한은 이 도구가 생성하거나 대신 승인하지 않습니다.</p>
      </aside>
    </main>
  );
}
