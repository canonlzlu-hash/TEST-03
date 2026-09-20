import { rawDb } from "@/db";
import { configSchema } from "@/lib/control-model-b";

export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const owner = request.headers.get("oai-authenticated-user-id");
  if (!owner) return reply({ error: "请登录后读取 B 版方案" }, 401);
  try {
    const db = rawDb();
    const own = await db.prepare("SELECT body, revision FROM control_configs WHERE owner_id = ?").bind(owner + "::b").first<{ body: string; revision: number }>();
    if (own) return reply({ config: configSchema.parse(JSON.parse(own.body)), revision: own.revision });
    const legacy = await db.prepare("SELECT body FROM control_configs WHERE owner_id = ?").bind(owner).first<{ body: string }>();
    const parsed = legacy ? configSchema.safeParse(JSON.parse(legacy.body)) : null;
    return reply({ config: parsed?.success ? parsed.data : null, revision: 0 });
  } catch (e) { console.error("B config load failed", e); return reply({ error: "暂时无法读取 B 版方案" }, 503); }
}

export async function PUT(request: Request) {
  const owner = request.headers.get("oai-authenticated-user-id");
  if (!owner) return reply({ error: "请登录后保存 B 版方案" }, 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply({ error: "请求来源无效" }, 403);
  try {
    const text = await request.text();
    if (text.length > 100000) return reply({ error: "方案过大" }, 413);
    let data: { config?: unknown; revision?: unknown };
    try { data = JSON.parse(text); } catch { return reply({ error: "配置格式无效" }, 400); }
    const parsed = configSchema.safeParse(data.config);
    if (!parsed.success || typeof data.revision !== "number" || !Number.isInteger(data.revision) || data.revision < 0) return reply({ error: "请检查 B 版对象模型" }, 400);
    const revision = data.revision;
    const key = owner + "::b";
    const stmt = revision === 0
      ? rawDb().prepare("INSERT OR IGNORE INTO control_configs (owner_id, body, revision, updated_at) VALUES (?, ?, 1, ?)").bind(key, JSON.stringify(parsed.data), new Date().toISOString())
      : rawDb().prepare("UPDATE control_configs SET body = ?, revision = revision + 1, updated_at = ? WHERE owner_id = ? AND revision = ?").bind(JSON.stringify(parsed.data), new Date().toISOString(), key, revision);
    const result = await stmt.run();
    if (result.meta.changes !== 1) return reply({ error: "B 版已在其他页面更新，请重新加载。" }, 409);
    return reply({ revision: revision + 1 });
  } catch (e) { console.error("B config save failed", e); return reply({ error: "B 版保存失败，当前修改仍保留" }, 503); }
}
