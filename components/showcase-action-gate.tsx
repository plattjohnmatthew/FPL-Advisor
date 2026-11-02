"use client";
import { cloneElement, createContext, useContext, useState, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { useCapabilities } from "./app-capabilities";
import { Dialog } from "./ui/interactive";
import { Button } from "./ui/primitives";
import { runShowcaseAction, SHOWCASE_DESCRIPTIONS } from "@/lib/showcase";
const Context=createContext<((action:string,description?:string)=>void) | null>(null);
export function ShowcaseProvider({children,links}:{children:ReactNode;links:{github:string;setup:string}}) {
 const [message,setMessage]=useState<{action:string;description?:string}|null>(null);
 return <Context.Provider value={(action,description)=>setMessage({action,description})}>{children}<Dialog open={message!==null} onClose={()=>setMessage(null)} title="Read-only showcase" className="showcase-dialog">
  <p className="eyebrow">{message?.action}</p>
  <p>This public version lets you explore the full FPL Research product without running paid API actions or changing data.</p>
  <p>{message?.description ?? (message ? SHOWCASE_DESCRIPTIONS[message.action] : null)}</p>
  <p className="helper-text">Clone the project from GitHub to run the full version locally with your own API keys and configuration.</p>
  <div className="showcase-dialog-actions"><a className="button-link" href={links.github} target="_blank" rel="noreferrer">View on GitHub ↗</a><a href={links.setup} target="_blank" rel="noreferrer">Run locally</a><Button variant="secondary" onClick={()=>setMessage(null)}>Close</Button></div>
 </Dialog></Context.Provider>;
}
export function useShowcaseAction() {
 const capabilities=useCapabilities(), show=useContext(Context);
 if (!show) throw new Error("ShowcaseProvider is required");
 return { block(action:string,description?:string) { return !runShowcaseAction(capabilities.mode==="public_read_only",show,action,()=>{},description); } };
}
export function ShowcaseActionGate({action,description,children}:{action:string;description?:string;children:ReactElement<{onClick?:(event:MouseEvent)=>void}>}) {
 const gate=useShowcaseAction();
 return cloneElement(children,{onClick:(event:MouseEvent)=>{ if(gate.block(action,description)){event.preventDefault();event.stopPropagation();return;} children.props.onClick?.(event); }});
}
