import { Ajv2020 } from 'ajv/dist/2020.js';
import type { MatchSnapshotV1 } from '../../../../packages/contracts/src/socket.js';
export type Point = Readonly<{ x: number; y: number }>;
export type Rect = Readonly<{ x: number; y: number; width: number; height: number }>;
export type Transform = Readonly<{ scale: number; tx: number; ty: number }>;

export function layoutContainedPair(
  available: Readonly<{ width: number; height: number }>,
  image: Readonly<{ width: number; height: number }>,
  gap: number,
) {
  if (![available.width,available.height,image.width,image.height].every(Number.isFinite) || available.width<=0 || available.height<=0 || image.width<=0 || image.height<=0 || !Number.isFinite(gap) || gap<0 || gap>=available.height) throw new RangeError('invalid layout dimensions');
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
  if(![transform.scale,transform.tx,transform.ty,viewport.width,viewport.height,limits.min,limits.max].every(Number.isFinite)||viewport.width<=0||viewport.height<=0||limits.min<=0||limits.max<limits.min)throw new RangeError('invalid transform');
  const scale = Math.min(limits.max, Math.max(limits.min, transform.scale));
  const maxX = viewport.width * (scale - 1) / 2;
  const maxY = viewport.height * (scale - 1) / 2;
  return { scale, tx: Math.min(maxX, Math.max(-maxX, transform.tx)), ty: Math.min(maxY, Math.max(-maxY, transform.ty)) };
}

/** Clamp panning to the pixels actually occupied by the contained image. */
export function clampTransformToContent(transform:Transform,content:Rect,limits:Readonly<{min:number;max:number}>):Transform{
 return clampTransform(transform,{width:content.width,height:content.height},limits);
}

export function contentToScreen(point: Point, rect: Rect, transform: Transform): Point {
  assertGeometry(point,rect,transform);
  return {
    x: rect.x + rect.width / 2 + ((point.x - .5) * rect.width) * transform.scale + transform.tx,
    y: rect.y + rect.height / 2 + ((point.y - .5) * rect.height) * transform.scale + transform.ty,
  };
}

export function inverseContentPoint(point: Point, rect: Rect, transform: Transform, _phase?: 'FINAL_RUSH'): Point {
  assertGeometry(point,rect,transform);
  return {
    x: ((point.x - rect.x - rect.width / 2 - transform.tx) / transform.scale) / rect.width + .5,
    y: ((point.y - rect.y - rect.height / 2 - transform.ty) / transform.scale) / rect.height + .5,
  };
}
function assertGeometry(point:Point,rect:Rect,transform:Transform){if(![point.x,point.y,rect.x,rect.y,rect.width,rect.height,transform.scale,transform.tx,transform.ty].every(Number.isFinite)||rect.width<=0||rect.height<=0||transform.scale<=0)throw new RangeError('invalid geometry')}

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

export function applyGestureDelta(base:Transform,delta:Transform,content:Rect,limits:Readonly<{min:number;max:number}>):Transform{
  return clampTransformToContent({scale:base.scale*delta.scale,tx:base.tx+delta.tx,ty:base.ty+delta.ty},content,limits);
}

export type PublicBattleViewModel = Pick<MatchSnapshotV1,'phase'|'scores'|'claimed'|'meaningQuiz'|'viewerInput'|'result'> & Readonly<{
  pendingIntentId: string | null;
  connection: 'CONNECTED' | 'OFFLINE' | 'RECONNECTING';
  scores: ReadonlyArray<Readonly<{ playerId: string; absoluteScore: number }>>;
  assets: MatchSnapshotV1['preload']['assets'];
  meaningQuiz: null | Readonly<{ quizOrdinal: number; prompt: string; options: ReadonlyArray<Readonly<{ id: string; label: string }>>; remainingMs: number }>;
  viewerInput: Readonly<{ enabled: boolean; reason: string | null }>;
}>;

export type BattleExternalState=Readonly<{pendingIntentId:string|null;connection:'CONNECTED'|'OFFLINE'|'RECONNECTING'}>;
export function adaptMatchSnapshot(snapshot:MatchSnapshotV1,external:BattleExternalState):PublicBattleViewModel{
 assertPublicUiValue(snapshot);
 if(snapshot.preload.assets[0].side!=='A'||snapshot.preload.assets[1].side!=='B')throw new TypeError('asset sides must be canonical A,B');
 return {phase:snapshot.phase,scores:snapshot.scores,claimed:snapshot.claimed,meaningQuiz:snapshot.meaningQuiz,viewerInput:snapshot.viewerInput,result:snapshot.result,assets:snapshot.preload.assets,...external};
}

type UiPreferences = Readonly<{ platform: 'ios' | 'android'; reducedMotion: boolean; textScale: number }>;

