# Database role provisioning

> `supabase/roles.sql` is local-test bootstrap only. Never include it in a production `db push --include-roles` deployment.

Legacy quarantine tables are treated as restricted personal-data stores. Before external beta, approve a legal basis, maximum retention, access audit, and an account-deletion procedure that removes or destroys auth UUID, nickname, device, and token data embedded in quarantined JSON. Without that approval, do not migrate legacy rows into production.

## 원칙

스키마 migration은 비밀번호나 운영 login을 만들지 않는다. `app_server`와 `deployment_role`은 권한 묶음인 `NOLOGIN NOINHERIT` group role이다. 실제 login은 환경별 비밀 관리 시스템과 배포 절차에서 별도로 만든다.

## 운영 예시

아래 SQL은 승인된 운영 관리자만 실행하며 literal password를 migration, shell history, CI log에 남기지 않는다. 비밀번호는 secret manager에서 parameterized 관리 명령으로 전달한다.

```sql
create role spot_learn_app_login
  login noinherit nosuperuser nocreatedb nocreaterole noreplication;
grant app_server to spot_learn_app_login;

create role spot_learn_deploy_login
  login noinherit nosuperuser nocreatedb nocreaterole noreplication;
grant deployment_role to spot_learn_deploy_login;
```

애플리케이션 연결은 TLS를 강제하는 direct PostgreSQL 또는 session-mode pool 연결을 사용한다. 연결 직후 transaction 단위로 `SET LOCAL ROLE app_server`를 실행하고 `current_user`를 확인한다. transaction pooler에서 session `SET ROLE` 상태가 유지된다고 가정하지 않는다.

배포 로그인은 런타임 서비스에 제공하지 않는다. 콘텐츠 게시 job에서만 `SET LOCAL ROLE deployment_role` 후 exact publish 함수 하나를 호출한다.

`deployment_role`은 validator executor의 신뢰 경계다. publish 함수의 DB 검사는 공개 secret key, canonical text binding, 버전·cardinality·핵심 nested shape, rights approval, asset origin/path/size를 방어하지만 JSON Schema 전체를 대체하지 않는다. 이 membership은 사람이 직접 쓰는 계정이나 일반 CI에 주지 않고, `@spot-learn/content-validator` 성공 결과만 전달하는 전용 게시 principal에만 부여한다.

## 검증과 회전

1. login 자체에는 group membership 외 object grant가 없는지 확인한다.
2. `NOINHERIT`와 `current_user` 전환을 확인한다.
3. `app_server`가 publish 함수를, `deployment_role`이 join 함수를 실행하지 못하는지 확인한다.
4. credential을 secret manager에서 주기적으로 회전하고 기존 세션을 종료한다.
5. 유출 또는 퇴사 시 login의 membership을 revoke하고 login을 disable한 뒤 감사 로그를 점검한다.

로컬 `postgres -> SET ROLE` 테스트는 함수 권한과 RLS를 검증할 뿐, 운영 credential 배포·TLS·회전이 완료됐다는 증거가 아니다.
