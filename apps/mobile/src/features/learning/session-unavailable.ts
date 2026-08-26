export type SessionUnavailableCopy = Readonly<{
  title: string;
  detail: string;
  retry: boolean;
  support: boolean;
}>;

/**
 * Named server/session failures the Android beta must show. A blank "준비 중"
 * screen is not allowed once play is in launch scope.
 */
export function sessionUnavailableCopy(reason: string | null): SessionUnavailableCopy {
  switch (reason) {
    case 'SIGNED_OUT':
      return { title: '로그인이 필요해요', detail: '학습은 서버가 판정해요. 내 정보에서 로그인해 주세요.', retry: false, support: false };
    case 'RANKING_POLICY_NOT_APPROVED':
    case 'HINT_POLICY_NOT_APPROVED':
    case 'RULESET_NOT_APPROVED':
    case 'POLICY_MISMATCH':
      return { title: '학습 정책을 아직 열 수 없어요', detail: `${reason} — 승인된 정책이 활성화되면 이어서 플레이할 수 있어요.`, retry: true, support: true };
    case 'SEASON_NOT_OPEN':
    case 'SEASON_NOT_FOUND':
    case 'CHALLENGE_PIN_MISMATCH':
      return { title: '이번 주 학습을 열 수 없어요', detail: `${reason} — 시즌이 열리면 다시 시도해 주세요.`, retry: true, support: true };
    case 'SELECTED_PET_REQUIRED':
      return { title: '이 모드는 선택한 펫이 필요해요', detail: '펫 보상은 이번 안드로이드 베타 범위가 아니에요.', retry: false, support: true };
    case 'MOBILE_RUNTIME_UNAVAILABLE':
    case 'MOBILE_CONFIG_INVALID':
    case 'AUTH_UNAVAILABLE':
      return { title: '앱 설정을 확인할 수 없어요', detail: reason ?? 'MOBILE_CONFIG_INVALID', retry: true, support: true };
    case 'EXPIRED':
      return { title: '시간이 끝났어요', detail: '서버 시계 기준으로 시도가 만료됐어요. 다시 시작할 수 있어요.', retry: true, support: false };
    default:
      return { title: '학습을 시작하지 못했어요', detail: reason ? `${reason} — 연결을 확인하고 다시 시도해 주세요.` : '연결을 확인하고 다시 시도해 주세요.', retry: true, support: true };
  }
}
