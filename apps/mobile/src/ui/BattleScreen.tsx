import type {MatchSnapshotV1} from '../../../../packages/contracts/src/socket.js';
import {matchSnapshotV1Schema} from '../../../../packages/contracts/src/socket.schema.js';
import {useEffect,useMemo,useRef,useState} from 'react';
import {AccessibilityInfo,findNodeHandle,Image,Modal,Pressable,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Gesture,GestureDetector} from 'react-native-gesture-handler';
import {adaptMatchSnapshot,assertPublicUiValue,clampTransformToContent,createTapIntent,inverseContentPoint,layoutContainedPair,type BattleExternalState,type Transform} from './battle-shell.js';

type Intent=NonNullable<ReturnType<typeof createTapIntent>>|{type:'SUBMIT_MEANING';optionId:string};
type Props={snapshot:MatchSnapshotV1;pendingIntentId:string|null;connection:BattleExternalState['connection'];lastRejection?:string|null;onIntent:(intent:Intent)=>void};
const playable=new Set(['PLAYING','FINAL_RUSH','SUDDEN_DEATH']);

export function BattleScreen({snapshot,pendingIntentId,connection,lastRejection=null,onIntent}:Props){
 const admitted=useMemo(()=>{assertPublicUiValue(snapshot);return matchSnapshotV1Schema.parse(snapshot)},[snapshot]);
 const vm=adaptMatchSnapshot(admitted,{pendingIntentId,connection});
 const disabled=!admitted.viewerInput.enabled||connection!=='CONNECTED'||pendingIntentId!==null||admitted.result!==null||!playable.has(admitted.phase);
 const [available,setAvailable]=useState({width:1,height:1});
 const [announcement,setAnnouncement]=useState('');
 const [transform,setTransform]=useState<Transform>({scale:1,tx:0,ty:0});
 const modalFocus=useRef<View>(null);
 const pair=layoutContainedPair(available,{width:vm.assets[0].width,height:vm.assets[0].height},8);
 useEffect(()=>{setAnnouncement(`Score ${vm.scores.map(x=>x.absoluteScore).join(' to ')}. ${connection}. ${admitted.phase}.${lastRejection?` Rejected: ${lastRejection}.`:''}`);},[vm.scores,connection,admitted.phase,lastRejection]);
 useEffect(()=>{const handle=findNodeHandle(modalFocus.current);if(vm.meaningQuiz&&handle!==null)AccessibilityInfo.setAccessibilityFocus(handle);},[vm.meaningQuiz]);
 const tapFor=(side:'A'|'B')=>Gesture.Tap().enabled(!disabled).onEnd(({x,y})=>{
   const rect=side==='A'?pair.a.content:pair.b.content;
   const point=inverseContentPoint({x,y},rect,transform,admitted.phase==='FINAL_RUSH'?'FINAL_RUSH':undefined);
   const intent=createTapIntent(vm,{side,...point}); if(intent)onIntent(intent);
 });
 const pan=Gesture.Pan().runOnJS(true).onUpdate(e=>setTransform(old=>clampTransformToContent({...old,tx:e.translationX,ty:e.translationY},pair.a.content,{min:1,max:4})));
 const pinch=Gesture.Pinch().runOnJS(true).onUpdate(e=>setTransform(old=>clampTransformToContent({...old,scale:e.scale},pair.a.content,{min:1,max:4})));
 const board=(side:'A'|'B',index:0|1)=><GestureDetector gesture={Gesture.Simultaneous(tapFor(side),pan,pinch)}><Pressable accessibilityRole="imagebutton" accessibilityLabel={`Difference image ${side}`} accessibilityHint="Double tap a visible difference" accessibilityState={{disabled,busy:pendingIntentId!==null}} disabled={disabled} style={{minWidth:48,minHeight:48,overflow:'hidden',height:pair.a.viewport.height}}><Image source={{uri:vm.assets[index].url}} accessibilityIgnoresInvertColors resizeMode="contain" style={{position:'absolute',left:pair.a.content.x,top:pair.a.content.y,width:pair.a.content.width,height:pair.a.content.height,transform:[{scale:transform.scale},{translateX:transform.tx},{translateY:transform.ty}]}}/>{vm.claimed.map(c=>{const circle=side==='A'?c.displayCircles.imageA:c.displayCircles.imageB;return <View key={`${side}-${c.objectiveId}`} accessible={false} pointerEvents="none" style={{position:'absolute',left:pair.a.content.x+(circle.cx-circle.r)*pair.a.content.width,top:pair.a.content.y+(circle.cy-circle.r)*pair.a.content.height,width:circle.r*2*pair.a.content.width,aspectRatio:1,borderRadius:999,borderWidth:3,borderColor:'#FFD54F',transform:[{scale:transform.scale},{translateX:transform.tx},{translateY:transform.ty}]}}/>})}</Pressable></GestureDetector>;
 return <SafeAreaView accessibilityLabel="Battle" style={{flex:1}}><View onLayout={({nativeEvent})=>setAvailable({width:nativeEvent.layout.width,height:nativeEvent.layout.height})} style={{flex:1}}><View accessibilityRole="summary" accessibilityLiveRegion="polite"><Text allowFontScaling maxFontSizeMultiplier={2}>{announcement}</Text><Text allowFontScaling maxFontSizeMultiplier={2}>{pendingIntentId?'Submitting…':admitted.phase}</Text></View>{board('A',0)}{board('B',1)}<Modal visible={vm.meaningQuiz!==null} accessibilityViewIsModal onRequestClose={()=>{}} transparent><View ref={modalFocus} accessible accessibilityRole="alert" accessibilityLabel="Meaning quiz" accessibilityLiveRegion="polite" style={{flex:1,justifyContent:'center'}}><Text accessibilityRole="header" allowFontScaling maxFontSizeMultiplier={2}>{vm.meaningQuiz?.prompt}</Text>{vm.meaningQuiz?.options.map(option=><Pressable key={option.id} disabled={pendingIntentId!==null} accessibilityRole="button" accessibilityLabel={option.label} accessibilityHint="Submit this meaning" accessibilityState={{disabled:pendingIntentId!==null,busy:pendingIntentId!==null}} onPress={()=>{if(pendingIntentId===null)onIntent({type:'SUBMIT_MEANING',optionId:option.id})}} style={{minWidth:48,minHeight:48}}><Text allowFontScaling maxFontSizeMultiplier={2}>{option.label}</Text></Pressable>)}</View></Modal></View></SafeAreaView>;
}
