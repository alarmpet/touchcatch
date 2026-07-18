import { describe, expect, it } from 'vitest';
import {
  buildBattleScreen,
  adaptMatchSnapshot,
  clampTransform,
  contentToScreen,
  hitTestCircle,
  inverseContentPoint,
  layoutContainedPair,
  resolveViewport,
  shouldCancelSyntheticTap,
  applyGestureDelta,
  createMeaningIntent,
} from './battle-shell.js';
import fixture from '../../../../tests/fixtures/public-match-snapshot.json' with {type:'json'};
import {matchSnapshotV1Schema} from '../../../../packages/contracts/src/socket.schema.js';

describe('battle geometry', () => {
  it('uses synchronized uncropped contain rectangles for the A/B pair', () => {
    const pair = layoutContainedPair({ width: 390, height: 500 }, { width: 941, height: 1672 }, 8);
    expect(pair.a.content).toEqual(pair.b.content);
    expect(pair.a.content.width / pair.a.content.height).toBeCloseTo(941 / 1672);
    expect(pair.a.content.x).toBeGreaterThanOrEqual(pair.a.viewport.x);
    expect(pair.a.content.y).toBeGreaterThanOrEqual(pair.a.viewport.y);
  });

  it('clamps zoom and pan so content always covers its viewport', () => {
    expect(clampTransform({ scale: 9, tx: 999, ty: -999 }, { width: 160, height: 200 }, { min: 1, max: 4 }))
      .toEqual({ scale: 4, tx: 240, ty: -300 });
  });

  it('round trips screen and content coordinates and stays invariant in FINAL_RUSH', () => {
    const rect = { x: 15, y: 120, width: 360, height: 240 };
    const transform = { scale: 2, tx: -40, ty: 18 };
    const point = { x: 0.31, y: 0.72 };
    const screen = contentToScreen(point, rect, transform);
    expect(inverseContentPoint(screen, rect, transform).x).toBeCloseTo(point.x);
    expect(inverseContentPoint(screen, rect, transform).y).toBeCloseTo(point.y);
    expect(inverseContentPoint(screen, rect, transform, 'FINAL_RUSH').x).toBeCloseTo(point.x);
    expect(inverseContentPoint(screen, rect, transform, 'FINAL_RUSH').y).toBeCloseTo(point.y);
  });

  it('rejects non-finite or degenerate transform geometry',()=>{
    expect(()=>inverseContentPoint({x:1,y:1},{x:0,y:0,width:0,height:1},{scale:1,tx:0,ty:0})).toThrow();
    expect(()=>inverseContentPoint({x:1,y:1},{x:0,y:0,width:1,height:1},{scale:0,tx:0,ty:0})).toThrow();
    expect(()=>clampTransform({scale:Number.NaN,tx:0,ty:0},{width:1,height:1},{min:1,max:4})).toThrow();
  });

  it('hit tests normalized public display circles at the boundary', () => {
    expect(hitTestCircle({ x: .6, y: .5 }, { x: .5, y: .5, radius: .1 })).toBe(true);
    expect(hitTestCircle({ x: .601, y: .5 }, { x: .5, y: .5, radius: .1 })).toBe(false);
  });

  it('reflows portrait resize and blocks unsupported landscape without changing content coordinates', () => {
    expect(resolveViewport({ width: 844, height: 390 })).toEqual({ supported:false, reason:'PORTRAIT_ONLY_MVP' });
    expect(resolveViewport({ width: 412, height: 915 })).toEqual({ supported:true, width:412, height:915 });
  });

  it('cancels the synthetic tap following a material pinch or pan', () => {
    const thresholds={ translationPx:8, scaleDelta:.05 };
    expect(shouldCancelSyntheticTap({ translationPx:9, scaleDelta:.01 }, thresholds)).toBe(true);
    expect(shouldCancelSyntheticTap({ translationPx:1, scaleDelta:.06 }, thresholds)).toBe(true);
    expect(shouldCancelSyntheticTap({ translationPx:1, scaleDelta:.01 }, thresholds)).toBe(false);
  });

  it('accumulates consecutive pan and pinch gestures and clamps the result',()=>{
    const limits={min:1,max:4}; const rect={x:0,y:0,width:100,height:200};
    const first=applyGestureDelta({scale:1,tx:0,ty:0},{scale:2,tx:20,ty:30},rect,limits);
    expect(applyGestureDelta(first,{scale:1.5,tx:10,ty:-5},rect,limits)).toEqual({scale:3,tx:30,ty:25});
    expect(applyGestureDelta({scale:4,tx:100,ty:100},{scale:2,tx:100,ty:100},rect,limits)).toEqual({scale:4,tx:150,ty:200});
  });
});

