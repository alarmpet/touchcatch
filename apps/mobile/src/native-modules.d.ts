declare module 'react-native' {
  import type {ComponentType} from 'react';
  export const AccessibilityInfo:{setAccessibilityFocus(handle:unknown):void};
  export const findNodeHandle:(value:unknown)=>number|null;
  type NativeProps={onLayout?:(event:{nativeEvent:{layout:{width:number;height:number}}})=>void;[key:string]:any};
  export const Image:ComponentType<NativeProps>,Modal:ComponentType<NativeProps>,Pressable:ComponentType<NativeProps>,Text:ComponentType<NativeProps>,View:ComponentType<NativeProps>;
}
declare module 'react-native-gesture-handler' {import type {ComponentType} from 'react';export const Gesture:any;export const GestureDetector:ComponentType<any>}
declare module 'react-native-safe-area-context' {import type {ComponentType} from 'react';export const SafeAreaView:ComponentType<any>}
