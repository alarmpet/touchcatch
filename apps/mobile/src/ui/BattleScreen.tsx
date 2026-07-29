import type {MatchSnapshotV1} from '../../../../packages/contracts/src/socket.js';
import {parseMatchSnapshotV1} from '../../../../packages/contracts/src/socket.schema.js';
import theme from '../../../../config/ui-theme.v1.json' with {type:'json'};
import {useEffect,useMemo,useRef,useState} from 'react';
import {AccessibilityInfo,findNodeHandle,Image,Modal,Platform,Pressable,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Gesture,GestureDetector} from 'react-native-gesture-handler';
import {adaptMatchSnapshot,applyGestureDelta,assertPublicUiValue,createMeaningIntent,createTapIntent,inverseContentPoint,layoutBattleRegions,shouldCancelSyntheticTap,touchTargetForPlatform,type BattleExternalState,type Transform} from './battle-shell.js';

type Intent=NonNullable<ReturnType<typeof createTapIntent>>|NonNullable<ReturnType<typeof createMeaningIntent>>;
type Props={snapshot:MatchSnapshotV1;pendingIntentId:string|null;connection:BattleExternalState['connection'];lastRejection?:string|null;preferences?:Readonly<{reducedMotion:boolean;highContrast:boolean}>;onIntent:(intent:Intent)=>void};
const playable=new Set(['PLAYING','FINAL_RUSH','SUDDEN_DEATH']);

