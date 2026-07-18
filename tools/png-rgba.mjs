import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';

export function readPngRgba(path){
 const bytes=readFileSync(path);if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('PNG signature required');
 let offset=8,width=0,height=0,depth=0,color=-1,interlace=-1;const idat=[];
 while(offset+12<=bytes.length){const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),start=offset+8,end=start+length;if(end+4>bytes.length)throw new Error('truncated PNG');const data=bytes.subarray(start,end);offset=end+4;if(type==='IHDR'){if(length!==13)throw new Error('invalid IHDR');width=data.readUInt32BE(0);height=data.readUInt32BE(4);depth=data[8];color=data[9];interlace=data[12]}else if(type==='IDAT')idat.push(data);else if(type==='IEND')break;}
 if(!width||!height||depth!==8||color!==6||interlace!==0||!idat.length)throw new Error('only non-interlaced 8-bit RGBA PNG is supported');
 const raw=inflateSync(Buffer.concat(idat)),stride=width*4;if(raw.length!==height*(stride+1))throw new Error('invalid PNG scanline size');const out=new Uint8Array(width*height*4);let p=0;
 for(let y=0;y<height;y++){const filter=raw[p++];if(filter>4)throw new Error('invalid PNG filter');for(let x=0;x<stride;x++){const value=raw[p++],left=x>=4?out[y*stride+x-4]:0,up=y?out[(y-1)*stride+x]:0,upperLeft=y&&x>=4?out[(y-1)*stride+x-4]:0;let predictor=0;if(filter===1)predictor=left;else if(filter===2)predictor=up;else if(filter===3)predictor=Math.floor((left+up)/2);else if(filter===4){const q=left+up-upperLeft,pa=Math.abs(q-left),pb=Math.abs(q-up),pc=Math.abs(q-upperLeft);predictor=pa<=pb&&pa<=pc?left:pb<=pc?up:upperLeft}out[y*stride+x]=(value+predictor)&255}}
 return{width,height,data:out};
}
