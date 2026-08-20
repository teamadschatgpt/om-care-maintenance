"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Role = "admin" | "approver" | "user" | "technician";
type Permission = "approve_request" | "prepare_estimate" | "approve_estimate" | "approve_work_type_1" | "approve_work_type_2" | "approve_work_type_3" | "execute_work" | "procurement" | "inspect_close" | "manage_users" | "view_reports";
type View = "dashboard" | "tickets" | "new" | "stock" | "purchase" | "reports" | "people" | "emails";
type Person = { id: number; name: string; email: string; role: Role; company?: string; department: string; phone?: string; active: boolean; approverId?: number; approverIds?: number[]; approvalCode?: string; loginId?: string; password?: string; permissions?: Permission[]; workTypePermissionsConfigured?: boolean };
type Stock = { id: number; code: string; name: string; qty: number; unit: string; min: number; price: number };
type Ticket = {
  id: string; title: string; category: string; location: string; requester: string; department: string;
  createdAt: string; status: string; progress: number; priority: string; estimate: number; cost: number;
  route: "stock" | "purchase" | "pending"; description: string; rating?: number; requesterId?: number;
  reportedDate?: string; reportedTime?: string; company?: string; phone?: string; floor?: string; building?: string; chargeCompany?: string;
  workType?: string;
  initialApproverId?: number; estimateApproverId?: number; currentApproverId?: number; initialApproverIds?: number[]; estimateApproverIds?: number[]; currentApproverIds?: number[]; approvalHistory?: string[]; assignedTechnicianId?: number;
  estimateNote?: string; workNote?: string; surveyScores?: number[]; surveyComment?: string; surveySubmittedAt?: string;
};
type Mail = { id: number; to: string; subject: string; time: string; status: string; recipientId?: number };
type AppState = { people: Person[]; stock: Stock[]; tickets: Ticket[]; mails: Mail[] };

