import { bindContext,getContext } from './db';
import { authError,getAppUser,requireRole } from './app/lib/authz';
import * as evaluations from './app/api/evaluations/route';
import * as history from './app/api/history/route';
import * as timeline from './app/api/timeline/route';
import * as manual from './app/api/manual/route';
import * as imports from './app/api/import/route';
import * as massReports from './app/api/mass-reports/route';
const handlers:Record<string,Record<string,Function>> = {evaluations,history,timeline,manual,import:imports,'mass-reports':massReports};
async function users(request:Request) {
  await requireRole(request,'admin');
  const {env,user:actor} = getContext(request);
  if (request.method === 'PATCH') {
    const {id,role,status} = await request.json() as any;
    if (!Number.isInteger(Number(id)) || !['admin','editor','viewer'].includes(role) || !['approved','pending','rejected'].includes(status)) return Response.json({error:'권한 설정이 올바르지 않습니다.'},{status:400});
    const target = await env.DB.prepare('SELECT id,role FROM techops_users WHERE id = ?').bind(Number(id)).first();
    if (!target) return Response.json({error:'계정을 찾을 수 없습니다.'},{status:404});
    if (target.role === 'admin' || role === 'admin') return Response.json({error:'사이트 관리자 권한은 기존 사용자 관리에서 변경합니다.'},{status:400});
    await env.DB.prepare('INSERT INTO tech_eval_permissions(user_id,role,status,approved_by,approved_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,status=excluded.status,approved_by=excluded.approved_by,approved_at=excluded.approved_at,updated_at=excluded.updated_at')
      .bind(Number(id),role,status,actor.username,status==='approved'?new Date().toISOString():'',new Date().toISOString()).run();
  } else if (request.method !== 'GET') return Response.json({error:'허용되지 않은 요청입니다.'},{status:405});
  const {results} = await env.DB.prepare(`SELECT u.id,u.username,u.username AS email,u.display_name AS displayName,'' AS department,'' AS requestNote,
    CASE WHEN u.role='admin' THEN 'admin' ELSE COALESCE(p.role,'viewer') END AS role,
    CASE WHEN u.role='admin' THEN 'approved' ELSE COALESCE(p.status,'approved') END AS status,
    COALESCE(p.approved_by,'') AS approvedBy,COALESCE(p.approved_at,'') AS approvedAt,u.created_at AS createdAt
    FROM techops_users u LEFT JOIN tech_eval_permissions p ON p.user_id=u.id ORDER BY u.id`).all();
  return Response.json({users:results,ok:true});
}
export async function handleEvaluationApi(request:Request,env:any,user:any) {
  bindContext(request,{env,user});
  try {
    const name = new URL(request.url).pathname.slice('/api/evaluation/'.length);
    let response:Response;
    if (name==='auth/session' && request.method==='GET') { await requireRole(request,'viewer'); response = Response.json(await getAppUser(request)); }
    else if (name==='users') response = await users(request);
    else {
      const handler = handlers[name]?.[request.method];
      response = handler ? await handler(request) : Response.json({error:'지원하지 않는 평가 요청입니다.'},{status:404});
    }
    const headers = new Headers(response.headers); headers.set('cache-control','no-store'); headers.set('x-content-type-options','nosniff');
    return new Response(response.body,{status:response.status,headers});
  } catch(error) { return authError(error,'평가관리 요청을 처리할 수 없습니다.'); }
}
