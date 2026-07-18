import type { MatchSnapshotV1 } from '../../../../packages/contracts/src/socket.js';
import { useState } from 'react';
import { Modal,Pressable,Text,View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureDetector,Gesture } from 'react-native-gesture-handler';
import { createTapIntent, type PublicBattleViewModel } from './battle-shell.js';
type Props={snapshot:MatchSnapshotV1;pendingIntentId:string|null;connection:'CONNECTED'|'OFFLINE'|'RECONNECTING';onIntent:(x:ReturnType<typeof createTapIntent>)=>void};
export function BattleScreen({snapshot,pendingIntentId,connection,onIntent}:Props){
 const vm={...snapshot,pendingIntentId,connection} as PublicBattleViewModel;
 const disabled=!snapshot.viewerInput.enabled||connection!=='CONNECTED'||pendingIntentId!==null;
 const [size,setSize]=useState({width:1,height:1});
 const tap=Gesture.Tap().enabled(!disabled).onEnd(({x,y})=>onIntent(createTapIntent(vm,{side:'A',x:x/size.width,y:y/size.height})));
 return <SafeAreaView accessible accessibilityLabel="Battle" style={{flex:1}}><View accessibilityRole="summary" accessibilityLiveRegion="polite"><Text allowFontScaling maxFontSizeMultiplier={2}>{connection}</Text></View><GestureDetector gesture={tap}><Pressable onLayout={({nativeEvent})=>setSize({width:nativeEvent.layout.width,height:nativeEvent.layout.height})} accessibilityRole="imagebutton" accessibilityLabel="Difference image A" accessibilityState={{disabled,busy:pendingIntentId!==null}} disabled={disabled} style={{minWidth:48,minHeight:48}}/></GestureDetector><Modal visible={snapshot.meaningQuiz!==null} accessibilityViewIsModal onRequestClose={()=>{}} transparent><View accessibilityRole="alert" accessibilityLiveRegion="polite"><Text allowFontScaling maxFontSizeMultiplier={2}>{snapshot.meaningQuiz?.prompt}</Text></View></Modal></SafeAreaView>
}
