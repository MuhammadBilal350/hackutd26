// iPhone 18 Pro: 1206 × 2622 physical pixels, rendered at 3× density.
export const IPHONE = { width: 402, height: 874, pixelRatio: 3 } as const;
export function previewScale(width:number,height:number) {
  const inset=width>=600?48:0;
  return Math.max(.1,Math.min(1,(width-inset)/IPHONE.width,(height-inset)/IPHONE.height));
}
