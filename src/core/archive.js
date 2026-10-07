import {unzip,zip,strToU8,strFromU8} from 'fflate';
import {validateRecording} from './model.js';
const LIMIT=1024*1024*1024;
export async function readArchive(file){
  if(file.size>LIMIT)throw new Error('1 GB 이하의 기록 파일을 열어주세요. 큰 세션은 나누어 기록하는 것을 권장합니다.');
  if(/\.json$/i.test(file.name))return {data:validateRecording(JSON.parse(await file.text())),assets:new Map(),release(){}};
  let total=0;
  const bytes=new Uint8Array(await file.arrayBuffer());
  const files=await new Promise((resolve,reject)=>unzip(bytes,{filter:f=>{total+=f.originalSize;if(total>LIMIT||f.originalSize>LIMIT)throw new Error('압축을 푼 기록 크기가 1 GB를 넘습니다.');return /^(recording\.json|assets\/[^/]+)$/.test(f.name);}},(e,r)=>e?reject(e):resolve(r)));
  if(!files['recording.json'])throw new Error('기록 데이터(recording.json)가 없는 파일입니다.');
  const data=validateRecording(JSON.parse(strFromU8(files['recording.json'])));
  const assets=new Map();const urls=[];
  for(const a of data.assets||[]){if(typeof a.url!=='string'||!/^assets\/[^/]+$/.test(a.path))continue;const bytes=files[a.path];if(!bytes)continue;const mime=/^(image\/(png|jpeg|gif|webp|avif)|audio\/[\w.+-]+|video\/[\w.+-]+|font\/[\w.+-]+|application\/(octet-stream|font-woff))$/i.test(a.mime)?a.mime:'application/octet-stream';const url=URL.createObjectURL(new Blob([bytes],{type:mime}));assets.set(a.url,url);urls.push(url);}
  return {data,assets,release(){for(const url of urls)URL.revokeObjectURL(url);}};
}
export async function makeArchive(data,blobs=[]){const entries={'recording.json':strToU8(JSON.stringify(data))};for(const a of blobs){entries[a.path]=[new Uint8Array(await a.blob.arrayBuffer()),{level:0}];}return new Blob([await new Promise((resolve,reject)=>zip(entries,{level:6},(e,r)=>e?reject(e):resolve(r)))],{type:'application/zip'});}
export function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
// Untrusted archives never get script execution or arbitrary remote requests in rrweb.
export function sanitizeEvents(events,assets){
  const cspId=2000000001;
  const policy="default-src 'none'; img-src blob: data:; media-src blob:; style-src 'unsafe-inline' blob:; font-src blob: data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  const resolve=url=>assets.get(url)||(/^data:image\/(png|jpeg|gif|webp|avif);base64,/i.test(url)?url:'');
  const css=s=>String(s).replace(/@import\s+[^;]+;?/gi,'').replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,(_,q,url)=>`url("${resolve(url)}")`);
  const attr=(k,v)=>{k=k.toLowerCase();if(k.startsWith('on')||['srcdoc','action','formaction','href','xlink:href','poster','srcset','integrity','nonce'].includes(k))return '';if(k==='src')return resolve(String(v));if(k==='style'||k==='_cssText'.toLowerCase())return css(v);if(k==='value')return '';return v;};
  const node=n=>{if(!n||typeof n!=='object')return n;const out={...n};if(out.id>=2000000000)out.id=-2;if(['script','iframe','object','embed','base','meta','link','form','audio','video'].includes(String(n.tagName).toLowerCase())){out.tagName='span';out.attributes={};out.childNodes=[];return out;}if(n.attributes)out.attributes=Object.fromEntries(Object.entries(n.attributes).map(([k,v])=>[k,attr(k,v)]));if(n.isStyle)out.textContent=css(n.textContent);if(n.childNodes)out.childNodes=n.childNodes.map(node);if(n.tagName==='head')out.childNodes=[{type:2,tagName:'meta',attributes:{'http-equiv':'Content-Security-Policy',content:policy},childNodes:[],id:cspId},...(out.childNodes||[])];return out;};
  return events.filter(e=>e.type!==6&&!(e.type===3&&[9,10,11,13,15].includes(e.data?.source))).map(e=>{const out=structuredClone(e);if(out.type===2)out.data.node=node(out.data.node);if(out.type===3&&out.data.source===0){out.data.removes=out.data.removes?.filter(a=>a.id<cspId);out.data.adds=out.data.adds?.filter(a=>a.parentId<cspId).map(a=>({...a,node:node(a.node)}));out.data.attributes=out.data.attributes?.filter(a=>a.id<cspId).map(a=>({...a,attributes:Object.fromEntries(Object.entries(a.attributes||{}).map(([k,v])=>[k,attr(k,v)]))}));out.data.texts=out.data.texts?.filter(a=>a.id<cspId).map(t=>({...t,value:css(t.value)}));}if(out.type===3&&out.data.source===8)out.data.adds=out.data.adds?.map(a=>({...a,rule:css(a.rule)}));return out;});
}
