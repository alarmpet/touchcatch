# 08. 데이터베이스 스키마와 권한 경계

## 노출 경계

Supabase Data API에는 `public`과 `graphql_public`만 노출한다. `private`는 설정에서 제외하며 schema/object/default privilege를 `PUBLIC`, `anon`, `authenticated`, `service_role`에서 모두 회수한다. 설정 제외만 보안 장치로 간주하지 않는다. <!-- REQ: DATA-001 -->

공개 콘텐츠 저장소는 다음과 같이 분리한다. <!-- REQ: DATA-002 -->

- `public.game_content_revisions`: 불변 공개 JSON, `(content_id, version)`, 공개 hash, schema/asset-policy/validator version, 게시 상태와 승인 시각 <!-- REQ: DATA-003 -->
- `private.game_content_solutions`: 리비전과 1:1인 불변 private solution과 hash <!-- REQ: DATA-004 -->
- `private.content_rights_manifests`: 불변 권리 manifest <!-- REQ: DATA-005 -->
- `private.content_publish_attestations`: validator version과 제출 hash, 게시 DB/session role 감사 기록 <!-- REQ: DATA-006 -->
- `public.game_content_catalog`: `security_invoker=true`이며 승인된 `PUBLISHED` 리비전만 반환하는 안전 projection <!-- REQ: DATA-007 -->

legacy `game_contents`, `match_events`, 기존 match/player 행은 새 계약을 증명할 자료가 없으므로 자동 변환하지 않는다. migration은 원본 JSON을 `private.legacy_*_quarantine`에 보존하고 공개 secret-bearing table을 제거한다. 운영자는 재검증·재게시 또는 명시적 폐기 결정을 해야 한다. 외부 베타 전에 quarantine의 법적 근거, 최대 보존기간, 접근 감사, 계정삭제 시 JSON 내 식별자 제거 절차를 승인해야 하며 승인 전에는 legacy 데이터를 production으로 이관하지 않는다. <!-- REQ: DATA-008 -->

## 역할과 함수 표면

- `game_security_owner`: `NOLOGIN NOINHERIT` 보안 함수·콘텐츠 객체 owner <!-- REQ: DATA-009 -->
- `deployment_role`: `NOLOGIN NOINHERIT`; `private.publish_content_revision_v1(...)`만 실행 <!-- REQ: DATA-010 -->
- `app_server`: `NOLOGIN NOINHERIT`; 현재 `private.join_match_participant_v1(...)`만 실행 <!-- REQ: DATA-011 -->

운영 migration은 ownership 이전 동안만 `postgres`에 `game_security_owner` membership을 주고 마지막에 회수한다. 로컬 전용 `supabase/roles.sql`만 테스트 관리자를 `app_server`와 `deployment_role`에 연결한다. 이 파일을 production에 `--include-roles`로 배포하면 안 된다. 운영 로그인 생성·비밀 회전·pooler 설정은 [docs/operations/database-role-provisioning.md](docs/operations/database-role-provisioning.md)를 따른다. <!-- REQ: DATA-012 -->

두 공개 진입 함수는 `SECURITY DEFINER`, 고정 `search_path=pg_catalog`, schema-qualified object reference, 전용 owner, exact EXECUTE grant를 사용한다. `service_role`은 권위 게임/경제 write 우회권이 없으며 인증·관리 allow-list 용도와 분리한다. <!-- REQ: DATA-013 -->

## 경기 불변식

- phase enum: `WAITING_FOR_ASSETS`, `COUNTDOWN`, `PLAYING`, `FINAL_RUSH`, `SETTLING`, `TIEBREAK_EVAL`, `SUDDEN_DEATH`, `FINISHED`, `CANCELLED` <!-- REQ: DATA-014 -->
- match는 content revision, ruleset version/hash, engine/protocol/server version, experiment variant를 고정한다. <!-- REQ: DATA-015 -->
- `participant_key`가 경기 내 권위 ID다. `user_id`는 nullable mapping이며 계정 삭제 시 `ON DELETE SET NULL`된다. <!-- REQ: DATA-016 -->
- seat는 1 또는 2이고 경기별 seat 및 non-null user가 유일하다. join 함수는 parent match row를 잠가 20개 동시 세션에서도 최대 두 자리만 허용한다. <!-- REQ: DATA-017 -->
- winner는 `(match_id, participant_key)` composite FK를 사용한다. 종료 status, end reason, timestamp, winner 조합은 CHECK로 제한한다. <!-- REQ: DATA-018 -->
- profile level/exp/points, pet level/exp/copies, player score는 음수 또는 잘못된 범위를 허용하지 않는다. selected pet은 사용자당 최대 하나다. <!-- REQ: DATA-019 -->
- accepted objective는 `(match_id, objective_id)`가 유일하다. <!-- REQ: DATA-020 -->

`private.match_request_receipts`, `private.match_command_receipts`, `private.match_events`는 request reservation 상태, sequenced command decision, ordered event를 분리한다. command receipt와 event는 append-only trigger로 UPDATE/DELETE를 거부한다. request receipt는 `PENDING -> COMPLETED`만 허용한다. <!-- REQ: DATA-021 -->

이 스키마만으로 crash recovery가 완성됐다고 주장하지 않는다. 원 계획의 G3 adapter가 fenced claim/replay/complete, snapshot·timer·outbox의 단일 transaction과 fault injection을 추가해야 한다. <!-- REQ: DATA-022 -->

## RLS와 클라이언트 권한

- `anon`, `authenticated`: active pet catalog와 승인된 콘텐츠를 읽을 수 있다. <!-- REQ: DATA-023 -->
- `authenticated`: 자기 profile/inventory만 읽고 profile의 `nickname` column만 수정할 수 있다. <!-- REQ: DATA-024 -->
- 클라이언트와 `service_role`: score, winner, balance, inventory copies, private solution, receipt/event를 직접 쓰지 못한다. <!-- REQ: DATA-025 -->
- 권위 write는 운영 `DATABASE_URL`을 사용하는 trusted server의 제한된 함수/transaction 경로만 허용한다. <!-- REQ: DATA-026 -->

## 로컬 검증

```powershell
corepack pnpm exec supabase db reset --local
corepack pnpm exec supabase db lint --local --fail-on error
corepack pnpm exec supabase test db --local
corepack pnpm test:db:concurrency
```

pgTAP은 schema 노출, RLS, grants/default ACL, 안전 view, definer allow-list, 리비전 불변성, phase/종료/계정삭제/event 불변식을 검사한다. Node harness는 서로 다른 20개 `app_server` 세션으로 실제 third-seat race를 검사하며 loopback DB가 아니면 fail closed한다. <!-- REQ: DATA-027 -->

현재 Task 3의 TypeScript `MatchPhase`/`MatchEndReason` SSOT는 아직 구현되지 않았다. 따라서 pgTAP의 SQL enum 목록 검사는 DB 내부 계약만 고정하며 domain↔DB 자동 parity 완료를 뜻하지 않는다. Task 3이 추가되면 생성 artifact 또는 cross-layer contract test로 이 목록을 대체하기 전까지 전체 계획 gate는 미완료다. <!-- REQ: DATA-028 -->
# Private economy ledger extension (2026-07-15)

Migration `202607150004_economy_ledgers.sql` adds random economy subjects, immutable economy/catalog revisions, effect-once receipts, reward/draw/fusion histories, pity state, protected inventory, and transactional outbox intents under `private`. Application roles can call only the trusted operation functions and cannot mutate these tables directly. <!-- REQ: DATA-029 -->
