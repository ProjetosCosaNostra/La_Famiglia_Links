const encoder=new TextEncoder();
const MAX_TOKEN_CHARS=512;

export function adminSecretReady(env){
  const token=String(env?.ADMIN_PANEL_TOKEN||"").trim();
  return token.length>=32&&token.length<=MAX_TOKEN_CHARS;
}

export function authorized(context){
  const expected=String(context?.env?.ADMIN_PANEL_TOKEN||"").trim();
  const header=String(context?.request?.headers?.get("authorization")||"");
  const match=header.match(/^Bearer\s+(.+)$/i);
  const supplied=match?match[1].trim():"";
  if(!expected||!supplied||expected.length>MAX_TOKEN_CHARS||supplied.length>MAX_TOKEN_CHARS)return false;
  const a=encoder.encode(expected),b=encoder.encode(supplied);
  let diff=a.length^b.length;
  const length=Math.max(a.length,b.length);
  for(let i=0;i<length;i++)diff|=(a[i]??0)^(b[i]??0);
  return diff===0;
}
