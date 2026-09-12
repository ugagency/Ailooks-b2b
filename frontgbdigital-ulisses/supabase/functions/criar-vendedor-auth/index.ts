// Edge Function: criar-vendedor-auth
// Cria o vendedor na tabela `vendedores` E o usuário correspondente no Supabase Auth,
// numa única chamada. Só a Edge Function tem a service_role key — o painel nunca a vê.
//
// Fluxo:
//   1) Valida o JWT de quem chama (deve ser plataforma/operador/loja com acesso à unidade).
//   2) Gera uma senha temporária aleatória.
//   3) Cria o usuário no Supabase Auth (email_confirm=true, já pode logar de cara).
//   4) Cria a linha em `vendedores` via RPC criar_vendedor (mesma checagem de permissão).
//   5) Devolve a senha temporária para o admin repassar ao vendedor.
//
// Deploy: supabase functions deploy criar-vendedor-auth

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
  // 10 caracteres alfanuméricos, fáceis de digitar num tablet.
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

    const { unidade_id, nome, email } = await req.json();
    if (!unidade_id || !nome || !email) {
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

    // Client "como o usuário" (anon key + JWT dele) — respeita RLS e permite checar permissão.
    const clienteUsuario = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // 1) Cria a linha em vendedores primeiro — a RPC já valida se o chamador
    //    tem permissão sobre a unidade (unidade_visivel) e se o e-mail é válido/único.
    const { data: vendedorId, error: erroCriar } = await clienteUsuario.rpc('criar_vendedor', {
      p_unidade: unidade_id, p_nome: nome, p_email: emailNorm,
    });
    if (erroCriar) {
      return new Response(JSON.stringify({ ok: false, erro: 'criar_vendedor', detalhe: erroCriar.message }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 2) Cria o usuário no Supabase Auth (precisa da service_role key).
    const clienteAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const senha = gerarSenhaTemporaria();
    const { data: authData, error: erroAuth } = await clienteAdmin.auth.admin.createUser({
      email: emailNorm,
      password: senha,
      email_confirm: true,
      user_metadata: { nome, papel: 'vendedor' },
    });

    if (erroAuth) {
      // Rollback: já criamos o vendedor na tabela, mas o Auth falhou (ex.: e-mail já tem conta Auth
      // de outro papel). Removemos a linha pra não deixar vendedor "fantasma" sem login.
      await clienteUsuario.from('vendedores').delete().eq('id', vendedorId);
      return new Response(JSON.stringify({ ok: false, erro: 'criar_auth', detalhe: erroAuth.message }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      vendedor_id: vendedorId,
      auth_user_id: authData.user?.id,
      email: emailNorm,
      senha_temporaria: senha,
    }), { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, erro: 'interno', detalhe: String(e) }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
