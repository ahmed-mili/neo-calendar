declare global { interface Window { NeoAndroid?: { invoke(id:string,command:string,args:string):void; pickDirectory(id:string):void; pickFiles(id:string,multiple:boolean):void; openExternal?(target:string):void }; __neoAndroidResolve?:(id:string,ok:boolean,payload:string)=>void } }
let sequence=0; const pending=new Map<string,{resolve:(v:any)=>void,reject:(e:Error)=>void}>();
window.__neoAndroidResolve=(id,ok,payload)=>{const item=pending.get(id);if(!item)return;pending.delete(id);if(ok){try{item.resolve(payload?JSON.parse(payload):null)}catch{item.resolve(payload)}}else item.reject(new Error(payload||"Android operation failed"));};
function request(start:(id:string)=>void){return new Promise<any>((resolve,reject)=>{const id=`nca-${Date.now()}-${++sequence}`;pending.set(id,{resolve,reject});try{start(id)}catch(e){pending.delete(id);reject(e)}})}
export function invokeNative<T>(command:string,args:unknown):Promise<T>{if(!window.NeoAndroid) return Promise.reject(new Error("Android native bridge unavailable"));return request(id=>window.NeoAndroid!.invoke(id,command,JSON.stringify(args??{})));}
export function pickDirectory():Promise<string|null>{return request(id=>window.NeoAndroid!.pickDirectory(id));}
export function pickFiles(multiple:boolean):Promise<string[]>{return request(id=>window.NeoAndroid!.pickFiles(id,multiple));}
