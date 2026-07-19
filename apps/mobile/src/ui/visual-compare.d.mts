export type RgbaImage={width:number;height:number;data:Uint8Array};
export type Region={id:string;x:number;y:number;width:number;height:number;maxChangedRatio:number;maxChannelDelta:number};
export function compareRegions(actual:RgbaImage,golden:RgbaImage,regions:readonly Region[],masks:readonly Region[]):Array<{id:string;pass:boolean;checkedPixels:number;changedPixelRatio:number;observedMaxChannelDelta:number}>;
