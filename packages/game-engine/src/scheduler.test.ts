import { expect,it } from 'vitest';
import { orderTimerIntents } from './scheduler.js';
it('orders timers by dueAt then stable timerId and removes cancelled timers',()=>expect(orderTimerIntents([
 {kind:'SCHEDULE',timerId:'b',dueAtMs:2,payload:{type:'START_MATCH'}},{kind:'SCHEDULE',timerId:'z',dueAtMs:1,payload:{type:'START_MATCH'}},{kind:'SCHEDULE',timerId:'a',dueAtMs:2,payload:{type:'START_MATCH'}},{kind:'CANCEL',timerId:'z'}
] as any)).toEqual([{kind:'SCHEDULE',timerId:'a',dueAtMs:2,payload:{type:'START_MATCH'}},{kind:'SCHEDULE',timerId:'b',dueAtMs:2,payload:{type:'START_MATCH'}}]));
