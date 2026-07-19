# 10. 콘텐츠 및 이미지 게시 파이프라인

## 계약 경계

콘텐츠 번들은 공개 메타데이터, 비공개 정답, 권리 증빙을 분리한다. <!-- REQ: CONTENT-001 -->

- `PublicGameContentV1`: `contentId`, `version`, `contentRevisionId`, 계약/자산 정책 버전, 테마·언어·난이도, 이미지 A/B의 콘텐츠 주소와 메타데이터만 포함한다. `contentId + version`은 논리 콘텐츠의 리비전 순서를, `contentRevisionId`는 불변 리비전 자체를 식별한다. <!-- REQ: CONTENT-002 -->
- `PrivateGameSolutionV1`: 차이점·단어 찾기·서든데스 hitbox, 최종 정답·별칭·힌트 단위·정답 option ID를 포함한다. 클라이언트 카탈로그에 노출하지 않는다. <!-- REQ: CONTENT-003 -->
- `RightsManifestSetV1`: 각 공개 자산과 SHA-256 기준 exact bijection인 출처, 생성기, prompt 보존 상태, 권리·교육 승인, 삭제 대응 담당 정보를 포함한다. <!-- REQ: CONTENT-004 -->

TypeScript 타입은 [packages/contracts/src/content.ts](packages/contracts/src/content.ts)의 schema-first 상수에서 생성한다. JSON Schema는 `corepack pnpm content:schemas`로 기계 생성하며 `content:schemas:check`가 drift를 거부한다. <!-- REQ: CONTENT-005 -->

기존 [schemas/game-content.schema.json](schemas/game-content.schema.json)은 폐기 예정인 결합 계약이다. 신규 게시와 소비 코드에서는 다음 세 계약만 사용한다. <!-- REQ: CONTENT-006 -->

- [schemas/game-content.public.schema.json](schemas/game-content.public.schema.json) <!-- REQ: CONTENT-007 -->
- [schemas/game-content.private.schema.json](schemas/game-content.private.schema.json) <!-- REQ: CONTENT-008 -->
- [schemas/rights-manifest.schema.json](schemas/rights-manifest.schema.json) <!-- REQ: CONTENT-009 -->

콘텐츠 계약은 정답 텍스트 제한의 단일 소유자이며 reducer·wire 계층은 `CONTENT_TEXT_LIMITS_V1`에서 파생된 공용 검증기를 사용하고 별도 정답/hitbox shape를 만들지 않는다. <!-- REQ: CONTENT-010 -->

## 게시 게이트

`@spot-learn/content-validator`는 Ajv 2020 strict mode와 semantic 검사를 함께 수행한다. 검증 순서는 다음과 같다. <!-- REQ: CONTENT-011 -->

1. 세 JSON Schema와 revision ID 일치, canonical private hash를 검사한다. <!-- REQ: CONTENT-012 -->
2. 자산 URL을 versioned allow-list의 `<origin>/assets/<sha256>.<mime-ext>`로 제한한다. local 기본 origin은 `https://cdn.spot-learn.test`이고 production validator는 `CONTENT_ASSET_ORIGINS`가 없으면 시작을 거부한다. DB의 `private.content_asset_origins`에도 같은 정책을 환경별 migration으로 등록해야 한다. userinfo, 임의 port, query, fragment, 비정규 경로를 거부한다. <!-- REQ: CONTENT-013 -->
3. 자산 파일명과 real path가 fixture asset root 안의 `<sha256>.<ext>`인지 확인하고 symlink·경로 탈출을 거부한다. <!-- REQ: CONTENT-014 -->
4. 실제 bytes의 SHA-256과 encoded size, magic MIME, decoder format, 선언 MIME를 대조한다. <!-- REQ: CONTENT-015 -->
5. PNG/JPEG/WebP container 종료 이후 trailing payload, 잘린 파일, 애니메이션·다중 page, EXIF orientation, dimension/pixel 상한을 검사한 뒤 제한된 `sharp` decode를 수행한다. <!-- REQ: CONTENT-016 -->
6. A/B 크기와 aspect, hitbox 경계, 모든 objective 쌍의 overlap·tangent 금지를 검사한다. <!-- REQ: CONTENT-017 -->
7. The ruleset cardinalities, required NORMAL/SPECIAL word-hunt mix, globally unique objective IDs, and answer-option existence are validated. <!-- REQ: CONTENT-018 -->
8. NFKC/case/whitespace 정규화한 정답·별칭의 길이와 유일성, `Intl.Segmenter` grapheme 배열과 `hintUnits`의 정확한 일치를 검사한다. <!-- REQ: CONTENT-019 -->
9. 공개 자산·로컬 locator·권리 entry의 SHA-256 bijection을 검사한다. 권리·교육의 사람 승인은 이 로컬 검증과 분리된 외부 게시 blocker다. <!-- REQ: CONTENT-020 -->

자산 정책 `1.0.0`은 파일당 8 MiB 이하, width/height 각각 4096 이하, decoded pixel 16,000,000 이하이다. 이미지 정규화가 필요하면 게시 전에 새 bytes를 만들고 새 raw hash와 메타데이터를 부여한다. 검증 뒤 원본 bytes를 바꾸면 안 된다. <!-- REQ: CONTENT-021 -->

성공 결과는 public/private/rights의 canonical JSON text와 각 SHA-256을 함께 만든다. private hash는 `privateSolutionHash` 자체를 제외한 canonical object에 적용한다. DB 게시 함수는 canonical text를 SHA-256하고 그 text를 JSONB로 parse한 값이 저장 요청과 정확히 같은지 확인한다. 또한 공개 root/image key allow-list, 리비전·버전·승인·자산 bijection을 다시 검사한다. PostgreSQL이 canonicalization을 새로 수행한다고 주장하지 않으며, 배포 principal은 validator가 만든 canonical text를 그대로 전달해야 한다. <!-- REQ: CONTENT-022 -->

## fixture와 실행

- 유효 fixture: `content/fixtures/valid`의 ko/BEGINNER, en/INTERMEDIATE, ja/ADVANCED 3개 <!-- REQ: CONTENT-023 -->
- 실패 fixture: `content/fixtures/invalid`의 schema, geometry, normalization, provenance, URL/path, container 및 image decode 공격 사례 <!-- REQ: CONTENT-024 -->
- hash-pinned bytes: `content/fixtures/assets` <!-- REQ: CONTENT-025 -->

<!-- GENERATED:UI_ASSETS:START -->
`UiRuntimeAssetManifestV1` is an empty strict DRAFT manifest. `ui:assets:check` rejects approval forgery and any unapproved beta asset. 로컬 수명주기는 immutable bytes와 exact `(rightsRecordId, assetSha256)` pair를 검증하고, 실제 사람의 시각 승인과 CDN 차단 자격증명은 외부 blocker로 유지한다. Concept references are never runtime assets or visual goldens. <!-- REQ: CONTENT-026 -->
<!-- GENERATED:UI_ASSETS:END -->

```powershell
corepack pnpm content:schemas:check
corepack pnpm content:validate
corepack pnpm vitest run packages/contracts/src/canonical-json.test.ts packages/contracts/src/content.test.ts packages/content-validator/src/validate-content.test.ts
```

게시 작업은 위 검증을 통과한 번들만 exact asset origin projection과 함께 `private.publish_content_revision_v1`에 전달한다. legacy 결합 JSON은 자동 승인·게시하지 않고 quarantine 정책 입력 없이는 처리하지 않는다. 법률·backup/WAL/PITR 승인은 외부 blocker다. <!-- REQ: CONTENT-027 -->