describe('public view-model battle shell', () => {
  const vm = adaptMatchSnapshot(matchSnapshotV1Schema.parse(fixture),{pendingIntentId:null,connection:'CONNECTED'});

  it('emits intent only and keeps pending distinct from server-confirmed success', () => {
    const screen = buildBattleScreen(vm, { platform: 'android', reducedMotion: false, textScale: 1 });
    expect(screen.emitTap({ side: 'A', x: .2, y: .3 })).toEqual({ type: 'TAP_IMAGE', imageSide: 'A', x: .2, y: .3 });
    expect(screen.status).toBe('default');
    const pending = buildBattleScreen({ ...vm, pendingIntentId: 'i1' }, { platform: 'android', reducedMotion: false, textScale: 1 });
    expect(pending.status).toBe('pending');
    expect(pending.confirmedDifferenceRings).toEqual([]);
  });

  it('provides stable accessibility without answers or private hitboxes', () => {
    const screen = buildBattleScreen(vm, { platform: 'ios', reducedMotion: true, textScale: 2 });
    expect(screen.accessibility.map(x => x.role)).toEqual(['header', 'imagebutton', 'imagebutton', 'button']);
    expect(screen.accessibility.every(x => x.minTarget >= 44)).toBe(true);
    expect(JSON.stringify(screen.accessibility)).not.toMatch(/correct|answer|hitbox/i);
    expect(screen.motionMs).toBeLessThanOrEqual(100);
    expect(screen.columns).toBe(1);
  });

  it('blocks modal dismissal and hides option correctness before submit', () => {
    const screen = buildBattleScreen({ ...vm, meaningQuiz: { quizOrdinal: 1, prompt: '뜻?', options: [{ id: 'a', label: '하나' }], remainingMs: 1000 } }, { platform: 'android', reducedMotion: false, textScale: 1 });
    expect(screen.modal?.dismissible).toBe(false);
    expect(screen.modal?.options).toEqual([{ id: 'a', label: '하나' }]);
    expect(screen.modal?.accessibilityLabels).toEqual(['하나']);
  });

  it('fails meaning submission closed under every tap input guard',()=>{
    const quiz={quizOrdinal:1,prompt:'q',options:[{id:'a',label:'A'},{id:'b',label:'B'}],remainingMs:100};
    expect(createMeaningIntent({...vm,meaningQuiz:quiz},'a')).toEqual({type:'SUBMIT_MEANING',optionId:'a'});
    expect(createMeaningIntent({...vm,meaningQuiz:quiz,connection:'OFFLINE'},'a')).toBeNull();
    expect(createMeaningIntent({...vm,meaningQuiz:quiz,pendingIntentId:'p'},'a')).toBeNull();
    expect(createMeaningIntent({...vm,meaningQuiz:quiz,viewerInput:{enabled:false,reason:'locked'}},'a')).toBeNull();
    expect(createMeaningIntent({...vm,meaningQuiz:quiz,phase:'FINISHED'},'a')).toBeNull();
    expect(createMeaningIntent({...vm,meaningQuiz:quiz,result:{winnerPlayerId:null,endReason:'DRAW'}},'a')).toBeNull();
    expect(createMeaningIntent({...vm,meaningQuiz:quiz},'missing')).toBeNull();
  });
});
