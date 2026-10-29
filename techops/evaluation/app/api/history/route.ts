import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { evaluationLogs } from "../../../db/schema";
import { authError, requireRole } from "../../lib/authz";

export async function GET(request:Request){
  try{await requireRole(request,"viewer");return Response.json({history:await getDb(request).select().from(evaluationLogs).orderBy(desc(evaluationLogs.createdAt),desc(evaluationLogs.id)).limit(200)})}
  catch(error){return authError(error,"Không thể tải lịch sử.")}
}
