/**
 * LexOfficeAT — Cloudflare Worker v2.0
 * Proxy para: DataJud CNJ + Anthropic Claude API
 *
 * ROTAS:
 * POST /api_publica_SIGLA/_search  → DataJud
 * POST /claude                     → Claude API (resolve CORS do browser)
 */

const DATAJUD_BASE = "https://api-publica.datajud.cnj.jus.br";
const DATAJUD_KEY  = "cDZHYzlZa0JadVREZDJCendFbGFkUnBQbXQrTldjSE10";
const CLAUDE_BASE  = "https://api.anthropic.com";

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, anthropic-version",
    };

    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });

    const url   = new URL(request.url);
    const path  = url.pathname;
    const body  = request.method === "POST" ? await request.text() : "{}";

    // ── ROTA: Claude API (/claude) ──────────────────────────────
    if (path === "/claude") {
      // Pega a API key do header Authorization: Bearer sk-ant-...
      const authHeader = request.headers.get("Authorization") || "";
      const claudeKey  = authHeader.replace("Bearer ", "").trim();

      if (!claudeKey || !claudeKey.startsWith("sk-ant")) {
        return new Response(
          JSON.stringify({ error: { message: "API Key Claude não informada no header Authorization" } }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
        );
      }

      const resp = await fetch(`${CLAUDE_BASE}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type":      "application/json",
          "x-api-key":         claudeKey,
          "anthropic-version": request.headers.get("anthropic-version") || "2023-06-01",
        },
        body,
      });

      const data = await resp.json();
      return new Response(JSON.stringify(data), {
        status: resp.status,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── ROTA: DataJud (/api_publica_SIGLA/_search) ───────────────
    const match = path.match(/^\/api_publica_([a-z0-9]+)\/_search$/);
    if (match) {
      const resp = await fetch(
        `${DATAJUD_BASE}/api_publica_${match[1]}/_search`,
        {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `ApiKey ${DATAJUD_KEY}`,
          },
          body,
        }
      );
      const data = await resp.json();
      return new Response(JSON.stringify(data), {
        status: resp.status,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // ── Rota não encontrada ──────────────────────────────────────
    return new Response(
      JSON.stringify({ error: "Use POST /claude ou POST /api_publica_SIGLA/_search" }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
  },
};