export function BattleScreen({snapshot,pendingIntentId,connection,lastRejection=null,preferences={reducedMotion:false,highContrast:false},onIntent}:Props){
 const admitted=useMemo(()=>{assertPublicUiValue(snapshot);return parseMatchSnapshotV1(snapshot)},[snapshot]);
 const vm=adaptMatchSnapshot(admitted,{pendingIntentId,connection});
 const disabled=!admitted.viewerInput.enabled||connection!=='CONNECTED'||pendingIntentId!==null||admitted.result!==null||!playable.has(admitted.phase);
 const canvasColor=preferences.highContrast?'#000000':theme.color.background;
 const inkColor=preferences.highContrast?'#FFFFFF':theme.color.ink;
 const [safeArea,setSafeArea]=useState({width:theme.viewport.baseline[0]??390,height:theme.viewport.baseline[1]??844});
 const [chrome,setChrome]=useState({headerHeight:0,summaryHeight:0});
 const [announcement,setAnnouncement]=useState('');
 const [transform,setTransform]=useState<Transform>({scale:1,tx:0,ty:0});
 const modalFocus=useRef<unknown>(null),boardFocus=useRef<unknown>(null),base=useRef<Transform>(transform),motion=useRef({translationPx:0,scaleDelta:0});
 const layout=layoutBattleRegions(safeArea,chrome,{width:vm.assets[0].width,height:vm.assets[0].height},theme.space.baseGrid),pair=layout.pair;
 useEffect(()=>setAnnouncement(`Score ${vm.scores.map(x=>x.absoluteScore).join(' to ')}. ${connection}. ${admitted.phase}.${lastRejection?` Rejected: ${lastRejection}.`:''}`),[vm.scores,connection,admitted.phase,lastRejection]);
 useEffect(()=>{const handle=findNodeHandle(vm.meaningQuiz?modalFocus.current:boardFocus.current);if(handle!==null)AccessibilityInfo.setAccessibilityFocus(handle)},[vm.meaningQuiz]);

 const board=(side:'A'|'B',index:0|1)=>{
  const begin=()=>{base.current=transform;motion.current={translationPx:0,scaleDelta:0}};
  const pan=Gesture.Pan().runOnJS(true).onBegin(begin).onUpdate((e:{translationX:number;translationY:number})=>{motion.current.translationPx=Math.hypot(e.translationX,e.translationY);setTransform(applyGestureDelta(base.current,{scale:1,tx:e.translationX,ty:e.translationY},pair.a.content,{min:1,max:4}))});
  const pinch=Gesture.Pinch().runOnJS(true).onBegin(begin).onUpdate((e:{scale:number})=>{motion.current.scaleDelta=Math.abs(e.scale-1);setTransform(applyGestureDelta(base.current,{scale:e.scale,tx:0,ty:0},pair.a.content,{min:1,max:4}))});
  const tap=Gesture.Tap().enabled(!disabled).onEnd(({x,y}:{x:number;y:number})=>{if(shouldCancelSyntheticTap(motion.current,{translationPx:theme.space.baseGrid,scaleDelta:.05}))return;const point=inverseContentPoint({x,y},pair.a.content,transform,admitted.phase==='FINAL_RUSH'?'FINAL_RUSH':undefined);const intent=createTapIntent(vm,{side,...point});if(intent)onIntent(intent)});
  return <GestureDetector key={side} gesture={Gesture.Exclusive(Gesture.Simultaneous(pan,pinch),tap)}>
   <Pressable ref={side==='A'?boardFocus:undefined} accessibilityRole="imagebutton" accessibilityLabel={`Difference image ${side}`} accessibilityHint="Double tap a visible difference" accessibilityState={{disabled,busy:pendingIntentId!==null}} disabled={disabled} style={{minWidth:touchTargetForPlatform(Platform.OS==='ios'?'ios':'android'),minHeight:touchTargetForPlatform(Platform.OS==='ios'?'ios':'android'),overflow:'hidden',height:pair.a.viewport.height,backgroundColor:canvasColor}}>
    <View testID={`board-content-${side}`} pointerEvents="none" style={{position:'absolute',left:pair.a.content.x,top:pair.a.content.y,width:pair.a.content.width,height:pair.a.content.height,transform:[{translateX:transform.tx},{translateY:transform.ty},{scale:transform.scale}]}}>
     <Image source={{uri:vm.assets[index].url}} fadeDuration={preferences.reducedMotion?0:theme.motionMs.pressed[0]} accessibilityIgnoresInvertColors resizeMode="contain" style={{width:'100%',height:'100%'}}/>
     {vm.claimed.map(c=>{const circle=side==='A'?c.displayCircles.imageA:c.displayCircles.imageB;return <View key={`${side}-${c.objectiveId}`} accessible={false} style={{position:'absolute',left:(circle.cx-circle.r)*pair.a.content.width,top:(circle.cy-circle.r)*pair.a.content.height,width:circle.r*2*pair.a.content.width,aspectRatio:1,borderRadius:theme.radius.pill,borderWidth:theme.depth.card.borderWidth*3,borderColor:preferences.highContrast?'#FFFF00':theme.color.reward}}/>})}
    </View>
   </Pressable>
  </GestureDetector>;
 };

 return <SafeAreaView accessibilityLabel="Battle" style={{flex:1,backgroundColor:canvasColor}} onLayout={({nativeEvent})=>setSafeArea({width:nativeEvent.layout.width,height:nativeEvent.layout.height})}>
  <View style={{flex:1}}>
   <View onLayout={({nativeEvent})=>setChrome(x=>({...x,headerHeight:nativeEvent.layout.height}))}><Text accessibilityRole="header" allowFontScaling maxFontSizeMultiplier={2} style={{color:inkColor,flexShrink:1}}>{admitted.phase}</Text></View>
   <View onLayout={({nativeEvent})=>setChrome(x=>({...x,summaryHeight:nativeEvent.layout.height}))} accessibilityRole="summary" accessibilityLiveRegion="polite"><Text allowFontScaling maxFontSizeMultiplier={2} style={{color:inkColor,fontSize:theme.typography.body.lg.fontSize,lineHeight:theme.typography.body.lg.lineHeight,flexShrink:1}}>{announcement}</Text><Text allowFontScaling maxFontSizeMultiplier={2} style={{color:inkColor,flexShrink:1}}>{pendingIntentId?'Submitting':admitted.phase}</Text></View>
   <View style={{height:safeArea.height-layout.boardsTop,gap:theme.space.baseGrid}}>{board('A',0)}{board('B',1)}</View>
   <Modal visible={vm.meaningQuiz!==null} accessibilityViewIsModal onRequestClose={()=>{}} transparent>
    <View ref={modalFocus} accessible accessibilityRole="alert" accessibilityLabel="Meaning quiz" accessibilityLiveRegion="polite" accessibilityViewIsModal importantForAccessibility="yes" onAccessibilityEscape={()=>{}} style={{flex:1,justifyContent:'center',padding:theme.space.screenX,backgroundColor:theme.color.overlay}}>
     <Text accessibilityRole="header" allowFontScaling maxFontSizeMultiplier={2} style={{fontSize:theme.typography.heading.md.fontSize,lineHeight:theme.typography.heading.md.lineHeight,color:theme.color.surface,flexShrink:1}}>{vm.meaningQuiz?.prompt}</Text>
     {vm.meaningQuiz?.options.map(option=><Pressable key={option.id} disabled={disabled} accessibilityRole="button" accessibilityLabel={option.label} accessibilityHint="Submit this meaning" accessibilityState={{disabled,busy:pendingIntentId!==null}} onPress={()=>{const intent=createMeaningIntent(vm,option.id);if(intent)onIntent(intent)}} style={{minWidth:touchTargetForPlatform(Platform.OS==='ios'?'ios':'android'),minHeight:touchTargetForPlatform(Platform.OS==='ios'?'ios':'android'),padding:theme.space.baseGrid,backgroundColor:theme.color.surface}}><Text allowFontScaling maxFontSizeMultiplier={2} style={{color:theme.color.ink,flexShrink:1}}>{option.label}</Text></Pressable>)}
    </View>
   </Modal>
  </View>
 </SafeAreaView>;
}
