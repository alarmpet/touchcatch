import {describe,expect,it} from 'vitest';
import {deflateSync} from 'node:zlib';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {readPngRgba} from '../../tools/png-rgba.mjs';

const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0});
const crc32=(bytes:Buffer)=>{let c=0xffffffff;for(const byte of bytes)c=crcTable[(c^byte)&255]!^(c>>>8);return (c^0xffffffff)>>>0};
const chunk=(type:string,data=Buffer.alloc(0))=>{const name=Buffer.from(type),out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([name,data])),8+data.length);return out};
const png=(colorType:number,pixels:number[],options:{interlace?:number;order?:string[]}={})=>{const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1,0);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=colorType;ihdr[12]=options.interlace??0;const chunks:Record<string,Buffer>={IHDR:chunk('IHDR',ihdr),IDAT:chunk('IDAT',deflateSync(Buffer.from([0,...pixels]))),IEND:chunk('IEND')};return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),...(options.order??['IHDR','IDAT','IEND']).map(x=>chunks[x]!)])};
const temp=()=>{mkdirSync(resolve('.superpowers'),{recursive:true});return mkdtempSync(resolve('.superpowers/png-'))};

describe('strict PNG decoding',()=>{
 it.each([[2,[10,20,30],[10,20,30,255]],[6,[10,20,30,40],[10,20,30,40]]] as const)('decodes non-interlaced 8-bit color type %s',(_,input,expected)=>{const path=join(temp(),'valid.png');writeFileSync(path,png(_, [...input]));expect([...readPngRgba(path).data]).toEqual(expected)});
 it('rejects a corrupt chunk CRC',()=>{const path=join(temp(),'crc.png'),bytes=png(6,[1,2,3,4]),last=bytes.length-1;bytes[last]=bytes[last]!^1;writeFileSync(path,bytes);expect(()=>readPngRgba(path)).toThrow(/CRC/i)});
 it.each([['IDAT before IHDR',['IDAT','IHDR','IEND']],['chunk after IEND',['IHDR','IEND','IDAT']],['missing IEND',['IHDR','IDAT']],['duplicate IHDR',['IHDR','IHDR','IDAT','IEND']]] as const)('rejects %s',(_,order)=>{const path=join(temp(),'order.png');writeFileSync(path,png(6,[1,2,3,4],{order:[...order]}));expect(()=>readPngRgba(path)).toThrow()});
 it('rejects interlaced and unsupported PNG formats',()=>{const a=join(temp(),'interlace.png'),b=join(temp(),'unsupported.png');writeFileSync(a,png(6,[1,2,3,4],{interlace:1}));writeFileSync(b,png(4,[1,2]));expect(()=>readPngRgba(a)).toThrow(/non-interlaced/i);expect(()=>readPngRgba(b)).toThrow(/RGB or RGBA/i)});
 it('rejects a chunk length that exceeds the input bounds',()=>{const path=join(temp(),'length.png'),bytes=png(6,[1,2,3,4]);bytes.writeUInt32BE(0xffffffff,8);writeFileSync(path,bytes);expect(()=>readPngRgba(path)).toThrow(/length exceeds/i)});
});
