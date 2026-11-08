import { useEffect,useRef } from 'react';
import L from 'leaflet';
import type { Coordinates,ServiceCenter } from '../../../shared/roadside';
import 'leaflet/dist/leaflet.css';
export default function WorkshopMap({location,centers,selected,onSelect}:{location:Coordinates;centers:ServiceCenter[];selected:string|null;onSelect:(id:string)=>void}) {
  const element=useRef<HTMLDivElement>(null);const map=useRef<L.Map|null>(null);const markers=useRef<L.LayerGroup|null>(null);
  useEffect(()=>{
    if(!element.current)return;
    const instance=L.map(element.current,{zoomControl:true,scrollWheelZoom:false}).setView([location.lat,location.lon],12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(instance);
    map.current=instance;markers.current=L.layerGroup().addTo(instance);
    const resize=new ResizeObserver(()=>instance.invalidateSize());resize.observe(element.current);
    return()=>{resize.disconnect();instance.remove();map.current=null;markers.current=null;};
  },[]);
  useEffect(()=>{
    const instance=map.current,group=markers.current;if(!instance||!group)return;
    group.clearLayers();
    L.circleMarker([location.lat,location.lon],{radius:6,color:'#fff',weight:3,fillColor:'#1688ff',fillOpacity:1}).bindTooltip('Your search location').addTo(group);
    centers.forEach((center,index)=>{
      const icon=L.divIcon({className:'workshop-marker',html:`<span class="${center.id===selected?'chosen':''}">${index+1}</span>`,iconSize:[30,34],iconAnchor:[15,32]});
      const tooltip=document.createElement('span');tooltip.textContent=center.name;
      L.marker([center.lat,center.lon],{icon,title:center.name}).bindTooltip(tooltip).on('click',()=>onSelect(center.id)).addTo(group);
    });
    if(centers.length)instance.fitBounds(L.latLngBounds([[location.lat,location.lon],...centers.map(c=>[c.lat,c.lon] as [number,number])]),{padding:[28,28],maxZoom:14});
    else instance.setView([location.lat,location.lon],12);
  },[location,centers,selected,onSelect]);
  return <div ref={element} className="workshop-map" role="region" aria-label="Nearby workshop map"/>;
}
