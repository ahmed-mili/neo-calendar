export async function dirname(value:string):Promise<string>{const i=Math.max(value.lastIndexOf("/"),value.lastIndexOf("\\"));return i>0?value.slice(0,i):value}
