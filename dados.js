/* ==========================================================
   dados.js — CAMADA DE DADOS INTEGRADA AO SUPABASE
   ========================================================== */

// 1. Configuração de conexão do Supabase
// Coloque aqui a sua URL e a sua chave Publishable obtidas no painel do Supabase
const SUPABASE_URL = "https://epvigdtksqfzamowcwww.supabase.co"; // Ex: https://epvigdtksqfzamowcwww.supabase.co
const SUPABASE_KEY = "sb_publishable_4EaTbPcaZUD_4mHnCjue5w_wsLHhGEt"; // Ex: sb_publishable_...

/* O login fica só NESTA aba (sessionStorage) e com uma chave própria. Assim, duas abas do mesmo navegador
   podem estar logadas como pessoas diferentes (ex.: matriz e lançador) sem uma derrubar a outra, e o login
   some ao fechar a aba (não fica guardado no navegador). */
let chaveDaAba = null;
try { chaveDaAba = sessionStorage.getItem("chave-aba-login"); } catch { /* sem sessionStorage */ }
if (!chaveDaAba) {
  chaveDaAba = "sb-aba-" + Math.random().toString(36).slice(2);
  try { sessionStorage.setItem("chave-aba-login", chaveDaAba); } catch { /* segue sem guardar */ }
}
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { storage: window.sessionStorage, storageKey: chaveDaAba },
});

/* Colunas lançadas pela SATÉLITE, na ordem da planilha.
   un: "h" horas, "d" dias, "R$" dinheiro, "t" texto livre. */
const COLUNAS = [
  { id: "nice",          rotulo: "Controle Nice",             un: "t" },
  { id: "atrasos442",    rotulo: "442 - Horas de atrasos",    un: "h" },
  { id: "faltas409",     rotulo: "409 - Faltas dia",          un: "d" },
  { id: "nFeriado",      rotulo: "Nº trab. feriado",          un: "d" },
  { id: "nDobras",       rotulo: "Nº dobras trab.",           un: "d" },
  { id: "premioGranja",  rotulo: "109 - Prêmio só da granja", un: "R$" },
  { id: "heAte60",       rotulo: "103 - H. extra até 60 hs",  un: "h" },
  { id: "heAcima60",     rotulo: "H. extra acima de 60 hs",   un: "h" },
  { id: "prodCafe",      rotulo: "Prod. turma café",          un: "R$" },
  { id: "km",            rotulo: "KM motoristas",             un: "R$" },
  { id: "comissoes",     rotulo: "Comissões",                 un: "R$" },
  { id: "premiosOutros", rotulo: "Prêmios outros",            un: "R$" },
];

/* Colunas lançadas SÓ pela matriz (ASSUNÇÃO: confirmar a origem da 103 - Nº h. extras) */
const COLUNAS_MATRIZ = [
  { id: "nHE103", rotulo: "103 - Nº h. extras",         un: "h" },
  { id: "dsr119", rotulo: "119 - DSR prod (lançar manual)", un: "R$" }, // vazio = usa base ÷ divisor (aparece cinza no campo)
];
const MATRIZ_ONLY = COLUNAS_MATRIZ.map((c) => c.id);

/* Colunas calculadas (só a matriz vê), na ordem da planilha */
const CALCULADAS = [
  ["feriado012", "012 - Valor feriado"], ["dobras114", "114 - Valor das dobras"],
  ["vlrTHE", "Vlr.T.H.E"], ["dsrHE", "DSR H.E."],
  ["calcAcima60", "Cálculo h. acima de 60"], ["dsrAcima60", "Cálculo DSR acima de 60"],
  ["premio110", "110 - Prêmio h. extra acima de 60"],
  ["totalKmCom", "Total km+com+prêmio+prod café"],
  ["valor", "Valor"], ["dsrExtra", "DSR extra"], ["base", "Base da produção"],
  ["prod117", "117 - Prod"], ["conferencia", "Conferência"], // o 119 é uma coluna só (entrada), ver COLUNAS_MATRIZ
].map(([id, rotulo]) => ({ id, rotulo, un: "R$" }));

/* ORDEM DAS COLUNAS NA MATRIZ: igual ao cabeçalho da planilha (depois de matrícula, nome, salário, função).
   Entradas da satélite, entradas da matriz e contas ficam intercaladas, como na planilha. */
const LAYOUT_MATRIZ = [
  "nice", "atrasos442", "faltas409", "nFeriado", "feriado012", "nDobras", "dobras114", "premioGranja",
  "heAte60", "vlrTHE", "dsrHE", "heAcima60", "calcAcima60", "dsrAcima60", "premio110",
  "prodCafe", "km", "comissoes", "premiosOutros", "totalKmCom",
  "nHE103", "valor", "dsrExtra", "base", "prod117", "dsr119", "conferencia",
];