const permissionOptions: { key: Permission; label: string }[] = [
  { key: "approve_request", label: "อนุมัติใบแจ้งซ่อม" }, { key: "prepare_estimate", label: "ประเมินราคา O&M" },
  { key: "approve_estimate", label: "อนุมัติราคาประเมิน" },
  { key: "approve_work_type_1", label: "งานแจ้งซ่อมเครื่องจักรและอุปกรณ์ส่วนกลาง" },
  { key: "approve_work_type_2", label: "งานแจ้งซ่อมเครื่องจักรและอุปกรณ์ในสำนักงาน บ.ทีม คอนซัลติ้งฯ" },
  { key: "approve_work_type_3", label: "งานแจ้งซ่อมแซมอุปกรณ์ในสำนักงานของบริษัทในกลุ่มทีม" },
  { key: "execute_work", label: "ดำเนินการซ่อม/เบิก Stock" },
  { key: "procurement", label: "ออก PR / PO" }, { key: "inspect_close", label: "ตรวจรับและปิดงาน" },
  { key: "manage_users", label: "เพิ่ม ลบ และกำหนดสิทธิ์ผู้ใช้" }, { key: "view_reports", label: "ดูรายงานและค่าใช้จ่าย" },
];
const companyOptions = [
  "ATT (เอทีที คอนซัลแตนท์ จำกัด)",
  "GFE (วิศวกรรมธรณีและฐานราก จำกัด)",
  "GOE (จีโออี คอนซัลแตนท์ จำกัด)",
  "LTEAM (LTEAM Sole Co.,Ltd.)",
  "TEAM (ทีม คอนซัลติ้ง เอนจิเนียริ่ง แอนด์ แมเนจเมนท์ จำกัด (มหาชน))",
  "TEAM NEXT (ทีม เน็กซ์)",
  "TEAM-CM (ทีม คอนสตรัคชั่น แมเนจเมนท์ จำกัด)",
  "TLT (ทีแอลที คอนซัลแตนส์ จำกัด)",
  "TPP (ทีมพลัส พาร์ทเนอร์ส จำกัด)",
  "มูลนิธิกลุ่มทีมรวมใจ (มูลนิธิกลุ่มทีมรวมใจ)",
];
const workTypeOptions = [
  "งานแจ้งซ่อมเครื่องจักรและอุปกรณ์ส่วนกลาง",
  "งานแจ้งซ่อมเครื่องจักรและอุปกรณ์ในสำนักงาน บ.ทีม คอนซัลติ้งฯ",
  "งานแจ้งซ่อมแซมอุปกรณ์ในสำนักงานของบริษัทในกลุ่มทีม",
];
const workTypePermissions: Permission[] = ["approve_work_type_1", "approve_work_type_2", "approve_work_type_3"];
const allPermissions = permissionOptions.map(option => option.key);
const permissionForWorkType = (workType:string): Permission => workTypePermissions[Math.max(0,workTypeOptions.indexOf(workType))];
const approverIdsForWorkType = (people:Person[], workType:string) => {
  const permission=permissionForWorkType(workType);
  return people.filter(person=>person.role==="approver" && person.active && person.permissions?.includes("approve_estimate") && person.permissions.includes(permission)).map(person=>person.id);
};
const resolveWorkType = (ticket: Ticket) => {
  if (ticket.workType) return ticket.workType;
  const company = `${ticket.company || ""} ${ticket.chargeCompany || ""}`;
  if (/TEAM \(|ทีม คอนซัลติ้ง/.test(company)) return workTypeOptions[1];
  if (!company.trim() || ticket.department === "O&M") return workTypeOptions[0];
  return workTypeOptions[2];
};

const money = (n: number) => new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(n);
const stages = ["รอหัวหน้าหน่วยงานอนุมัติ", "รอหัวหน้า O&M อนุมัติ", "รออนุมัติค่าใช้จ่าย", "กำลังดำเนินการ", "รอประเมินความพึงพอใจ", "ปิดงานแล้ว"];
const stageLabels = ["รอหัวหน้าหน่วยงานอนุมัติ", "รอ ADMIN อนุมัติ", "รออนุมัติค่าใช้จ่าย", "กำลังดำเนินการ", "รอ User ประเมิน", "ปิดงาน"];
const workflowLabels = ["แจ้งซ่อม ONLINE", "หัวหน้าหน่วยงานอนุมัติ", "ADMIN อนุมัติ / เลือกช่าง", "หัวหน้าหน่วยงานอนุมัติค่าใช้จ่าย", "กำลังดำเนินการ", "ส่งงาน / User ประเมิน", "ปิดงาน"];
const stageLabel = (status: string) => { const index = stages.indexOf(status); return index >= 0 ? stageLabels[index] : status; };
const ticketStageLabel = (ticket: Ticket) => ticket.status === "รอประเมินความพึงพอใจ" && ticket.rating ? "ทำแบบประเมินแล้ว" : stageLabel(ticket.status);
const statusTone: Record<string, string> = {
  "รอหัวหน้าหน่วยงานอนุมัติ": "amber", "รอหัวหน้า O&M อนุมัติ": "blue", "รออนุมัติค่าใช้จ่าย": "purple",
  "กำลังดำเนินการ": "cyan", "รอประเมินความพึงพอใจ": "orange", "ปิดงานแล้ว": "green", "ไม่อนุมัติ": "red",
};

const initialState: AppState = {
  people: [
    { id: 1, name: "คุณอรอนงค์ วัฒนะ", email: "oranong@company.co.th", role: "admin", department: "O&M", active: true },
    { id: 2, name: "คุณสมชาย ใจดี", email: "somchai@company.co.th", role: "user", department: "การเงิน", active: true },
    { id: 3, name: "คุณนภา แสงทอง", email: "napa@company.co.th", role: "user", department: "ทรัพยากรบุคคล", active: true },
    { id: 4, name: "คุณกิตติศักดิ์ ชูชัย", email: "kitti@company.co.th", role: "admin", department: "จัดซื้อ", active: true },
    { id: 5, name: "คุณวรพล พัฒนกิจ", email: "woraphon@company.co.th", role: "approver", department: "หัวหน้าฝ่ายการเงิน", active: true, approvalCode: "APR-FIN-001" },
    { id: 6, name: "คุณพิมพ์ชนก ศรีสุข", email: "pimchanok@company.co.th", role: "approver", department: "หัวหน้าฝ่ายทรัพยากรบุคคล", active: true, approvalCode: "APR-HR-001" },
  ],
  stock: [
    { id: 1, code: "SP-001", name: "หลอดไฟ LED 18W", qty: 42, unit: "หลอด", min: 10, price: 135 },
    { id: 2, code: "SP-014", name: "ก๊อกน้ำอ่างล้างมือ", qty: 6, unit: "ชุด", min: 5, price: 850 },
    { id: 3, code: "SP-027", name: "สายไฟ VCT 2x2.5", qty: 80, unit: "เมตร", min: 30, price: 42 },
    { id: 4, code: "SP-032", name: "แบตเตอรี่ UPS 12V", qty: 3, unit: "ลูก", min: 5, price: 1250 },
  ],
  tickets: [
    { id: "OM-2608-014", title: "เครื่องปรับอากาศไม่เย็น", category: "เครื่องปรับอากาศ", location: "อาคาร A ชั้น 3", requester: "คุณสมชาย ใจดี", department: "การเงิน", createdAt: "4 ส.ค. 2569", status: "รอหัวหน้าหน่วยงานอนุมัติ", progress: 14, priority: "เร่งด่วน", estimate: 0, cost: 0, route: "pending", description: "เครื่องปรับอากาศมีลมออกแต่ไม่เย็น และมีเสียงผิดปกติ" },
    { id: "OM-2608-013", title: "เปลี่ยนหลอดไฟห้องประชุม", category: "ไฟฟ้า", location: "อาคาร B ห้อง 201", requester: "คุณนภา แสงทอง", department: "ทรัพยากรบุคคล", createdAt: "3 ส.ค. 2569", status: "กำลังดำเนินการ", progress: 66, priority: "ปกติ", estimate: 540, cost: 405, route: "stock", description: "หลอดไฟดับ 3 จุด บริเวณโต๊ะประชุม" },
    { id: "OM-2608-012", title: "ท่อน้ำรั่วใต้ซิงก์", category: "ประปา", location: "โรงอาหาร", requester: "คุณสมชาย ใจดี", department: "การเงิน", createdAt: "2 ส.ค. 2569", status: "รออนุมัติค่าใช้จ่าย", progress: 42, priority: "เร่งด่วน", estimate: 2850, cost: 0, route: "purchase", description: "พบจุดรั่วบริเวณข้อต่อใต้ซิงก์ล้างจาน" },
    { id: "OM-2607-089", title: "ประตูห้องเก็บเอกสารฝืด", category: "อาคาร", location: "อาคาร A ชั้น 2", requester: "คุณสมชาย ใจดี", department: "การเงิน", createdAt: "29 ก.ค. 2569", status: "ปิดงานแล้ว", progress: 100, priority: "ปกติ", estimate: 1200, cost: 980, route: "purchase", description: "บานพับฝืดและประตูปิดไม่สนิท", rating: 3.8 },
  ],
  mails: [
    { id: 1, to: "หัวหน้าฝ่ายการเงิน", subject: "ขออนุมัติใบแจ้งซ่อม OM-2608-014", time: "วันนี้ 09:24", status: "ส่งแล้ว" },
    { id: 2, to: "คุณนภา แสงทอง", subject: "แจ้งความคืบหน้างาน OM-2608-013", time: "เมื่อวาน 16:45", status: "เปิดอ่าน" },
    { id: 3, to: "หัวหน้าฝ่ายทรัพยากรบุคคล", subject: "ขออนุมัติราคาประเมิน OM-2608-012", time: "2 ส.ค. 14:10", status: "เปิดอ่าน" },
  ],
};

function normalizeState(input: AppState): AppState {
  const people = [...input.people];
  const upgradedPeople = people.map(p => {
    const defaults: Record<number, Partial<Person>> = {
      1: { loginId: "admin", password: "123456", permissions: allPermissions },
      2: { loginId: "somchai", password: "123456", approverId: 5, permissions: [] },
      3: { loginId: "napa", password: "123456", approverId: 6, permissions: [] },
      4: { loginId: "purchasing", password: "123456", permissions: ["procurement", "view_reports"] },
      5: { loginId: "apr-fin", password: "123456", permissions: ["approve_request", "approve_estimate", "view_reports"] },
      6: { loginId: "apr-hr", password: "123456", permissions: ["approve_request", "approve_estimate", "view_reports"] },
    };
    const preset = defaults[p.id] || {};
    const legacyApproverId = p.approverId || preset.approverId;
    const migratedRole: Role = p.role === "admin" && !!p.approvalCode && !p.permissions?.includes("manage_users") && !p.permissions?.includes("prepare_estimate") ? "approver" : p.role;
    const basePermissions = p.permissions || preset.permissions || (migratedRole === "admin" ? ["view_reports"] : migratedRole === "technician" ? ["execute_work","inspect_close"] : migratedRole === "approver" ? ["approve_request","approve_estimate"] : []);
    const permissions = migratedRole === "approver" && !p.workTypePermissionsConfigured && !workTypePermissions.some(permission=>basePermissions.includes(permission)) ? [...basePermissions,...workTypePermissions] : basePermissions;
    return { ...p, role:migratedRole, loginId: p.loginId || preset.loginId || `user-${p.id}`, password: p.password || preset.password || "123456", permissions, workTypePermissionsConfigured:migratedRole === "approver" ? true : p.workTypePermissionsConfigured, approverId: legacyApproverId, approverIds: p.approverIds || (legacyApproverId ? [legacyApproverId] : []) };
  });
  const tickets = input.tickets.map(ticket => {
    const requester = upgradedPeople.find(p => p.name === ticket.requester || p.id === ticket.requesterId);
    const approverId = requester?.approverId || (ticket.department === "ทรัพยากรบุคคล" ? 6 : 5);
    const migratedStatus = ticket.status === "รอหัวหน้าอนุมัติ" ? "รอหัวหน้าหน่วยงานอนุมัติ" : ticket.status === "O&M ประเมินราคา" ? "รอหัวหน้า O&M อนุมัติ" : ticket.status === "รออนุมัติราคา" ? "รออนุมัติค่าใช้จ่าย" : ticket.status === "ตรวจรับงาน" ? "รอประเมินความพึงพอใจ" : ticket.status;
    const departmentApproverIds = requester?.approverIds?.length ? requester.approverIds : [approverId];
    const estimateApproverIds = approverIdsForWorkType(upgradedPeople,ticket.workType || resolveWorkType(ticket));
    const omApproverIds = upgradedPeople.filter(person => person.role === "admin" && person.active && person.permissions?.includes("prepare_estimate")).map(person => person.id);
    const waitingApproverIds = migratedStatus === "รอหัวหน้าหน่วยงานอนุมัติ" ? departmentApproverIds : migratedStatus === "รออนุมัติค่าใช้จ่าย" ? estimateApproverIds : migratedStatus === "รอหัวหน้า O&M อนุมัติ" ? omApproverIds : [];
    const legacyStatus = ticket.status !== migratedStatus;
    return {
      ...ticket,
      status: migratedStatus,
      requesterId: ticket.requesterId || requester?.id,
      initialApproverId: ticket.initialApproverId || approverId,
      estimateApproverId: migratedStatus === "รออนุมัติค่าใช้จ่าย" ? estimateApproverIds[0] : ticket.estimateApproverId || approverId,
      currentApproverId: migratedStatus === "รออนุมัติค่าใช้จ่าย" || legacyStatus ? waitingApproverIds[0] : ticket.currentApproverId || waitingApproverIds[0],
      initialApproverIds: ticket.initialApproverIds || (ticket.initialApproverId ? [ticket.initialApproverId] : requester?.approverIds?.length ? requester.approverIds : [approverId]),
      estimateApproverIds: migratedStatus === "รออนุมัติค่าใช้จ่าย" ? estimateApproverIds : ticket.estimateApproverIds || (ticket.estimateApproverId ? [ticket.estimateApproverId] : requester?.approverIds?.length ? requester.approverIds : [approverId]),
      currentApproverIds: migratedStatus === "รออนุมัติค่าใช้จ่าย" || legacyStatus ? waitingApproverIds : ticket.currentApproverIds || waitingApproverIds,
      approvalHistory: ticket.approvalHistory || [],
      workType: ticket.workType || resolveWorkType(ticket),
    };
  });
  return { ...input, people: upgradedPeople, tickets };
}

const surveyGroups = [
  { title:"ความสะดวกในการติดต่อ", questions:["การติดต่อกับเจ้าหน้าที่", "การติดต่อทางโทรศัพท์", "การให้ข้อมูล ข้อเสนอแนะเกี่ยวกับการซ่อมบำรุงและการบำรุงรักษาที่เป็นประโยชน์ต่อท่าน"] },
  { title:"ความพึงพอใจในการให้บริการ", questions:["การบริการจากเจ้าหน้าที่ในการแก้ปัญหา", "ความสุภาพของเจ้าหน้าที่", "ระยะเวลาในการดำเนินการแก้ปัญหา", "ความรู้ความสามารถของเจ้าหน้าที่ในการแก้ปัญหา"] },
  { title:"ความพึงพอใจในด้านคุณภาพ", questions:["ความเรียบร้อย ถูกต้องสมบูรณ์ของการปฏิบัติงาน", "คุณภาพของอุปกรณ์ที่นำมาใช้", "ความปลอดภัยในการปฏิบัติงาน และการใช้งาน"] },
];
const surveyQuestions = surveyGroups.flatMap(group => group.questions);

export default function Home() {
  const [state, setState] = useState<AppState>(() => normalizeState(initialState));
  const [ready, setReady] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [selected, setSelected] = useState(initialState.tickets[0].id);
  const [toast, setToast] = useState("");
  const [surveyTicket, setSurveyTicket] = useState<string | null>(null);
  const [surveyReadOnly, setSurveyReadOnly] = useState(false);
  const [scores, setScores] = useState<number[]>(Array(10).fill(4));
  const [loginTab, setLoginTab] = useState<Role>("user");
  const [loginAccountId, setLoginAccountId] = useState(2);

  useEffect(() => {
    fetch("/api/state").then(r => r.ok ? r.json() : Promise.reject()).then(d => d.state && setState(normalizeState(d.state))).catch(() => {
      const saved = localStorage.getItem("om-care-state"); if (saved) setState(normalizeState(JSON.parse(saved)));
    }).finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!ready) return;
    localStorage.setItem("om-care-state", JSON.stringify(state));
    const timer = setTimeout(() => fetch("/api/state", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ state }) }).catch(() => {}), 500);
    return () => clearTimeout(timer);
  }, [state, ready]);
  useEffect(() => {
    if (!ready || sessionChecked) return;
    try { const saved = JSON.parse(localStorage.getItem("om-care-session") || "null") as {accountId?:number} | null; const account = saved?.accountId ? state.people.find(person => person.id === saved.accountId && person.active) : undefined; if (account) { setLoginAccountId(account.id); setLoginTab(account.role); setRole(account.role); if (account.role === "technician") setView("tickets"); } else { localStorage.removeItem("om-care-session"); } } catch { localStorage.removeItem("om-care-session"); }
    setSessionChecked(true);
  }, [ready, sessionChecked, state.people]);

  const flash = (message: string) => { setToast(message); setTimeout(() => setToast(""), 2800); };
  const currentPerson = state.people.find(p => p.id === loginAccountId) || state.people[0];
  const activeTicket = state.tickets.find(t => t.id === selected) || state.tickets[0];
  const technicianOnly = role === "technician";
  const visibleTickets = role === "user" ? state.tickets.filter(t => t.requesterId === currentPerson.id || t.requester === currentPerson.name) : technicianOnly ? state.tickets.filter(t => t.assignedTechnicianId === currentPerson.id) : state.tickets;
  const statsTickets = role === "user" || role === "technician" ? visibleTickets : state.tickets;
  const stats = useMemo(() => ({
    open: statsTickets.filter(t => !["ปิดงานแล้ว", "ไม่อนุมัติ"].includes(t.status)).length,
    waiting: statsTickets.filter(t => t.status.includes("อนุมัติ")).length,
    doing: statsTickets.filter(t => ["กำลังดำเนินการ", "รอประเมินความพึงพอใจ"].includes(t.status)).length,
    spend: statsTickets.reduce((s, t) => s + t.cost, 0),
  }), [statsTickets]);

  const updateTicket = (patch: Partial<Ticket>, mail?: string) => {
    if (role === "technician" && activeTicket.assignedTechnicianId !== currentPerson.id) { flash("ใบงานนี้ไม่ได้มอบหมายให้ ID ช่างของคุณ"); return; }
    if (role === "technician" && patch.status && !["รอประเมินความพึงพอใจ","ปิดงานแล้ว"].includes(patch.status)) { flash("บัญชีช่างดำเนินการได้เฉพาะส่งงานเสร็จและปิดงาน"); return; }
    if (patch.status === "กำลังดำเนินการ" && !activeTicket.assignedTechnicianId) { flash("กรุณาเลือกช่างผู้รับผิดชอบก่อนอนุมัติไปขั้นดำเนินการ"); return; }
    if (patch.status === "ปิดงานแล้ว" && !activeTicket.rating) { flash("ต้องให้ User ทำแบบประเมินก่อนจึงจะปิดงานได้"); return; }
    const isApproval = ["รอหัวหน้าหน่วยงานอนุมัติ","รอหัวหน้า O&M อนุมัติ","รออนุมัติค่าใช้จ่าย"].includes(activeTicket.status);
    const isApprovalAction = isApproval && !!patch.status;
    const isApprovedTransition = isApprovalAction && patch.status !== "ไม่อนุมัติ";
    const requiredPermission: Partial<Record<string, Permission>> = { "รอหัวหน้าหน่วยงานอนุมัติ": "approve_request", "รอหัวหน้า O&M อนุมัติ": "prepare_estimate", "รออนุมัติค่าใช้จ่าย": "approve_estimate", "กำลังดำเนินการ": "execute_work", "รอประเมินความพึงพอใจ": "inspect_close" };
    const permission = requiredPermission[activeTicket.status];
    if ((role === "admin" || role === "approver") && permission && !currentPerson.permissions?.includes(permission)) {
      flash(`ID ${currentPerson.loginId} ไม่มีสิทธิ์: ${permissionOptions.find(item => item.key === permission)?.label}`);
      return;
    }
    if (activeTicket.status === "รออนุมัติค่าใช้จ่าย") {
      const workTypePermission=permissionForWorkType(resolveWorkType(activeTicket));
      if (!currentPerson.permissions?.includes(workTypePermission)) {
        flash(`ID ${currentPerson.loginId} ไม่มีสิทธิ์อนุมัติประเภท: ${resolveWorkType(activeTicket)}`);
        return;
      }
    }
    const allowedApproverIds = activeTicket.currentApproverIds?.length ? activeTicket.currentApproverIds : activeTicket.currentApproverId ? [activeTicket.currentApproverId] : [];
    if (isApproval && !allowedApproverIds.includes(currentPerson.id)) {
      const assigned = state.people.filter(p => allowedApproverIds.includes(p.id));
      flash(`งานถูกล็อก: ผู้อนุมัติที่ Admin กำหนดคือ ${assigned.map(p => p.name).join(", ") || "ยังไม่กำหนด"}`);
      return;
    }
    const nextRecipientIds = patch.rating !== undefined && activeTicket.assignedTechnicianId ? [activeTicket.assignedTechnicianId] : patch.currentApproverIds?.length ? patch.currentApproverIds : activeTicket.requesterId ? [activeTicket.requesterId] : [];
    const recipients = state.people.filter(p => nextRecipientIds.includes(p.id));
    const approvedPatch = isApprovalAction ? { currentApproverId: undefined, currentApproverIds: [], ...patch, approvalHistory: [...(activeTicket.approvalHistory || []), `${currentPerson.approvalCode || `ID-${currentPerson.id}`} ${isApprovedTransition ? "อนุมัติ" : "ไม่อนุมัติ"} ${new Date().toLocaleString("th-TH")}`] } : patch;
    const mailEntries = mail ? recipients.map((recipient, index) => ({ id: Date.now() + index, to: `${recipient.name} <${recipient.email}>`, recipientId: recipient.id, subject: mail, time: "เมื่อสักครู่", status: "กำลังส่ง" })) : [];
    setState(s => ({ ...s, tickets: s.tickets.map(t => t.id === selected ? { ...t, ...approvedPatch } : t), mails: [...mailEntries, ...s.mails] }));
    if (mail) {
      recipients.forEach(recipient => fetch("/api/notify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: recipient.email, toName: recipient.name, subject: mail, ticketId: activeTicket.id, approverId: recipient.id }) }).catch(() => {}));
    }
    flash(isApprovalAction ? `${isApprovedTransition ? "อนุมัติ" : "บันทึกไม่อนุมัติ"}ด้วย ${currentPerson.approvalCode || `ID-${currentPerson.id}`} เรียบร้อยแล้ว` : "บันทึกข้อมูลและส่งการแจ้งเตือนแล้ว");
  };

  const assignTechnician = (ticketId: string, technicianId?: number) => {
    const technician = state.people.find(person => person.id === technicianId);
    const mailEntry: Mail | null = technician ? { id: Date.now(), to: `${technician.name} <${technician.email}>`, recipientId: technician.id, subject: `มอบหมายใบงาน ${ticketId}`, time: "เมื่อสักครู่", status: "กำลังส่ง" } : null;
    setState(current => ({ ...current, tickets: current.tickets.map(ticket => ticket.id === ticketId ? { ...ticket, assignedTechnicianId: technicianId } : ticket), mails: mailEntry ? [mailEntry, ...current.mails] : current.mails }));
    if (technician) fetch("/api/notify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: technician.email, toName: technician.name, subject: `มอบหมายใบงาน ${ticketId}`, ticketId, approverId: technician.id }) }).catch(() => {});
    flash(technician ? `มอบหมายใบงาน ${ticketId} ให้ ${technician.name} แล้ว` : `ยกเลิกการมอบหมายช่างในใบงาน ${ticketId} แล้ว`);
  };

  if (!ready || !sessionChecked) return <div className="session-loading"><div className="brand-mark big">O</div><b>กำลังเปิดระบบ O&M CARE...</b></div>;
  if (!role) return <ManualLogin tab={loginTab} setTab={setLoginTab} people={state.people} onLogin={(account) => { localStorage.setItem("om-care-session", JSON.stringify({accountId:account.id})); setLoginAccountId(account.id); setRole(account.role); setView(account.role === "technician" ? "tickets" : "dashboard"); }} />;

  const navAdmin: { key: View; icon: string; label: string }[] = [
    { key: "dashboard", icon: "⌂", label: "ภาพรวม" }, { key: "tickets", icon: "▤", label: "ใบแจ้งซ่อม" },
    { key: "stock", icon: "▦", label: "คลังอะไหล่" }, { key: "purchase", icon: "₿", label: "PR / PO" },
    { key: "reports", icon: "◫", label: "รายงานประจำเดือน" }, { key: "people", icon: "♙", label: "ผู้ใช้งาน" },
    { key: "emails", icon: "✉", label: "E-mail log" },
  ];
  const navUser: { key: View; icon: string; label: string }[] = [
    { key: "dashboard", icon: "⌂", label: "หน้าหลัก" }, { key: "new", icon: "+", label: "แจ้งซ่อมใหม่" },
    { key: "tickets", icon: "▤", label: "งานของฉัน" }, { key: "emails", icon: "✉", label: "การแจ้งเตือน" },
  ];
  const navTechnician: { key: View; icon: string; label: string }[] = [
    { key: "dashboard", icon: "⌂", label: "ภาพรวมงานช่าง" }, { key: "tickets", icon: "▤", label: "ใบงานของฉัน" },
    { key: "stock", icon: "▦", label: "คลังอะไหล่" }, { key: "emails", icon: "✉", label: "การแจ้งเตือน" },
  ];
  const navApprover: { key: View; icon: string; label: string }[] = [
    { key: "dashboard", icon: "⌂", label: "ภาพรวมการอนุมัติ" }, { key: "tickets", icon: "▤", label: "ใบงานรออนุมัติ" }, { key: "emails", icon: "✉", label: "การแจ้งเตือน" },
  ];
  const visibleAdminNav = navAdmin.filter(item => item.key === "people" ? currentPerson.permissions?.includes("manage_users") : item.key === "reports" ? currentPerson.permissions?.includes("view_reports") : item.key === "stock" ? currentPerson.permissions?.includes("execute_work") : item.key === "purchase" ? currentPerson.permissions?.includes("procurement") : true);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">O</div><div><b>O&M CARE</b><small>ระบบบริหารงานแจ้งซ่อม</small></div></div>
        <div className="role-pill">{role === "admin" ? "ADMINISTRATOR" : role === "approver" ? "APPROVER PORTAL" : role === "technician" ? "TECHNICIAN PORTAL" : "USER PORTAL"}</div>
        <nav>{(role === "admin" ? visibleAdminNav : role === "approver" ? navApprover : role === "technician" ? navTechnician : navUser).map(n => <button key={n.key} className={view === n.key ? "active" : ""} onClick={() => setView(n.key)}><span>{n.icon}</span>{n.label}{n.key === "tickets" && <em>{visibleTickets.length}</em>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="avatar">{currentPerson.name.replace("คุณ", "").slice(0, 2)}</div><div><b>{currentPerson.name}</b><small>{currentPerson.approvalCode ? `ผู้อนุมัติ ${currentPerson.approvalCode}` : currentPerson.department}</small></div><button aria-label="ออกจากระบบ" onClick={() => { localStorage.removeItem("om-care-session"); setRole(null); }}>↪</button></div>
      </aside>

      <main>
        <header><div><small>วันอังคารที่ 4 สิงหาคม 2569</small><h1>{pageTitle(view, role)}</h1></div><div className="head-actions"><button className="icon-btn">⌕</button><button className="icon-btn notice">♢<i /></button>{role === "user" && <button className="primary" onClick={() => setView("new")}>＋ แจ้งซ่อมใหม่</button>}</div></header>
        <div className="content">
          {view === "dashboard" && <Dashboard role={role} stats={stats} tickets={visibleTickets} pick={(id) => { setSelected(id); setView("tickets"); }} setView={setView} />}
          {view === "tickets" && <Tickets role={role} currentPerson={currentPerson} people={state.people} tickets={visibleTickets} active={activeTicket} selected={selected} setSelected={setSelected} updateTicket={updateTicket} assignTechnician={assignTechnician} openSurvey={(ticket,readOnly) => { setSelected(ticket.id); setScores(ticket.surveyScores?.length === 10 ? ticket.surveyScores : Array(10).fill(4)); setSurveyReadOnly(readOnly); setSurveyTicket(ticket.id); }} flash={flash} />}
          {view === "new" && <NewTicket state={state} currentPerson={currentPerson} setState={setState} done={(id) => { setSelected(id); setView("tickets"); const approvers = state.people.filter(p => (currentPerson.approverIds || []).includes(p.id)); approvers.forEach(approver => fetch("/api/notify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: approver.email, toName: approver.name, subject: `ขออนุมัติการดำเนินการใบแจ้งซ่อม ${id}`, ticketId: id, approverId: approver.id }) }).catch(() => {})); flash(`บันทึกใบงานในประวัติ ID ${currentPerson.loginId} และส่งไปยังหัวหน้าหน่วยงาน ${approvers.length} คนแล้ว`); }} />}
          {view === "stock" && <StockPage stock={state.stock} />}
          {view === "purchase" && <Purchase tickets={state.tickets.filter(t => t.route === "purchase")} update={(id, patch) => { setSelected(id); setTimeout(() => updateTicket(patch, `อัปเดตการจัดซื้อ ${id}`), 0); }} />}
          {view === "reports" && <Reports state={state} />}
          {view === "people" && <><ExcelUserImport state={state} currentPerson={currentPerson} setState={setState} flash={flash} /><PeopleV4 state={state} currentPerson={currentPerson} setState={setState} flash={flash} onCurrentDeleted={() => { localStorage.removeItem("om-care-session"); setLoginAccountId(0); setRole(null); setView("dashboard"); }} /></>}
          {view === "emails" && <Emails mails={state.mails} />}
        </div>
      </main>
      {surveyTicket && <Survey ticket={state.tickets.find(ticket => ticket.id === surveyTicket) || activeTicket} scores={scores} setScores={setScores} readOnly={surveyReadOnly} close={() => setSurveyTicket(null)} submit={(comment) => { const avg = scores.reduce((a,b)=>a+b,0)/10; setSelected(surveyTicket); setTimeout(() => updateTicket({ rating:avg, surveyScores:scores, surveyComment:comment, surveySubmittedAt:new Date().toISOString() }, `รับผลประเมินความพึงพอใจ ${surveyTicket}`), 0); setSurveyTicket(null); }} />}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </div>
  );
}

function ManualLogin({ tab, setTab, people, onLogin }: { tab: Role; setTab: (role: Role) => void; people: Person[]; onLogin: (person: Person) => void }) {
  const [userId, setUserId] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState("");
  const submit = (event: FormEvent) => { event.preventDefault(); const account = people.find(person => person.loginId?.toLowerCase() === userId.trim().toLowerCase() && person.password === password && person.role === tab && person.active); if (!account) { setError("User ID หรือรหัสผ่านไม่ถูกต้อง หรือเลือกประเภทบัญชีไม่ตรง"); return; } onLogin(account); };
  return <div className="login-page"><div className="login-art"><div className="login-logo"><div className="brand-mark big">O</div><div><b>O&M CARE</b><small>ROLE-BASED MAINTENANCE</small></div></div><div className="art-copy"><span>SECURE WORKFLOW</span><h1>แต่ละ ID<br/>มีสิทธิ์ <em>เฉพาะขั้นตอน</em></h1><p>เข้าสู่ระบบด้วยรหัสพนักงานและรหัสผ่านของตนเอง<br/>ระบบจะจดจำการเข้าสู่ระบบไว้เมื่อรีเฟรชหน้าเว็บ</p><div className="mini-flow"><div><i>1</i><b>Login</b></div><span>→</span><div><i>2</i><b>ตรวจ ID</b></div><span>→</span><div><i>3</i><b>ตรวจสิทธิ์</b></div><span>→</span><div><i>4</i><b>อนุมัติ</b></div></div></div><div className="art-shape one"/><div className="art-shape two"/></div><div className="login-panel"><form className="login-box" onSubmit={submit} autoComplete="off"><span className="eyebrow">SECURE SIGN IN</span><h2>เข้าสู่ระบบ</h2><div className="login-tabs"><button type="button" className={tab === "user" ? "active" : ""} onClick={() => { setTab("user"); setUserId(""); setPassword(""); setError(""); }}>♙ ผู้ใช้งาน</button><button type="button" className={tab === "technician" ? "active" : ""} onClick={() => { setTab("technician"); setUserId(""); setPassword(""); setError(""); }}>⚒ ช่าง</button><button type="button" className={tab === "approver" ? "active" : ""} onClick={() => { setTab("approver"); setUserId(""); setPassword(""); setError(""); }}>✓ ผู้อนุมัติ</button><button type="button" className={tab === "admin" ? "active" : ""} onClick={() => { setTab("admin"); setUserId(""); setPassword(""); setError(""); }}>⚙ ADMIN</button></div><label>{tab === "admin" ? "User ID ผู้ดูแล" : tab === "approver" ? "User ID ผู้อนุมัติ" : tab === "technician" ? "รหัสพนักงานช่าง" : "รหัสพนักงาน"}</label><div className="input-icon"><span>♙</span><input value={userId} onChange={e => setUserId(e.target.value)} placeholder={tab === "admin" ? "กรอก User ID ผู้ดูแล" : tab === "approver" ? "กรอก User ID ผู้อนุมัติ" : tab === "technician" ? "กรอกรหัสพนักงานช่าง" : "กรอกรหัสพนักงาน เช่น 01E4713"} autoComplete="off" required/></div><label>รหัสผ่าน</label><div className="input-icon"><span>●</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="กรอกรหัสผ่าน" autoComplete="new-password" required/><b>◉</b></div>{error && <div className="login-error">⚠ {error}</div>}<button className="login-submit" type="submit">เข้าสู่ระบบ <span>→</span></button></form><small className="copyright">© 2026 O&M Department · Private internal system</small></div></div>;
}

function Login({ tab, setTab, people, accountId, setAccountId, onLogin }: { tab: Role; setTab: (r: Role) => void; people: Person[]; accountId: number; setAccountId: (id: number) => void; onLogin: () => void }) {
  const accounts = people.filter(person => person.role === tab && person.active);
  return <div className="login-page"><div className="login-art"><div className="login-logo"><div className="brand-mark big">O</div><div><b>O&M CARE</b><small>IDENTITY-BASED APPROVAL</small></div></div><div className="art-copy"><span>CONTROLLED WORKFLOW</span><h1>อนุมัติถูกคน<br/>ถูกขั้นตอน <em>ตรวจสอบได้</em></h1><p>ทุกใบงานผูกกับรหัสผู้อนุมัติเฉพาะบุคคล<br/>งานจะไม่เดินหน้าจนกว่า ID ที่กำหนดจะอนุมัติ</p><div className="mini-flow"><div><i>1</i><b>แจ้งซ่อม</b></div><span>→</span><div><i>2</i><b>ระบุ ID</b></div><span>→</span><div><i>3</i><b>อนุมัติ</b></div><span>→</span><div><i>4</i><b>ดำเนินการ</b></div></div></div><div className="art-shape one"/><div className="art-shape two"/></div><div className="login-panel"><div className="login-box"><span className="eyebrow">SECURE APPROVAL</span><h2>เข้าสู่ระบบ</h2><p>เลือกบัญชีเพื่อทดสอบสิทธิ์ตาม ID ที่กำหนด</p><div className="login-tabs"><button className={tab === "user" ? "active" : ""} onClick={() => setTab("user")}>♙ ผู้ใช้งาน</button><button className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}>⚙ Admin / ผู้อนุมัติ</button></div><label>บัญชีผู้ใช้งาน</label><select className="account-select" value={accountId} onChange={e => setAccountId(Number(e.target.value))}>{accounts.map(person => <option key={person.id} value={person.id}>{person.name} — {person.approvalCode || person.department}</option>)}</select><label>รหัสผ่าน</label><div className="input-icon"><span>●</span><input type="password" defaultValue="123456"/><b>◉</b></div><button className="login-submit" onClick={onLogin}>เข้าสู่ระบบ <span>→</span></button><div className="demo-note"><b>ID ปัจจุบัน</b><span>{people.find(p => p.id === accountId)?.approvalCode || `USER-${accountId}`}</span><span>รหัสผ่าน 123456</span></div></div><small className="copyright">© 2026 O&M Department · Approval identity enforced</small></div></div>;
  return <div className="login-page"><div className="login-art"><div className="login-logo"><div className="brand-mark big">O</div><div><b>O&M CARE</b><small>Online Maintenance Management</small></div></div><div className="art-copy"><span>SMART MAINTENANCE</span><h1>ทุกงานซ่อม<br/>จัดการได้ <em>ในที่เดียว</em></h1><p>แจ้งเรื่อง ติดตาม อนุมัติ และดูรายงาน<br/>โปร่งใสทุกขั้นตอน ลดเวลาการประสานงาน</p><div className="mini-flow"><div><i>1</i><b>แจ้งซ่อม</b></div><span>→</span><div><i>2</i><b>อนุมัติ</b></div><span>→</span><div><i>3</i><b>ดำเนินการ</b></div><span>→</span><div><i>4</i><b>ปิดงาน</b></div></div></div><div className="art-shape one"/><div className="art-shape two"/></div><div className="login-panel"><div className="login-box"><span className="eyebrow">ยินดีต้อนรับ</span><h2>เข้าสู่ระบบ</h2><p>เลือกประเภทผู้ใช้งานเพื่อเข้าสู่ระบบ O&M CARE</p><div className="login-tabs"><button className={tab === "user" ? "active" : ""} onClick={() => setTab("user")}>♙ ผู้ใช้งาน</button><button className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}>⚙ ผู้ดูแลระบบ</button></div><label>อีเมล</label><div className="input-icon"><span>✉</span><input defaultValue={tab === "admin" ? "admin@company.co.th" : "somchai@company.co.th"} key={tab+"email"}/></div><label>รหัสผ่าน</label><div className="input-icon"><span>●</span><input type="password" defaultValue="123456"/><b>◉</b></div><div className="login-row"><label><input type="checkbox" defaultChecked/> จดจำการเข้าสู่ระบบ</label><button>ลืมรหัสผ่าน?</button></div><button className="login-submit" onClick={onLogin}>เข้าสู่ระบบ <span>→</span></button><div className="demo-note"><b>บัญชีทดลอง</b><span>{tab === "admin" ? "admin@company.co.th" : "somchai@company.co.th"}</span><span>รหัสผ่าน 123456</span></div></div><small className="copyright">© 2026 O&M Department · Secure Internal System</small></div></div>;
}

function pageTitle(view: View, role: Role) { const map: Record<View,string> = { dashboard: role === "admin" ? "ศูนย์ควบคุมงานซ่อม" : role === "approver" ? "ศูนย์อนุมัติใบงาน" : role === "technician" ? "ภาพรวมงานช่าง" : "หน้าหลักผู้ใช้งาน", tickets: role === "admin" ? "ทะเบียนใบแจ้งซ่อม" : role === "approver" ? "ใบงานรออนุมัติ" : role === "technician" ? "ใบงานที่มอบหมายให้ฉัน" : "ติดตามงานของฉัน", new: "แจ้งซ่อมออนไลน์", stock: "คลังอะไหล่", purchase: "การจัดซื้อ PR / PO", reports: "รายงานประจำเดือน O&M", people: "จัดการผู้ใช้งาน", emails: "บันทึก E-mail" }; return map[view]; }

function Dashboard({ role, stats, tickets, pick, setView }: { role: Role; stats: {open:number;waiting:number;doing:number;spend:number}; tickets: Ticket[]; pick:(id:string)=>void; setView:(v:View)=>void }) {
  const isAdmin = role === "admin";
  const isTechnician = role === "technician";
  return <><section className="hero"><div><span>O&M OPERATIONS CENTER</span><h2>{isAdmin ? "งานวันนี้อยู่ในมือคุณ" : isTechnician ? "ใบงานที่มอบหมาย พร้อมให้ดำเนินการ" : "แจ้งง่าย ติดตามได้ทุกขั้นตอน"}</h2><p>{isAdmin ? `มี ${stats.waiting} รายการรอการอนุมัติ และ ${stats.doing} งานกำลังดำเนินการ` : isTechnician ? `มี ${stats.open} ใบงานที่เปิดอยู่ และ ${stats.doing} งานกำลังดำเนินการ` : "เราพร้อมดูแลทุกปัญหา เพื่อให้คุณทำงานได้อย่างต่อเนื่อง"}</p></div><div className="hero-ring"><b>{isAdmin ? stats.open : tickets.length}</b><small>{isAdmin ? "งานที่เปิดอยู่" : isTechnician ? "ใบงานของฉัน" : "รายการของฉัน"}</small></div></section>
    <section className="stats-grid"><Stat icon="▤" label="งานที่เปิดอยู่" value={stats.open} note="ใบแจ้งซ่อม" tone="navy"/><Stat icon="⌛" label="รออนุมัติ" value={stats.waiting} note="ต้องดำเนินการ" tone="amber"/><Stat icon="⚒" label="กำลังดำเนินการ" value={stats.doing} note="อยู่ใน SLA" tone="teal"/><Stat icon="฿" label="ค่าใช้จ่ายเดือนนี้" value={money(stats.spend)} note="บันทึกแล้ว" tone="purple"/></section>
    <section className="grid-main"><div className="panel"><div className="panel-head"><div><span className="eyebrow">RECENT REQUESTS</span><h3>{isTechnician ? "ใบงานช่างล่าสุด" : "งานแจ้งซ่อมล่าสุด"}</h3></div><button onClick={() => setView("tickets")}>ดูทั้งหมด →</button></div><div className="ticket-list">{tickets.slice(0,4).map(ticket => <button className="ticket-row" key={ticket.id} onClick={() => pick(ticket.id)}><span className={`category ${ticket.category === "ไฟฟ้า" ? "yellow" : ticket.category === "ประปา" ? "blue" : "teal"}`}>{ticket.category.slice(0,1)}</span><div><b>{ticket.title}</b><small>{ticket.id} · {ticket.location}</small></div><div className="row-progress"><span><i style={{width:`${ticket.progress}%`}}/></span><small>{ticket.progress}%</small></div><span className={`badge ${statusTone[ticket.status]}`}>{ticketStageLabel(ticket)}</span><strong>›</strong></button>)}</div></div>
      <div className="panel activity"><div className="panel-head"><div><span className="eyebrow">QUICK ACTIONS</span><h3>ดำเนินการด่วน</h3></div></div>
        {role === "user" && <button onClick={() => setView("new")}><i>＋</i><span><b>สร้างใบแจ้งซ่อม</b><small>บันทึกเรื่องใหม่เข้าสู่ระบบ</small></span>›</button>}
        <button onClick={() => setView("tickets")}><i>{isTechnician ? "⚒" : "✓"}</i><span><b>{isTechnician ? "ใบงานที่มอบหมาย" : isAdmin ? "รายการรออนุมัติ" : "ติดตามใบแจ้งซ่อม"}</b><small>{isTechnician ? `${tickets.length} รายการของฉัน` : `${stats.waiting} รายการต้องตรวจสอบ`}</small></span>›</button>
        {isAdmin && <button onClick={() => setView("reports")}><i>▥</i><span><b>ออกรายงานเดือนนี้</b><small>ข้อมูลอัปเดตล่าสุด</small></span>›</button>}
        {isTechnician && <button onClick={() => setView("stock")}><i>▦</i><span><b>ตรวจสอบคลังอะไหล่</b><small>ดูจำนวนอะไหล่คงเหลือ</small></span>›</button>}
      </div></section></>;
}
function Stat({icon,label,value,note,tone}:{icon:string;label:string;value:number|string;note:string;tone:string}) { return <div className="stat"><div className={`stat-icon ${tone}`}>{icon}</div><div><span>{label}</span><b>{value}</b><small>{note}</small></div><em>↗</em></div>; }

function TicketRequestSummary({ticket}:{ticket:Ticket}) {
  return <section className="panel ticket-request-summary"><div className="panel-head"><div><span className="eyebrow">REQUEST INFORMATION</span><h3>ข้อมูลใบแจ้งซ่อม {ticket.id}</h3></div><span className={`badge ${statusTone[ticket.status]}`}>{ticketStageLabel(ticket)}</span></div><div className="request-summary-grid"><div><span>วันที่แจ้ง</span><b>{ticket.reportedDate || ticket.createdAt}</b></div><div><span>เวลาแจ้ง</span><b>{ticket.reportedTime || "—"}</b></div><div><span>ผู้แจ้ง</span><b>{ticket.requester}</b></div><div><span>บริษัท</span><b>{ticket.company || "—"}</b></div><div><span>เบอร์ติดต่อ</span><b>{ticket.phone || "—"}</b></div><div><span>หน่วยงาน</span><b>{ticket.department}</b></div><div><span>ชั้นที่</span><b>{ticket.floor || "—"}</b></div><div><span>อาคาร</span><b>{ticket.building || ticket.location}</b></div><div className="charge-company"><span>ค่าใช้จ่ายเข้าบริษัท</span><b>{ticket.chargeCompany || "—"}</b></div></div></section>;
}

function Tickets({ role, currentPerson, people, tickets, active, selected, setSelected, updateTicket, assignTechnician, openSurvey, flash }:{ role:Role;currentPerson:Person;people:Person[];tickets:Ticket[];active:Ticket;selected:string;setSelected:(id:string)=>void;updateTicket:(p:Partial<Ticket>,m?:string)=>void;assignTechnician:(ticketId:string,technicianId?:number)=>void;openSurvey:(ticket:Ticket,readOnly:boolean)=>void;flash:(message:string)=>void }) {
  const [showDetail, setShowDetail] = useState(false);
  const ticket = tickets.find(item => item.id === selected) || active;
  const [estimateDraft, setEstimateDraft] = useState(String(ticket.estimate || ""));
  const [estimateNoteDraft, setEstimateNoteDraft] = useState(ticket.estimateNote || "");
  const [workTypeDraft, setWorkTypeDraft] = useState(ticket.workType || "");
  const [workNoteDraft, setWorkNoteDraft] = useState(ticket.workNote || "");
  const [actualCostDraft, setActualCostDraft] = useState(ticket.cost ? String(ticket.cost) : ticket.workNote ? "0" : "");
  useEffect(() => { setEstimateDraft(String(ticket.estimate || "")); setEstimateNoteDraft(ticket.estimateNote || ""); setWorkTypeDraft(ticket.workType || ""); setWorkNoteDraft(ticket.workNote || ""); setActualCostDraft(ticket.cost ? String(ticket.cost) : ticket.workNote ? "0" : ""); }, [ticket.id, ticket.estimate, ticket.estimateNote, ticket.workType, ticket.workNote, ticket.cost]);
  const technicianOnly = role === "technician";
  const technicians = people.filter(person => person.role === "technician" && person.active);
  const assignedTechnician = people.find(person => person.id === ticket.assignedTechnicianId);
  const requester = people.find(person => person.id === ticket.requesterId || person.name === ticket.requester);
  const departmentApproverIds = requester?.approverIds?.length ? requester.approverIds : ticket.estimateApproverIds || [];
  const omApproverIds = people.filter(person => person.role === "admin" && person.active && person.permissions?.includes("prepare_estimate")).map(person => person.id);
  const canAssignTechnician = role === "admin" && ticket.status === "รอหัวหน้า O&M อนุมัติ";
  const canTechnicianAdvance = role === "technician" && ["กำลังดำเนินการ","รอประเมินความพึงพอใจ"].includes(ticket.status);
  const canAdminWork = role === "admin" && ticket.status === "กำลังดำเนินการ" && !!currentPerson.permissions?.includes("execute_work");
  const allowedIds = ticket.currentApproverIds?.length ? ticket.currentApproverIds : ticket.currentApproverId ? [ticket.currentApproverId] : [];
  const neededPermission: Permission | undefined = ticket.status === "รอหัวหน้าหน่วยงานอนุมัติ" ? "approve_request" : ticket.status === "รอหัวหน้า O&M อนุมัติ" ? "prepare_estimate" : ticket.status === "รออนุมัติค่าใช้จ่าย" ? "approve_estimate" : undefined;
  const neededWorkTypePermission = ticket.status === "รออนุมัติค่าใช้จ่าย" ? permissionForWorkType(resolveWorkType(ticket)) : undefined;
  const isApprovalActor = role === "admin" || role === "approver";
  const approvalLocked = isApprovalActor && (!!allowedIds.length && !allowedIds.includes(currentPerson.id) || !!neededPermission && !currentPerson.permissions?.includes(neededPermission) || !!neededWorkTypePermission && !currentPerson.permissions?.includes(neededWorkTypePermission));
  const stageIndex = stages.indexOf(ticket.status);
  const workflowIndex = stageIndex >= 0 ? stageIndex + 1 : 0;
  const nextStatus = stages[Math.min(Math.max(stageIndex + 1, 0), stages.length - 1)];
  const next = () => {
    if (ticket.status === "รอหัวหน้าหน่วยงานอนุมัติ") {
      updateTicket({ status:"รอหัวหน้า O&M อนุมัติ", progress:28, currentApproverId:omApproverIds[0], currentApproverIds:omApproverIds }, `ขอให้ ADMIN อนุมัติและเลือกช่าง ${ticket.id}`);
      return;
    }
    if (ticket.status === "รอหัวหน้า O&M อนุมัติ") {
      const estimate = Number(estimateDraft);
      const workTypeApproverIds=approverIdsForWorkType(people,workTypeDraft);
      if (!ticket.assignedTechnicianId) { flash("กรุณาเลือกช่างผู้รับผิดชอบก่อน ADMIN อนุมัติ"); return; }
      if (!estimate || estimate <= 0) { flash("กรุณากรอกราคาประเมินค่าใช้จ่าย"); return; }
      if (!workTypeDraft) { flash("กรุณาเลือกประเภทใบงานก่อน ADMIN อนุมัติ"); return; }
      if (!workTypeApproverIds.length) { flash("ยังไม่มี ID ผู้อนุมัติที่ได้รับสิทธิ์สำหรับประเภทใบงานนี้"); return; }
      updateTicket({ status:"รออนุมัติค่าใช้จ่าย", progress:42, estimate, estimateNote:estimateNoteDraft.trim(), workType:workTypeDraft, estimateApproverId:workTypeApproverIds[0], estimateApproverIds:workTypeApproverIds, currentApproverId:workTypeApproverIds[0], currentApproverIds:workTypeApproverIds }, `ขออนุมัติค่าใช้จ่ายใบงาน ${ticket.id}`);
      return;
    }
    if (ticket.status === "รออนุมัติค่าใช้จ่าย") {
      updateTicket({ status:"กำลังดำเนินการ", progress:66 }, `ผลอนุมัติใบงาน ${ticket.id}: กำลังดำเนินการ`);
      return;
    }
    if (ticket.status === "กำลังดำเนินการ") {
      if (!workNoteDraft.trim()) { flash("กรุณาระบุรายละเอียดการดำเนินงานก่อนส่งงาน"); return; }
      if (actualCostDraft.trim() === "" || Number(actualCostDraft) < 0) { flash("กรุณากรอกค่าใช้จ่ายจริงก่อนส่งงาน"); return; }
      updateTicket({ status:"รอประเมินความพึงพอใจ", progress:84, workNote:workNoteDraft.trim(), cost:Number(actualCostDraft) }, `ดำเนินการใบงาน ${ticket.id} เสร็จแล้ว กรุณาเข้า O&M CARE เพื่อประเมินความพึงพอใจ`);
      return;
    }
    if (ticket.status === "รอประเมินความพึงพอใจ") {
      if (!ticket.rating) { flash("ต้องให้ User ทำแบบประเมินก่อนจึงจะปิดงานได้"); return; }
      updateTicket({ status:"ปิดงานแล้ว", progress:100, cost:ticket.cost }, `ปิดงาน ${ticket.id} เรียบร้อยแล้ว`);
    }
  };

  if (!showDetail) return <section className="panel full ticket-list-page"><div className="panel-head"><div><span className="eyebrow">MAINTENANCE REQUESTS</span><h3>{technicianOnly ? "ใบงานที่มอบหมายให้ฉัน" : "รายการใบแจ้งซ่อม"}</h3><p>กดเลือกรายการเพื่อดูรายละเอียดและสถานะดำเนินงาน</p></div><span className="ticket-count">{tickets.length} รายการ</span></div><div className="filters compact-filter"><input placeholder="ค้นหาเลขที่ใบงานหรือรายการ"/><button>ตัวกรอง</button></div><div className="compact-ticket-list">{tickets.length ? tickets.map(item => <button key={item.id} onClick={() => { setSelected(item.id); setShowDetail(true); }}><span className={`compact-status-dot ${statusTone[item.status]}`}/><span className="compact-ticket-main"><b>{item.title}</b><small>{item.id} · {item.location}</small></span><span className="compact-ticket-requester"><small>{technicianOnly ? "ผู้แจ้ง" : "ช่างผู้รับผิดชอบ"}</small><b>{technicianOnly ? item.requester : people.find(person => person.id === item.assignedTechnicianId)?.name || "ยังไม่มอบหมาย"}</b></span><span className={`badge ${statusTone[item.status]}`}>{ticketStageLabel(item)}</span><time>{item.createdAt}</time><strong>›</strong></button>) : <div className="empty-ticket-list">{technicianOnly ? "ยังไม่มีใบงานที่มอบหมายให้คุณ" : "ยังไม่มีใบแจ้งซ่อม"}</div>}</div></section>;

  return <section className="workspace detail-open"><div className="ticket-detail"><button className="ticket-back" onClick={() => setShowDetail(false)}>← กลับไปรายการใบงาน</button><div className="detail-head"><div><span className="eyebrow">{ticket.id}</span><h2>{ticket.title}</h2><p>{ticket.location} · โดย {ticket.requester}</p></div><span className={`badge large ${statusTone[ticket.status]}`}>{ticketStageLabel(ticket)}</span></div>
    {approvalLocked && <div className="stage-hold"><i>⏳</i><div><b>กำลังรอการอนุมัติ</b><span>ขั้นตอนที่ติดอยู่: {stageLabel(ticket.status)}</span></div></div>}
    {role === "user" ? <div className={`user-current-status ${statusTone[ticket.status]}`}><span>สถานะใบงานปัจจุบัน</span><b>{ticketStageLabel(ticket)}</b></div> : <div className="timeline">{workflowLabels.map((label,index) => <div className={index <= workflowIndex ? "done" : ""} key={`${label}-${index}`}><i>{index < workflowIndex ? "✓" : index+1}</i><small>{label}</small></div>)}</div>}
    <div className="detail-grid"><div className="info-card"><h3>รายละเอียดการแจ้ง</h3><dl><div><dt>หมวดหมู่</dt><dd>{ticket.category}</dd></div><div><dt>หน่วยงาน</dt><dd>{ticket.department}</dd></div><div><dt>ความเร่งด่วน</dt><dd>{ticket.priority}</dd></div><div><dt>ช่างผู้รับผิดชอบ</dt><dd>{assignedTechnician?.name || "ยังไม่มอบหมาย"}</dd></div><div className="full"><dt>ประเภทใบงาน</dt><dd>{ticket.workType || "รอ ADMIN กำหนด"}</dd></div><div className="full"><dt>อาการ / รายละเอียด</dt><dd>{ticket.description}</dd></div>{ticket.workNote && <div className="full"><dt>รายละเอียดการดำเนินงาน</dt><dd>{ticket.workNote}</dd></div>}</dl></div><div className="info-card cost-card"><h3>ค่าใช้จ่าย</h3><div><span>ราคาประเมิน</span><b>{ticket.estimate ? money(ticket.estimate) : "รอประเมิน"}</b></div>{ticket.estimateNote && <p className="estimate-note-view"><span>หมายเหตุราคาประเมิน</span>{ticket.estimateNote}</p>}<div><span>ค่าใช้จ่ายจริง</span><b>{ticket.workNote ? money(ticket.cost) : "—"}</b></div><small>วิธีดำเนินการ: {ticket.route === "stock" ? "ซ่อมเอง / เบิก Stock" : ticket.route === "purchase" ? "จัดซื้อ / ผู้รับเหมา" : "รอพิจารณา"}</small></div></div>
    {canAssignTechnician && !approvalLocked && <div className="workflow-editor admin-approval-editor"><div><b>ADMIN อนุมัติและกำหนดประเภทใบงาน</b><small>เลือกประเภทเพื่อใช้แยกสรุปผลประเมินประจำเดือน</small></div><label>ประเภทใบงาน<select value={workTypeDraft} onChange={event=>setWorkTypeDraft(event.target.value)}><option value="">— เลือกประเภทใบงาน —</option>{workTypeOptions.map(option=><option key={option}>{option}</option>)}</select></label><label>ราคาประเมินค่าใช้จ่าย (บาท)<input type="number" min="0" step="0.01" value={estimateDraft} onChange={event => setEstimateDraft(event.target.value)}/></label><label>หมายเหตุสำหรับ User / หัวหน้างาน<textarea rows={3} value={estimateNoteDraft} onChange={event => setEstimateNoteDraft(event.target.value)}/></label></div>}
    {canAssignTechnician && !approvalLocked && <div className="technician-assignment"><div><b>ADMIN เลือกช่างผู้รับผิดชอบ</b><small>ต้องเลือกช่างก่อนส่งขออนุมัติค่าใช้จ่าย</small></div><select value={ticket.assignedTechnicianId || ""} onChange={event => assignTechnician(ticket.id, Number(event.target.value) || undefined)}><option value="">— เลือกช่าง —</option>{technicians.map(person => <option key={person.id} value={person.id}>{person.name} · {person.loginId}</option>)}</select></div>}
    {(canTechnicianAdvance || canAdminWork) && ticket.status === "กำลังดำเนินการ" && <div className="workflow-editor work-note-editor"><div><b>{canAdminWork ? "ADMIN ดำเนินการแทนช่าง" : "รายละเอียดการดำเนินงาน"}</b><small>ระบุค่าใช้จ่ายจริงและสิ่งที่ดำเนินการก่อนส่งงานให้ User ประเมิน</small></div><label>ค่าใช้จ่ายจริง (บาท)<input type="number" min="0" step="0.01" value={actualCostDraft} onChange={event=>setActualCostDraft(event.target.value)}/></label><label>หมายเหตุการทำงาน<textarea rows={4} value={workNoteDraft} onChange={event => setWorkNoteDraft(event.target.value)}/></label></div>}
    {((isApprovalActor && !!neededPermission) || canTechnicianAdvance || canAdminWork) && !approvalLocked && !["ปิดงานแล้ว","ไม่อนุมัติ"].includes(ticket.status) && <div className="action-bar"><div><b>{role === "technician" || canAdminWork ? "ดำเนินการใบงาน" : "ขั้นตอนอนุมัติ"}</b><small>{ticket.status === "กำลังดำเนินการ" ? "ส่งผลการดำเนินการให้ User ประเมิน" : role === "technician" ? "User ประเมินแล้ว ช่างสามารถปิดงานได้" : stageLabel(nextStatus)}</small></div>{isApprovalActor && ["รอหัวหน้าหน่วยงานอนุมัติ","รออนุมัติค่าใช้จ่าย"].includes(ticket.status) && <button className="danger" onClick={() => updateTicket({status:"ไม่อนุมัติ",progress:0},`${ticket.status === "รออนุมัติค่าใช้จ่าย" ? "ไม่อนุมัติค่าใช้จ่าย" : "ไม่อนุมัติ"} ${ticket.id}`)}>ไม่อนุมัติ</button>}<button className="primary" disabled={(ticket.status === "รอหัวหน้า O&M อนุมัติ" && (!ticket.assignedTechnicianId || !Number(estimateDraft) || !workTypeDraft)) || (ticket.status === "รอประเมินความพึงพอใจ" && !ticket.rating)} onClick={next}>{role === "technician" && ticket.status === "รอประเมินความพึงพอใจ" ? "ปิดงาน →" : ticket.status === "กำลังดำเนินการ" ? "ส่งงานดำเนินการเสร็จ →" : ticket.status === "รอหัวหน้าหน่วยงานอนุมัติ" ? "อนุมัติและส่ง ADMIN →" : ticket.status === "รอหัวหน้า O&M อนุมัติ" ? "ADMIN อนุมัติ / ส่งขอค่าใช้จ่าย →" : "อนุมัติค่าใช้จ่าย / เริ่มงาน →"}</button></div>}
    {role === "user" && ticket.status === "รอประเมินความพึงพอใจ" && !ticket.rating && <div className="pre-close-survey"><div><b>แบบประเมินก่อนปิดงาน</b><small>ช่างส่งงานเสร็จแล้ว กรุณาประเมินความพึงพอใจ 10 ข้อ เพื่อให้ช่างปิดงาน</small></div><button className="survey-cta" onClick={() => openSurvey(ticket,false)}>★ ทำแบบประเมิน</button></div>}
    {role === "admin" && <div className="survey-admin-view"><div><b>แบบประเมินงานของใบงานนี้</b><small>{ticket.rating ? `User ประเมินแล้ว ${ticket.rating.toFixed(2)} / 4.00` : "ยังไม่มีผลประเมินจาก User"}</small></div><button disabled={!ticket.rating} onClick={() => openSurvey(ticket,true)}>ดูแบบประเมิน</button></div>}
    {ticket.rating && <div className="rating-done">★ ประเมินแล้ว {ticket.rating.toFixed(1)} / 4.0 · พร้อมปิดงาน</div>}
  </div></section>;
}

function NewTicket({state,currentPerson,setState,done}:{state:AppState;currentPerson:Person;setState:(s:AppState)=>void;done:(id:string)=>void}) {
  const now = new Date(); const pad = (value:number) => String(value).padStart(2,"0");
  const defaultDate = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`; const defaultTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const submit = (event:FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const id = `OM-2608-${String(state.tickets.length+15).padStart(3,"0")}`;
    const approverIds = currentPerson.approverIds || (currentPerson.approverId ? [currentPerson.approverId] : []); const approvers = state.people.filter(person => approverIds.includes(person.id));
    const reportedDate = String(form.get("reportedDate")); const reportedTime = String(form.get("reportedTime")); const company = String(form.get("company")); const phone = String(form.get("phone")); const floor = String(form.get("floor")); const building = String(form.get("building")); const chargeCompany = String(form.get("chargeCompany"));
    const ticket:Ticket = { id, title:String(form.get("title")), category:String(form.get("category")), location:`${building}${floor ? ` ชั้น ${floor}` : ""}`, requester:currentPerson.name, requesterId:currentPerson.id, company, department:currentPerson.department, phone, reportedDate, reportedTime, floor, building, chargeCompany, createdAt:new Date(`${reportedDate}T${reportedTime || "00:00"}`).toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"numeric"}), status:"รอหัวหน้าหน่วยงานอนุมัติ", progress:14, priority:String(form.get("priority")), estimate:0, cost:0, route:"pending", description:String(form.get("description")), initialApproverId:approverIds[0], estimateApproverId:approverIds[0], currentApproverId:approverIds[0], initialApproverIds:approverIds, estimateApproverIds:approverIds, currentApproverIds:approverIds, approvalHistory:[] };
    const mailEntries:Mail[] = approvers.map((approver,index) => ({ id:Date.now()+index, to:`${approver.name} <${approver.email}>`, recipientId:approver.id, subject:`ขออนุมัติการดำเนินการใบแจ้งซ่อม ${id}`, time:"เมื่อสักครู่", status:"กำลังส่ง" }));
    setState({ ...state, tickets:[ticket,...state.tickets], mails:[...mailEntries,...state.mails] }); done(id);
  };
  return <section className="form-panel expanded"><div className="form-intro"><span className="eyebrow">NEW MAINTENANCE REQUEST</span><h2>แจ้งปัญหาให้เราดูแล</h2><p>ข้อมูลผู้แจ้งจะเชื่อมกับ User ID โดยอัตโนมัติ และส่งใบงานไปยังผู้อนุมัติที่กำหนด</p><div className="form-tip"><b>ข้อมูลจาก User ID</b><span>{currentPerson.name} · {currentPerson.company || "ยังไม่ได้กำหนดบริษัท"}<br/>{currentPerson.department} · ID {currentPerson.loginId}</span></div></div><form onSubmit={submit}><div className="request-grid three"><label>วันที่แจ้ง *<input type="date" name="reportedDate" defaultValue={defaultDate} required/></label><label>เวลาแจ้ง *<input type="time" name="reportedTime" defaultValue={defaultTime} required/></label><label>ผู้แจ้ง<input value={currentPerson.name} readOnly/></label></div><div className="request-grid two-fields"><label>บริษัท *<select name="company" defaultValue={currentPerson.company || ""} required><option value="">เลือกบริษัท</option>{companyOptions.map(company => <option key={company}>{company}</option>)}</select></label><label>หน่วยงาน<input value={currentPerson.department} readOnly/></label></div><div className="request-grid three"><label>เบอร์ติดต่อ *<input name="phone" defaultValue={currentPerson.phone || ""} required/></label><label>ประจำอยู่ชั้นที่ *<input name="floor" required/></label><label>อาคาร *<input name="building" required/></label></div><div><label>ค่าใช้จ่ายเข้าบริษัท *<select name="chargeCompany" required defaultValue=""><option value="">กรุณาเลือก บริษัท</option>{companyOptions.map(company => <option key={company}>{company}</option>)}</select></label></div><div><label>หัวข้อที่แจ้ง *<input name="title" required/></label></div><div className="two"><label>หมวดหมู่<select name="category"><option>เครื่องปรับอากาศ</option><option>ไฟฟ้า</option><option>ประปา</option><option>อาคาร</option><option>อื่น ๆ</option></select></label><label>ความเร่งด่วน<select name="priority"><option>ปกติ</option><option>เร่งด่วน</option><option>ฉุกเฉิน</option></select></label></div><div><label>รายละเอียดอาการ *<textarea name="description" required rows={5}/></label></div><div className="form-actions"><button type="button">บันทึกร่าง</button><button className="primary" type="submit">ส่งใบแจ้งซ่อม →</button></div></form></section>;
}

function StockPage({stock}:{stock:Stock[]}) { return <section className="panel full"><div className="panel-head"><div><span className="eyebrow">INVENTORY CONTROL</span><h3>รายการอะไหล่คงคลัง</h3></div><button className="primary">＋ เพิ่มอะไหล่</button></div><table><thead><tr><th>รหัส</th><th>รายการ</th><th>คงเหลือ</th><th>จุดสั่งซื้อ</th><th>ราคาต่อหน่วย</th><th>สถานะ</th></tr></thead><tbody>{stock.map(s=><tr key={s.id}><td><b>{s.code}</b></td><td>{s.name}</td><td><strong>{s.qty}</strong> {s.unit}</td><td>{s.min} {s.unit}</td><td>{money(s.price)}</td><td><span className={`badge ${s.qty<=s.min?"red":"green"}`}>{s.qty<=s.min?"ต้องสั่งซื้อ":"พร้อมใช้"}</span></td></tr>)}</tbody></table></section>; }
function Purchase({tickets,update}:{tickets:Ticket[];update:(id:string,p:Partial<Ticket>)=>void}) { return <section className="panel full"><div className="panel-head"><div><span className="eyebrow">PROCUREMENT WORKFLOW</span><h3>ติดตาม PR / PO และผู้รับเหมา</h3></div></div><div className="kanban">{["รอออก PR","ออก PO แล้ว","ผู้รับเหมาดำเนินการ"].map((col,ci)=><div key={col}><h4>{col}<span>{ci===0?tickets.length:0}</span></h4>{ci===0&&tickets.map(t=><article key={t.id}><small>{t.id}</small><b>{t.title}</b><p>{t.location}</p><strong>{money(t.estimate)}</strong><button onClick={()=>update(t.id,{status:"กำลังดำเนินการ",progress:66})}>ออก PO / ส่งผู้รับเหมา →</button></article>)}</div>)}</div></section>; }
function Reports({state}:{state:AppState}) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [workTypeFilter, setWorkTypeFilter] = useState("all");
  const thaiMonths = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  const ticketPeriod = (ticket:Ticket) => {
    if (ticket.reportedDate && /^\d{4}-\d{2}/.test(ticket.reportedDate)) return { year:Number(ticket.reportedDate.slice(0,4)), month:Number(ticket.reportedDate.slice(5,7)) };
    const match = ticket.createdAt.match(/(\d{1,2})\s+([^\s]+)\s+(\d{4})/); const shortMonths:Record<string,number> = { "ม.ค.":1,"ก.พ.":2,"มี.ค.":3,"เม.ย.":4,"พ.ค.":5,"มิ.ย.":6,"ก.ค.":7,"ส.ค.":8,"ก.ย.":9,"ต.ค.":10,"พ.ย.":11,"ธ.ค.":12 };
    return match ? { year:Number(match[3]) - 543, month:shortMonths[match[2]] || 0 } : { year:now.getFullYear(), month:now.getMonth()+1 };
  };
  const availableYears = Array.from(new Set([...state.tickets.map(ticket => ticketPeriod(ticket).year), now.getFullYear()])).sort((a,b)=>b-a);
  const monthTickets = state.tickets.filter(ticket => { const period=ticketPeriod(ticket); return period.month===month && period.year===year; });
  const filtered = monthTickets.filter(ticket => workTypeFilter === "all" || resolveWorkType(ticket) === workTypeFilter);
  const evaluations = filtered.filter(ticket => ticket.surveyScores?.length === 10);
  const scoreRows = surveyQuestions.map((question,index) => {
    const values = evaluations.map(ticket => ticket.surveyScores?.[index]).filter((value):value is number => typeof value === "number");
    const counts = [4,3,2,1].map(score => values.filter(value => value === score).length);
    const total = values.reduce((sum,value)=>sum+value,0);
    return { question, counts, responses:values.length, total, percent:values.length ? total/(values.length*4)*100 : 0 };
  });
  const allScores = evaluations.flatMap(ticket => ticket.surveyScores || []);
  const overallPercent = allScores.length ? allScores.reduce((sum,value)=>sum+value,0)/(allScores.length*4)*100 : 0;
  const groupRows = workTypeOptions.map((name,index) => { const tickets=monthTickets.filter(ticket=>resolveWorkType(ticket)===name); return { name:`ประเภทที่ ${index+1}: ${name}`, received:tickets.length, completed:tickets.filter(ticket=>ticket.status==="ปิดงานแล้ว").length, active:tickets.filter(ticket=>!["ปิดงานแล้ว","ไม่อนุมัติ"].includes(ticket.status)).length }; });
  const completed = filtered.filter(ticket => ticket.status === "ปิดงานแล้ว").length;
  const reportTypeLabel = workTypeFilter === "all" ? "รวมทุกประเภทใบงาน" : workTypeFilter;
  return <><section className="report-hero no-print"><div><span>MONTHLY O&M SATISFACTION REPORT</span><h2>สรุปผลแบบประเมินความพึงพอใจ</h2><p>เลือกรอบเดือนแล้วระบบจะคำนวณตารางตามแบบ OPM อัตโนมัติ</p></div><button onClick={()=>window.print()}>↓ ดาวน์โหลด PDF</button></section>
    <section className="panel report-filters no-print"><label>เดือน<select value={month} onChange={event=>setMonth(Number(event.target.value))}>{thaiMonths.map((name,index)=><option value={index+1} key={name}>{name}</option>)}</select></label><label>ปี<select value={year} onChange={event=>setYear(Number(event.target.value))}>{availableYears.map(value=><option key={value} value={value}>{value+543}</option>)}</select></label><label className="work-type-filter">ประเภทใบงาน<select value={workTypeFilter} onChange={event=>setWorkTypeFilter(event.target.value)}><option value="all">รวมทุกประเภทใบงาน</option>{workTypeOptions.map((option,index)=><option value={option} key={option}>{index+1}. {option}</option>)}</select></label><span>เลือกประเภทแล้วกด “ดาวน์โหลด PDF” เพื่อออกรายงานแยกประเภท</span></section>
    <section className="monthly-survey report-sheet"><div className="report-sheet-head"><h2>ผลประเมินแบบสำรวจความพึงพอใจงานซ่อมบำรุง (OPM)</h2><h3>{reportTypeLabel}</h3><h3>ประจำเดือน {thaiMonths[month-1]} {year+543}</h3><span>{evaluations.length*4} (คะแนนเต็มต่อข้อ)</span></div><div className="report-table-wrap"><table className="opm-summary-table"><thead><tr><th>รายละเอียด</th><th>4</th><th>3</th><th>2</th><th>1</th><th>จำนวน<br/>แบบประเมิน</th><th>คะแนน<br/>รวม</th><th>% ที่ได้</th></tr></thead><tbody>{scoreRows.map((row,index)=><tr key={row.question}><td>{index+1}) {row.question}</td>{row.counts.map((count,scoreIndex)=><td key={scoreIndex}>{count}</td>)}<td>{row.responses}</td><td>{row.total}</td><td>{row.percent.toFixed(2)}</td></tr>)}<tr className="overall-row"><th colSpan={7}>สรุปความพึงพอใจในภาพรวม</th><th>{overallPercent.toFixed(2)}</th></tr></tbody></table></div><div className="report-sheet-bottom"><div className="group-work-summary">{(workTypeFilter === "all" ? groupRows : groupRows.filter(group=>group.name.includes(workTypeFilter))).map(group=><div key={group.name}><b>{group.name}</b><p><span>จำนวนงานที่รับทั้งหมด</span><strong>{group.received} งาน</strong></p><p><span>จำนวนงานที่ดำเนินการแล้วเสร็จ</span><strong>{group.completed} งาน</strong></p>{group.active>0&&<p><span>จำนวนงานที่อยู่ระหว่างดำเนินการ</span><strong>{group.active} งาน</strong></p>}</div>)}<div className="grand-work-total"><p><span>รวมจำนวนงานซ่อมบำรุงที่รับทั้งหมด</span><strong>{filtered.length} งาน</strong></p><p><span>รวมจำนวนงานที่ดำเนินการแล้วเสร็จ</span><strong>{completed} งาน</strong></p></div></div><div className="report-signatures"><p><span>ลงชื่อ</span><i/> <span>ผู้บันทึก</span></p><p><span>วันที่</span><i/></p><p><span>ลงชื่อ</span><i/> <span>ผู้ตรวจสอบ 1</span></p><p><span>วันที่</span><i/></p><p><span>ลงชื่อ</span><i/> <span>ผู้ตรวจสอบ 2</span></p><p><span>วันที่</span><i/></p></div></div></section>
  </>;
}

function ExcelUserImport({state,currentPerson,setState,flash}:{state:AppState;currentPerson:Person;setState:(s:AppState)=>void;flash:(s:string)=>void}) {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{added:number;duplicates:number;invalid:number} | null>(null);
  if (!currentPerson.permissions?.includes("manage_users")) return null;
  const approvers = state.people.filter(person => person.role === "approver" && person.active);
  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const rows = [{ "User ID":"01E4713", "Password":"123456", "Name":"คุณตัวอย่าง ผู้ใช้งาน", "Email":"user@company.co.th", "Company":"TEAM (ทีม คอนซัลติ้ง เอนจิเนียริ่ง แอนด์ แมเนจเมนท์ จำกัด (มหาชน))", "Department":"วิศวกรรม", "Phone":"02-000-0000", "Approver ID":"APR-FIN-001" }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), "Users");
    XLSX.writeFile(book, "OM-CARE-user-import-template.xlsx");
  };
  const importExcel = async (file: File) => {
    setImporting(true); setResult(null);
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = book.Sheets[book.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const existing = new Set(state.people.map(person => person.loginId?.trim().toLowerCase()));
      const pending = new Set<string>();
      let duplicates = 0; let invalid = 0;
      const added: Person[] = [];
      const normalizeKey = (key:string) => key.toLowerCase().replace(/[\s_-]/g, "");
      rows.forEach((row, index) => {
        const cells = Object.fromEntries(Object.entries(row).map(([key,value]) => [normalizeKey(key), String(value).trim()]));
        const get = (...keys:string[]) => keys.map(key => cells[normalizeKey(key)]).find(Boolean) || "";
        const loginId = get("User ID","Login ID","รหัสผู้ใช้","ไอดี").toLowerCase();
        const password = get("Password","รหัสผ่าน");
        const name = get("Name","ชื่อ","ชื่อ-นามสกุล","ชื่อ–นามสกุล");
        const email = get("Email","อีเมล");
        const company = get("Company","บริษัท");
        const department = get("Department","หน่วยงาน");
        const phone = get("Phone","เบอร์ติดต่อ","โทรศัพท์");
        if (!loginId || password.length < 6 || !name || !email.includes("@") || !department) { invalid++; return; }
        if (existing.has(loginId) || pending.has(loginId)) { duplicates++; return; }
        const approverCodes = get("Approver ID","ผู้อนุมัติ","รหัสผู้อนุมัติ").split(/[,;|]/).map(value => value.trim().toLowerCase()).filter(Boolean);
        const approverIds = approvers.filter(person => approverCodes.includes((person.approvalCode || "").toLowerCase()) || approverCodes.includes((person.loginId || "").toLowerCase())).map(person => person.id);
        pending.add(loginId);
        added.push({ id: Date.now() + index + 1, loginId, password, name, email, company, department, phone, role: "user", active: true, approverId: approverIds[0], approverIds, permissions: [] });
      });
      const summary = { added: added.length, duplicates, invalid };
      let saved = true;
      if (added.length) {
        const nextState = { ...state, people: [...added, ...state.people] };
        setState(nextState);
        try { const response = await fetch("/api/state", { method:"PUT", headers:{"content-type":"application/json"}, body:JSON.stringify({state:nextState}) }); const payload = await response.json() as {ok?:boolean}; saved = response.ok && payload.ok === true; } catch { saved = false; }
      }
      setResult(summary);
      flash(saved ? `เพิ่ม ${summary.added} ID ใน USER & MULTI-APPROVER CONTROL และบันทึกถาวรแล้ว · ซ้ำ ${summary.duplicates} · ไม่ครบ ${summary.invalid}` : `เพิ่มรายชื่อบนหน้าจอแล้ว แต่บันทึกส่วนกลางไม่สำเร็จ กรุณาลองอัปโหลดอีกครั้ง`);
    } catch {
      setResult({ added: 0, duplicates: 0, invalid: 1 });
      flash("อ่านไฟล์ Excel ไม่สำเร็จ กรุณาใช้ไฟล์ .xlsx ตามแบบฟอร์มตัวอย่าง");
    } finally { setImporting(false); }
  };
  return <section className="panel excel-import-panel"><div><span className="eyebrow">BULK USER IMPORT</span><h3>เพิ่ม User ID หลายคนด้วย Excel</h3><p>คอลัมน์: User ID, Password, Name, Email, Department และ Company / Phone / Approver ID (ถ้ามี) รองรับไฟล์ตัวอย่างเดิมและไฟล์แบบใหม่</p></div><div className="excel-import-actions"><button onClick={downloadTemplate}>↓ ดาวน์โหลดไฟล์ตัวอย่างใหม่</button><label className={importing ? "disabled" : ""}>⇧ {importing ? "กำลังนำเข้าและบันทึก..." : "เลือกไฟล์ Excel"}<input type="file" accept=".xlsx,.xls" disabled={importing} onChange={event => { const file = event.target.files?.[0]; if (file) importExcel(file); event.currentTarget.value = ""; }}/></label></div>{result && <div className="excel-result"><span><b>{result.added}</b> เพิ่มแล้ว</span><span><b>{result.duplicates}</b> ข้อมูลซ้ำ</span><span><b>{result.invalid}</b> ข้อมูลไม่ครบ</span></div>}</section>;
}

function PeopleV4({state,currentPerson,setState,flash,onCurrentDeleted}:{state:AppState;currentPerson:Person;setState:(s:AppState)=>void;flash:(s:string)=>void;onCurrentDeleted:()=>void}) {
  const [open, setOpen] = useState(false); const [editingId, setEditingId] = useState<number | null>(null); const [newRole, setNewRole] = useState<Role>("user"); const [newPermissions, setNewPermissions] = useState<Permission[]>([]); const [newApproverIds, setNewApproverIds] = useState<number[]>([]);
  const canManage = currentPerson.role === "admin" && currentPerson.permissions?.includes("manage_users"); const approvers = state.people.filter(person => person.role === "approver" && person.active);
  if (!canManage) return <section className="panel full locked-approval"><div className="lock-symbol">🔒</div><h2>ไม่มีสิทธิ์จัดการผู้ใช้งาน</h2></section>;
  const toggleArray = (values: number[], id: number) => values.includes(id) ? values.filter(value => value !== id) : [...values, id];
  const saveNew = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const f = new FormData(event.currentTarget); const loginId = String(f.get("loginId")).trim().toLowerCase(); if (state.people.some(p => p.loginId?.toLowerCase() === loginId)) { flash("User ID นี้ถูกใช้งานแล้ว"); return; } const person: Person = { id: Date.now(), loginId, password: String(f.get("password")), name: String(f.get("name")), email: String(f.get("email")), department: String(f.get("department")), role: newRole, active: true, approvalCode: newRole === "approver" ? String(f.get("approvalCode")) || `APR-${Date.now().toString().slice(-5)}` : undefined, approverIds: newRole === "user" ? newApproverIds : [], permissions: newRole === "admin" || newRole === "approver" ? newPermissions : newRole === "technician" ? ["execute_work","inspect_close"] : [], workTypePermissionsConfigured:newRole === "approver" ? true : undefined }; setState({ ...state, people: [...state.people, person] }); setOpen(false); setNewPermissions([]); setNewApproverIds([]); flash(`สร้างบัญชี ${loginId} แล้ว`); };
  const saveEdit = (event: FormEvent<HTMLFormElement>, person: Person) => {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const loginId = String(f.get("loginId")).trim().toLowerCase();
    if (state.people.some(p => p.id !== person.id && p.loginId?.toLowerCase() === loginId)) { flash("User ID นี้ถูกใช้งานแล้ว"); return; }
    const nextRole: Role = person.id === 1 ? "admin" : String(f.get("role")) as Role;
    const removedAsApprover = person.role === "approver" && nextRole !== "approver";
    const updatedPerson: Person = {
      ...person,
      loginId,
      password: String(f.get("password")),
      name: String(f.get("name")),
      email: String(f.get("email")),
      department: String(f.get("department")),
      role: nextRole,
      approvalCode: nextRole === "approver" ? String(f.get("approvalCode")).trim() || person.approvalCode || `APR-${Date.now().toString().slice(-5)}` : undefined,
      permissions: nextRole === "admin" || nextRole === "approver" ? person.permissions || [] : nextRole === "technician" ? ["execute_work","inspect_close"] : [],
      workTypePermissionsConfigured:nextRole === "approver" ? true : undefined,
      approverId: nextRole === "user" ? person.approverId : undefined,
      approverIds: nextRole === "user" ? person.approverIds || [] : [],
    };
    setState({
      ...state,
      people: state.people.map(item => item.id === person.id ? updatedPerson : removedAsApprover ? { ...item, approverIds: (item.approverIds || []).filter(id => id !== person.id), approverId: item.approverId === person.id ? undefined : item.approverId } : item),
      tickets: removedAsApprover ? state.tickets.map(ticket => ({ ...ticket, initialApproverIds: (ticket.initialApproverIds || []).filter(id => id !== person.id), estimateApproverIds: (ticket.estimateApproverIds || []).filter(id => id !== person.id), currentApproverIds: (ticket.currentApproverIds || []).filter(id => id !== person.id), initialApproverId: ticket.initialApproverId === person.id ? undefined : ticket.initialApproverId, estimateApproverId: ticket.estimateApproverId === person.id ? undefined : ticket.estimateApproverId, currentApproverId: ticket.currentApproverId === person.id ? undefined : ticket.currentApproverId })) : state.tickets,
    });
    setEditingId(null);
    flash(`แก้ไขบัญชี ${loginId} เป็น ${nextRole === "admin" ? "ADMIN" : nextRole === "approver" ? "ผู้อนุมัติ" : nextRole === "technician" ? "ช่าง" : "User"} แล้ว`);
  };
  const togglePermission = (personId: number, permission: Permission) => {
    const nextPeople=state.people.map(person => person.id === personId ? { ...person, permissions: person.permissions?.includes(permission) ? person.permissions.filter(item => item !== permission) : [...(person.permissions || []), permission], workTypePermissionsConfigured:person.role === "approver" && workTypePermissions.includes(permission) ? true : person.workTypePermissionsConfigured } : person);
    setState({ ...state, people:nextPeople, tickets:state.tickets.map(ticket=>{ if(ticket.status!=="รออนุมัติค่าใช้จ่าย") return ticket; const ids=approverIdsForWorkType(nextPeople,resolveWorkType(ticket)); return {...ticket,estimateApproverId:ids[0],estimateApproverIds:ids,currentApproverId:ids[0],currentApproverIds:ids}; }) });
  };
  const toggleApprover = (userId: number, approverId: number) => { const user = state.people.find(person => person.id === userId); const nextIds = toggleArray(user?.approverIds || [], approverId); setState({ ...state, people: state.people.map(person => person.id === userId ? { ...person, approverIds: nextIds, approverId: nextIds[0] } : person), tickets: state.tickets.map(ticket => ticket.requesterId === userId && ticket.status === "รอหัวหน้าหน่วยงานอนุมัติ" ? { ...ticket, initialApproverIds: nextIds, currentApproverIds: nextIds, initialApproverId: nextIds[0], currentApproverId: nextIds[0] } : ticket) }); };
  const remove = async (person: Person) => { if (!window.confirm(`ยืนยันลบบัญชี ${person.loginId}?${person.id === currentPerson.id ? " ระบบจะออกจากระบบหลังลบสำเร็จ" : ""}`)) return; const deletingCurrentAccount = person.id === currentPerson.id; const nextState = { ...state, people: state.people.filter(item => item.id !== person.id).map(item => ({ ...item, approverIds: (item.approverIds || []).filter(id => id !== person.id), approverId: item.approverId === person.id ? undefined : item.approverId })), tickets: state.tickets.map(ticket => ({ ...ticket, initialApproverIds: (ticket.initialApproverIds || []).filter(id => id !== person.id), estimateApproverIds: (ticket.estimateApproverIds || []).filter(id => id !== person.id), currentApproverIds: (ticket.currentApproverIds || []).filter(id => id !== person.id), initialApproverId: ticket.initialApproverId === person.id ? undefined : ticket.initialApproverId, estimateApproverId: ticket.estimateApproverId === person.id ? undefined : ticket.estimateApproverId, currentApproverId: ticket.currentApproverId === person.id ? undefined : ticket.currentApproverId, assignedTechnicianId: ticket.assignedTechnicianId === person.id ? undefined : ticket.assignedTechnicianId })) }; setState(nextState); try { const response = await fetch("/api/state", { method:"PUT", headers:{"content-type":"application/json"}, body:JSON.stringify({state:nextState}) }); const payload = await response.json() as {ok?:boolean}; if (!response.ok || payload.ok !== true) throw new Error("save failed"); if (deletingCurrentAccount) { onCurrentDeleted(); return; } flash(`ลบบัญชี ${person.loginId} และบันทึกถาวรแล้ว`); } catch { setState(state); flash(`ลบบัญชี ${person.loginId} ไม่สำเร็จ กรุณาลองใหม่`); } };
  return <section className="panel full"><div className="panel-head"><div><span className="eyebrow">USER & ROLE CONTROL</span><h3>จัดการ ADMIN ผู้อนุมัติ ช่าง และ User แยกประเภท</h3></div><button className="primary" onClick={() => setOpen(!open)}>＋ เพิ่มบัญชีใหม่</button></div>{open && <form className="user-create-form" onSubmit={saveNew}><div className="user-fields"><input name="loginId" required placeholder="User ID"/><input name="password" type="password" required minLength={6} placeholder="รหัสผ่าน"/><input name="name" required placeholder="ชื่อ–นามสกุล"/><input name="email" type="email" required placeholder="อีเมล"/><input name="department" required placeholder="หน่วยงาน"/><select value={newRole} onChange={e => { setNewRole(e.target.value as Role); setNewPermissions([]); }}><option value="user">User</option><option value="technician">ช่าง</option><option value="approver">ผู้อนุมัติ</option><option value="admin">ADMIN</option></select>{newRole === "approver" && <input name="approvalCode" placeholder="Approval ID"/>}</div>{newRole === "user" && <div className="multi-approver"><b>เลือกผู้อนุมัติใบแจ้งซ่อมขั้นแรกได้มากกว่า 1 คน</b>{approvers.map(person => <label key={person.id} className={newApproverIds.includes(person.id) ? "chosen" : ""}><input type="checkbox" checked={newApproverIds.includes(person.id)} onChange={() => setNewApproverIds(ids => toggleArray(ids, person.id))}/><span>✓</span>{person.name}<small>{person.approvalCode || person.loginId}</small></label>)}</div>}{(newRole === "admin" || newRole === "approver") && <div className="permission-picker"><b>{newRole === "admin" ? "สิทธิ์ ADMIN รายขั้นตอน" : "สิทธิ์อนุมัติรายขั้นตอน"}</b>{permissionOptions.filter(option => newRole === "admin" ? !workTypePermissions.includes(option.key) : ["approve_request","approve_estimate",...workTypePermissions].includes(option.key)).map(option => <label key={option.key}><input type="checkbox" checked={newPermissions.includes(option.key)} onChange={() => setNewPermissions(values => values.includes(option.key) ? values.filter(item => item !== option.key) : [...values, option.key])}/>{option.label}</label>)}</div>}<div className="form-actions"><button type="button" onClick={() => setOpen(false)}>ยกเลิก</button><button className="primary">สร้างบัญชี</button></div></form>}<div className="user-cards">{state.people.map(person => <article className="user-card" key={person.id}>{editingId === person.id ? <form className="edit-user-form" onSubmit={event => saveEdit(event, person)}><input name="loginId" defaultValue={person.loginId} required placeholder="User ID"/><input name="password" type="text" defaultValue={person.password} required minLength={6} placeholder="รหัสผ่าน"/><input name="name" defaultValue={person.name} required/><input name="email" type="email" defaultValue={person.email} required/><input name="department" defaultValue={person.department} required/><select name="role" defaultValue={person.role} disabled={person.id === 1} aria-label="ประเภทบัญชี"><option value="user">User</option><option value="technician">ช่าง</option><option value="approver">ผู้อนุมัติ</option><option value="admin">ADMIN</option></select><input name="approvalCode" defaultValue={person.approvalCode} placeholder="Approval ID (สำหรับผู้อนุมัติ)"/><button type="button" onClick={() => setEditingId(null)}>ยกเลิก</button><button className="primary">บันทึก</button></form> : <><div className="user-card-head"><div className="person"><i>{person.name.replace("คุณ","").slice(0,2)}</i><div><b>{person.name}</b><small>{person.department} · {person.email}</small></div></div><div><span className={`badge ${person.role === "admin" ? "purple" : person.role === "approver" ? "green" : person.role === "technician" ? "orange" : "blue"}`}>{person.loginId}</span><button className="edit-user" onClick={() => setEditingId(person.id)}>แก้ไข</button><button className="delete-user" onClick={() => remove(person)}>ลบ</button></div></div><div className="identity-row"><span>ประเภท <b>{person.role === "admin" ? "ADMIN" : person.role === "approver" ? "ผู้อนุมัติ" : person.role === "technician" ? "ช่าง" : "User"}</b></span><span>Approval ID <b>{person.approvalCode || "—"}</b></span></div>{person.role === "user" ? <div className="multi-approver compact"><b>ผู้อนุมัติใบแจ้งซ่อมขั้นแรก</b>{approvers.map(approver => <label key={approver.id} className={(person.approverIds || []).includes(approver.id) ? "chosen" : ""}><input type="checkbox" checked={(person.approverIds || []).includes(approver.id)} onChange={() => toggleApprover(person.id, approver.id)}/><span>✓</span>{approver.name}<small>{approver.approvalCode}</small></label>)}</div> : <div className="permission-grid">{permissionOptions.filter(option => person.role === "admin" ? !workTypePermissions.includes(option.key) : person.role === "technician" ? ["execute_work","inspect_close"].includes(option.key) : ["approve_request","approve_estimate",...workTypePermissions].includes(option.key)).map(option => <label className={person.permissions?.includes(option.key) ? "enabled" : ""} key={option.key}><input type="checkbox" checked={!!person.permissions?.includes(option.key)} disabled={person.id === 1 || person.role === "technician"} onChange={() => togglePermission(person.id, option.key)}/><span>✓</span>{option.label}</label>)}</div>}</>}</article>)}</div></section>;
}

function PeopleV3({state,currentPerson,setState,flash}:{state:AppState;currentPerson:Person;setState:(s:AppState)=>void;flash:(s:string)=>void}) {
  const [open, setOpen] = useState(false); const [newRole, setNewRole] = useState<Role>("user"); const [newPermissions, setNewPermissions] = useState<Permission[]>([]);
  const canManage = currentPerson.permissions?.includes("manage_users"); const approvers = state.people.filter(person => person.role === "admin" && person.active);
  if (!canManage) return <section className="panel full locked-approval"><div className="lock-symbol">🔒</div><span className="eyebrow">ADMIN PERMISSION REQUIRED</span><h2>ไม่มีสิทธิ์จัดการผู้ใช้งาน</h2><p>บัญชี {currentPerson.loginId} ต้องได้รับสิทธิ์ “เพิ่ม ลบ และกำหนดสิทธิ์ผู้ใช้” ก่อน</p></section>;
  const save = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const f = new FormData(event.currentTarget); const loginId = String(f.get("loginId")).trim().toLowerCase(); if (state.people.some(p => p.loginId?.toLowerCase() === loginId)) { flash("User ID นี้ถูกใช้งานแล้ว"); return; } const person: Person = { id: Date.now(), name: String(f.get("name")), email: String(f.get("email")), department: String(f.get("department")), role: newRole, active: true, loginId, password: String(f.get("password")), approvalCode: newRole === "admin" ? String(f.get("approvalCode")) || `APR-${Date.now().toString().slice(-5)}` : undefined, approverId: newRole === "user" ? Number(f.get("approverId")) || undefined : undefined, permissions: newRole === "admin" ? newPermissions : [] }; setState({ ...state, people: [...state.people, person] }); setOpen(false); setNewPermissions([]); flash(`สร้างบัญชี ${loginId} แล้ว`); };
  const togglePermission = (personId: number, permission: Permission) => { setState({ ...state, people: state.people.map(person => person.id === personId ? { ...person, permissions: person.permissions?.includes(permission) ? person.permissions.filter(item => item !== permission) : [...(person.permissions || []), permission] } : person) }); };
  const assign = (personId: number, approverId: number) => { setState({ ...state, people: state.people.map(person => person.id === personId ? { ...person, approverId: approverId || undefined } : person), tickets: state.tickets.map(ticket => ticket.requesterId === personId && ticket.status.includes("อนุมัติ") ? { ...ticket, initialApproverId: approverId || undefined, estimateApproverId: approverId || undefined, currentApproverId: approverId || undefined } : ticket) }); flash("อัปเดตผู้อนุมัติแล้ว"); };
  const remove = (person: Person) => { if (person.id === 1 || person.id === currentPerson.id) { flash("ไม่สามารถลบบัญชีหลักหรือบัญชีที่กำลังใช้งาน"); return; } if (!window.confirm(`ยืนยันลบบัญชี ${person.loginId} — ${person.name}?`)) return; setState({ ...state, people: state.people.filter(item => item.id !== person.id).map(item => item.approverId === person.id ? { ...item, approverId: undefined } : item), tickets: state.tickets.map(ticket => ticket.currentApproverId === person.id ? { ...ticket, currentApproverId: undefined } : ticket) }); flash(`ลบบัญชี ${person.loginId} แล้ว`); };
  return <section className="panel full"><div className="panel-head"><div><span className="eyebrow">USER ID & PERMISSION CONTROL</span><h3>บัญชีผู้ใช้และสิทธิ์อนุมัติรายขั้นตอน</h3></div><button className="primary" onClick={() => setOpen(!open)}>＋ เพิ่มบัญชีใหม่</button></div>{open && <form className="user-create-form" onSubmit={save}><div className="user-fields"><input name="loginId" required placeholder="User ID"/><input name="password" type="password" required minLength={6} placeholder="รหัสผ่านอย่างน้อย 6 ตัว"/><input name="name" required placeholder="ชื่อ–นามสกุล"/><input name="email" type="email" required placeholder="อีเมล"/><input name="department" required placeholder="หน่วยงาน"/><select value={newRole} onChange={e => setNewRole(e.target.value as Role)}><option value="user">User</option><option value="admin">Admin / ผู้อนุมัติ</option></select>{newRole === "admin" ? <input name="approvalCode" placeholder="Approval ID เช่น APR-ENG-001"/> : <select name="approverId" required><option value="">กำหนดผู้อนุมัติ</option>{approvers.map(a => <option key={a.id} value={a.id}>{a.name} ({a.loginId})</option>)}</select>}</div>{newRole === "admin" && <div className="permission-picker"><b>เลือกขั้นตอนที่ ID นี้อนุมัติ/ดำเนินการได้</b>{permissionOptions.map(option => <label key={option.key}><input type="checkbox" checked={newPermissions.includes(option.key)} onChange={() => setNewPermissions(current => current.includes(option.key) ? current.filter(item => item !== option.key) : [...current, option.key])}/>{option.label}</label>)}</div>}<div className="form-actions"><button type="button" onClick={() => setOpen(false)}>ยกเลิก</button><button className="primary" type="submit">สร้างบัญชี</button></div></form>}<div className="user-cards">{state.people.map(person => <article className="user-card" key={person.id}><div className="user-card-head"><div className="person"><i>{person.name.replace("คุณ","").slice(0,2)}</i><div><b>{person.name}</b><small>{person.department} · {person.email}</small></div></div><div><span className={`badge ${person.role === "admin" ? "purple" : "blue"}`}>{person.role.toUpperCase()}</span><button className="delete-user" onClick={() => remove(person)} disabled={person.id === 1 || person.id === currentPerson.id}>ลบ</button></div></div><div className="identity-row"><span>User ID <b>{person.loginId}</b></span><span>Approval ID <b>{person.approvalCode || "—"}</b></span>{person.role === "user" && <label>ผู้อนุมัติ<select value={person.approverId || ""} onChange={e => assign(person.id, Number(e.target.value))}><option value="">ยังไม่กำหนด</option>{approvers.map(a => <option key={a.id} value={a.id}>{a.name} — {a.loginId}</option>)}</select></label>}</div>{person.role === "admin" && <div className="permission-grid">{permissionOptions.map(option => <label className={person.permissions?.includes(option.key) ? "enabled" : ""} key={option.key}><input type="checkbox" checked={!!person.permissions?.includes(option.key)} disabled={person.id === 1} onChange={() => togglePermission(person.id, option.key)}/><span>✓</span>{option.label}</label>)}</div>}</article>)}</div></section>;
}

function PeopleV2({state,setState,flash}:{state:AppState;setState:(s:AppState)=>void;flash:(s:string)=>void}) {
  const [open, setOpen] = useState(false);
  const approvers = state.people.filter(person => person.role === "admin" && person.approvalCode);
  const savePerson = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget); const role = String(f.get("role")) as Role;
    const person: Person = { id: Date.now(), name: String(f.get("name")), email: String(f.get("email")), department: String(f.get("department")), role, active: true, approverId: role === "user" ? Number(f.get("approverId")) : undefined, approvalCode: role === "admin" ? String(f.get("approvalCode")) : undefined };
    setState({ ...state, people: [...state.people, person] }); setOpen(false); flash("เพิ่มผู้ใช้งานและกำหนดสายอนุมัติแล้ว");
  };
  const assign = (personId: number, approverId: number) => { setState({ ...state, people: state.people.map(p => p.id === personId ? { ...p, approverId } : p), tickets: state.tickets.map(t => t.requesterId === personId && t.status.includes("อนุมัติ") ? { ...t, initialApproverId: approverId, estimateApproverId: approverId, currentApproverId: approverId } : t) }); flash("อัปเดตผู้อนุมัติและใบงานที่รออนุมัติแล้ว"); };
  return <section className="panel full"><div className="panel-head"><div><span className="eyebrow">IDENTITY & APPROVAL MATRIX</span><h3>ผู้ใช้งานและสายอนุมัติรายบุคคล</h3></div><button className="primary" onClick={() => setOpen(!open)}>＋ เพิ่ม Admin / User</button></div>{open && <form className="inline-form approval-form" onSubmit={savePerson}><input name="name" required placeholder="ชื่อ–นามสกุล"/><input name="email" type="email" required placeholder="อีเมล"/><input name="department" required placeholder="หน่วยงาน"/><select name="role"><option value="user">User</option><option value="admin">Admin / ผู้อนุมัติ</option></select><input name="approvalCode" placeholder="รหัสอนุมัติ เช่น APR-FIN-002"/><select name="approverId"><option value="">เลือกผู้อนุมัติ</option>{approvers.map(a => <option key={a.id} value={a.id}>{a.name} ({a.approvalCode})</option>)}</select><button className="primary">บันทึก</button></form>}<table><thead><tr><th>ชื่อ–นามสกุล</th><th>อีเมล</th><th>สิทธิ์ / ID</th><th>ผู้อนุมัติที่กำหนด</th><th>สถานะ</th></tr></thead><tbody>{state.people.map(person => { const assigned = state.people.find(p => p.id === person.approverId); return <tr key={person.id}><td><div className="person"><i>{person.name.replace("คุณ","").slice(0,2)}</i><div><b>{person.name}</b><small>{person.department}</small></div></div></td><td>{person.email}</td><td><span className={`badge ${person.role === "admin" ? "purple" : "blue"}`}>{person.approvalCode || "USER"}</span></td><td>{person.role === "user" ? <select className="table-select" value={person.approverId || ""} onChange={e => assign(person.id, Number(e.target.value))}><option value="">ยังไม่กำหนด</option>{approvers.map(a => <option key={a.id} value={a.id}>{a.name} — {a.approvalCode}</option>)}</select> : <span className="approver-label">ผู้มีสิทธิ์อนุมัติ</span>}</td><td><span className="online">● ใช้งาน</span></td></tr>})}</tbody></table></section>;
}
function People({state,setState,flash}:{state:AppState;setState:(s:AppState)=>void;flash:(s:string)=>void}) { const [open,setOpen]=useState(false);const submit=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);setState({...state,people:[...state.people,{id:Date.now(),name:String(f.get("name")),email:String(f.get("email")),department:String(f.get("department")),role:String(f.get("role")) as Role,active:true}]});setOpen(false);flash("เพิ่มผู้ใช้งานเรียบร้อยแล้ว")};return <section className="panel full"><div className="panel-head"><div><span className="eyebrow">ACCESS MANAGEMENT</span><h3>รายชื่อ Admin และ User</h3></div><button className="primary" onClick={()=>setOpen(!open)}>＋ เพิ่มผู้ใช้งาน</button></div>{open&&<form className="inline-form" onSubmit={submit}><input name="name" required placeholder="ชื่อ–นามสกุล"/><input name="email" type="email" required placeholder="อีเมล"/><input name="department" required placeholder="หน่วยงาน"/><select name="role"><option value="user">User</option><option value="admin">Admin</option></select><button className="primary">บันทึก</button></form>}<table><thead><tr><th>ชื่อ–นามสกุล</th><th>อีเมล</th><th>หน่วยงาน</th><th>สิทธิ์</th><th>สถานะ</th></tr></thead><tbody>{state.people.map(p=><tr key={p.id}><td><div className="person"><i>{p.name.replace("คุณ","").slice(0,2)}</i><b>{p.name}</b></div></td><td>{p.email}</td><td>{p.department}</td><td><span className={`badge ${p.role==="admin"?"purple":"blue"}`}>{p.role.toUpperCase()}</span></td><td><span className="online">● ใช้งาน</span></td></tr>)}</tbody></table></section>; }
function Emails({mails}:{mails:Mail[]}) { return <section className="panel full"><div className="panel-head"><div><span className="eyebrow">EMAIL AUDIT TRAIL</span><h3>ประวัติการส่ง E-mail อัตโนมัติ</h3></div><button>ส่งออก Log</button></div><div className="mail-list">{mails.map(m=><div key={m.id}><i>✉</i><div><b>{m.subject}</b><small>ถึง: {m.to}</small></div><span>{m.time}</span><em className={m.status==="ส่งแล้ว"?"sent":"read"}>● {m.status}</em></div>)}</div></section>; }
function Survey({ticket,scores,setScores,readOnly,close,submit}:{ticket:Ticket;scores:number[];setScores:(n:number[])=>void;readOnly:boolean;close:()=>void;submit:(comment:string)=>void}) {
  const [comment,setComment] = useState(ticket.surveyComment || "");
  let offset = 0;
  return <div className="modal"><div className="survey"><button className="modal-close" onClick={close}>×</button><span className="eyebrow">FM-ADS-111Rev.2 · TEAM GROUP</span><h2>แบบสำรวจความพึงพอใจงานซ่อมบำรุงรักษา</h2><div className="survey-meta"><span><small>หน่วยงาน</small><b>{ticket.department}</b></span><span><small>วันที่</small><b>{ticket.surveySubmittedAt ? new Date(ticket.surveySubmittedAt).toLocaleDateString("th-TH") : ticket.reportedDate || ticket.createdAt}</b></span><span><small>เลขที่ใบแจ้งซ่อม</small><b>{ticket.id}</b></span><span><small>ผู้ให้ความเห็น</small><b>{ticket.requester}</b></span></div><div className="scale"><span>4 = พอใจมาก</span><span>3 = พอใจ</span><span>2 = ควรปรับปรุง</span><span>1 = ควรแก้ไข</span></div>{surveyGroups.map(group => { const start=offset; offset+=group.questions.length; return <div className="survey-group" key={group.title}><h3>{group.title}</h3>{group.questions.map((question,index)=>{const questionIndex=start+index;return <div className="question" key={question}><label><b>{questionIndex+1}</b>{question}</label><div>{[4,3,2,1].map(score=><button type="button" disabled={readOnly} className={scores[questionIndex]===score?"active":""} key={score} onClick={()=>{const copy=[...scores];copy[questionIndex]=score;setScores(copy)}}>{score}</button>)}</div></div>})}</div>})}<label className="survey-comment">ข้อเสนอแนะอื่น ๆ<textarea rows={3} readOnly={readOnly} value={comment} onChange={event=>setComment(event.target.value)}/></label>{readOnly ? <div className="survey-readonly-actions"><b>คะแนนเฉลี่ย {ticket.rating?.toFixed(2) || "—"} / 4.00</b><button className="primary" onClick={close}>ปิด</button></div> : <button className="login-submit" onClick={()=>submit(comment)}>ส่งแบบประเมิน →</button>}</div></div>;
}
