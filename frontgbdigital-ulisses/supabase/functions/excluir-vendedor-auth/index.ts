// Edge Function: excluir-vendedor-auth
// Exclui o vendedor da tabela `vendedores` E o usuário correspondente no
// Supabase Auth, numa única chamada. Só a Edge Function tem a service_role
// key — o painel nunca a vê.
//
// Fluxo:
//   1) Valida o JWT de quem chama.
//   2) Lê o vendedor (respeitando RLS do chamador — se ele não enxerga o
//      vendedor, não tem permissão, e a query já retorna vazio).
//   3) Deleta a linha em `vendedores` (respeitando RLS do chamador).
//   4) Deleta o usuário no Supabase Auth, se houver user_id vinculado.
//
// Deploy: supabase functions deploy excluir-vendedor-auth

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, erro: 'sem_autorizacao' }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const { vendedor_id } = await req.json();
    if (!vendedor_id) {
      return new Response(JSON.stringify({ ok: false, erro: 'parametros_invalidos' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Client "como o usuário" (anon key + JWT dele) — respeita RLS.
    const clienteUsuario = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // 1) Lê o vendedor primeiro — se o RLS ("vendedores select") não deixar
    //    o chamador enxergar essa linha, ele também não tem permissão para
    //    excluí-la, e paramos aqui com 404 (não vaza se o id existe ou não).
    const { data: vendedor, error: erroLer } = await clienteUsuario
      .from('vendedores')
      .select('id, user_id')
      .eq('id', vendedor_id)
      .maybeSingle();
    if (erroLer || !vendedor) {
      return new Response(JSON.stringify({ ok: false, erro: 'nao_encontrado' }), {
        status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 2) Deleta a linha em vendedores (a policy "vendedores delete" já
    //    valida permissão de novo, via unidade_visivel).
    const { error: erroDelete } = await clienteUsuario
      .from('vendedores')
      .delete()
      .eq('id', vendedor_id);
    if (erroDelete) {
      return new Response(JSON.stringify({ ok: false, erro: 'excluir_vendedor', detalhe: erroDelete.message }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 3) Deleta o usuário no Supabase Auth (precisa da service_role key).
    if (vendedor.user_id) {
      const clienteAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      const { error: erroAuth } = await clienteAdmin.auth.admin.deleteUser(vendedor.user_id);
      if (erroAuth) {
        // A linha em vendedores já foi removida; o login no Auth órfão não dá
        // mais acesso a nada (RLS exige a linha em vendedores), mas avisamos.
        return new Response(JSON.stringify({ ok: true, aviso: 'vendedor_excluido_auth_pendente', detalhe: erroAuth.message }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, erro: 'interno', detalhe: String(e) }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
