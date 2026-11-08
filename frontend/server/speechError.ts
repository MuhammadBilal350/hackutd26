/** Translate known provider codes without returning account details or credentials. */
export async function speechError(response:Response,action:string):Promise<string> {
  const body=await response.json().catch(()=>null);
  if(body?.detail?.status==='quota_exceeded')return 'Speech is unavailable because the configured provider has no credits remaining.';
  return `${action} (provider HTTP ${response.status}).`;
}
