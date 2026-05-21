/**
 * LexOfficeAT — Cloudflare Worker: Proxy DataJud CNJ
 * 
 * DEPLOY GRATUITO (2 min):
 * 1. Acesse https://workers.cloudflare.com
 * 2. Crie conta gratuita → "Create a Worker"
 * 3. Cole este código inteiro → "Save and Deploy"
 * 4. Copie a URL gerada (ex: lexoffice-datajud.SEU-USUARIO.workers.dev)
 * 5. No LexOfficeAT → Integrações → cole a URL no campo "Proxy DataJud"
 */

const DATAJUD_BASE = "https://api-publica.datajud.cnj.jus.br";
const API_KEY = "cDZHYzlZa0JadVREZDJCendFbGFkUnBQbXQrTldjSE10";

// Tribunais suportados
const SIGLAS = [
  "tjac","tjal","tjam","tjap","tjba","tjce","tjdft","tjes","tjgo",
  "tjma","tjmg","tjms","tjmt","tjpa","tjpb","tjpe","tjpi","tjpr",
  "tjrj","tjrn","tjro","tjrr","tjrs","tjsc","tjse","tjsp","tjto",
  "trt1","trt2","trt3","trt4","trt5","trt6","trt7","trt8","trt9",
  "trt10","trt11","trt12","trt13","trt14","trt15","trt16","trt17",
  "trt18","trt19","trt20","trt21","trt22","trt23","trt24",
  "trf1","trf2","trf3","trf4","trf5","stj","tst","stf","tse","stm"
];

export default {
  async fetch(request, env) {
    // CORS headers para GitHub Pages
    const corsHeaders = {
      "Access-Control-Allow-Origin": "https://amilcaradvocacia.github.io",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Content-Type": "application/json",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname; // ex: /api_publica_trt9/_search

    // Valida se é uma rota DataJud válida
    const match = path.match(/^\/api_publica_([a-z0-9]+)\/_search$/);
    if (!match) {
      return new Response(JSON.stringify({ error: "Rota inválida. Use /api_publica_SIGLA/_search" }),
        { status: 400, headers: corsHeaders });
    }

    const sigla = match[1];
    if (!SIGLAS.includes(sigla)) {
      return new Response(JSON.stringify({ error: `Tribunal não suportado: ${sigla}` }),
        { status: 400, headers: corsHeaders });
    }

    // Proxy para DataJud
    const targetUrl = `${DATAJUD_BASE}/api_publica_${sigla}/_search`;
    let body = null;
    if (request.method === "POST") {
      body = await request.text();
    }

    try {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `ApiKey ${API_KEY}`,
        },
        body: body || JSON.stringify({
          query: { match_all: {} },
          size: 1,
        }),
      });

      const data = await response.json();
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: corsHeaders,
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }),
        { status: 500, headers: corsHeaders });
    }
  }
};
