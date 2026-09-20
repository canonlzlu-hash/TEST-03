import { z } from "zod";

export const deviceSchema = z.object({
  id: z.string().min(1).max(80), kind: z.enum(["fan", "door", "power", "sensor"]),
  subtype: z.enum(["standard","vfd","gfan","dp","vent","rev","lock","cargo","emg","gen","th","co2"]).default("standard"),
  name: z.string().trim().min(1).max(40), x: z.number().min(8).max(92), y: z.number().min(10).max(88),
  enabled: z.boolean(), capacity: z.number().min(100).max(100000),
  width: z.number().min(0.5).max(10), height: z.number().min(1).max(10),
  open: z.boolean(), coefficient: z.number().min(0.001).max(0.6),
  source: z.enum(["mains", "backup"]),
});
export const configSchema = z.object({
  version: z.literal(2),
  length: z.number().min(10).max(200), width: z.number().min(10).max(150),
  volume: z.number().min(1000).max(200000),
  target: z.number().min(100).max(600), band: z.number().min(5).max(50),
  baseLeak: z.number().min(100).max(50000),
  addDelay: z.number().int().min(1).max(60), stopDelay: z.number().int().min(1).max(60),
  minHz: z.number().min(10).max(35), maxHz: z.number().min(40).max(60),
  ramp: z.number().min(0.5).max(10),
  devices: z.array(deviceSchema).max(40),
}).superRefine((c, ctx) => {
  if (new Set(c.devices.map(d => d.id)).size !== c.devices.length) ctx.addIssue({ code: "custom", message: "设备编号不能重复" });
});
export type Config = z.infer<typeof configSchema>;
export type Device = z.infer<typeof deviceSchema>;
export type Kind = Device["kind"];
export const kindNames: Record<Kind, string> = { fan: "风机", door: "旋转门", power: "供电系统", sensor: "压差传感器" };
export function newDevice(kind: Kind, index: number, id: string, x?: number, y?: number): Device {
  return { id, kind, subtype: "standard", name: kindNames[kind] + " " + index, x: x ?? 16 + ((index - 1) % 5) * 17,
    y: y ?? (kind === "fan" ? 78 : kind === "door" ? 48 : 19), enabled: true,
    capacity: 8000, width: 2, height: 2.4, open: false, coefficient: 0.035, source: "mains" };
}
export const catalog = {
 vfd: {name:"变频风机",kind:"fan",hint:"调频 · 顺序联动"},
 gfan: {name:"工频风机",kind:"fan",hint:"固定 50 Hz · 启停"},
 dp: {name:"差压变送器",kind:"sensor",hint:"压力反馈"},
 vent: {name:"排风阀",kind:"door",hint:"开闭 · 排气"},
 rev: {name:"旋转门",kind:"door",hint:"开闭 · 漏气"},
 lock: {name:"气锁门",kind:"door",hint:"等效通道 · 漏气"},
 cargo: {name:"物流门",kind:"door",hint:"大通道 · 漏气"},
 emg: {name:"应急门",kind:"door",hint:"开闭 · 漏气"},
 gen: {name:"发电机组",kind:"power",hint:"备用供电"},
 th: {name:"温湿度传感器",kind:"sensor",hint:"布置预留"},
 co2: {name:"CO₂传感器",kind:"sensor",hint:"布置预留"},
 mains: {name:"供电系统",kind:"power",hint:"市电 / 备用"},
} as const;
export type CatalogKind = keyof typeof catalog;
export const isPressure = (d: Device) => d.kind === "sensor" && d.subtype !== "th" && d.subtype !== "co2";
export function newCatalogDevice(type: CatalogKind,index:number,id:string,x?:number,y?:number):Device {
 const d = newDevice(catalog[type].kind,index,id,x,y);
 return {...d, name:catalog[type].name+" "+index, subtype:type==="mains"?"standard":type,
 source:type==="gen"?"backup":"mains",
 width:type==="cargo"?4:type==="emg"?1.2:type==="vent"?.8:2,
 height:type==="cargo"?4:type==="vent"?1:2.4,
 coefficient:type==="cargo"||type==="emg"?.35:type==="vent"?.6:type==="lock"?.05:.035};
}

