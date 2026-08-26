import { Pressable, Text, View } from 'react-native';
import type { AccountDeletionState, AccountDeletionStatus, StoredReceipt } from './account-deletion-client';
import { colors, spacing } from '../ui/design-tokens';
import { buttonStyle, buttonTextStyle, surface, text } from '../ui/ui-kit';

/**
 * The destructive path, as a card rather than a system alert.
 *
 * An `Alert.alert` confirmation would fit two lines. Google requires that the person be told
 * what happens and roughly when before they commit, and a card is the only surface with room
 * to say it — so the confirmation step doubles as the disclosure.
 *
 * The previous version of this screen had a single unconfirmed button that signed the device
 * out and reported success. Two steps is the minimum for something irreversible.
 */

export type DeletionPhase =
  | Readonly<{ kind: 'IDLE' }>
  | Readonly<{ kind: 'CONFIRMING' }>
  | Readonly<{ kind: 'REQUESTING' }>
  | Readonly<{ kind: 'REQUESTED'; receipt: StoredReceipt; status?: AccountDeletionStatus }>
  | Readonly<{ kind: 'ERROR'; code: string }>;

const stateLabel: Record<AccountDeletionState, string> = {
  ACCESS_BLOCKED: '접수됐어요. 계정은 이미 사용할 수 없어요.',
  APP_DATA_DISPOSED: '학습 기록과 펫 데이터를 지웠어요.',
  PROVIDERS_REVOKED: '연결된 소셜 로그인을 해제했어요.',
  AUTH_DELETED: '로그인 계정을 삭제했어요.',
  COMPLETED: '삭제가 모두 끝났어요.',
  FAILED_RETRYABLE: '처리 중 문제가 생겨 다시 시도하고 있어요.',
  FAILED_PERMANENT: '처리하지 못했어요. 고객지원으로 문의해 주세요.',
  MANUAL_REVIEW: '확인이 필요해 담당자가 검토하고 있어요.',
  BLOCKED_LEGAL_HOLD: '법령상 보관 의무가 있어 일부 기록이 남아 있어요.',
};

const errorLabel: Record<string, string> = {
  DELETION_ALREADY_REQUESTED: '이미 삭제를 요청했어요.',
  DELETION_ALREADY_IN_PROGRESS: '이미 삭제가 진행 중이에요.',
  ACCOUNT_CLOSED: '이미 삭제된 계정이에요.',
  RECEIPT_EXPIRED: '확인 기간이 지났어요. 고객지원으로 문의해 주세요.',
  DELETION_REQUEST_NOT_FOUND: '삭제 요청을 찾지 못했어요.',
  NETWORK_UNAVAILABLE: '네트워크에 연결하지 못했어요.',
  NETWORK_TIMEOUT: '응답이 늦어 요청을 마치지 못했어요.',
};

export function AccountDeletionCard(props: Readonly<{
  phase: DeletionPhase;
  busy: boolean;
  purgeFailed: readonly string[];
  onBegin(): void;
  onCancel(): void;
  onConfirm(): void;
  onRefresh(): void;
}>) {
  const { phase } = props;

  if (phase.kind === 'IDLE') {
    return <View style={{ marginTop: spacing.lg }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="회원 탈퇴"
        disabled={props.busy}
        onPress={props.onBegin}
        style={{ ...buttonStyle(props.busy ? 'disabled' : 'secondary', { block: true }), borderColor: colors.danger }}
      >
        <Text style={{ ...buttonTextStyle(props.busy ? 'disabled' : 'secondary'), color: colors.danger }}>회원 탈퇴 (계정 삭제)</Text>
      </Pressable>
    </View>;
  }

  if (phase.kind === 'CONFIRMING') {
    return <View accessibilityLabel="계정 삭제 안내" style={{ ...surface.cardLifted, marginTop: spacing.lg, gap: spacing.xs, borderColor: colors.danger }}>
      <Text style={{ ...text.title, color: colors.danger }}>정말 삭제할까요?</Text>
      {/* This list is the disclosure, not decoration. It is what "let users know what to
          expect" means in practice. */}
      <Text style={text.caption}>· 요청하는 즉시 이 계정으로 로그인할 수 없어요.</Text>
      <Text style={text.caption}>· 학습 기록, 펫, 주간 랭킹 기록을 지워요.</Text>
      <Text style={text.caption}>· 대전 기록은 상대방의 기록이기도 해서, 내 정보만 지우고 기록 자체는 남아요.</Text>
      <Text style={text.caption}>· 처리에는 시간이 걸려요. 진행 상황은 이 화면에서 확인할 수 있어요.</Text>
      <Text style={text.caption}>· 되돌릴 수 없어요.</Text>
      <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="삭제 취소"
          disabled={props.busy}
          onPress={props.onCancel}
          style={{ ...buttonStyle('secondary', { block: true }), flex: 1 }}
        >
          <Text style={buttonTextStyle('secondary')}>취소</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="계정 삭제 확인"
          disabled={props.busy}
          onPress={props.onConfirm}
          style={{ ...buttonStyle(props.busy ? 'disabled' : 'secondary', { block: true }), flex: 1, borderColor: colors.danger }}
        >
          <Text style={{ ...buttonTextStyle(props.busy ? 'disabled' : 'secondary'), color: colors.danger }}>삭제 요청</Text>
        </Pressable>
      </View>
    </View>;
  }

  if (phase.kind === 'REQUESTING') {
    return <View style={{ ...surface.cardLifted, marginTop: spacing.lg }}>
      <Text accessibilityLiveRegion="polite" style={text.caption}>삭제를 요청하는 중이에요…</Text>
    </View>;
  }

  if (phase.kind === 'ERROR') {
    return <View style={{ ...surface.cardLifted, marginTop: spacing.lg, gap: spacing.xs }}>
      <Text accessibilityRole="alert" style={text.danger}>{errorLabel[phase.code] ?? '삭제를 요청하지 못했어요. 다시 시도해 주세요.'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="다시 시도" onPress={props.onBegin} style={buttonStyle('secondary', { block: true })}>
        <Text style={buttonTextStyle('secondary')}>다시 시도</Text>
      </Pressable>
    </View>;
  }

  const status = phase.status;
  return <View accessibilityLabel="계정 삭제 진행 상황" style={{ ...surface.cardLifted, marginTop: spacing.lg, gap: spacing.xs }}>
    <Text style={text.overline}>ACCOUNT DELETION</Text>
    <Text accessibilityLiveRegion="polite" style={text.title}>
      {status ? stateLabel[status.state] : '삭제를 요청했어요.'}
    </Text>
    {/* The person is told the request is durable even when the device is offline, because the
        alternative reading — that closing the app cancels it — is the wrong one. */}
    <Text style={text.caption}>요청은 서버에 저장돼 있어요. 앱을 닫아도 계속 처리돼요.</Text>
    {props.purgeFailed.length > 0
      ? <Text accessibilityRole="alert" style={text.danger}>이 기기에서 로그인 정보를 완전히 지우지 못했어요. 앱을 다시 설치하면 확실히 지워져요.</Text>
      : null}
    <Pressable accessibilityRole="button" accessibilityLabel="삭제 상태 새로고침" disabled={props.busy} onPress={props.onRefresh} style={buttonStyle(props.busy ? 'disabled' : 'secondary', { block: true })}>
      <Text style={buttonTextStyle(props.busy ? 'disabled' : 'secondary')}>{props.busy ? '확인 중…' : '진행 상황 새로고침'}</Text>
    </Pressable>
  </View>;
}
