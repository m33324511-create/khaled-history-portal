import { json } from "../../_lib/auth.js";
export async function onRequestPost(){
 return json({ok:true},200,{"Set-Cookie":"student_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"});
}
