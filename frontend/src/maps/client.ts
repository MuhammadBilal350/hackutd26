import { createRoadsideFinder, type Coordinates, type ServiceCenter } from '../../../shared/roadside';
export function searchWorkshops(location:Coordinates) {return createRoadsideFinder(import.meta.env.VITE_GEOAPIFY_API_KEY)(location);}
export function browserLocation():Promise<Coordinates> {
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation){reject(new Error('Location is not supported by this browser.'));return;}
    navigator.geolocation.getCurrentPosition(position=>resolve({lat:position.coords.latitude,lon:position.coords.longitude}),error=>reject(new Error(error.code===1?'Location access was declined. Allow location in your browser and try again.':'Your location could not be found. Please try again.')),{enableHighAccuracy:false,timeout:10_000,maximumAge:60_000});
  });
}
export function directions(center:ServiceCenter) {return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${center.lat},${center.lon}`)}`;}
