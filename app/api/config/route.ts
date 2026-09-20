import { rawDb } from "@/db";
import { configSchema } from "@/lib/control-model";

export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  const owner = request.headers.get("oai-authenticated-user-id");
  if (!owner) return reply({ error: "请登录后读取方案" }, 401);
  try {
    const row = await rawDb().prepare("SELECT body, revision FROM control_configs WHERE owner_id = ?").bind(owner).first<{ body: string; revision: number }>();
    if (!row) return reply({ config: null, revision: 0 });
    const stored = JSON.parse(row.body);
    const parsed = configSchema.safeParse(stored);
    return reply({ config: parsed.success ? parsed.data : stored, revision: row.revision });
  } catch (e) { console.error("Config load failed", e); return reply({ error: "暂时无法读取方案，请稍后重试" }, 503); }
}
export async function PUT(request: Request) {
  const owner = request.headers.get("oai-authenticated-user-id");
  if (!owner) return reply({ error: "请登录后保存方案" }, 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply({ error: "请求来源无效" }, 403);
  try {
    const text = await request.text();
    if (text.length > 100000) return reply({ error: "方案过大" }, 413);
    let data: { config?: unknown; revision?: unknown };
    try { data = JSON.parse(text); } catch { return reply({ error: "配置格式无效" }, 400); }
    const parsed = configSchema.safeParse(data.config);
    if (!parsed.success || typeof data.revision !== "number" || !Number.isInteger(data.revision) || data.revision < 0) return reply({ error: "请检查设备和联动参数" }, 400);
    const revision = data.revision;
    const db = rawDb();
    const stmt = revision === 0
      ? db.prepare("INSERT OR IGNORE INTO control_configs (owner_id, body, revision, updated_at) VALUES (?, ?, 1, ?)").bind(owner, JSON.stringify(parsed.data), new Date().toISOString())
      : db.prepare("UPDATE control_configs SET body = ?, revision = revision + 1, updated_at = ? WHERE owner_id = ? AND revision = ?").bind(JSON.stringify(parsed.data), new Date().toISOString(), owner, revision);
    const result = await stmt.run();
    if (result.meta.changes !== 1) return reply({ error: "其他页面已保存新方案。请先导出本次修改，再重新加载比较，避免覆盖。" }, 409);
    return reply({ revision: revision + 1 });
  } catch (e) { console.error("Config save failed", e); return reply({ error: "保存失败，当前修改仍保留，请稍后重试" }, 503); }
}
