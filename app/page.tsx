"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Activity, ArrowDown, ArrowUp, Check, ChevronRight, CircleHelp, Download, DoorOpen, Fan, Gauge, Grip, Layers3, LayoutDashboard, Moon, MousePointer2, Pause, Play, Plus, RotateCcw, Save, SlidersHorizontal, Sun, Trash2, Wind, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import "./workbench-a.css";
import "./floating-layout-a.css";
import { FloatingWindow, type WindowFrame } from "@/components/floating-window-a";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { configSchema, defaultConfig, doorLeak, initialSim, kindNames, newDevice, noFaults, sourceFor, tick, type Config, type Device, type Faults, type Kind, catalog, newCatalogDevice, type CatalogKind, isPressure } from "@/lib/control-model";

const icons = { fan: Fan, door: DoorOpen, power: Zap, sensor: Gauge };
const kinds = Object.keys(catalog) as CatalogKind[];
const timeLabel = (n: number) => String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
const windowTitles = { layout: "气膜设备布局", library: "设备库", properties: "设备属性", group: "机组联动", scenario: "工况试验", events: "联动过程", workspaces: "工作区" } as const;
type WindowId = keyof typeof windowTitles;
type ThemeMode = "light" | "dark";
type SavedWorkspace = { id: string; name: string; savedAt: string; openWindows: WindowId[]; windowOrder: WindowId[]; frames: Record<WindowId, WindowFrame>; selected: string | null; config: Config; faults: Faults; speed: number; theme: ThemeMode };
const defaultFrames: Record<WindowId, WindowFrame> = {
  layout: { x: 320, y: 160, w: 820, h: 650, maximized: false },
  library: { x: 16, y: 160, w: 300, h: 560, maximized: false },
  properties: { x: 330, y: 180, w: 340, h: 560, maximized: false },
  group: { x: 1148, y: 160, w: 360, h: 610, maximized: false },
  scenario: { x: 770, y: 200, w: 370, h: 540, maximized: false },
  events: { x: 330, y: 280, w: 480, h: 340, maximized: false },
  workspaces: { x: 450, y: 190, w: 430, h: 500, maximized: false },
};
const workspaceStorageKey = "yifan-control-workspaces-a-v1";
const themeStorageKey = "yifan-control-theme-a";
const makeWorkspaceId = () => "workspace-" + Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, "0")).join("");