export function buildBattleScreen(vm: PublicBattleViewModel, preferences: UiPreferences) {
  const minTarget = preferences.platform === 'ios' ? 44 : 48;
  const modal=vm.meaningQuiz ? {
      dismissible: false as const,
      options: vm.meaningQuiz.options.map(({ id, label }) => ({ id, label })),
      accessibilityLabels: vm.meaningQuiz.options.map(option => option.label),
      accessibilityViewIsModal:true as const,
      focusTrap:true as const,
      backdropDismiss:false as const,
      systemBackDismiss:false as const,
      liveRegion:'polite' as const,
    } : null;
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
    modal,
    nativeTree:{type:'SafeAreaView' as const,props:{accessible:true,accessibilityViewIsModal:false,allowFontScaling:true,maxFontSizeMultiplier:2,importantForAccessibility:'yes'},children:[{type:'View',props:{accessibilityRole:'summary',accessibilityLiveRegion:'polite'}},{type:'SpotBoardPair',props:{accessibilityRole:'adjustable',disabled:!vm.viewerInput.enabled||vm.connection!=='CONNECTED'||vm.pendingIntentId!==null}},{type:'Modal',props:{visible:modal!==null,accessibilityViewIsModal:modal!==null,onRequestClose:null,backdropDismiss:false}}]},
    emitTap(point: Readonly<{ side: 'A' | 'B'; x: number; y: number }>) {
      return { type: 'TAP_IMAGE' as const, imageSide: point.side, x: point.x, y: point.y };
    },
  };
}

const playable=new Set(['PLAYING','FINAL_RUSH','SUDDEN_DEATH']);
export function createTapIntent(vm:PublicBattleViewModel, point:Readonly<{side:'A'|'B';x:number;y:number}>) {
  if(!vm.viewerInput.enabled||vm.connection!=='CONNECTED'||vm.pendingIntentId!==null||vm.result!==null||!playable.has(vm.phase)) return null;
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.x>1||point.y<0||point.y>1) return null;
  return {type:'TAP_IMAGE' as const,imageSide:point.side,x:point.x,y:point.y};
}
export function createMeaningIntent(vm:PublicBattleViewModel,optionId:string){
  if(!vm.meaningQuiz||!vm.meaningQuiz.options.some(option=>option.id===optionId))return null;
  if(!vm.viewerInput.enabled||vm.connection!=='CONNECTED'||vm.pendingIntentId!==null||vm.result!==null||!playable.has(vm.phase))return null;
  return {type:'SUBMIT_MEANING' as const,optionId};
}
const forbiddenPrivateKeys=new Set(['canonicalAnswer','aliases','correctOptionId','hitboxes','privateSolution','serviceRoleKey','assetAttestation']);
export function assertPublicUiValue(value:unknown,path='$'):void{if(Array.isArray(value)){value.forEach((x,i)=>assertPublicUiValue(x,`${path}[${i}]`));return}if(typeof value!=='object'||value===null)return;for(const [key,nested] of Object.entries(value)){if(forbiddenPrivateKeys.has(key))throw new TypeError(`${path}.${key} is private`);assertPublicUiValue(nested,`${path}.${key}`)}}

const ajv=new Ajv2020({strict:true,allErrors:true,formats:{'date-time':/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/,'uri':/^https?:\/\//}});
export function parseUiBundle<T extends {theme:unknown;screens:unknown;references:unknown;rights:unknown;assets:unknown}>(bundle:T):T {
  // Frozen manifests are themselves the exact contract. Compiling `const` schemas with
  // Draft 2020-12 rejects nested additions, omissions, reordering and token drift.
  const baselines={theme:themeBaseline,screens:screenBaseline,references:referenceBaseline,rights:rightsBaseline};
  for(const key of Object.keys(baselines) as Array<keyof typeof baselines>){
    const validate=ajv.compile({$schema:'https://json-schema.org/draft/2020-12/schema',const:baselines[key]});
    if(!validate(bundle[key])) throw new TypeError(`${key}: ${ajv.errorsText(validate.errors)}`);
  }
  const validateAssets=ajv.compile(assetSchema);if(!validateAssets(bundle.assets))throw new TypeError(`assets: ${ajv.errorsText(validateAssets.errors)}`);
  return bundle;
}
import themeBaseline from '../../../../config/ui-theme.v1.json' with {type:'json'};
import screenBaseline from '../../../../config/ui-screen-contract.v1.json' with {type:'json'};
import referenceBaseline from '../../../../docs/design/ui-reference/manifest.json' with {type:'json'};
import rightsBaseline from '../../../../docs/design/ui-reference/rights-manifest.json' with {type:'json'};
import assetSchema from '../../../../schemas/ui-runtime-assets.schema.json' with {type:'json'};
