import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';

const signature=Buffer.from([137,80,78,71,13,10,26,10]);
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0});
const crc32=bytes=>{let c=0xffffffff;for(const byte of bytes)c=crcTable[(c^byte)&255]^(c>>>8);return (c^0xffffffff)>>>0};
const paeth=(left,up,upperLeft)=>{const q=left+up-upperLeft,pa=Math.abs(q-left),pb=Math.abs(q-up),pc=Math.abs(q-upperLeft);return pa<=pb&&pa<=pc?left:pb<=pc?up:upperLeft};

export function readPngRgba(path){
 const bytes=readFileSync(path);if(bytes.length<20||!bytes.subarray(0,8).equals(signature))throw new Error('PNG signature required');
 let offset=8,width=0,height=0,depth=0,color=-1,interlace=-1,seenIhdr=false,seenIdat=false,closedIdat=false,seenIend=false;const idat=[];
 while(offset<bytes.length){
  if(offset+12>bytes.length)throw new Error('truncated PNG chunk');
  const length=bytes.readUInt32BE(offset),typeStart=offset+4,dataStart=offset+8,dataEnd=dataStart+length,crcEnd=dataEnd+4;
  if(dataEnd< dataStart||crcEnd>bytes.length)throw new Error('PNG chunk length exceeds input');
  const type=bytes.toString('ascii',typeStart,dataStart),data=bytes.subarray(dataStart,dataEnd),expected=bytes.readUInt32BE(dataEnd),actual=crc32(bytes.subarray(typeStart,dataEnd));
  if(actual!==expected)throw new Error(`PNG ${type} CRC mismatch`);
  if(!seenIhdr&&type!=='IHDR')throw new Error('IHDR must be the first PNG chunk');
  if(type==='IHDR'){
   if(seenIhdr)throw new Error('duplicate PNG IHDR');if(length!==13)throw new Error('invalid IHDR');seenIhdr=true;width=data.readUInt32BE(0);height=data.readUInt32BE(4);depth=data[8];color=data[9];interlace=data[12];if(data[10]!==0||data[11]!==0)throw new Error('unsupported PNG compression or filter method');
  }else if(type==='IDAT'){
   if(closedIdat)throw new Error('PNG IDAT chunks must be consecutive');seenIdat=true;idat.push(data);
  }else if(type==='IEND'){
   if(!seenIdat)throw new Error('PNG IDAT required');if(length!==0)throw new Error('invalid IEND');seenIend=true;offset=crcEnd;if(offset!==bytes.length)throw new Error('IEND must be the last PNG chunk');break;
  }else if(seenIdat)closedIdat=true;
  offset=crcEnd;
 }
 if(!seenIend)throw new Error('PNG IEND required');
 if(!width||!height||depth!==8||![2,6].includes(color)||interlace!==0)throw new Error('only non-interlaced 8-bit RGB or RGBA PNG is supported');
 const bpp=color===2?3:4,stride=width*bpp,expectedRaw=height*(stride+1);if(!Number.isSafeInteger(expectedRaw)||expectedRaw>0x7fffffff)throw new Error('PNG dimensions are too large');
 const raw=inflateSync(Buffer.concat(idat));if(raw.length!==expectedRaw)throw new Error('invalid PNG scanline size');const decoded=new Uint8Array(width*height*bpp);let p=0;
 for(let y=0;y<height;y++){const filter=raw[p++];if(filter>4)throw new Error('invalid PNG filter');for(let x=0;x<stride;x++){const value=raw[p++],left=x>=bpp?decoded[y*stride+x-bpp]:0,up=y?decoded[(y-1)*stride+x]:0,upperLeft=y&&x>=bpp?decoded[(y-1)*stride+x-bpp]:0;const predictor=filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):filter===4?paeth(left,up,upperLeft):0;decoded[y*stride+x]=(value+predictor)&255}}
 if(color===6)return{width,height,data:decoded};const out=new Uint8Array(width*height*4);for(let src=0,dst=0;src<decoded.length;src+=3,dst+=4){out[dst]=decoded[src];out[dst+1]=decoded[src+1];out[dst+2]=decoded[src+2];out[dst+3]=255}return{width,height,data:out};
}
