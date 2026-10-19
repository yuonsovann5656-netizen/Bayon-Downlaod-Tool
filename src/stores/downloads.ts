import { create } from 'zustand';
export type Item={id:string;url:string;filename:string;path?:string;status:string;percent:number|null;received:number;total:number;speed:number;message?:string};
type State={items:Item[]; add:(item:Item)=>void; patch:(id:string, update:Partial<Item>)=>void; remove:(id:string)=>void; set:(items:Item[])=>void};
export const useDownloads=create<State>(set=>({items:[],add:item=>set(s=>({items:[item,...s.items]})),patch:(id,update)=>set(s=>({items:s.items.map(x=>x.id===id?{...x,...update}:x)})),remove:id=>set(s=>({items:s.items.filter(x=>x.id!==id)})),set:items=>set({items})}));
