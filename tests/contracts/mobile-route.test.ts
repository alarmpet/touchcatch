import {describe,expect,it} from 'vitest';
import fixture from '../fixtures/public-match-snapshot.json' with {type:'json'};
import {matchSnapshotV1Schema} from '../../packages/contracts/src/socket.schema.js';

describe('development battle route fixture',()=>{
  it('is an actual strict public MatchSnapshotV1',()=>{
    expect(matchSnapshotV1Schema.parse(fixture)).toEqual(fixture);
  });
});
