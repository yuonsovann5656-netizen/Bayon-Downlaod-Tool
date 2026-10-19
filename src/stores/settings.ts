import { create } from 'zustand';
export type Settings={downloadDirectory:string;videoFormat:string;audioFormat:string;quality:string;maxConcurrent:number;theme:'dark'|'light'|'system';accent:string;notifications:boolean;launchAtStartup:boolean};
type Store={value:Settings;load:()=>Promise<void>;update:(patch:Partial<Settings>)=>Promise<void>};
const defaults:Settings={downloadDirectory:'',videoFormat:'mp4',audioFormat:'mp3',quality:'original',maxConcurrent:2,theme:'dark',accent:'#1685FF',notifications:true,launchAtStartup:false};
export const useSettings=create<Store>(set=>({value:defaults,load:async()=>{try{set({value:await window.bayon.settings.get()})}catch{}},update:async patch=>{const value=await window.bayon.settings.set({...useSettings.getState().value,...patch});set({value})}}));
