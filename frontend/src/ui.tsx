import type { CSSProperties, ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native-web';
export const red = '#f40024';
type BoxProps = {children?:ReactNode;ui?:string;style?:CSSProperties;className?:string};
// Native styles accept numeric spacing, not CSS shorthand strings.
function nativeStyle(style?:CSSProperties) {
  if(!style)return style;
  const result={...style};
  for(const property of ['padding','margin'] as const) {
    const value=result[property];
    if(typeof value!=='string'||!/^[-\d.px\s]+$/.test(value))continue;
    const parts=value.trim().split(/\s+/).map(Number.parseFloat);
    if(parts.some(n=>!Number.isFinite(n)))continue;
    const [top,right=top,bottom=top,left=right]=parts;
    delete result[property];
    Object.assign(result,{[`${property}Top`]:top,[`${property}Right`]:right,[`${property}Bottom`]:bottom,[`${property}Left`]:left});
  }
  return result;
}
export function Box({children,ui,style,className}:BoxProps) { return <View dataSet={{ui}} {...(className ? {className} : {})} style={nativeStyle(style) as never}>{children}</View>; }
export function Txt({children,ui='body',style}:BoxProps) { return <Text dataSet={{ui}} style={style as never}>{children}</Text>; }
export function Tap({children,onPress,label,ui,style,selected,disabled=false}:BoxProps & {onPress?:()=>void;label?:string;selected?:boolean;disabled?:boolean}) {
  return <Pressable {...{role:'button' as const,'aria-label':label,'aria-selected':selected,'aria-disabled':disabled,dataSet:{ui}}} disabled={disabled} onPress={onPress} style={({pressed})=>[nativeStyle(style) as never,{opacity:disabled ? .4 : pressed ? .7 : 1}]}>{children}</Pressable>;
}
export function Card({children,style}:BoxProps) { return <Box ui="card" style={style}>{children}</Box>; }
export function Row({children,style}:BoxProps) { return <Box ui="row" style={style}>{children}</Box>; }
export function Header({title,sub}:{title:string;sub?:string}) {return <Box><Txt ui="title">{title}</Txt>{sub && <Txt ui="sub">{sub}</Txt>}</Box>;}
export function Label({children}:BoxProps) {return <Txt ui="label">{children}</Txt>;}
export function Button({children,onPress,secondary=false,disabled=false,label}:{children:ReactNode;onPress?:()=>void;secondary?:boolean;disabled?:boolean;label?:string}) {return <Tap label={label || (typeof children==='string'?children:undefined)} ui={secondary?'secondary':'primary'} onPress={onPress} disabled={disabled}><Txt>{children}</Txt></Tap>;}
export function Segments({items,value,onChange,label}:{items:string[];value:string;onChange:(value:string)=>void;label?:string}) {return <Box ui="segment">{items.map(item=><Tap key={item} label={label ? `${label} ${item}` : item} selected={value===item} onPress={()=>onChange(item)}><Txt>{item}</Txt></Tap>)}</Box>;}
export function Progress({percent,color=red}:{percent:number;color?:string}) {return <Box ui="progress"><Box style={{width:`${percent}%`,background:color}}/></Box>;}
export function Badge({children,tone='amber'}:{children:ReactNode;tone?:string}) {return <Txt ui="tag" style={{color:`var(--${tone})`,background:`var(--${tone}bg)`}}>{children}</Txt>;}
export function IconBox({children,color='red'}:{children:ReactNode;color?:string}) {return <Box ui="icon-box" style={{color:color==='red'?red:`var(--${color})`,background:color==='red'?'var(--rose)':`var(--${color}bg)`}}>{children}</Box>;}
export function ScoreRing() {return <div className="ring"><svg viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="48" fill="none" stroke="var(--line)" strokeWidth="9"/><circle cx="55" cy="55" r="48" fill="none" stroke={red} strokeWidth="9" strokeDasharray="223 302" strokeLinecap="round"/></svg><div className="ring-center"><strong>7.4</strong><small>of 10</small></div></div>;}
export function Toyota() {return <img className="toyota" src="/toyota-logo-transparent.png" width="60" height="44" alt="Toyota"/>;}