export const defaultConfig: Config = {
  version: 2, length: 60, width: 30, volume: 18000, target: 280, band: 12, baseLeak: 6000,
  addDelay: 8, stopDelay: 8, minHz: 20, maxHz: 50, ramp: 2,
  devices: [
    newDevice("fan", 1, "fan-1", 23, 78), newDevice("fan", 2, "fan-2", 44, 78), newDevice("fan", 3, "fan-3", 65, 78),
    newDevice("door", 1, "door-1", 78, 48), newDevice("power", 1, "power-1", 21, 19),
    { ...newDevice("power", 2, "power-2", 42, 19), source: "backup" }, newDevice("sensor", 1, "sensor-1", 32, 46),
  ],
};
export type Faults = { mainsOff: boolean; sensorFailed: boolean; fanId: string | null };
export const noFaults: Faults = { mainsOff: false, sensorFailed: false, fanId: null };
export type Log = { time: number; text: string; tone: "info" | "warn" };
export type Sim = { time: number; pressure: number; hz: Record<string, number>; low: number; high: number; supply: number; leak: number; reason: string; sourceId: string | null; events: Log[]; trend: number[] };
export function initialSim(c: Config): Sim {
  return { time: 0, pressure: c.target, hz: {}, low: 0, high: 0, supply: 0, leak: 0, reason: "点击开始模拟，按顺序投入首台可用风机。", sourceId: null, events: [], trend: [c.target] };
}
export function doorLeak(d: Device, pressure: number) {
  // Illustrative effective-opening model. Not a calibrated rotary-door product curve.
  if (!d.enabled || d.kind !== "door") return 0;
  return d.width * d.height * (d.open ? d.coefficient : d.subtype === "vent" ? 0 : 0.001) * Math.sqrt(2 * Math.max(pressure, 0) / 1.2) * 3600;
}
export function sourceFor(c: Config, f: Faults) {
  return c.devices.find(d => d.kind === "power" && d.enabled && d.source === "mains" && !f.mainsOff)
    ?? c.devices.find(d => d.kind === "power" && d.enabled && d.source === "backup");
}
export function tick(c: Config, prev: Sim, f: Faults): Sim {
  const s: Sim = { ...prev, time: prev.time + 1, hz: { ...prev.hz }, events: [...prev.events] };
  const emit = (text: string, tone: Log["tone"] = "info") => { s.events.unshift({ time: s.time, text, tone }); };
  const fans = c.devices.filter(d => d.kind === "fan");
  const minFor = (d: Device) => d.subtype === "gfan" ? 50 : c.minHz;
  const maxFor = (d: Device) => d.subtype === "gfan" ? 50 : c.maxHz;
  const usable = fans.filter(d => d.enabled && d.id !== f.fanId);
  const source = sourceFor(c, f);
  const sensorOk = !f.sensorFailed && c.devices.some(d => isPressure(d) && d.enabled);
  for (const id of Object.keys(s.hz)) {
    if (!usable.some(d => d.id === id) || !source) {
      if (s.hz[id] > 0) emit((fans.find(d => d.id === id)?.name ?? "已移除风机") + "退出：设备不可用或供电中断", "warn");
      delete s.hz[id];
    } else if (s.hz[id] > 0) s.hz[id] = Math.min(maxFor(usable.find(d => d.id === id)!), Math.max(minFor(usable.find(d => d.id === id)!), s.hz[id]));
  }
  if ((source?.id ?? null) !== prev.sourceId) {
    emit(source ? "供电来源：" + source.name + (source.source === "backup" ? "（备用电源）" : "（市电）") : "无可用电源，风机停止", source ? "info" : "warn");
  }
  s.sourceId = source?.id ?? null;
  const active = usable.filter(d => (s.hz[d.id] ?? 0) > 0);
  if (!source) {
    s.reason = "无可用电源；等待恢复供电。"; s.low = 0; s.high = 0;
  } else if (!usable.length) {
    s.reason = "无可用风机；供风能力为零。"; s.low = 0; s.high = 0;
  } else if (!sensorOk) {
    s.reason = "压差数据失效：暂停自动增减机，保持当前可用风机频率；下方压力为模拟真值。"; s.low = 0; s.high = 0;
    if (prev.reason !== s.reason) emit(s.reason, "warn");
  } else if (!active.length) {
    s.hz[usable[0].id] = minFor(usable[0]); s.low = 0; s.high = 0;
    s.reason = "投入首台可用设备：" + usable[0].name; emit(s.reason);
  } else {
    const last = active[active.length - 1];
    const next = usable.find(d => !s.hz[d.id]);
    if (s.pressure < c.target - c.band) {
      s.high = 0;
      const adjustable = [...active].reverse().find(d => s.hz[d.id] < maxFor(d));
      if (adjustable) {
        s.hz[adjustable.id] = Math.min(c.maxHz, s.hz[adjustable.id] + c.ramp);
        s.low = 0; s.reason = adjustable.name + "升频：压力低于投入线 " + (c.target - c.band) + " Pa。";
      } else {
        s.low += 1;
        s.reason = next ? "在运风机已满频；低压持续 " + s.low + "/" + c.addDelay + " 秒，下一台为" + next.name : "全部可用风机已满频，供风仍不足。";
        if (next && s.low >= c.addDelay) {
          s.hz[next.id] = minFor(next); s.low = 0; s.reason = "逐台投入：" + next.name + "以 " + minFor(next) + " Hz 启动。"; emit(s.reason);
        } else if (!next && prev.reason !== s.reason) emit(s.reason, "warn");
      }
    } else if (s.pressure > c.target + c.band) {
      s.low = 0;
      if (s.hz[last.id] > minFor(last)) {
        s.hz[last.id] = Math.max(c.minHz, s.hz[last.id] - c.ramp); s.high = 0;
        s.reason = last.name + "降频：压力高于退出线 " + (c.target + c.band) + " Pa。";
      } else if (active.length > 1) {
        const remaining = active.slice(0, -1);
        const required = c.baseLeak * Math.sqrt(c.target / 280) + c.devices.reduce((n, d) => n + doorLeak(d, c.target), 0);
        if (remaining.reduce((n, d) => n + d.capacity, 0) < required) {
          s.high = 0;
          const trim = [...remaining].reverse().find(d => s.hz[d.id] > minFor(d));
          if (trim) s.hz[trim.id] = Math.max(c.minHz, s.hz[trim.id] - c.ramp);
          s.reason = "退机后剩余容量不足：保留末台，调低其他运行风机，避免反复启停。";
        } else {
          s.high += 1; s.reason = last.name + "已到最低频率；退出计时 " + s.high + "/" + c.stopDelay + " 秒。";
          if (s.high >= c.stopDelay) { s.hz[last.id] = 0; s.high = 0; s.reason = "逐台退出：" + last.name + "停止，其余风机继续保压。"; emit(s.reason); }
        }
      } else { s.high = 0; s.reason = "首台风机最低频率保压；如持续超压，需调整基准漏气或风机容量。"; }
    } else {
      s.low = 0; s.high = 0; s.reason = "压力位于目标带内，保持当前机组组合。";
    }
  }
  s.supply = fans.reduce((n, d) => n + d.capacity * (s.hz[d.id] ?? 0) / maxFor(d), 0);
  s.leak = c.baseLeak * Math.sqrt(Math.max(s.pressure, 0) / 280) + c.devices.reduce((n, d) => n + doorLeak(d, s.pressure), 0);
  // Simplified pressure response, used only to verify control sequence.
  s.pressure = Math.max(0, Math.min(1500, s.pressure + ((s.supply - s.leak) / 3600) * 101325 / c.volume));
  s.trend = [...prev.trend, s.pressure].slice(-150);
  s.events = s.events.slice(0, 100);
  return s;
}
