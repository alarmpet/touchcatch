import sharp from'sharp';
export type DeltaRegion={id:string;cx:number;cy:number;r:number};
export type VisualDeltaPolicy={pixelThreshold:number;minChangedPixelsPerRegion:number;maxOutsideChangedRatio:number};
export type VisualDeltaReport={dimensionsMatch:true;width:number;height:number;changedRegions:number;missingRegions:string[];outsideChangedPixels:number;outsideChangedRatio:number;outsidePolicy:'PASS'};
export async function evaluateVisualDelta(imageA:string,imageB:string,regions:readonly DeltaRegion[],policy:VisualDeltaPolicy):Promise<VisualDeltaReport>{
 const[a,b]=await Promise.all([sharp(imageA).ensureAlpha().raw().toBuffer({resolveWithObject:true}),sharp(imageB).ensureAlpha().raw().toBuffer({resolveWithObject:true})]);
 if(a.info.width!==b.info.width||a.info.height!==b.info.height)throw Error('PAIR_DIMENSION_MISMATCH');
 const{width,height}=a.info,channels=a.info.channels,counts=new Map(regions.map(region=>[region.id,0]));let outsideChangedPixels=0,outsidePixels=0;
 for(let y=0;y<height;y+=1)for(let x=0;x<width;x+=1){
  const offset=(y*width+x)*channels;
  const changed=Math.max(Math.abs((a.data[offset]??0)-(b.data[offset]??0)),Math.abs((a.data[offset+1]??0)-(b.data[offset+1]??0)),Math.abs((a.data[offset+2]??0)-(b.data[offset+2]??0)))>=policy.pixelThreshold;
  const matches=regions.filter(region=>{const dx=(x+.5)/width-region.cx,dy=(y+.5)/height-region.cy;return dx*dx+dy*dy<=region.r*region.r;});
  if(matches.length){if(changed)for(const region of matches)counts.set(region.id,(counts.get(region.id)??0)+1);}else{outsidePixels+=1;if(changed)outsideChangedPixels+=1;}
 }
 const missingRegions=regions.filter(region=>(counts.get(region.id)??0)<policy.minChangedPixelsPerRegion).map(region=>region.id);
 if(missingRegions.length)throw Error(`MISSING_DECLARED_VISUAL_DELTA:${missingRegions.join(',')}`);
 const outsideChangedRatio=outsidePixels?outsideChangedPixels/outsidePixels:0;if(outsideChangedRatio>policy.maxOutsideChangedRatio)throw Error('UNDECLARED_VISUAL_DELTA');
 return{dimensionsMatch:true,width,height,changedRegions:regions.length,missingRegions,outsideChangedPixels,outsideChangedRatio,outsidePolicy:'PASS'};
}
