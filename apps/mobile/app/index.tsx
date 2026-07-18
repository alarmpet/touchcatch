import {BattleScreen} from '../src/ui/BattleScreen.js';
import fixture from '../../../tests/fixtures/public-match-snapshot.json' with {type:'json'};
import {matchSnapshotV1Schema} from '../../../packages/contracts/src/socket.schema.js';
export default function Home(){if(!(globalThis as typeof globalThis & {__DEV__?:boolean}).__DEV__)throw new Error('Battle route requires an authenticated projected snapshot');return <BattleScreen snapshot={matchSnapshotV1Schema.parse(fixture)} pendingIntentId={null} connection="CONNECTED" onIntent={()=>{}}/>}
