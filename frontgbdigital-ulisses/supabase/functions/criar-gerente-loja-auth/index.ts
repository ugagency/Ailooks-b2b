// Edge Function: criar-gerente-loja-auth
// Cria o usuário no Supabase Auth e vincula como gerente (papel 'loja') de
// uma loja específica, numa única chamada. Só a Edge Function tem a
// service_role key — o painel nunca a vê.
//
// Fluxo:
//   1) Valida o JWT de quem chama.
//   2) Checa permissão via loja_visivel(p_loja) — plataforma, operador da
//      rede ou gerente já vinculado à própria loja podem adicionar outro
//      gerente.
//   3) Gera senha temporária, cria o usuário no Auth (email_confirm=true).
//   4) Vincula em usuarios_painel via vincular_gerente_loja() (service_role).
//   5) Devolve a senha temporária para o admin repassar ao gerente.
//
// Deploy: supabase functions deploy criar-gerente-loja-auth

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function gerarSenhaTemporaria(): string {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  for (let i = 0; i < 10; i++) s += alfabeto[bytes[i] % alfabeto.length];
  return s;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, erro: 'sem_autorizacao' }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const { loja_id, email } = await req.json();
    if (!loja_id || !email) {
      return new Response(JSON.stringify({ ok: false, erro: 'parametros_invalidos' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    const emailNorm = String(email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailNorm)) {
      return new Response(JSON.stringify({ ok: false, erro: 'email_invalido' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Client "como o usuário" (anon key + JWT dele) — usado só para checar permissão.
    const clienteUsuario = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // 1) Checa se o chamador tem permissão sobre a loja (plataforma, operador
    //    da rede, ou gerente já vinculado a ela).
    const { data: podeVer, error: erroPermissao } = await clienteUsuario.rpc('loja_visivel', { p_loja: loja_id });
    if (erroPermissao || !podeVer) {
      return new Response(JSON.stringify({ ok: false, erro: 'sem_permissao' }), {
        status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const clienteAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 2) Se o e-mail já existe no Auth, reaproveita a conta; senão cria uma nova.
    let userId: string;
    const senha = gerarSenhaTemporaria();
    const { data: authData, error: erroAuth } = await clienteAdmin.auth.admin.createUser({
      email: emailNorm,
      password: senha,
      email_confirm: true,
      user_metadata: { papel: 'loja' },
    });

    if (erroAuth) {
      // E-mail já cadastrado no Auth (ex.: já é vendedor/operador de outra loja)?
      // Busca o usuário existente e só vincula — sem gerar/expor senha nova.
      const { data: lista, error: erroLista } = await clienteAdmin.auth.admin.listUsers();
      const existente = !erroLista && lista?.users.find(u => u.email?.toLowerCase() === emailNorm);
      if (!existente) {
        return new Response(JSON.stringify({ ok: false, erro: 'criar_auth', detalhe: erroAuth.message }), {
          status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
      userId = existente.id;
    } else {
      userId = authData.user!.id;
    }

    // 3) Vincula em usuarios_painel (papel 'loja').
    const { error: erroVinculo } = await clienteAdmin.rpc('vincular_gerente_loja', {
      p_loja: loja_id, p_user_id: userId,
    });
    if (erroVinculo) {
      return new Response(JSON.stringify({ ok: false, erro: 'vincular_gerente', detalhe: erroVinculo.message }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      user_id: userId,
      email: emailNorm,
      senha_temporaria: authData?.user ? senha : null, // null quando reaproveitou conta existente
    }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, erro: 'interno', detalhe: String(e) }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