/* Constantes das contas (como na planilha). Hoje fixas; se algum divisor mudar por mês,
   isto vira parâmetro por competência. */
const PARAMS = { diasMes: 30, horasMes: 220, adicionalHE: 1.5, divDsrHE: 5, divDsrAcima60: 5.2, divDsrProd: 4.6 };

/* CONTAS DA MATRIZ, exatamente como descritas (sem SE/ARRED/SEERRO: não arredonda).
   v = valores lançados { id: valor }. No sistema final esta conta roda no servidor (SQL, decimal). */
function calcular(salario, v, P = PARAMS) {
  const n = (x) => Number(x) || 0;
  const hora = (salario / P.horasMes) * P.adicionalHE; // salário/220 × 1,5
  const dia = salario / P.diasMes;                      // salário/30
  const feriado012 = dia * n(v.nFeriado);
  const dobras114 = dia * n(v.nDobras);
  const vlrTHE = hora * n(v.heAte60);
  const dsrHE = vlrTHE / P.divDsrHE;
  const calcAcima60 = hora * n(v.heAcima60);
  const dsrAcima60 = calcAcima60 / P.divDsrAcima60;
  /* 110 = cálculo ÷ cálculo DSR, como descrito. Resulta sempre no divisor (5,2); com zero horas,
     a divisão seria 0/0, então fica 0 (o print da planilha mostra 0,00). */
  const premio110 = dsrAcima60 === 0 ? 0 : calcAcima60 / dsrAcima60;
  const totalKmCom = n(v.prodCafe) + n(v.km) + n(v.comissoes) + n(v.premiosOutros);
  const valor = hora * n(v.nHE103);
  const dsrExtra = valor / P.divDsrHE;
  const base = totalKmCom - valor - dsrExtra;
  const manual119 = v.dsr119 !== undefined && v.dsr119 !== null && v.dsr119 !== "";
  const dsr119 = manual119 ? n(v.dsr119) : base / P.divDsrProd;
  const prod117 = base - dsr119;
  const conferencia = valor + dsrExtra + prod117 + dsr119;
  return { feriado012, dobras114, vlrTHE, dsrHE, calcAcima60, dsrAcima60, premio110,
           totalKmCom, valor, dsrExtra, base, prod117, dsr119, conferencia };
}