export default function Home() {
  const [openWindows, setOpenWindows] = useState<WindowId[]>(["layout", "library", "group"]);
  const [windowOrder, setWindowOrder] = useState<WindowId[]>(Object.keys(windowTitles) as WindowId[]);
  const [frames, setFrames] = useState<Record<WindowId, WindowFrame>>(defaultFrames);
  const [workspaceName, setWorkspaceName] = useState("");
  const [savedWorkspaces, setSavedWorkspaces] = useState<SavedWorkspace[]>([]);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [workspaceStorageReady, setWorkspaceStorageReady] = useState(false);
  function openWindow(id: WindowId) { setOpenWindows(v => v.includes(id) ? v : [...v, id]); setWindowOrder(v => [...v.filter(k => k !== id), id]); }
  function toggleWindow(id: WindowId) { setOpenWindows(v => v.includes(id) ? v.filter(k => k !== id) : [...v, id]); setWindowOrder(v => [...v.filter(k => k !== id), id]); }
  function windowProps(id: WindowId) { return { title: windowTitles[id], id, open: openWindows.includes(id), layer: 10 + windowOrder.indexOf(id), frame: frames[id], onFrameChange: (frame: WindowFrame) => setFrames(v => ({ ...v, [id]: frame })), onClose: () => setOpenWindows(v => v.filter(k => k !== id)), onFocus: () => setWindowOrder(v => v[v.length-1] === id ? v : [...v.filter(k => k !== id), id]) }; }
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [sim, setSim] = useState(() => initialSim(defaultConfig));
  const [faults, setFaults] = useState<Faults>(noFaults);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selected, setSelected] = useState<string | null>("fan-1");
    const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [storage, setStorage] = useState<"loading" | "ready" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [savedConfig, setSavedConfig] = useState("");
  const revision = useRef(0);
  const configRef = useRef(config);
  const faultsRef = useRef(faults);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ id: string; startX: number; startY: number; x: number; y: number } | null>(null);
  const current = config.devices.find(d => d.id === selected);
  const fans = config.devices.filter(d => d.kind === "fan");
  const doors = config.devices.filter(d => d.kind === "door");
  const activeFans = fans.filter(d => (sim.hz[d.id] ?? 0) > 0);
  const source = sourceFor(config, faults);
  const sensorOk = !faults.sensorFailed && config.devices.some(d => isPressure(d) && d.enabled);
  const dirty = JSON.stringify(config) !== savedConfig;
  configRef.current = config;
  faultsRef.current = faults;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config").then(async r => { if (!r.ok) throw new Error(); return await r.json() as { config: unknown; revision: number }; }).then(data => {
      if (cancelled) return;
      const parsed = configSchema.safeParse(data.config);
      const loaded = parsed.success ? parsed.data : defaultConfig;
      setConfig(loaded); setSim(initialSim(loaded)); setSavedConfig(JSON.stringify(loaded));
      setSelected(loaded.devices[0]?.id ?? null); revision.current = data.revision ?? 0; setStorage("ready");
    }).catch(() => { if (!cancelled) { setStorage("error"); setMessage("未能读取已保存方案。可继续试用，重新加载后再保存；也可先导出当前配置。"); } });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setSim(s => tick(configRef.current, s, faultsRef.current)), 1000 / speed);
    return () => window.clearInterval(timer);
  }, [running, speed]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty && storage === "ready") e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, storage]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(workspaceStorageKey) ?? "[]") as unknown;
      if (Array.isArray(saved)) setSavedWorkspaces(saved.filter(item => item && typeof item === "object" && typeof (item as SavedWorkspace).name === "string").slice(0, 15) as SavedWorkspace[]);
      const storedTheme = localStorage.getItem(themeStorageKey);
      if (storedTheme === "dark" || storedTheme === "light") setTheme(storedTheme);
    } catch { setMessage("已忽略无法读取的本机工作区记录。"); }
    setWorkspaceStorageReady(true);
  }, []);
  useEffect(() => { if (workspaceStorageReady) localStorage.setItem(themeStorageKey, theme); }, [theme, workspaceStorageReady]);

  const patchConfig = (patch: Partial<Config>) => setConfig(c => ({ ...c, ...patch }));
  const editDevice = (id: string, patch: Partial<Device>) => setConfig(c => ({ ...c, devices: c.devices.map(d => d.id === id ? { ...d, ...patch } : d) }));
  function addDevice(kind: CatalogKind, x?: number, y?: number) {
    if (configRef.current.devices.length >= 40) { setMessage("当前工作台最多支持40个设备。"); return; }
    const id = "device-" + Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, "0")).join("");
    setConfig(c => {
      const existing = c.devices.filter(d => d.subtype === kind || (kind === "mains" && d.kind === "power"));
      let n = existing.length + 1;
      while (c.devices.some(d => d.name === catalog[kind].name + " " + n)) n++;
      const item = newCatalogDevice(kind, n, id, x, y);
      if (x === undefined && y === undefined) {
        const rows = [item.y, 78, 19, 48, 65, 32];
        const slots = rows.flatMap(py => [17, 39, 61, 83].map(px => ({ x: px, y: py })));
        const free = slots.find(p => c.devices.every(d => Math.abs(d.x - p.x) > 15 || Math.abs(d.y - p.y) > 16));
        if (free) { item.x = free.x; item.y = free.y; }
      }
      return { ...c, devices: [...c.devices, item] };
    });
    setSelected(id);
    openWindow("properties");
  }
  function removeDevice(id: string) {
    setConfig(c => ({ ...c, devices: c.devices.filter(d => d.id !== id) }));
    setSelected(null);
    setSim(s => { const hz = { ...s.hz }; delete hz[id]; return { ...s, hz, low: 0, high: 0 }; });
    setPendingDelete(null);
  }
  function reorder(id: string, delta: number) {
    setConfig(c => {
      const list = [...c.devices]; const indices = list.map((d, i) => d.kind === "fan" ? i : -1).filter(i => i >= 0);
      const rank = indices.findIndex(i => list[i].id === id); const other = indices[rank + delta];
      if (rank < 0 || other === undefined) return c;
      const here = indices[rank]; [list[here], list[other]] = [list[other], list[here]];
      return { ...c, devices: list };
    });
  }
  function dragStart(e: PointerEvent<HTMLButtonElement>, d: Device) {
    if (e.button !== 0) return;
    setSelected(d.id);
    dragging.current = { id: d.id, startX: e.clientX, startY: e.clientY, x: d.x, y: d.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function dragMove(e: PointerEvent<HTMLButtonElement>) {
    const drag = dragging.current; const rect = boardRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;
    editDevice(drag.id, { x: Math.max(8, Math.min(92, drag.x + (e.clientX - drag.startX) / rect.width * 100)), y: Math.max(10, Math.min(88, drag.y + (e.clientY - drag.startY) / rect.height * 100)) });
  }
  async function save() {
    const result = configSchema.safeParse(config);
    if (!result.success) { setMessage("请检查设备名称和参数范围后再保存。"); return; }
    setSaving(true); const snapshot = JSON.stringify(result.data);
    try {
      const r = await fetch("/api/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: result.data, revision: revision.current }) });
      const data = await r.json() as { error?: string; revision: number };
      if (!r.ok) throw new Error(data.error ?? "保存失败，请重试");
      revision.current = data.revision; setSavedConfig(snapshot); setMessage("方案已保存，设备位置、参数和机组规则已一并记录。");
    } catch (e) { setMessage(e instanceof Error ? e.message : "保存失败，当前编辑仍然保留。"); }
    setSaving(false);
  }
  function exportConfig() {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "yifan-pressure-workbench.json"; a.click(); URL.revokeObjectURL(url);
  }
  function saveCurrentWorkspace() {
    const name = workspaceName.trim();
    if (!name) { setMessage("请先给当前工作区起一个名称。"); return; }
    const existing = savedWorkspaces.find(item => item.name === name);
    if (!existing && savedWorkspaces.length >= 15) { setMessage("最多保存15个工作区，请先删除一个旧工作区。"); return; }
    const snapshot: SavedWorkspace = { id: existing?.id ?? makeWorkspaceId(), name, savedAt: new Date().toISOString(), openWindows: [...openWindows], windowOrder: [...windowOrder], frames: JSON.parse(JSON.stringify(frames)) as Record<WindowId, WindowFrame>, selected, config: JSON.parse(JSON.stringify(config)) as Config, faults: { ...faults }, speed, theme };
    const next = existing ? savedWorkspaces.map(item => item.id === existing.id ? snapshot : item) : [snapshot, ...savedWorkspaces];
    setSavedWorkspaces(next); localStorage.setItem(workspaceStorageKey, JSON.stringify(next));
    setWorkspaceName(""); setMessage(existing ? `工作区“${name}”已更新。` : `工作区“${name}”已保存。`);
  }
  function loadWorkspace(item: SavedWorkspace) {
    const parsed = configSchema.safeParse(item.config);
    if (!parsed.success) { setMessage(`工作区“${item.name}”的设备配置已失效，无法加载。`); return; }
    const ids = Object.keys(windowTitles) as WindowId[];
    setRunning(false); setConfig(parsed.data); setSim(initialSim(parsed.data)); setFaults({ ...noFaults, ...item.faults }); setSpeed([1,5,10].includes(item.speed) ? item.speed : 1);
    setSelected(parsed.data.devices.some(d => d.id === item.selected) ? item.selected : parsed.data.devices[0]?.id ?? null);
    setOpenWindows(item.openWindows.filter(id => ids.includes(id))); setWindowOrder([...ids.filter(id => !item.windowOrder.includes(id)), ...item.windowOrder.filter(id => ids.includes(id))]);
    setFrames(ids.reduce((all, id) => ({ ...all, [id]: item.frames?.[id] ?? defaultFrames[id] }), {} as Record<WindowId, WindowFrame>)); setTheme(item.theme === "dark" ? "dark" : "light");
    setMessage(`已加载工作区“${item.name}”。`);
  }
  function deleteWorkspace(id: string) {
    const next = savedWorkspaces.filter(item => item.id !== id); setSavedWorkspaces(next); localStorage.setItem(workspaceStorageKey, JSON.stringify(next));
  }
  function restoreDefaultWorkspace() {
    setFrames(JSON.parse(JSON.stringify(defaultFrames)) as Record<WindowId, WindowFrame>); setWindowOrder(Object.keys(windowTitles) as WindowId[]); setOpenWindows(["layout", "library", "group"]);
  }
  const liveLabel = !source ? "无可用电源" : !sensorOk ? "反馈失效" : sim.time === 0 ? "准备就绪" : sim.pressure < config.target - config.band ? "低压补气" : sim.pressure > config.target + config.band ? "降频退机" : "目标带内";
  const estimatedLeak = config.baseLeak * Math.sqrt(Math.max(sim.pressure, 0) / 280) + doors.reduce((n, d) => n + doorLeak(d, sim.pressure), 0);

  return <main className={"workbench workbench-a theme-"+theme}>
    <header className="app-header">
      <div className="brand"><span>翌帆气膜</span><i/><div><strong>控制系统工作台 · A版</strong><small>渐进开发基线版</small></div></div>
      <span className="simulation-badge"><Activity size={15}/>仿真模式</span>
      <div className="header-actions"><a className="version-link" href="/b">查看 B 版</a><span className="save-status">{storage === "loading" ? "正在读取方案" : storage === "error" ? "方案读取失败" : dirty ? "有未保存修改" : "方案已同步"}</span><Button variant="outline" onClick={exportConfig} aria-label="导出方案"><Download size={16}/><span>导出</span></Button><Button onClick={save} disabled={saving || storage !== "ready"}><Save size={16}/><span>{saving ? "保存中…" : "保存方案"}</span></Button><Button className="theme-toggle" variant="outline" size="icon" onClick={() => setTheme(v => v === "light" ? "dark" : "light")} aria-label={theme === "light" ? "切换为黑暗模式" : "切换为明亮模式"}>{theme === "light" ? <Moon size={18}/> : <Sun size={18}/>}</Button></div>
    </header>
    {message && <div className="message" role="status"><span>{message}</span><button onClick={() => setMessage("")}>关闭</button></div>}
    <nav className="floating-toolbar" aria-label="工具窗口">
      <span className="toolbar-caption"><Layers3 size={16}/> 工作窗口</span>
      {(Object.keys(windowTitles) as WindowId[]).map(id => <Button key={id} variant="outline" aria-pressed={openWindows.includes(id)} onClick={() => toggleWindow(id)}><span className="window-indicator"/>{windowTitles[id]}</Button>)}
      <Button variant="ghost" onClick={restoreDefaultWorkspace}>恢复布局</Button>
      <small>拖动标题栏移动 · 拖动右下角缩放</small>
    </nav>
    <div className="work-grid" onClickCapture={e => { if ((e.target as HTMLElement).closest(".plan-device, .inventory-item, .sequence-row>button:first-of-type")) openWindow("properties"); }}>
      <div className="workspace-surface"><LayoutDashboard size={34}/><strong>气膜控制工作区</strong><span>从上方打开工作窗口，拖动并组合成适合当前任务的布局。</span></div>
      <FloatingWindow {...windowProps("library")}>
      <aside className="device-library">
        <div className="library-title"><Layers3 size={17}/><h2>设备库</h2><span>{config.devices.length}</span></div>
        <p>点击添加，或拖入平面图</p>
        <div className="library-tools">{kinds.map(kind => { const Icon = icons[catalog[kind].kind]; return <button key={kind} className={"library-item " + kind} draggable onDragStart={e => e.dataTransfer.setData("application/yifan-device", kind)} onClick={() => addDevice(kind)} aria-label={"添加" + catalog[kind].name}><span className="library-icon"><Icon size={22}/></span><span><b>{catalog[kind].name}</b><small>{catalog[kind].hint}</small></span><Plus size={17}/></button>; })}</div>
        <div className="inventory-title">当前设备 <small>点击定位</small></div>
        <div className="inventory">{config.devices.map(d => { const Icon = icons[d.kind]; return <button key={d.id} onClick={() => { setSelected(d.id); }} className={selected === d.id ? "inventory-item selected" : "inventory-item"}><Icon size={15}/><span>{d.name}</span>{d.kind === "fan" ? <small>{Math.round(sim.hz[d.id] ?? 0)} Hz</small> : <ChevronRight size={13}/>}</button>; })}{!config.devices.length && <p>从上方添加第一个设备</p>}</div>
        <div className="library-note"><MousePointer2 size={17}/><span>设备位置可拖动<br/>联动顺序在右侧调整</span></div>
      </aside>
      </FloatingWindow>

      <FloatingWindow {...windowProps("layout")} contentClassName="layout-window-content"><section className="central-workspace">
        <div className="canvas-heading"><div><span className="eyebrow">SPATIAL OVERVIEW / 空间总览</span><h1>气膜设备布局</h1></div><span className={"state-pill " + (liveLabel === "目标带内" || liveLabel === "准备就绪" ? "" : "warning")}>{liveLabel}</span></div>
        <div className="canvas-card">
          <div className="canvas-topline"><span><MousePointer2 size={15}/>立体俯视示意</span><small>{config.length} × {config.width} m</small><span className="canvas-legend"><i/>运行 <i className="off"/>待机</span></div>
          <div className="plan-board" ref={boardRef} data-testid="plan-board" onDragOver={e => e.preventDefault()} onDrop={e => {
            e.preventDefault(); const kind = e.dataTransfer.getData("application/yifan-device") as CatalogKind;
            if (!kinds.includes(kind)) return; const rect = e.currentTarget.getBoundingClientRect();
            addDevice(kind, Math.max(8, Math.min(92, (e.clientX - rect.left) / rect.width * 100)), Math.max(10, Math.min(88, (e.clientY - rect.top) / rect.height * 100)));
          }}>
            <svg className="plan-lines" viewBox="0 0 1000 630" preserveAspectRatio="none" aria-hidden="true">
              <defs><linearGradient id="a-dome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fafffd"/><stop offset=".45" stopColor="#edf6f1"/><stop offset="1" stopColor="#a8c7b6"/></linearGradient></defs>
              <rect x="100" y="185" width="800" height="267" rx="100" fill="#416f5720"/>
              <rect x="100" y="158" width="800" height="267" rx="100" fill="url(#a-dome)" stroke="#668779" strokeWidth="2"/>
              {[260,420,580,740].map(x=><path key={x} d={`M${x} 425 Q${x-70} 290 ${x} 158`} stroke="#ffffff" strokeWidth="3" fill="none" opacity=".7"/>)}
              <rect x="112" y="170" width="776" height="243" rx="91" fill="none" stroke="#d6e2db" strokeDasharray="5 5"/>
              <path d="M140 131 H860 M140 124 V138 M860 124 V138" stroke="#93a69a"/>
              <path d="M75 189 V394 M68 189 H82 M68 394 H82" stroke="#93a69a"/>
              {config.devices.filter(d => d.kind !== "door").map(d => <path key={d.id} d={"M" + d.x * 10 + " " + d.y * 6.3 + " L500 310"} className={"connection " + ((sim.hz[d.id] ?? 0) > 0 || (d.kind === "power" && source?.id === d.id) ? "energized" : "")}/>)}
            </svg>
            <span className="dimension-label">{config.length} m</span>
            <div className="pressure-hub"><span>气膜内部空间</span><strong>{Math.round(sim.pressure)} <small>Pa</small></strong><span>目标带 {config.target - config.band}–{config.target + config.band} Pa</span></div>
            {config.devices.map(d => {
              const Icon = icons[d.kind]; const hz = sim.hz[d.id] ?? 0;
              const failed = !d.enabled || d.id === faults.fanId || (isPressure(d) && !sensorOk);
              const on = !failed && (d.kind === "fan" ? hz > 0 : d.kind === "power" ? source?.id === d.id : d.kind === "door" ? d.open : true);
              const text = failed ? "不可用" : d.kind === "fan" ? hz ? Math.round(hz) + " Hz" : "待机" : d.kind === "door" ? d.open ? "开启" : "关闭" : d.kind === "power" ? on ? "供电中" : "备用 / 未投入" : isPressure(d) ? Math.round(sim.pressure) + " Pa" : "布置预留";
              return <button key={d.id} aria-label={"选择" + d.name} data-testid={"device-" + d.id} className={"plan-device " + d.kind + (selected === d.id ? " selected" : "") + (on ? " is-on" : "") + (failed ? " is-failed" : "")} style={{ left: d.x + "%", top: d.y + "%" }} onPointerDown={e => dragStart(e, d)} onPointerMove={dragMove} onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }} onClick={() => { setSelected(d.id); }} onKeyDown={e => {
                const steps: Record<string, [number, number]> = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] };
                if (steps[e.key]) { e.preventDefault(); const [x,y] = steps[e.key]; editDevice(d.id, { x: Math.max(8, Math.min(92, d.x+x)), y: Math.max(10, Math.min(88, d.y+y)) }); }
              }}><span className="plan-device-icon"><Icon size={23} className={d.kind === "fan" && hz > 0 && running ? "spinning" : ""}/></span><b>{d.name}</b><small>{text}</small>{d.kind === "fan" && <em>{fans.findIndex(f => f.id === d.id) + 1}</em>}</button>;
            })}
          </div>
          <div className="canvas-bottom"><span><Grip size={14}/>拖动设备调整位置；方向键可微调</span><span>{doors.filter(d => d.enabled && d.open).length} 扇门开启</span></div>
        </div>
        <div className="sim-controls">
          <Button onClick={() => setRunning(r => !r)} disabled={storage === "loading"}>{running ? <Pause size={17}/> : <Play size={17}/>} {running ? "暂停" : "开始模拟"}</Button>
          <Button variant="outline" onClick={() => { setRunning(false); setSim(initialSim(config)); }} aria-label="重置模拟"><RotateCcw size={16}/></Button>
          <label className="speed-select">速度<select value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={1}>1×</option><option value={5}>5×</option><option value={10}>10×</option></select></label>
          <span className="sim-clock">{timeLabel(sim.time)}</span><span className="sim-controls-hint">可边运行边开关门、调整设备</span>
        </div>
      </section></FloatingWindow>

        <FloatingWindow {...windowProps("events")}><div className="timeline-panel">
          <div className="timeline-heading"><h2><Activity size={16}/>联动过程</h2><span>模拟时间 · 最近事件</span></div>
          <p className="current-reason" aria-live="polite">{sim.reason}</p>
          <div className="timeline-list" data-testid="event-log">{sim.events.length ? sim.events.slice(0, 12).map((e, i) => <div className={"event " + e.tone} key={e.time + "-" + i}><time>{timeLabel(e.time)}</time><span>{e.text}</span></div>) : <div className="empty-events">运行后，逐台启动、退出和供电变化会记录在这里。</div>}</div>
        </div></FloatingWindow>

          <FloatingWindow {...windowProps("group")}>
          <section className="a-group editor-content"><h2 className="a-panel-title">机组联动 <small>压力维持 · 持续显示</small></h2>        <div className="readings">
          <div><span>{sensorOk ? "模拟压差" : "模拟真值 · 反馈失效"}</span><strong>{Math.round(sim.pressure)}<small>Pa</small></strong></div>
          <div><span>目标压力</span><strong>{config.target}<small>Pa</small></strong></div>
          <div><span>运行风机</span><strong>{activeFans.length}<small>/ {fans.length} 台</small></strong></div>
          <div><span>估算漏气量</span><strong>{Math.round(estimatedLeak).toLocaleString()}<small>m³/h</small></strong></div>
        </div>

            <div className="panel-heading"><span className="editor-icon"><SlidersHorizontal size={23}/></span><div><small>所有风机共用</small><h2>顺序投入，逆序退出</h2></div></div>
            <p className="panel-intro">低压持续且在运机组达到上限，投入下一台；压力回升后逆序退出。变频机调频，工频机仅以 50 Hz 启停。</p>
            <div className="sequence-list">{fans.map((d, i) => <div className="sequence-row" key={d.id}><span className="rank">{i+1}</span><button onClick={() => { setSelected(d.id); }}>{d.name}<small>{d.enabled ? (sim.hz[d.id] ?? 0) > 0 ? Math.round(sim.hz[d.id]) + " Hz" : "待机" : "已禁用"}</small></button><button aria-label={"上移"+d.name} disabled={i === 0 || running} onClick={() => reorder(d.id, -1)}><ArrowUp size={15}/></button><button aria-label={"下移"+d.name} disabled={i === fans.length-1 || running} onClick={() => reorder(d.id, 1)}><ArrowDown size={15}/></button></div>)}</div>
            {running && <p className="field-note">暂停模拟后可调整启动顺序。</p>}
            <div className="two-fields"><NumberField label="目标压力" unit="Pa" value={config.target} min={100} max={600} onChange={v => patchConfig({ target: v })}/><NumberField label="控制回差" unit="Pa" value={config.band} min={5} max={50} onChange={v => patchConfig({ band: v })}/><NumberField label="投入延时" unit="秒" value={config.addDelay} min={1} max={60} onChange={v => patchConfig({ addDelay: v })}/><NumberField label="退出延时" unit="秒" value={config.stopDelay} min={1} max={60} onChange={v => patchConfig({ stopDelay: v })}/><NumberField label="最低频率" unit="Hz" value={config.minHz} min={10} max={35} onChange={v => patchConfig({ minHz: v })}/><NumberField label="最高频率" unit="Hz" value={config.maxHz} min={40} max={60} onChange={v => patchConfig({ maxHz: v })}/></div>
            <NumberField label="每秒调频步长" unit="Hz" value={config.ramp} min={0.5} max={10} step={0.5} onChange={v => patchConfig({ ramp: v })}/>
            <div className="rule-summary"><b>投入条件</b><p>压力低于 {config.target-config.band} Pa；在运风机全部满频；持续 {config.addDelay} 秒。</p><b>退出条件</b><p>压力高于 {config.target+config.band} Pa；末台变频机降至 {config.minHz} Hz（工频机无需降频）；剩余机组容量足够；持续 {config.stopDelay} 秒。保留首台可用风机。</p><b>避免反复启停</b><p>若退机后容量不足，先保留末台，通过其他运行风机调频平衡供气。</p></div>
          </section>
          </FloatingWindow>
          <FloatingWindow {...windowProps("scenario")}>
          <section className="a-scenario editor-content"><h2 className="a-panel-title">工况试验 <small>实时操作 · 持续显示</small></h2>
            <div className="panel-heading"><span className="editor-icon"><Wind size={23}/></span><div><small>多种条件可同时发生</small><h2>边操作，边看响应</h2></div></div>
            <div className="panel-section-title">门状态</div>{doors.map(d => <Toggle key={d.id} label={d.name} hint={d.width+" × "+d.height+" m · "+(d.enabled ? "参与漏气计算" : "已禁用")} checked={d.open} onChange={v => editDevice(d.id, { open: v })}/>)}{!doors.length && <p className="field-note">暂无旋转门，可从设备库添加。</p>}
            <div className="panel-section-title">异常事件</div><Toggle label="市电中断" hint="检查是否自动切换可用备用电源" checked={faults.mainsOff} onChange={v => setFaults(f => ({ ...f, mainsOff: v }))}/><Toggle label="压力反馈失效" hint="暂停自动增减机，观察降级状态" checked={faults.sensorFailed} onChange={v => setFaults(f => ({ ...f, sensorFailed: v }))}/>
            <label className="field">风机故障<select value={faults.fanId ?? ""} onChange={e => setFaults(f => ({ ...f, fanId: e.target.value || null }))}><option value="">无故障</option>{fans.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
            <div className="panel-section-title">气膜与环境参数</div><div className="two-fields"><NumberField label="气膜长度" unit="m" value={config.length} min={10} max={200} onChange={v => patchConfig({ length: v })}/><NumberField label="气膜宽度" unit="m" value={config.width} min={10} max={150} onChange={v => patchConfig({ width: v })}/></div><NumberField label="内部有效体积" unit="m³" value={config.volume} min={1000} max={200000} onChange={v => patchConfig({ volume: v })}/><NumberField label="280 Pa时基础漏气量" unit="m³/h" value={config.baseLeak} min={100} max={50000} onChange={v => patchConfig({ baseLeak: v })}/>
            <p className="field-note">长宽用于平面标注，有效体积单独设置并参与压力变化计算。</p>
          </section>
          </FloatingWindow>

      <FloatingWindow {...windowProps("properties")}>
      <aside className="editor-panel">
<div className="editor-content"><h2 className="a-panel-title">设备属性</h2>
            {current ? <>
              <div className="panel-heading"><span className={"editor-icon " + current.kind}>{(() => { const Icon = icons[current.kind]; return <Icon size={23}/>; })()}</span><div><small>{(current.subtype !== "standard" ? catalog[current.subtype].name : kindNames[current.kind])}</small><h2>{current.name}</h2></div></div>
              <label className="field">设备名称<Input aria-label="设备名称" value={current.name} maxLength={40} onChange={e => editDevice(current.id, { name: e.target.value })}/></label>
              <Toggle label="设备可用" hint="关闭后不参与联动计算" checked={current.enabled} onChange={v => editDevice(current.id, { enabled: v })}/>
              {current.kind === "fan" && <><NumberField key={current.id+"capacity"} label="额定供风量" unit="m³/h" value={current.capacity} min={100} max={100000} onChange={v => editDevice(current.id, { capacity: v })}/><p className="field-note">{current.subtype === "gfan" ? "工频机固定 50 Hz，按额定风量供风；只参与启停，不参与调频。" : "按频率线性折算供风量，后续可接入风机性能曲线。"}</p><div className="object-reading"><span>当前频率</span><strong>{Math.round(sim.hz[current.id] ?? 0)} Hz</strong></div><button className="link-button" >启动顺序 #{fans.findIndex(d => d.id === current.id)+1} · 编辑机组联动 <ChevronRight size={16}/></button></>}
              {current.kind === "door" && <><Toggle label={current.subtype === "vent" ? "阀开启" : "门开启"} hint="运行中切换，观察压力与风机变化" checked={current.open} onChange={v => editDevice(current.id, { open: v })}/><div className="two-fields"><NumberField key={current.id+"width"} label="有效通道宽" unit="m" value={current.width} min={0.5} max={10} step={0.1} onChange={v => editDevice(current.id, { width: v })}/><NumberField key={current.id+"height"} label="通道高度" unit="m" value={current.height} min={1} max={10} step={0.1} onChange={v => editDevice(current.id, { height: v })}/></div><NumberField key={current.id+"coefficient"} label="等效漏气系数" value={current.coefficient} min={0.001} max={0.6} step={0.001} onChange={v => editDevice(current.id, { coefficient: v })}/><div className="object-reading"><span>当前估算漏气</span><strong>{Math.round(doorLeak(current, sim.pressure)).toLocaleString()} m³/h</strong></div><p className="field-note">宽 × 高为等效通道面积。门关闭残余系数为 0.001；排风阀关闭按零排气。气锁门暂按单一等效通道计算，不含双门互锁。均为模拟假设。</p></>}
              {current.kind === "power" && <><label className="field">电源类型<select value={current.source} onChange={e => editDevice(current.id, { source: e.target.value as "mains" | "backup" })}><option value="mains">市电</option><option value="backup">备用电源</option></select></label><div className="object-reading"><span>供电状态</span><strong>{source?.id === current.id ? "正在供电" : "未投入"}</strong></div><p className="field-note">设备库顺序内市电优先，市电均不可用时切换备用电源；本版假定任一可用电源可带动整个机组。</p></>}
              {isPressure(current) && <><div className="object-reading"><span>压力反馈</span><strong>{sensorOk && current.enabled ? Math.round(sim.pressure)+" Pa" : "数据无效"}</strong></div><p className="field-note">全部传感器不可用时暂停自动增减机，保持当前可用设备频率。仿真画布仍显示模拟真值。</p></>}
              {(current.subtype === "th" || current.subtype === "co2") && <p className="field-note">本阶段仅用于设备布置，不参与压力联动，暂无测量数据。</p>}<div className="panel-section-title">平面位置</div><div className="two-fields"><NumberField key={current.id+"x"} label="横向位置" unit="%" value={Math.round(current.x)} min={8} max={92} onChange={v => editDevice(current.id, { x: v })}/><NumberField key={current.id+"y"} label="纵向位置" unit="%" value={Math.round(current.y)} min={10} max={88} onChange={v => editDevice(current.id, { y: v })}/></div>
              <Button variant="outline" className="delete-button" onClick={() => setPendingDelete(current.id)}><Trash2 size={16}/>删除此设备</Button>
            </> : <div className="selection-empty"><MousePointer2 size={27}/><h2>选择一个设备</h2><p>点击平面图或设备列表，即可编辑参数。</p></div>}
          </div>

        <div className="simulation-note"><CircleHelp size={16}/><p>控制逻辑演示。压力、风量与漏气系数尚未按工程实测校准，不向现场设备下发命令。</p></div>
      </aside>
      </FloatingWindow>

      <FloatingWindow {...windowProps("workspaces")}>
        <section className="workspace-manager">
          <div className="workspace-save-box"><div><strong>保存当前工作区</strong><span>记录全部窗口的内容、位置、大小、开关状态和显示模式。</span></div><label>工作区名称<Input value={workspaceName} maxLength={30} placeholder="例如：设备布置模式" onChange={e => setWorkspaceName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveCurrentWorkspace(); }}/></label><Button onClick={saveCurrentWorkspace}><Save size={16}/>{savedWorkspaces.some(item => item.name === workspaceName.trim()) ? "更新同名工作区" : "保存当前工作区"}</Button></div>
          <div className="workspace-list-heading"><strong>已保存工作区</strong><span>{savedWorkspaces.length} / 15</span></div>
          <div className="workspace-list">{savedWorkspaces.map(item => <div className="workspace-row" key={item.id}><button onClick={() => loadWorkspace(item)}><LayoutDashboard size={18}/><span><b>{item.name}</b><small>{new Date(item.savedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} · {item.openWindows.length} 个窗口</small></span></button><Button variant="ghost" size="icon" aria-label={"删除工作区"+item.name} onClick={() => deleteWorkspace(item.id)}><X size={16}/></Button></div>)}{!savedWorkspaces.length && <div className="workspace-empty"><LayoutDashboard size={28}/><p>还没有保存的工作区</p><span>调整好窗口后，在上方输入名称保存。</span></div>}</div>
          <p className="workspace-storage-note">工作区保存在当前浏览器中；“保存方案”仍用于保存正式设备方案。</p>
        </section>
      </FloatingWindow>
    </div>
    <AlertDialog open={!!pendingDelete} onOpenChange={v => { if (!v) setPendingDelete(null); }}><AlertDialogContent className={theme === "dark" ? "a-dark-dialog" : ""}><AlertDialogHeader><AlertDialogTitle>删除设备？</AlertDialogTitle><AlertDialogDescription>将从当前方案移除“{config.devices.find(d => d.id === pendingDelete)?.name}”，联动机组和模拟立即同步更新。点击保存方案后才会保存此次删除。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>保留设备</AlertDialogCancel><AlertDialogAction onClick={() => pendingDelete && removeDevice(pendingDelete)}>确认删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}
function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <div className="toggle-row"><div><strong>{label}</strong><small>{hint}</small></div><Switch aria-label={label} checked={checked} onCheckedChange={onChange}/></div>;
}
function NumberField({ label, unit, value, min, max, step = 1, onChange }: { label: string; unit?: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return <label className="field">{label}<div className="number-wrap"><Input aria-label={label} type="number" value={text} min={min} max={max} step={step} onChange={e => {
    setText(e.target.value); const n = Number(e.target.value); if (e.target.value && Number.isFinite(n) && n >= min && n <= max && (step !== 1 || Number.isInteger(n))) onChange(n);
  }} onBlur={() => { const n = Number(text); const valid = text !== "" && Number.isFinite(n) && n >= min && n <= max && (step !== 1 || Number.isInteger(n)); if (!valid) setText(String(value)); }}/>{unit && <span>{unit}</span>}</div></label>;
}
