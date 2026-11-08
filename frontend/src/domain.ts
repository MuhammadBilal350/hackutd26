export function finance(price: number, down: number, apr: number, months: number): {monthly:number;interest:number} | null {
  if (![price, down, apr, months].every(Number.isFinite) || price < 0 || down < 0 || apr < 0 || months <= 0) return null;
  const principal = Math.max(0, price - down);
  const rate = apr / 1200;
  const monthly = rate ? principal * rate / (1 - Math.pow(1 + rate, -months)) : principal / months;
  return { monthly, interest: Math.max(0, monthly * months - principal) };
}
export function canAnalyze(exterior: string, dashboard: string): boolean { return Boolean(exterior && dashboard); }
export const money = (value:number) => '$' + Math.round(value).toLocaleString('en-US');
export const costs = [
  [1800,7200],[2100,3800],[2300,3800],[2700,3800],[3000,3800],
  [3100,3300],[3400,3300],[3600,3400],[5300,4800],[4200,3800]
];
export const issues = [
  ['Check engine light','Steady amber · book within 2 weeks','Soon'],
  ['Tire pressure','One tire is low','Today'],
  ['Passenger door dent','Front door, about 2 in','Soon'],
  ['Rear bumper scratch','Paint only','Minor']
];
export const maintenance = [['Oil change','1,240 mi',75],['Tire rotation','2,800 mi',44],['Brake pads','9,500 mi',62],['Cabin air filter','6,100 mi',59]] as const;
export const dealers = [['Cedar Hill Toyota','$34,690','7.8 mi · 5 in stock','+$510'],['Riverbend Toyota','$35,050','11.5 mi · 2 in stock','+$870'],['Northgate Toyota','$35,420','3.1 mi · 4 in stock','+$1,240'],['Summit Toyota','$36,210','18.9 mi · 1 in stock','+$2,030']];
