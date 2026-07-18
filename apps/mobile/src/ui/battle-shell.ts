export type Point = Readonly<{ x: number; y: number }>;
export type Rect = Readonly<{ x: number; y: number; width: number; height: number }>;
export type Transform = Readonly<{ scale: number; tx: number; ty: number }>;

export function layoutContainedPair(
  available: Readonly<{ width: number; height: number }>,
  image: Readonly<{ width: number; height: number }>,
  gap: number,
) {
  const viewportHeight = (available.height - gap) / 2;
  const viewport = { x: 0, y: 0, width: available.width, height: viewportHeight };
  const scale = Math.min(viewport.width / image.width, viewport.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const content = { x: (viewport.width - width) / 2, y: (viewport.height - height) / 2, width, height };
  return {
    a: { viewport, content },
    b: { viewport: { ...viewport, y: viewportHeight + gap }, content },
  } as const;
}

export function clampTransform(transform: Transform, viewport: Readonly<{ width: number; height: number }>, limits: Readonly<{ min: number; max: number }>): Transform {
  const scale = Math.min(limits.max, Math.max(limits.min, transform.scale));
  const maxX = viewport.width * (scale - 1) / 2;
  const maxY = viewport.height * (scale - 1) / 2;
  return { scale, tx: Math.min(maxX, Math.max(-maxX, transform.tx)), ty: Math.min(maxY, Math.max(-maxY, transform.ty)) };
}

export function contentToScreen(point: Point, rect: Rect, transform: Transform): Point {
  return {
    x: rect.x + rect.width / 2 + ((point.x - .5) * rect.width) * transform.scale + transform.tx,
    y: rect.y + rect.height / 2 + ((point.y - .5) * rect.height) * transform.scale + transform.ty,
  };
}

export function inverseContentPoint(point: Point, rect: Rect, transform: Transform, _phase?: 'FINAL_RUSH'): Point {
  return {
    x: ((point.x - rect.x - rect.width / 2 - transform.tx) / transform.scale) / rect.width + .5,
    y: ((point.y - rect.y - rect.height / 2 - transform.ty) / transform.scale) / rect.height + .5,
  };
}

export function hitTestCircle(point: Point, circle: Readonly<{ x: number; y: number; radius: number }>): boolean {
  return Math.hypot(point.x - circle.x, point.y - circle.y) <= circle.radius + Number.EPSILON;
}

export function resolveViewport(viewport: Readonly<{width:number;height:number}>) {
  return viewport.width > viewport.height
    ? { supported:false as const, reason:'PORTRAIT_ONLY_MVP' as const }
    : { supported:true as const, width:viewport.width, height:viewport.height };
}

export function shouldCancelSyntheticTap(
  gesture:Readonly<{translationPx:number;scaleDelta:number}>,
  threshold:Readonly<{translationPx:number;scaleDelta:number}>,
):boolean {
  return Math.abs(gesture.translationPx)>threshold.translationPx || Math.abs(gesture.scaleDelta)>threshold.scaleDelta;
}

type PublicBattleViewModel = Readonly<{
  phase: 'WAITING_FOR_ASSETS' | 'COUNTDOWN' | 'PLAYING' | 'FINAL_RUSH' | 'SETTLING' | 'TIEBREAK_EVAL' | 'SUDDEN_DEATH' | 'FINISHED' | 'CANCELLED';
  pendingIntentId: string | null;
  connection: 'CONNECTED' | 'OFFLINE' | 'RECONNECTING';
  scores: ReadonlyArray<Readonly<{ playerId: string; absoluteScore: number }>>;
  claimed: ReadonlyArray<Readonly<{ objectiveId: string; ownerPlayerId: string; displayCircles: ReadonlyArray<Readonly<{ x: number; y: number; radius: number }>> }>>;
  assets: readonly [Readonly<{ side: 'A'; url: string; width: number; height: number }>, Readonly<{ side: 'B'; url: string; width: number; height: number }>];
  meaningQuiz: null | Readonly<{ quizOrdinal: number; prompt: string; options: ReadonlyArray<Readonly<{ id: string; label: string }>>; remainingMs: number }>;
  viewerInput: Readonly<{ enabled: boolean; reason: string | null }>;
}>;

type UiPreferences = Readonly<{ platform: 'ios' | 'android'; reducedMotion: boolean; textScale: number }>;

export function buildBattleScreen(vm: PublicBattleViewModel, preferences: UiPreferences) {
  const minTarget = preferences.platform === 'ios' ? 44 : 48;
  return {
    status: vm.pendingIntentId ? 'pending' as const : vm.connection === 'CONNECTED' ? 'default' as const : vm.connection.toLowerCase() as 'offline' | 'reconnecting',
    confirmedDifferenceRings: vm.claimed.flatMap(c => c.displayCircles),
    motionMs: preferences.reducedMotion ? 100 : 220,
    columns: preferences.textScale >= 2 ? 1 : 2,
    accessibility: [
      { id: 'battle-score', role: 'header', label: 'Battle score', minTarget },
      { id: 'board-a', role: 'imagebutton', label: 'Difference image A', minTarget },
      { id: 'board-b', role: 'imagebutton', label: 'Difference image B', minTarget },
      { id: 'submit-response', role: 'button', label: 'Submit final response', minTarget, disabled: !vm.viewerInput.enabled },
    ] as const,
    modal: vm.meaningQuiz ? {
      dismissible: false as const,
      options: vm.meaningQuiz.options.map(({ id, label }) => ({ id, label })),
      accessibilityLabels: vm.meaningQuiz.options.map(option => option.label),
    } : null,
    emitTap(point: Readonly<{ side: 'A' | 'B'; x: number; y: number }>) {
      return { type: 'TAP_IMAGE' as const, imageSide: point.side, x: point.x, y: point.y };
    },
  };
}
