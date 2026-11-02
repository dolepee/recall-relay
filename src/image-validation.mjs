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
      if(bytes[24]>8)throw new Error('depth');
      const chunks=[bytes.subarray(0,8)],idat=[];let ended=false;
      for(let offset=8;offset<bytes.length;){
        if(offset+12>bytes.length)throw new Error('chunk');
        const length=bytes.readUInt32BE(offset),end=offset+12+length;
        if(end>bytes.length||ended)throw new Error('chunk');
        const kind=bytes.toString('ascii',offset+4,offset+8);
        if(kind==='IHDR'&&offset!==8)throw new Error('header');
        if(['IHDR','PLTE','IDAT','tRNS','IEND'].includes(kind))chunks.push(bytes.subarray(offset,end));
        else if(kind[0]===kind[0].toUpperCase())throw new Error('critical chunk');
        if(kind==='IDAT')idat.push(bytes.subarray(offset+8,end-4));
        if(kind==='IEND')ended=true;
        offset=end;
      }
      if(!ended||!idat.length)throw new Error('incomplete');
      // Bound decompression before the pure-JS decoder. Strip ancillary metadata,
      // including compressed profiles, so it cannot allocate outside this bound.
      inflateSync(Buffer.concat(idat),{maxOutputLength:width*height*4+height});
      const decoded=decodePNG(Buffer.concat(chunks),{checkCrc:true});
      if(decoded.width!==width||decoded.height!==height||!decoded.data.length)throw new Error('pixels');
    }else{
      const decoded=jpeg.decode(bytes,{useTArray:true,formatAsRGBA:false,tolerantDecoding:false,maxResolutionInMP:4,maxMemoryUsageInMB:32});
      if(!decoded.width||!decoded.height||decoded.width>4096||decoded.height>4096||decoded.width*decoded.height>MAX_PIXELS)throw new Error('dimensions');
    }
  }catch{throw new Error('The photograph cannot be decoded safely. Choose a valid non-interlaced 8-bit PNG or JPEG up to 4 megapixels and 4096 pixels per side.');}
}
