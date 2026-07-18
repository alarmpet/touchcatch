# 10. 콘텐츠 및 이미지 게시 파이프라인

## 계약 경계

콘텐츠 번들은 공개 메타데이터, 비공개 정답, 권리 증빙을 분리한다.

- `PublicGameContentV1`: `contentId`, `version`, `contentRevisionId`, 계약/자산 정책 버전, 테마·언어·난이도, 이미지 A/B의 콘텐츠 주소와 메타데이터만 포함한다. `contentId + version`은 논리 콘텐츠의 리비전 순서를, `contentRevisionId`는 불변 리비전 자체를 식별한다.
- `PrivateGameSolutionV1`: 차이점·단어 찾기·서든데스 hitbox, 최종 정답·별칭·힌트 단위·정답 option ID를 포함한다. 클라이언트 카탈로그에 노출하지 않는다.
- `RightsManifestSetV1`: 각 공개 자산과 SHA-256 기준으로 정확히 1:1인 출처, 생성기, prompt 보존 상태, 권리·교육 승인, 삭제 대응 담당 정보를 포함한다.

TypeScript 타입은 [packages/contracts/src/content.ts](packages/contracts/src/content.ts)의 schema-first 상수에서 생성한다. JSON Schema는 `corepack pnpm content:schemas`로 기계 생성하며 `content:schemas:check`가 drift를 거부한다.

기존 [schemas/game-content.schema.json](schemas/game-content.schema.json)은 폐기 예정인 결합 계약이다. 신규 게시와 소비 코드에서는 다음 세 계약만 사용한다.

- [schemas/game-content.public.schema.json](schemas/game-content.public.schema.json)
- [schemas/game-content.private.schema.json](schemas/game-content.private.schema.json)
- [schemas/rights-manifest.schema.json](schemas/rights-manifest.schema.json)

Task 5는 콘텐츠 계약만 소유한다. 아직 구현되지 않은 Task 3/4의 reducer·wire 계층은 이후 이 타입과 `CONTENT_TEXT_LIMITS_V1`을 import해야 하며 별도 정답/hitbox shape를 만들면 안 된다.

## 게시 게이트

`@spot-learn/content-validator`는 Ajv 2020 strict mode와 semantic 검사를 함께 수행한다. 검증 순서는 다음과 같다.

1. 세 JSON Schema와 revision ID 일치, canonical private hash를 검사한다.
2. 자산 URL을 versioned allow-list의 `<origin>/assets/<sha256>.<mime-ext>`로 제한한다. local 기본 origin은 `https://cdn.spot-learn.test`이고 production validator는 `CONTENT_ASSET_ORIGINS`가 없으면 시작을 거부한다. DB의 `private.content_asset_origins`에도 같은 정책을 환경별 migration으로 등록해야 한다. userinfo, 임의 port, query, fragment, 비정규 경로를 거부한다.
3. 자산 파일명과 real path가 fixture asset root 안의 `<sha256>.<ext>`인지 확인하고 symlink·경로 탈출을 거부한다.
4. 실제 bytes의 SHA-256과 encoded size, magic MIME, decoder format, 선언 MIME를 대조한다.
5. PNG/JPEG/WebP container 종료 이후 trailing payload, 잘린 파일, 애니메이션·다중 page, EXIF orientation, dimension/pixel 상한을 검사한 뒤 제한된 `sharp` decode를 수행한다.
6. A/B 크기와 aspect, hitbox 경계, 모든 objective 쌍의 overlap·tangent 금지를 검사한다.
7. 7 NORMAL + 3 HARD, word hunt 2 NORMAL + 1 SPECIAL, 전역 objective ID 유일성, 정답 option 존재를 검사한다.
8. NFKC/case/whitespace 정규화한 정답·별칭의 길이와 유일성, `Intl.Segmenter` grapheme 배열과 `hintUnits`의 정확한 일치를 검사한다.
9. 공개 자산과 권리 entry의 SHA-256 bijection 및 권리·교육의 승인 상태를 검사한다.

자산 정책 `1.0.0`은 파일당 8 MiB 이하, width/height 각각 4096 이하, decoded pixel 16,000,000 이하이다. 이미지 정규화가 필요하면 게시 전에 새 bytes를 만들고 새 raw hash와 메타데이터를 부여한다. 검증 뒤 원본 bytes를 바꾸면 안 된다.

성공 결과는 public/private/rights의 canonical JSON text와 각 SHA-256을 함께 만든다. private hash는 `privateSolutionHash` 자체를 제외한 canonical object에 적용한다. DB 게시 함수는 canonical text를 SHA-256하고 그 text를 JSONB로 parse한 값이 저장 요청과 정확히 같은지 확인한다. 또한 공개 root/image key allow-list, 리비전·버전·승인·자산 bijection을 다시 검사한다. PostgreSQL이 canonicalization을 새로 수행한다고 주장하지 않으며, 배포 principal은 validator가 만든 canonical text를 그대로 전달해야 한다.

## fixture와 실행

- 유효 fixture: `content/fixtures/valid`의 ko/BEGINNER, en/INTERMEDIATE, ja/ADVANCED 3개
- 실패 fixture: `content/fixtures/invalid`의 schema, geometry, normalization, provenance, URL/path, container 및 image decode 공격 사례
- hash-pinned bytes: `content/fixtures/assets`

<!-- GENERATED:UI_ASSETS:START -->
`UiRuntimeAssetManifestV1` is an empty strict DRAFT manifest. `ui:assets:check` rejects approval forgery and any unapproved beta asset. Publish verifies immutable bytes and the exact `(rightsRecordId, assetSha256)` pair; rollback selects an earlier approved immutable manifest; takedown blocks the hash at CDN and admission layers. Concept references are never runtime assets or visual goldens.
<!-- GENERATED:UI_ASSETS:END -->

```powershell
corepack pnpm content:schemas:check
corepack pnpm content:validate
corepack pnpm vitest run packages/contracts/src/canonical-json.test.ts packages/contracts/src/content.test.ts packages/content-validator/src/validate-content.test.ts
```

게시 작업은 위 검증을 통과한 번들만 `private.publish_content_revision_v1`에 전달한다. legacy 결합 JSON은 자동 승인하거나 자동 게시하지 않는다.
