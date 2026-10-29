import { getContext } from '../../db';
export type AppRole = 'admin' | 'editor' | 'viewer';
const rank = { viewer: 1, editor: 2, admin: 3 };
export class AuthError extends Error { constructor(message: string, public status = 401) { super(message); } }
export async function getAppUser(request: Request) {
  const {env,user:siteUser} = getContext(request);
  const permission = siteUser.role === 'admin' ? null : await env.DB.prepare('SELECT role,status FROM tech_eval_permissions WHERE user_id = ?').bind(siteUser.id).first();
  const user = {id:siteUser.id, username:siteUser.username, email:siteUser.username, displayName:siteUser.display_name,
    role:siteUser.role === 'admin' ? 'admin' : permission?.role || 'viewer', status:permission?.status || 'approved'};
  return {identity:{email:siteUser.username,fullName:siteUser.display_name},user};
}
export async function requireRole(request:Request,minimum:AppRole='viewer') {
  const actor = await getAppUser(request);
  if (actor.user.status !== 'approved' || (rank[actor.user.role as AppRole] || 0) < rank[minimum]) throw new AuthError('평가관리 작업 권한이 없습니다.',403);
  return {...actor,role:actor.user.role as AppRole};
}
export function authError(error:unknown,fallback:string) {
  return Response.json({error:error instanceof Error ? error.message : fallback},{status:error instanceof AuthError ? error.status : 500});
}
