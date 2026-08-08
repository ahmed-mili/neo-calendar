import {pickDirectory,pickFiles} from "./bridge";
export async function open(options:any):Promise<string|string[]|null>{if(options?.directory)return pickDirectory();const files=await pickFiles(Boolean(options?.multiple));return options?.multiple?files:(files[0]??null)}
export async function save():Promise<null>{return null}
