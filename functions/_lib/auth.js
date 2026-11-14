const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers }
});
export function b64url(bytes) {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
export function unb64url(s) {
  const raw = atob(s.replace(/-/g,"+").replace(/_/g,"/") + "=".repeat((4-s.length%4)%4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
async function hmacKey(secret, usages) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), {name:"HMAC",hash:"SHA-256"}, false, usages);
}
export async function issueSession(payload, secret) {
  const encoded = b64url(encoder.encode(JSON.stringify(payload)));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret,["sign"]), encoder.encode(encoded)));
  return encoded + "." + b64url(signature);
}
export async function readSession(request, cookieName, secret) {
  const cookies = request.headers.get("Cookie") || "";
  const token = cookies.split(";").map(x=>x.trim()).find(x=>x.startsWith(cookieName+"="))?.slice(cookieName.length+1);
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  try {
    const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret,["verify"]), unb64url(parts[1]), encoder.encode(parts[0]));
    if (!valid) return null;
    const data = JSON.parse(decoder.decode(unb64url(parts[0])));
    if (!data.exp || data.exp < Math.floor(Date.now()/1000)) return null;
    return data;
  } catch { return null; }
}
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:310000,hash:"SHA-256"},key,256));
  return "pbkdf2$310000$"+b64url(salt)+"$"+b64url(bits);
}
export async function verifyPassword(password, stored) {
  try {
    const [kind, iterations, saltText, hashText] = stored.split("$");
    if (kind !== "pbkdf2" || Number(iterations) < 200000) return false;
    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt:unb64url(saltText),iterations:Number(iterations),hash:"SHA-256"},key,256));
    const expected = unb64url(hashText);
    if (bits.length !== expected.length) return false;
    let diff=0; for(let i=0;i<bits.length;i++) diff |= bits[i]^expected[i];
    return diff===0;
  } catch { return false; }
}
export function cookie(name,value,maxAge) {
  return name+"="+value+"; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age="+maxAge;
}
export function clearCookie(name) { return name+"=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"; }
export function sameOrigin(request) {
  const origin=request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}
export async function requireAdmin(request, env) {
  const session=await readSession(request,"admin_session",env.SESSION_SECRET);
  if (!session || session.kind!=="admin" || !session.sub) return null;
  const admin=await env.DB.prepare("SELECT id, full_name, username, role, permissions_json, is_active FROM admins WHERE id=? LIMIT 1").bind(session.sub).first();
  if (!admin || !admin.is_active) return null;
  return admin;
}
