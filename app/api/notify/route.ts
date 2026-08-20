import { env } from "cloudflare:workers";

type NotifyPayload = { to?: string; toName?: string; subject?: string; ticketId?: string; approverId?: number };

export async function POST(request: Request) {
  const body = await request.json() as NotifyPayload;
  if (!body.to || !body.subject || !body.ticketId || !body.approverId) {
    return Response.json({ sent: false, error: "ข้อมูลผู้รับไม่ครบถ้วน" }, { status: 400 });
  }
  const runtime = env as unknown as Record<string, string | undefined>;
  const apiKey = runtime.RESEND_API_KEY;
  const from = runtime.EMAIL_FROM;
  if (!apiKey || !from) {
    return Response.json({ sent: false, logged: true, reason: "ยังไม่ได้กำหนดบริการส่งอีเมล" });
  }
  const appUrl = new URL(request.url).origin;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "authorization": `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [body.to],
      subject: body.subject,
      html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#17364b"><div style="background:#123b55;color:white;padding:24px;border-radius:12px 12px 0 0"><b style="font-size:22px">O&amp;M CARE</b><p style="margin:6px 0 0;color:#b9d8dc">ระบบแจ้งซ่อมออนไลน์</p></div><div style="border:1px solid #dce8ea;padding:28px;border-radius:0 0 12px 12px"><p>เรียน ${body.toName || "ผู้อนุมัติ"}</p><h2>${body.subject}</h2><p>ใบงาน <b>${body.ticketId}</b> กำลังรอการอนุมัติจากรหัสของท่านโดยเฉพาะ</p><p style="background:#eef8f7;padding:14px;border-radius:8px">Approval ID: <b>ID-${body.approverId}</b><br/>หากท่านยังไม่อนุมัติ ระบบจะล็อกใบงานไว้และไม่ดำเนินการไปขั้นตอนถัดไป</p><a href="${appUrl}" style="display:inline-block;background:#15968b;color:white;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">เปิดระบบเพื่อพิจารณา</a><p style="font-size:12px;color:#7b8b94;margin-top:24px">อีเมลนี้ส่งอัตโนมัติจากระบบ O&amp;M CARE</p></div></div>`,
    }),
  });
  if (!response.ok) return Response.json({ sent: false, error: await response.text() }, { status: 502 });
  return Response.json({ sent: true });
}