const Dados = (() => {
  let atual = null; // Guarda os dados do perfil do usuário logado na memória
  let idSessao = null; // id (Auth) de quem entrou NESTA aba, para detectar troca de login em outra aba
  let aoPerderSessao = null;

  // O login fica guardado no navegador e é COMPARTILHADO entre abas do mesmo navegador. Se outra aba entrar com
  // outro usuário (ou sair), esta aba passaria a falar com o banco como a outra pessoa. Aqui isso é detectado
  // e a aba volta para a tela de login, em vez de ficar mostrando dados errados.
  supabaseClient.auth.onAuthStateChange((evento, sessao) => {
    if (!atual) return;
    const outraPessoa = sessao && sessao.user && idSessao && sessao.user.id !== idSessao;
    if (evento === "SIGNED_OUT" || outraPessoa) {
      atual = null; idSessao = null;
      if (aoPerderSessao) aoPerderSessao();
    }
  });

  // Auxiliares internos
  // O Supabase devolve no máximo 1000 linhas por consulta (padrão da API): busca em páginas até acabar.
  async function buscarTudo(montar) {
    const PAGINA = 1000;
    let tudo = [];
    for (let ini = 0; ; ini += PAGINA) {
      const { data, error } = await montar().range(ini, ini + PAGINA - 1);
      if (error) throw new Error(error.message);
      tudo = tudo.concat(data || []);
      if (!data || data.length < PAGINA) return tudo;
    }
  }
  const exigirLogin = () => { if (!atual) throw new Error("Sessão expirada. Entre novamente."); };
  const souMatriz = () => atual && atual.papel === "matriz";
  const podeNaUnidade = (u) => souMatriz() || (atual && atual.unidade === u);

  /* ---------- Sessão ---------- */
  async function entrar(usuarioLogin, senha) {
    // 1. Faz o login primeiro no Supabase Auth usando o e-mail padrão
    const emailFake = `${usuarioLogin.toLowerCase().trim()}@sistema.local`;
    const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
      email: emailFake,
      password: senha,
    });

    if (authError || !authData.session) throw new Error("Usuário ou senha incorretos.");

    // 2. Com a sessão ativa, busca o perfil na tabela public.usuarios usando o ID seguro do Auth
    const { data: profile, error: errProfile } = await supabaseClient
      .from('usuarios')
      .select('*')
      .eq('id', authData.session.user.id)
      .maybeSingle();

    if (errProfile || !profile) throw new Error("Perfil de usuário não encontrado no banco de dados.");
    if (profile.ativo === false) {
      await supabaseClient.auth.signOut();
      throw new Error("Este usuário está desativado. Fale com a matriz.");
    }

    idSessao = authData.session.user.id;
    atual = { usuario: profile.usuario, nome: profile.nome, papel: profile.papel, unidade: profile.unidade };
    return { ...atual };
  }

  async function sair() {
    atual = null; idSessao = null; // antes do signOut, para não disparar o aviso de sessão perdida
    await supabaseClient.auth.signOut();
  }

  function aoPerderSessaoDefinir(fn) { aoPerderSessao = fn; }

  function sessao() {
    return atual ? { ...atual } : null;
  }

  /* ---------- Usuários (logins) ---------- */
  async function usuarios() {
    exigirLogin();
    if (!souMatriz()) throw new Error("Só a matriz gerencia usuários.");
    const { data, error } = await supabaseClient.from('usuarios').select('*');
    if (error) throw new Error(error.message);
    return data.map(({ id, ...resto }) => ({ ...resto, ativo: resto.ativo !== false }));
  }

  async function salvarUsuario(u, loginOriginal) {
    exigirLogin();
    if (!souMatriz()) throw new Error("Só a matriz gerencia usuários.");

    const login = String(u.usuario || "").trim();
    const nome = String(u.nome || "").trim();
    const senha = String(u.senha || "");
    const unidade = u.papel === "lancador" ? String(u.unidade || "").trim() : null;
    const ativo = u.ativo !== false;

    if (!login || /\s/.test(login)) throw new Error("Informe o login, sem espaços.");
    if (!nome) throw new Error("Informe o nome.");
    if (!["matriz", "lancador"].includes(u.papel)) throw new Error("Escolha o perfil.");
    if (u.papel === "lancador" && !unidade) throw new Error("Informe a unidade (filial) do lançador.");

    if (!loginOriginal && !senha) throw new Error("Informe a senha do novo usuário.");

    const euMesmo = loginOriginal && atual.usuario === loginOriginal;
    if (euMesmo && (u.papel !== atual.papel || !ativo)) {
      throw new Error("Você não pode mudar o próprio perfil nem desativar o próprio acesso.");
    }

    // Criar/alterar login roda no servidor (Edge Function "admin-usuarios"), que confere se quem chama é a matriz.
    // O navegador não escreve mais direto em public.usuarios nem cria contas (o cadastro público fica desligado).
    const { data, error } = await supabaseClient.functions.invoke("admin-usuarios", {
      body: { usuario: login, nome, papel: u.papel, unidade, senha, ativo, loginOriginal: loginOriginal || null },
    });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch { /* sem corpo */ }
      throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error);

    if (euMesmo) {
      atual = { usuario: login.toLowerCase(), nome, papel: u.papel, unidade };
    }
  }

  /* ---------- Funcionários ---------- */
  async function funcionarios() {
    exigirLogin();
    if (souMatriz()) {
      // O salário só sai do banco por esta função, que recusa quem não é matriz.
      const dados = await buscarTudo(() => supabaseClient.rpc("listar_funcionarios_matriz").order("codigo"));
      return dados.map((f) => ({ ...f }));
    }
    // Lançador: o banco nem entrega a coluna salario (por isso as colunas são listadas, sem "*").
    const dados = await buscarTudo(() => supabaseClient
      .from("funcionarios")
      .select("codigo, nome, funcao, unidade, ativo")
      .eq("unidade", atual.unidade)
      .order("codigo"));
    return dados.map((f) => ({ ...f }));
  }

  async function salvarFuncionario(f) {
    exigirLogin();
    if (!souMatriz()) throw new Error("Só a matriz pode alterar o cadastro.");

    const { error } = await supabaseClient.rpc("salvar_funcionario", {
      p_codigo: f.codigo, p_nome: f.nome, p_funcao: f.funcao,
      p_unidade: f.unidade, p_salario: f.salario, p_ativo: f.ativo,
    });
    if (error) throw new Error(error.message);
  }

  /* Unidades = as que existem em funcionários ou usuários. A lista fica em cache para as telas lerem sem esperar. */
  let listaUnidades = [];
  async function carregarUnidades() {
    exigirLogin();
    if (!souMatriz()) { listaUnidades = [atual.unidade]; return; }
    const [func, usr] = await Promise.all([
      buscarTudo(() => supabaseClient.from("funcionarios").select("unidade").order("unidade")),
      supabaseClient.from("usuarios").select("unidade"),
    ]);
    listaUnidades = [...new Set([...func, ...(usr.data || [])].map((x) => x.unidade).filter(Boolean))].sort();
  }
  const unidades = () => listaUnidades;

  /* ---------- Período (liberação da matriz) ---------- */
  async function liberacao(comp, uni) {
    const { data } = await supabaseClient
      .from('periodos')
      .select('status')
      .eq('competencia', comp)
      .eq('unidade', uni)
      .maybeSingle();

    if (!data) return "fechado";
    return data.status === "fechado" ? "fechado" : data.status === "encerrado" ? "encerrado" : "aberto";
  }

  async function statusPeriodo(comp, uni) {
    exigirLogin();
    const lib = await liberacao(comp, uni);
    if (lib !== "aberto") return lib;

    // Busca funcionários ativos da unidade
    const { data: todos } = await supabaseClient
      .from('funcionarios')
      .select('codigo')
      .eq('unidade', uni)
      .eq('ativo', true);

    if (!todos || !todos.length) return "aberto";

    // Busca situação das linhas
    const { data: linhas } = await supabaseClient
      .from('linhas_status')
      .select('codigo, status')
      .eq('competencia', comp)
      .eq('unidade', uni);

    const linhasMap = {};
    if (linhas) {
      linhas.forEach(l => { linhasMap[l.codigo] = l.status; });
    }

    const todasConcluidas = todos.every((f) => linhasMap[f.codigo] === "concluido");
    return todasConcluidas ? "concluido" : "aberto";
  }

  async function statusLinhas(comp, uni) {
    exigirLogin();
    if (!podeNaUnidade(uni)) throw new Error("Sem permissão nesta unidade.");

    const { data: todos } = await supabaseClient
      .from('funcionarios')
      .select('codigo')
      .eq('unidade', uni)
      .eq('ativo', true);

    const { data: linhas } = await supabaseClient
      .from('linhas_status')
      .select('codigo, status')
      .eq('competencia', comp)
      .eq('unidade', uni);

    const linhasMap = {};
    if (linhas) {
      linhas.forEach(l => { linhasMap[l.codigo] = l.status; });
    }

    const r = {};
    if (todos) {
      todos.forEach((f) => (r[f.codigo] = linhasMap[f.codigo] === "concluido" ? "concluido" : "aberto"));
    }
    return r;
  }

  async function liberar(comp, uni) {
    exigirLogin();
    if (!souMatriz()) throw new Error("Só a matriz libera o período.");
    const currentLib = await liberacao(comp, uni);
    if (currentLib !== "fechado") return;

    const { error } = await supabaseClient.from('periodos').upsert([{ competencia: comp, unidade: uni, status: "aberto" }]);
    if (error) throw new Error(error.message);
  }

  async function encerrarFilial(comp, uni) {
    exigirLogin();
    if (!souMatriz()) throw new Error("Só a matriz encerra a filial.");
    const statusAtual = await statusPeriodo(comp, uni);
    if (statusAtual !== "concluido") throw new Error("Só dá para encerrar quando todas as linhas estiverem concluídas.");

    // Foto do mês: nome, função, salário, lançamentos e contas como estão agora. O histórico lê daqui.
    const [funcs, vals] = await Promise.all([funcionarios(), lancamentos(comp, uni)]);
    const foto = funcs.filter((f) => f.unidade === uni && f.ativo).map((f) => ({
      competencia: comp, unidade: uni, codigo: f.codigo, nome: f.nome, funcao: f.funcao, salario: f.salario,
      valores: vals[f.codigo] || {}, calculos: calcular(f.salario, vals[f.codigo] || {}),
    }));
    const del = await supabaseClient.from('fechamentos').delete().eq('competencia', comp).eq('unidade', uni);
    if (del.error) throw new Error(del.error.message);
    const ins = await supabaseClient.from('fechamentos').insert(foto);
    if (ins.error) throw new Error(ins.error.message);

    const { error } = await supabaseClient.from('periodos').upsert([{ competencia: comp, unidade: uni, status: "encerrado" }]);
    if (error) throw new Error(error.message);
  }

  /* Foto gravada no encerramento (só a matriz lê: tem salário). Vazio = mês encerrado antes deste recurso. */
  async function fechamento(comp, uni) {
    exigirLogin();
    if (!souMatriz()) throw new Error("Só a matriz consulta o fechamento.");
    return buscarTudo(() => supabaseClient.from('fechamentos').select('*')
      .eq('competencia', comp).eq('unidade', uni).order('codigo'));
  }

  async function concluirLinha(comp, uni, codigo) {
    exigirLogin();
    if (!podeNaUnidade(uni)) throw new Error("Sem permissão nesta unidade.");
    const currentLib = await liberacao(comp, uni);
    if (currentLib !== "aberto") throw new Error("Período não está liberado.");

    const { error } = await supabaseClient.from('linhas_status').upsert([{
      competencia: comp,
      unidade: uni,
      codigo: codigo,
      status: "concluido"
    }]);
    if (error) throw new Error(error.message);
  }

  async function reabrirFilial(comp, uni) {
    exigirLogin();
    if (!souMatriz()) throw new Error("Só a matriz reabre o lançamento.");
    const currentLib = await liberacao(comp, uni);
    if (currentLib === "encerrado") {
      const { error } = await supabaseClient.from('periodos').upsert([{ competencia: comp, unidade: uni, status: "aberto" }]);
      if (error) throw new Error(error.message);
      return;
    }

    // Apaga status das linhas para reabrir todas
    await supabaseClient.from('linhas_status').delete().eq('competencia', comp).eq('unidade', uni);
  }

  /* ---------- Lançamentos ---------- */
  async function lancamentos(comp, uni) {
    exigirLogin();
    if (!podeNaUnidade(uni)) throw new Error("Sem permissão nesta unidade.");

    const data = await buscarTudo(() => supabaseClient
      .from('lancamentos')
      .select('codigo, tipo, valor')
      .eq('competencia', comp)
      .eq('unidade', uni)
      .order('codigo').order('tipo'));

    const saida = {};
    if (data) {
      data.forEach(item => {
        (saida[item.codigo] ||= {})[item.tipo] = item.valor;
      });
    }
    return saida;
  }

  async function salvarLancamento(comp, uni, codigo, tipo, valor) {
    exigirLogin();
    if (!podeNaUnidade(uni)) throw new Error("Sem permissão nesta unidade.");
    
    const col = [...COLUNAS, ...COLUNAS_MATRIZ].find((c) => c.id === tipo);
    if (!col) throw new Error("Coluna desconhecida.");

    const currentLib = await liberacao(comp, uni);
    if (MATRIZ_ONLY.includes(tipo)) {
      if (!souMatriz()) throw new Error("Só a matriz lança esta coluna.");
    } else if (currentLib === "encerrado") {
      throw new Error("A matriz encerrou esta filial: não é mais possível alterar.");
    } else if (currentLib !== "aberto") {
      throw new Error("Período não está aberto para lançamento.");
    }

    if (valor === "") {
      await supabaseClient
        .from('lancamentos')
        .delete()
        .eq('competencia', comp)
        .eq('unidade', uni)
        .eq('codigo', codigo)
        .eq('tipo', tipo);
    } else {
      const valorTratado = col.un === "t" ? String(valor) : String(Number(valor) || 0);
      const { error } = await supabaseClient.from('lancamentos').upsert([{
        competencia: comp,
        unidade: uni,
        codigo: codigo,
        tipo: tipo,
        valor: valorTratado
      }]);
      if (error) throw new Error(error.message);
    }
  }

  /* ---------- Tempo real ---------- */
  // Avisa (aoMudar) quando algo muda nas tabelas. O banco só envia o que o usuário tem permissão de ler (RLS).
  // Ao reconectar depois de uma queda, avisa também, para a tela não ficar com dados velhos.
  function observar(tabelas, aoMudar) {
    exigirLogin();
    const canal = supabaseClient.channel("mudancas-" + Date.now());
    tabelas.forEach((t) => canal.on("postgres_changes", { event: "*", schema: "public", table: t }, () => aoMudar(t)));
    let jaConectou = false;
    canal.subscribe((status) => {
      if (status === "SUBSCRIBED") { if (jaConectou) aoMudar("reconectou"); jaConectou = true; }
    });
    return () => { supabaseClient.removeChannel(canal); };
  }

  return { 
    aoPerderSessao: aoPerderSessaoDefinir, observar, entrar, sair, sessao, usuarios, salvarUsuario, funcionarios, salvarFuncionario, unidades, carregarUnidades, fechamento,
    statusPeriodo, statusLinhas, liberar, concluirLinha, encerrarFilial, reabrirFilial, lancamentos, salvarLancamento 
  };
})();