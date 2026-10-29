import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { evaluationLogs, evaluations, evaluationTimeline } from "../../../db/schema";
import { authError, requireRole } from "../../lib/authz";

const STATUSES=["Chờ thực hiện","Đang thực hiện","Hoàn thành","Hold"];
function failCodesByStep(note:string){const source=note.match(/Fail code:\s*(.*)$/i)?.[1]??"",result=new Map<string,string>();for(const match of source.matchAll(/(?:^|\s)([A-Za-z0-9_-]+)\s*:\s*(.*?)(?=\s+[A-Za-z0-9_-]+\s*:|$)/g)){const step=match[1].trim().toUpperCase(),codes=match[2].trim();if(step&&codes)result.set(step,codes)}return result}

export async function GET(request:Request){
  try{await requireRole(request,"viewer");const evaluationId=Number(new URL(request.url).searchParams.get("evaluationId"));if(!evaluationId)throw new Error("Thiếu mã Lot.");const db=getDb(request),timeline=await db.select().from(evaluationTimeline).where(eq(evaluationTimeline.evaluationId,evaluationId)).orderBy(asc(evaluationTimeline.sequence),asc(evaluationTimeline.id)),[evaluation]=await db.select().from(evaluations).where(eq(evaluations.id,evaluationId)),codes=failCodesByStep(evaluation?.note??"");return Response.json({timeline:timeline.map(item=>{const stepCode=codes.get(item.stage.toUpperCase());return stepCode&&!item.note.includes("Fail code:")?{...item,note:`${item.note?`${item.note} · `:""}Fail code: ${stepCode}`} : item})})}
  catch(error){return authError(error,"Không thể tải timeline.")}
}

export async function POST(request:Request){
  try{const actor=await requireRole(request,"editor"),payload=await request.json() as Record<string,unknown>,evaluationId=Number(payload.evaluationId),stage=String(payload.stage??"").trim(),eventDate=String(payload.eventDate??""),status=String(payload.status??"Chờ thực hiện"),note=String(payload.note??"").trim(),db=getDb(request);if(!evaluationId||!stage||!eventDate)throw new Error("Vui lòng nhập đầy đủ bước và thời gian.");if(!STATUSES.includes(status))throw new Error("Trạng thái không hợp lệ.");const [evaluation]=await db.select().from(evaluations).where(eq(evaluations.id,evaluationId));if(!evaluation)throw new Error("Không tìm thấy Lot đánh giá.");const [item]=await db.insert(evaluationTimeline).values({evaluationId,stage,eventDate,status,note}).returning();await db.insert(evaluationLogs).values({evaluationId,action:"Timeline",lotNo:evaluation.lotNo,evaluationType:evaluation.evaluationType,detail:`${stage} · ${status}${note?` · ${note}`:""}`,actor:actor.user.displayName});return Response.json({item},{status:201})}
  catch(error){return authError(error,"Không thể lưu timeline.")}
}

export async function DELETE(request:Request){
  try{const actor=await requireRole(request,"admin"),id=Number(new URL(request.url).searchParams.get("id")),db=getDb(request);if(!id)throw new Error("Thiếu mã timeline.");const [item]=await db.select().from(evaluationTimeline).where(eq(evaluationTimeline.id,id));if(!item)throw new Error("Không tìm thấy bước timeline.");const [evaluation]=await db.select().from(evaluations).where(eq(evaluations.id,item.evaluationId));await db.delete(evaluationTimeline).where(eq(evaluationTimeline.id,id));if(evaluation)await db.insert(evaluationLogs).values({evaluationId:evaluation.id,action:"Timeline",lotNo:evaluation.lotNo,evaluationType:evaluation.evaluationType,detail:`Đã xóa bước ${item.stage}`,actor:actor.user.displayName});return Response.json({ok:true})}
  catch(error){return authError(error,"Không thể xóa timeline.")}
}
