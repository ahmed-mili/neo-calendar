import {invokeNative} from "./bridge"; export function invoke<T>(command:string,args?:unknown):Promise<T>{return invokeNative<T>(command,args)}
