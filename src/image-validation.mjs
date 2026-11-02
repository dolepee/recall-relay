import {Buffer} from 'node:buffer';
import {decode as decodePNG} from 'fast-png';
import {inflateSync} from 'node:zlib';
import jpeg from 'jpeg-js';
const MAX_PIXELS=4_000_000;
// Decode bounded image data before it can be presented as reviewable evidence.
// Successful decoding establishes neither ownership nor authenticity.
export function validateImageBytes(bytes,type){
  try{
    if(type==='png'){
      if(bytes.length<33||bytes.toString('ascii',12,16)!=='IHDR'||bytes[28]!==0)throw new Error('header');
      const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
      if(!width||!height||width>4096||height>4096||width*height>MAX_PIXELS)throw new Error('dimensions');
      const color=bytes[25],channels={0:1,2:3,3:1,4:2,6:4}[color];
      if(bytes[24]!==8||!channels||bytes[26]!==0||bytes[27]!==0)throw new Error('format');
      const chunks=[bytes.subarray(0,8)],idat=[],seen=new Set();
      let ended=false,dataStarted=false,dataEnded=false,paletteEntries=0,chunkCount=0;
      for(let offset=8;offset<bytes.length;){
        if(offset+12>bytes.length||++chunkCount>4096)throw new Error('chunk');
        const length=bytes.readUInt32BE(offset),end=offset+12+length;
        if(end>bytes.length||ended)throw new Error('chunk');
        const kind=bytes.toString('ascii',offset+4,offset+8);
        if(!/^[A-Za-z]{4}$/.test(kind))throw new Error('chunk name');
        if(dataStarted&&kind!=='IDAT')dataEnded=true;
        if(['IHDR','PLTE','tRNS','IEND'].includes(kind)){
          if(seen.has(kind))throw new Error('duplicate chunk');
          seen.add(kind);
        }
        if(kind==='IHDR'&&(offset!==8||length!==13))throw new Error('header');
        if(kind==='PLTE'){
          if(dataStarted||seen.has('tRNS')||color===0||color===4||!length||length%3||length>768)throw new Error('palette');
          paletteEntries=length/3;
        }
        if(kind==='tRNS'){
          if(dataStarted||!length||!([0,2,3].includes(color))||
            (color===3&&(!paletteEntries||length>paletteEntries))||
            (color===0&&length!==2)||(color===2&&length!==6))throw new Error('transparency');
        }
        if(kind==='IDAT'){
          if(dataEnded||(color===3&&!paletteEntries))throw new Error('data order');
          dataStarted=true;
        }
        if(kind==='IEND'&&(length!==0||!dataStarted))throw new Error('end');
        if(['IHDR','PLTE','IDAT','tRNS','IEND'].includes(kind))chunks.push(bytes.subarray(offset,end));
        else if(kind[0]===kind[0].toUpperCase())throw new Error('critical chunk');
        if(kind==='IDAT')idat.push(bytes.subarray(offset+8,end-4));
        if(kind==='IEND')ended=true;
        offset=end;
      }
      if(!ended||!idat.length)throw new Error('incomplete');
      // Bound decompression before the pure-JS decoder. Strip ancillary metadata,
      // including compressed profiles, so it cannot allocate outside this bound.
      const expectedBytes=width*height*channels+height;
      if(inflateSync(Buffer.concat(idat),{maxOutputLength:expectedBytes}).length!==expectedBytes)throw new Error('scanlines');
      const decoded=decodePNG(Buffer.concat(chunks),{checkCrc:true});
      if(decoded.width!==width||decoded.height!==height||!decoded.data.length)throw new Error('pixels');
      if(color===3&&decoded.data.some(index=>index>=paletteEntries))throw new Error('palette index');
    }else{
      const decoded=jpeg.decode(bytes,{useTArray:true,formatAsRGBA:false,tolerantDecoding:false,maxResolutionInMP:4,maxMemoryUsageInMB:32});
      if(!decoded.width||!decoded.height||decoded.width>4096||decoded.height>4096||decoded.width*decoded.height>MAX_PIXELS)throw new Error('dimensions');
    }
  }catch{throw new Error('The photograph cannot be decoded safely. Choose a valid non-interlaced 8-bit PNG or JPEG up to 4 megapixels and 4096 pixels per side.');}
}
