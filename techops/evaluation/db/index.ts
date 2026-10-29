import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

type Context = { env: { DB: any }; user: { id: number; username: string; display_name: string; role: string } };
// Request-keyed context avoids mixing users or database bindings across concurrent requests.
const contexts = new WeakMap<Request, Context>();
export function bindContext(request: Request, context: Context) { contexts.set(request, context); }
export function getContext(request: Request) {
  const context = contexts.get(request);
  if (!context) throw new Error('평가 요청에 인증 컨텍스트가 없습니다.');
  return context;
}
export function getDb(request: Request) { return drizzle(getContext(request).env.DB, { schema }); }
