/* ==========================================================
   app.js — TELAS E EVENTOS
   Só cuida da interface. Todo acesso a dados passa por Dados.*
   (dados.js), então a troca para Supabase não mexe aqui.
   ========================================================== */

/* ---------- Utilidades ---------- */
const $ = (sel) => document.querySelector(sel);
/* Escapa texto antes de pôr em HTML (evita injeção de código) */
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const moeda = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const NOMES_STATUS = { fechado: "Fechado", aberto: "Aberto para lançamento", concluido: "Concluído", encerrado: "Encerrado pela matriz" };
const IMPRIME = ["concluido", "encerrado"]; // status em que a matriz pode imprimir (todas as linhas concluídas)

let usuario = null;      // usuário logado
let calculosFixos = null;   // contas gravadas no encerramento { matrícula: contas }; null = calcula na hora
let funcionariosCache = []; // última lista carregada (para busca e edição)

/* ---------- Login / sessão ---------- */
/* Mostrar/ocultar senha no login (o reset do formulário volta a ocultar) */
function verSenha(mostrar) {
  const botao = $("#btn-ver-senha");
  $("#login-senha").type = mostrar ? "text" : "password";
  botao.setAttribute("aria-pressed", String(mostrar));
  botao.setAttribute("aria-label", mostrar ? "Ocultar senha" : "Mostrar senha");
}
$("#btn-ver-senha").addEventListener("click", () => verSenha($("#login-senha").type === "password"));
$("#form-login").addEventListener("reset", () => verSenha(false));

$("#form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!$("#login-carregando").hidden) return;            // já está entrando
  $("#login-erro").hidden = true;
  $("#login-carregando").hidden = false;
  try {
    usuario = await Dados.entrar($("#login-usuario").value.trim(), $("#login-senha").value);
    await iniciarApp();
  } catch (err) {
    $("#login-carregando").hidden = true;
    $("#login-erro").textContent = err.message;
    $("#login-erro").hidden = false;
  }
});

$("#btn-sair").addEventListener("click", () => {
  pararObservacaoTempoReal();
  Dados.sair();
  usuario = null;
  $("#tela-app").hidden = true;
  $("#tela-login").hidden = false;
  $("#form-login").reset();
});

/* Login mudou em outra aba (ou a sessão acabou): volta para a tela de entrada com um aviso claro */
Dados.aoPerderSessao(() => {
  pararObservacaoTempoReal();
  usuario = null;
  $("#tela-app").hidden = true;
  $("#tela-login").hidden = false;
  $("#form-login").reset();
  $("#login-erro").textContent = "Sua sessão mudou (outro login neste navegador ou sessão expirada). Entre novamente.";
  $("#login-erro").hidden = false;
});

async function iniciarApp() {
  $("#login-carregando").hidden = false;   // bolinhas até a tela principal estar pronta
  try {
    document.body.dataset.papel = usuario.papel; // o CSS usa isto para esconder itens da matriz
    $("#usuario-info").textContent = usuario.nome;

    // Competência padrão = mês atual (formato AAAA-MM)
    $("#competencia").value = new Date().toISOString().slice(0, 7);

    await montarSeletoresUnidade();
    await abrirAba(usuario.papel === "matriz" ? "funcionarios" : "lancamentos");

    $("#tela-login").hidden = true;
    $("#tela-app").hidden = false;
  } finally {
    $("#login-carregando").hidden = true;
  }
  iniciarObservacao();
}

/* Seletor de unidade da aba Lançamentos (matriz escolhe; lançador fica fixo na sua) e filtro de filial do
   cadastro. Refaz as listas mantendo a escolha atual; chamada de novo quando surge unidade nova. */
async function montarSeletoresUnidade() {
  await Dados.carregarUnidades();
  const sel = $("#unidade"), escolhida = sel.value;
  const unidades = usuario.papel === "matriz" ? Dados.unidades() : [usuario.unidade];
  sel.innerHTML = unidades.map((u) => `<option>${esc(u)}</option>`).join("");
  if (unidades.includes(escolhida)) sel.value = escolhida;
  sel.disabled = usuario.papel !== "matriz";
  const filtro = $("#filtro-filial"), filtrada = filtro.value;
  filtro.innerHTML = '<option value="">Todas as filiais</option>' +
    Dados.unidades().map((u) => `<option>${esc(u)}</option>`).join("");
  filtro.value = filtrada; // se a unidade não existir mais, volta para "Todas"
}

/* ---------- Abas ---------- */
document.querySelectorAll(".aba").forEach((b) =>
  b.addEventListener("click", () => abrirAba(b.dataset.aba)));

let abaAtual = "lancamentos";
function abrirAba(nome) {
  abaAtual = nome;
  document.querySelectorAll(".aba").forEach((b) =>
    b.setAttribute("aria-selected", b.dataset.aba === nome));
  $("#aba-funcionarios").hidden = nome !== "funcionarios";
  $("#aba-lancamentos").hidden = nome !== "lancamentos";
  $("#aba-usuarios").hidden = nome !== "usuarios";
  if (nome === "funcionarios") return carregarFuncionarios();
  if (nome === "usuarios") return carregarUsuarios();
  return carregarLancamentos();
}

/* ---------- Aba Usuários (matriz): logins e senhas ---------- */
let usuariosCache = [];
let loginEmEdicao = null; // login original do usuário aberto no diálogo (null = novo)

async function carregarUsuarios() {
  try {
    usuariosCache = await Dados.usuarios();
    $("#msg-usuarios").hidden = true;
    desenharUsuarios();
  } catch (err) { $("#msg-usuarios").textContent = err.message; $("#msg-usuarios").hidden = false; }
}

function desenharUsuarios() {
  const termo = $("#busca-usuario").value.trim().toLowerCase();
  const lista = usuariosCache.filter((u) =>
    u.usuario.toLowerCase().includes(termo) || u.nome.toLowerCase().includes(termo));
  $("#corpo-usuarios").innerHTML = lista.length ? lista.map((u) => `
    <tr class="${u.ativo ? "" : "inativo"}">
      <td>${esc(u.usuario)}</td><td>${esc(u.nome)}</td>
      <td>${u.papel === "matriz" ? "Matriz" : "Lançador"}</td><td>${esc(u.unidade || "—")}</td>
      <td>${u.ativo ? "Ativo" : "Desativado"}</td>
      <td><button class="btn" data-editar-usuario="${esc(u.usuario)}">Editar</button></td>
    </tr>`).join("") : `<tr><td colspan="6">Nenhum usuário encontrado.</td></tr>`;
}
$("#busca-usuario").addEventListener("input", desenharUsuarios);
$("#corpo-usuarios").addEventListener("click", (e) => {
  const login = e.target.dataset.editarUsuario;
  if (login) abrirDialogoUsuario(usuariosCache.find((u) => u.usuario === login));
});

/* A unidade só se aplica ao perfil Lançador */
function ajustarCamposUsuario() {
  $("#u-unidade-box").hidden = $("#u-papel").value !== "lancador";
}
$("#u-papel").addEventListener("change", ajustarCamposUsuario);
$("#u-mostrar").addEventListener("change", (e) => ($("#u-senha").type = e.target.checked ? "text" : "password"));

function abrirDialogoUsuario(u) {
  const novo = !u;
  loginEmEdicao = u?.usuario ?? null;
  $("#usu-titulo").textContent = novo ? "Novo usuário" : "Alterar usuário";
  $("#u-login").value = u?.usuario ?? "";
  $("#u-nome").value = u?.nome ?? "";
  $("#u-papel").value = u?.papel ?? "lancador";
  $("#u-unidade").value = u?.unidade ?? "";
  $("#u-unidades").innerHTML = Dados.unidades().map((x) => `<option value="${esc(x)}">`).join("");
  $("#u-senha").value = "";
  $("#u-senha").required = novo;
  $("#u-senha").type = "password";
  $("#u-mostrar").checked = false;
  $("#u-senha-dica").textContent = novo ? "" : "(deixe em branco para manter a atual)";
  $("#u-ativo").checked = u?.ativo ?? true;
  $("#usu-erro").hidden = true;
  ajustarCamposUsuario();
  $("#dlg-usuario").showModal();
}
$("#btn-novo-usuario").addEventListener("click", () => abrirDialogoUsuario(null));
$("#usu-cancelar").addEventListener("click", () => $("#dlg-usuario").close());

$("#form-usuario").addEventListener("submit", async (e) => {
  e.preventDefault(); // só fecha o diálogo se o salvamento der certo
  try {
    await Dados.salvarUsuario({
      usuario: $("#u-login").value, nome: $("#u-nome").value, papel: $("#u-papel").value,
      unidade: $("#u-unidade").value, senha: $("#u-senha").value, ativo: $("#u-ativo").checked,
    }, loginEmEdicao);
    usuario = Dados.sessao() || usuario;          // se alterou o próprio cadastro, atualiza o nome no topo
    $("#usuario-info").textContent = usuario.nome;
    $("#dlg-usuario").close();
    await montarSeletoresUnidade(); // login de lançador pode ter criado uma unidade nova
    carregarUsuarios();
  } catch (err) {
    $("#usu-erro").textContent = err.message;
    $("#usu-erro").hidden = false;
  }
});

/* ---------- Aba Funcionários (matriz) ---------- */
async function carregarFuncionarios() {
  funcionariosCache = await Dados.funcionarios();
  desenharFuncionarios();
}

function desenharFuncionarios() {
  const termo = $("#busca-func").value.trim().toLowerCase();
  const filial = $("#filtro-filial").value; // "" = todas
  const lista = funcionariosCache.filter((f) =>
    (filial === "" || f.unidade === filial) &&
    (f.nome.toLowerCase().includes(termo) || f.codigo.toLowerCase().includes(termo)));
  $("#corpo-func").innerHTML = lista.length ? lista.map((f) => `
    <tr class="${f.ativo ? "" : "inativo"}">
      <td>${esc(f.codigo)}</td><td>${esc(f.nome)}</td><td>${esc(f.funcao)}</td>
      <td>${esc(f.unidade)}</td><td class="num">${moeda(f.salario)}</td>
      <td>${f.ativo ? "Ativo" : "Inativo"}</td>
      <td><button class="btn" data-editar="${esc(f.codigo)}">Editar</button></td>
    </tr>`).join("") : `<tr><td colspan="7">Nenhum funcionário encontrado.</td></tr>`;
}
$("#busca-func").addEventListener("input", desenharFuncionarios);
$("#filtro-filial").addEventListener("change", desenharFuncionarios);
$("#corpo-func").addEventListener("click", (e) => {
  const cod = e.target.dataset.editar;
  if (cod) abrirDialogo(funcionariosCache.find((f) => f.codigo === cod));
});

/* Diálogo de cadastro/edição */
function abrirDialogo(f) {
  const novo = !f;
  $("#dlg-titulo").textContent = novo ? "Novo funcionário" : "Editar funcionário";
  $("#f-codigo").value = f?.codigo ?? "";
  $("#f-codigo").readOnly = !novo; // o código identifica o funcionário: não muda depois de criado
  $("#f-nome").value = f?.nome ?? "";
  $("#f-nome").readOnly = !novo;    // ao alterar, só status, função e salário mudam
  $("#f-funcao").value = f?.funcao ?? "";
  // Unidade: lista das existentes; o "+" troca a lista por um campo para digitar uma unidade nova
  const sel = $("#f-unidade");
  sel.innerHTML = '<option value="">Selecione a unidade</option>' +
    Dados.unidades().map((u) => `<option>${esc(u)}</option>`).join("");
  sel.value = f?.unidade ?? $("#filtro-filial").value; // novo: já vem a filial filtrada na tela, se houver
  sel.disabled = !novo;                                // a filial não muda depois de cadastrado
  $("#btn-nova-unidade").hidden = !novo;
  modoUnidadeNova(false);
  $("#f-salario").value = f?.salario ?? "";
  $("#f-ativo").checked = f?.ativo ?? true;
  $("#func-erro").hidden = true;
  $("#dlg-func").showModal();
}
/* Alterna entre escolher a unidade na lista e digitar uma nova (botão "+" / "Lista") */
function modoUnidadeNova(nova) {
  $("#f-unidade").hidden = nova;
  $("#f-unidade").required = !nova;
  $("#f-unidade-nova").hidden = !nova;
  $("#f-unidade-nova").required = nova;
  $("#f-unidade-nova").value = "";
  $("#btn-nova-unidade").textContent = nova ? "Lista" : "+";
  $("#btn-nova-unidade").title = nova ? "Voltar para a lista de unidades" : "Cadastrar uma nova unidade";
  if (nova) $("#f-unidade-nova").focus();
}
$("#btn-nova-unidade").addEventListener("click", () => modoUnidadeNova($("#f-unidade-nova").hidden));

/* Unidade escolhida no formulário: a da lista ou a nova digitada */
function unidadeDoFormulario() {
  if ($("#f-unidade-nova").hidden) return $("#f-unidade").value.trim();
  const nome = $("#f-unidade-nova").value.trim().replace(/\s+/g, " ");
  // Se já existir (sem diferenciar maiúscula), usa a existente em vez de criar duplicada
  return Dados.unidades().find((u) => u.toLowerCase() === nome.toLowerCase()) ?? nome;
}
$("#btn-novo-func").addEventListener("click", () => abrirDialogo(null));
$("#btn-cancelar").addEventListener("click", () => $("#dlg-func").close());

$("#form-func").addEventListener("submit", async (e) => {
  e.preventDefault(); // mantém o diálogo aberto até o salvamento dar certo
  const codigo = $("#f-codigo").value.trim();
  const existe = funcionariosCache.some((f) => f.codigo === codigo);
  if (existe && !$("#f-codigo").readOnly) {
    $("#func-erro").textContent = "Já existe um funcionário com este código.";
    $("#func-erro").hidden = false;
    return;
  }
  try {
    await Dados.salvarFuncionario({
      codigo, nome: $("#f-nome").value.trim(), funcao: $("#f-funcao").value.trim(),
      unidade: unidadeDoFormulario(), salario: Number($("#f-salario").value),
      ativo: $("#f-ativo").checked,
    });
    $("#dlg-func").close();
    await montarSeletoresUnidade(); // se a unidade é nova, já aparece nos filtros e na aba Lançamentos
    carregarFuncionarios();
  } catch (err) {
    $("#func-erro").textContent = err.message;
    $("#func-erro").hidden = false;
  }
});

/* ---------- Aba Lançamentos ---------- */
$("#competencia").addEventListener("change", carregarLancamentos);
$("#unidade").addEventListener("change", carregarLancamentos);

function mostrarMsg(texto) {
  $("#msg-lanc").textContent = texto || "";
  $("#msg-lanc").hidden = !texto;
}

/* Procura uma coluna pelo id e marca o tipo: sat (lançada na satélite), mat (lançada na matriz), calc (conta) */
const colunaPorId = (id) => [
  ...COLUNAS.map((c) => ({ ...c, tipo: "sat" })),
  ...COLUNAS_MATRIZ.map((c) => ({ ...c, tipo: "mat" })),
  ...CALCULADAS.map((c) => ({ ...c, tipo: "calc" })),
].find((c) => c.id === id);

/* Formata conforme a unidade da coluna */
const fmt = (n, un) => un === "R$" ? moeda(n) : Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 4 });

/* Lê os campos de uma linha como { coluna: valor } (vazio fica "": importa para o 119 manual) */
function lerLinha(tr) {
  const v = {};
  tr.querySelectorAll("input[data-tipo]").forEach((i) => (v[i.dataset.tipo] = i.value));
  return v;
}
/* Contas da linha: as gravadas no encerramento (histórico) ou, com o mês aberto, calculadas agora */
const contasDa = (tr) => calculosFixos?.[tr.dataset.cod] ?? calcular(Number(tr.dataset.sal), lerLinha(tr));
/* Recalcula as colunas calculadas da linha (só a matriz as vê) */
function preencherCalculos(tr) {
  const r = contasDa(tr);
  tr.querySelectorAll("[data-calc]").forEach((td) => (td.textContent = fmt(r[td.dataset.calc], td.dataset.un)));
  // 119 vazio = valor sugerido (base ÷ divisor), mostrado em cinza dentro do campo
  const campo119 = tr.querySelector('input[data-tipo="dsr119"]');
  if (campo119) campo119.placeholder = moeda(r.dsr119);

  // Destaque amarelo: se a satélite lançou horas em "103 - H. extra até 60 hs" (coluna 13),
  // a célula "103 - Nº h. extras" (coluna 25) da mesma linha fica amarela. Vazio ou 0 não conta.
  const temHE = (Number(lerLinha(tr).heAte60) || 0) > 0;
  const celula103 = tr.querySelector('input[data-tipo="nHE103"]')?.closest("td");
  if (celula103) {
    celula103.classList.toggle("destaque-amarelo", temHE);
    celula103.title = temHE ? "Há horas lançadas em 103 - H. extra até 60 hs" : "";
  }
}

let ctxSat = null;                // dados da tela do lançador (usados pelo formulário)
let codigoAberto = null;          // matrícula do formulário aberto
let fila = Promise.resolve();     // grava os campos do formulário em ordem
const falhas = new Set();         // campos que não foram gravados (bloqueiam o Concluído)
const UN_TXT = { h: "horas", d: "dias", "R$": "R$", t: "" };

async function carregarLancamentos() {
  const comp = $("#competencia").value, uni = $("#unidade").value;
  if (!comp || !uni) return;
  mostrarMsg("");
  try {
    const [status, todos, valores, linhas] = await Promise.all([
      Dados.statusPeriodo(comp, uni), Dados.funcionarios(), Dados.lancamentos(comp, uni), Dados.statusLinhas(comp, uni),
    ]);
    const matriz = usuario.papel === "matriz";
    let lista = todos.filter((f) => f.unidade === uni && f.ativo);
    // Mês encerrado: mostra a foto do encerramento (salário, contas e lista de quem estava), não o cadastro de hoje
    calculosFixos = null;
    if (matriz && status === "encerrado") {
      const foto = await Dados.fechamento(comp, uni);
      if (foto.length) {
        lista = foto.map((r) => ({ codigo: r.codigo, nome: r.nome, funcao: r.funcao, salario: r.salario, valores: r.valores }));
        calculosFixos = Object.fromEntries(foto.map((r) => [r.codigo, r.calculos]));
      }
    }
    const concluidas = lista.filter((f) => linhas[f.codigo] === "concluido").length;
    $("#status-periodo").className = `status status--${status}`;
    $("#status-periodo").textContent = NOMES_STATUS[status];
    $("#contagem").textContent = status === "fechado" ? "" : `${concluidas} de ${lista.length} linhas concluídas`;
    desenharAcoes(status, comp, uni);
    // Imprimir: só a matriz, e só quando a filial concluiu todas as linhas
    $("#btn-imprimir").disabled = !IMPRIME.includes(status);
    $("#btn-imprimir").title = IMPRIME.includes(status) ? "" : "Disponível quando a filial concluir todas as linhas";
    $("#btn-contraprova").disabled = status === "fechado";
    $("#caixa-tabela").hidden = !matriz;
    $("#lista-satelite").hidden = matriz;
    if (status === "fechado" && !matriz) mostrarMsg("Aguardando a matriz liberar o período.");
    if (status === "encerrado" && !matriz) mostrarMsg("A matriz encerrou esta filial: os lançamentos estão somente para consulta.");
    if (status === "encerrado" && matriz) mostrarMsg(calculosFixos
      ? "Histórico fixo: salários, contas e funcionários como estavam no encerramento."
      : "Encerrado antes do histórico fixo: valores calculados com o cadastro atual. Reabra e encerre de novo para congelar.");
    if (status === "aberto" && matriz) mostrarMsg("Atenção: esta filial ainda não concluiu todas as linhas; os números podem mudar.");

    // Lançador: lista de funcionários + formulário
    if (!matriz) { ctxSat = { comp, uni, status, valores, linhas, lista }; desenharListaSatelite(); return; }

    // Matriz: 31 colunas na ordem exata da planilha (entradas e contas intercaladas)
    const cols = LAYOUT_MATRIZ.map(colunaPorId);
    const th = (t, c = "", id = "", un = "") => `<th class="${c}" data-col="${id}" data-un="${un}">${esc(t)}</th>`;
    $("#cab-lanc").innerHTML = "<tr>" + th("Matrícula", "", "matricula") + th("Nome", "", "nome") +
      th("Salário", "num", "salario") + th("Função", "", "funcao") +
      cols.map((c) => th(c.rotulo, "num" + (c.tipo === "calc" ? " calc" : ""), c.id, c.un)).join("") + "</tr>";
    $("#corpo-lanc").innerHTML = lista.length ? lista.map((f) => {
      const v = f.valores ?? valores[f.codigo] ?? {};
      const ok = linhas[f.codigo] === "concluido";
      const marca = status === "fechado" ? "" : ok ? "mat-ok" : "mat-aberta";
      const leitor = status === "fechado" ? "" : `<span class="so-leitor"> ${ok ? "concluído" : "em aberto"}</span>`;
      const celulas = cols.map((c) => c.tipo === "calc"
        ? `<td class="num" data-col="${c.id}" data-calc="${c.id}" data-un="${c.un}"></td>`
        : `<td class="num" data-col="${c.id}" data-un="${c.un}"><input type="${c.un === "t" ? "text" : "number"}"
            step="0.01" min="0" data-tipo="${c.id}" value="${esc(v[c.id] ?? "")}" ${c.tipo === "mat" && !calculosFixos ? "" : "disabled"}
            aria-label="${esc(c.rotulo)} de ${esc(f.nome)}"></td>`).join("");
      return `<tr data-cod="${esc(f.codigo)}" data-sal="${f.salario}">
        <td class="${marca}" data-col="matricula">${esc(f.codigo)}${leitor}</td><td data-col="nome">${esc(f.nome)}</td>
        <td class="num" data-col="salario">${moeda(f.salario)}</td><td data-col="funcao">${esc(f.funcao)}</td>${celulas}</tr>`;
    }).join("") : `<tr><td colspan="9">Nenhum funcionário ativo nesta unidade.</td></tr>`;
    document.querySelectorAll("#corpo-lanc tr[data-cod]").forEach((tr) => preencherCalculos(tr));
  } catch (err) { mostrarMsg(err.message); }
}

/* ---------- Satélite: lista de funcionários e formulário ---------- */
function desenharListaSatelite() {
  const { status, linhas, lista } = ctxSat;
  $("#lista-satelite").innerHTML = lista.length ? lista.map((f) => {
    const ok = linhas[f.codigo] === "concluido";
    const cls = status === "fechado" ? "" : ok ? "linha-func--ok" : "linha-func--aberta";
    const texto = status === "fechado" ? "Aguardando liberação" : status === "encerrado" ? "Encerrado (somente consulta)"
      : ok ? "Concluído (pode alterar)" : "Em aberto";
    return `<button type="button" class="linha-func ${cls}" data-abrir="${esc(f.codigo)}" ${status === "fechado" ? "disabled" : ""}>
      <strong>${esc(f.nome)}</strong><span>Matrícula ${esc(f.codigo)} - ${esc(f.funcao)}</span><em>${texto}</em></button>`;
  }).join("") : "<p>Nenhum funcionário ativo nesta unidade.</p>";
}
$("#lista-satelite").addEventListener("click", (e) => {
  const b = e.target.closest("[data-abrir]");
  if (b) abrirFormulario(b.dataset.abrir);
});

function abrirFormulario(cod) {
  const { status, valores, linhas, lista } = ctxSat;
  const f = lista.find((x) => x.codigo === cod), ok = linhas[cod] === "concluido", v = valores[cod] || {};
  const travado = status === "encerrado"; // só a matriz encerrando trava; linha concluída continua editável
  codigoAberto = cod; falhas.clear();
  $("#lanc-titulo").textContent = f.nome;
  $("#lanc-sub").textContent = `Matrícula ${f.codigo} - ${f.funcao} - ` +
    (travado ? "filial encerrada pela matriz (somente leitura)"
      : ok ? "concluído; cada campo alterado é salvo ao sair dele, até a matriz encerrar a filial"
      : "cada campo é salvo ao sair dele; só vira verde ao clicar em Concluído");
  $("#lanc-campos").innerHTML = COLUNAS.map((c) => `<label>${esc(c.rotulo)}${UN_TXT[c.un] ? " (" + UN_TXT[c.un] + ")" : ""}
    <input data-tipo="${c.id}" type="${c.un === "t" ? "text" : "number"}" step="0.01" min="0" inputmode="decimal"
      value="${esc(v[c.id] ?? "")}" ${travado ? "disabled" : ""}></label>`).join("");
  $("#lanc-concluir").hidden = ok || travado;
  $("#lanc-fechar").textContent = ok || travado ? "Fechar" : "Fechar (continua em aberto)";
  $("#lanc-erro").hidden = true;
  $("#dlg-lanc").showModal();
}

/* Autosave: grava cada campo ao sair dele (sobrevive a fechar a aba sem concluir) */
$("#lanc-campos").addEventListener("change", (e) => {
  const campo = e.target;
  if (!campo.dataset.tipo) return;
  const { comp, uni } = ctxSat, cod = codigoAberto, tipo = campo.dataset.tipo, valor = campo.value;
  fila = fila.then(() => Dados.salvarLancamento(comp, uni, cod, tipo, valor))
    .then(() => { (ctxSat.valores[cod] ||= {})[tipo] = valor; falhas.delete(tipo); })
    .catch((err) => { falhas.add(tipo); $("#lanc-erro").textContent = err.message; $("#lanc-erro").hidden = false; });
});
$("#lanc-fechar").addEventListener("click", () => $("#dlg-lanc").close());
$("#form-lanc").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await fila; // espera os campos pendentes serem gravados
    if (falhas.size) throw new Error("Há campo que não foi salvo. Corrija e tente de novo.");
    await Dados.concluirLinha(ctxSat.comp, ctxSat.uni, codigoAberto);
    $("#dlg-lanc").close();
    carregarLancamentos();
  } catch (err) { $("#lanc-erro").textContent = err.message; $("#lanc-erro").hidden = false; }
});

/* ---------- Matriz: imprimir colunas escolhidas ---------- */
$("#btn-imprimir").addEventListener("click", () => {
  const colunas = [...document.querySelectorAll("#cab-lanc th")].filter((t) => !["matricula", "nome"].includes(t.dataset.col));
  $("#imp-colunas").innerHTML = colunas.map((t) => `<label class="check"><input type="checkbox" value="${esc(t.dataset.col)}"> ${esc(t.textContent.trim())}</label>`).join("");
  $("#imp-erro").hidden = true;
  $("#dlg-imprimir").showModal();
});
const marcarTodas = (v) => document.querySelectorAll("#imp-colunas input").forEach((i) => (i.checked = v));
$("#imp-todas").addEventListener("click", () => marcarTodas(true));
$("#imp-nenhuma").addEventListener("click", () => marcarTodas(false));
$("#imp-cancelar").addEventListener("click", () => $("#dlg-imprimir").close());
$("#form-imprimir").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ids = [...document.querySelectorAll("#imp-colunas input:checked")].map((i) => i.value);
  const comp = $("#competencia").value, uni = $("#unidade").value;
  try {
    // Confere de novo no momento de imprimir (a matriz pode ter reaberto a filial)
    if (!IMPRIME.includes(await Dados.statusPeriodo(comp, uni))) throw new Error("A filial ainda não concluiu todas as linhas.");
    if (!ids.length) throw new Error("Marque ao menos uma coluna.");
    const todas = [...document.querySelectorAll("#corpo-lanc tr[data-cod]")];
    const linhas = $("#imp-so-dados").checked ? todas.filter((tr) => temDadoNasColunas(tr, ids)) : todas;
    if (!linhas.length) throw new Error("Nenhum funcionário tem dados nas colunas marcadas.");
    $("#dlg-imprimir").close();
    imprimirColunas(ids, comp, uni, linhas, todas.length);
  } catch (err) { $("#imp-erro").textContent = err.message; $("#imp-erro").hidden = false; }
});

/* A linha "tem dado" se QUALQUER uma das colunas marcadas estiver preenchida:
   texto (ex.: Controle Nice) não vazio, ou número diferente de zero (0 e vazio contam como sem dado).
   Colunas de conta e o 119 em branco usam o valor calculado, que é o mesmo que sai impresso. */
function temDadoNasColunas(tr, ids) {
  const v = lerLinha(tr), r = contasDa(tr);
  return ids.some((id) => {
    if (id in r) return Math.abs(r[id]) >= 0.005;             // conta (menos de 1 centavo = zero)
    const bruto = String(v[id] ?? "").trim();
    if (bruto === "") return false;
    return colunaPorId(id).un === "t" ? true : Number(bruto) !== 0;
  });
}

/* Monta uma tabela só com as colunas marcadas (na ordem da matriz) e as linhas escolhidas, e chama a impressão */
function imprimirColunas(ids, comp, uni, linhas, totalFuncionarios) {
  const ths = [...document.querySelectorAll("#cab-lanc th")].filter((t) => ["matricula", "nome", ...ids].includes(t.dataset.col));
  const valorDe = (tr, t) => {
    if (t.dataset.col === "matricula") return tr.dataset.cod;
    const td = tr.querySelector(`td[data-col="${t.dataset.col}"]`), i = td.querySelector("input");
    if (!i) return td.textContent.trim();
    if (i.value === "") return i.placeholder || ""; // 119 vazio: imprime o valor sugerido que está em uso
    return i.type === "text" ? i.value : fmt(i.value, td.dataset.un);
  };
  const resumo = linhas.length === totalFuncionarios ? `${linhas.length} funcionários`
    : `${linhas.length} de ${totalFuncionarios} funcionários (só os que têm dados nas colunas)`;
  $("#area-impressao").innerHTML = `<h1>Lançamentos de pessoal</h1>
    <p>Filial: ${esc(uni)} - Competência: ${esc(comp.split("-").reverse().join("/"))} - ${esc(resumo)} - Emitido em ${esc(new Date().toLocaleString("pt-BR"))} por ${esc(usuario.nome)}</p>
    <table><thead><tr>${ths.map((t) => `<th class="${t.classList.contains("num") ? "num" : ""}">${esc(t.textContent.trim())}</th>`).join("")}</tr></thead>
    <tbody>${linhas.map((tr) => "<tr>" + ths.map((t) => `<td class="${t.classList.contains("num") ? "num" : ""}">${esc(valorDe(tr, t))}</td>`).join("") + "</tr>").join("")}</tbody></table>`;
  window.print();
}

/* ---------- Satélite: contraprova (cópia do lançamento) ----------
   Imprime (ou salva em PDF) TODOS os funcionários ativos da unidade e TODAS as colunas lançadas,
   mesmo as vazias, para a filial guardar o que lançou. Lê os dados de novo, para sair o que está gravado. */
$("#btn-contraprova").addEventListener("click", async () => {
  const comp = $("#competencia").value, uni = $("#unidade").value;
  try {
    const [lista, valores, linhas] = await Promise.all([
      Dados.funcionarios(), Dados.lancamentos(comp, uni), Dados.statusLinhas(comp, uni)]);
    const func = lista.filter((f) => f.unidade === uni && f.ativo);
    const celula = (v, c) => (v === undefined || v === null || v === "") ? "" : c.un === "t" ? String(v) : fmt(v, c.un);
    $("#area-impressao").innerHTML = `<h1>Contraprova do lançamento</h1>
      <p>Filial: ${esc(uni)} - Competência: ${esc(comp.split("-").reverse().join("/"))} - ${func.length} funcionários -
      Emitido em ${esc(new Date().toLocaleString("pt-BR"))} por ${esc(usuario.nome)}</p>
      <table><thead><tr><th>Matrícula</th><th>Nome</th>${COLUNAS.map((c) => `<th class="${c.un === "t" ? "" : "num"}">${esc(c.rotulo)}</th>`).join("")}<th>Situação</th></tr></thead>
      <tbody>${func.map((f) => { const v = valores[f.codigo] || {};
        return `<tr><td>${esc(f.codigo)}</td><td>${esc(f.nome)}</td>${COLUNAS.map((c) => `<td class="${c.un === "t" ? "" : "num"}">${esc(celula(v[c.id], c))}</td>`).join("")}
        <td>${linhas[f.codigo] === "concluido" ? "Concluído" : "Em aberto"}</td></tr>`; }).join("")}</tbody></table>`;
    window.print();
  } catch (err) { mostrarMsg(err.message); }
});

/* Botões disponíveis em cada status (quem pode o quê é conferido de novo em dados.js).
   A conclusão agora é por linha (formulário do lançador); a filial fica "concluída" quando todas as linhas estão. */
function desenharAcoes(status, comp, uni) {
  const matriz = usuario.papel === "matriz";
  const acoes = {
    fechado:   matriz ? [["Liberar para lançamento", () => Dados.liberar(comp, uni), true]] : [],
    aberto:    [],
    concluido: matriz ? [
      ["Encerrar filial", async () => {
        if (!confirm("Encerrar esta filial? A unidade não poderá mais alterar nenhum dado (você pode reabrir depois).")) return;
        await Dados.encerrarFilial(comp, uni);
      }, true],
      ["Reabrir filial", () => Dados.reabrirFilial(comp, uni), false],
    ] : [],
    encerrado: matriz ? [["Reabrir filial", () => Dados.reabrirFilial(comp, uni), false]] : [],
  }[status];

  $("#acoes").innerHTML = "";
  acoes.forEach(([rotulo, fn, primario]) => {
    const b = document.createElement("button");
    b.className = "btn" + (primario ? " btn--primario" : "");
    b.textContent = rotulo;
    b.addEventListener("click", async () => {
      try { await fn(); carregarLancamentos(); } catch (err) { mostrarMsg(err.message); }
    });
    $("#acoes").appendChild(b);
  });
}

/* Ao alterar um campo: grava (upsert) e, na matriz, recalcula as contas da linha */
$("#corpo-lanc").addEventListener("change", async (e) => {
  const campo = e.target;
  if (!campo.dataset.tipo) return;
  const linha = campo.closest("tr");
  try {
    await Dados.salvarLancamento($("#competencia").value, $("#unidade").value,
      linha.dataset.cod, campo.dataset.tipo, campo.value);
    if (usuario.papel === "matriz") preencherCalculos(linha);
  } catch (err) { mostrarMsg(err.message); carregarLancamentos(); }
});

/* ---------- Atualização da tela ---------- */
function atualizarTela() {
  if (!usuario) return;
  if (abaAtual === "funcionarios") carregarFuncionarios();
  else if (abaAtual === "usuarios") carregarUsuarios();
  else carregarLancamentos();
}
$("#btn-atualizar").addEventListener("click", atualizarTela);

/* Outra aba alterou os dados: atualiza a tela, sem apagar o que está sendo digitado */
window.addEventListener("dados-mudaram", () => {
  if (!usuario) return;
  if (document.activeElement && document.activeElement.closest("#corpo-lanc")) {
    mostrarMsg("Há dados novos: clique em Atualizar quando terminar de digitar.");
    return;
  }
  atualizarTela();
});

/* Atualização em tempo real (Supabase Realtime): quando a matriz libera/encerra ou alguém conclui uma linha,
   o banco avisa e a tela se atualiza sozinha, sem recarregar de tempos em tempos.
   Não atualiza enquanto há janela aberta ou alguém digitando na tabela da matriz: deixa pendente e atualiza
   assim que a pessoa terminar. */
let pararObservacao = null, timerAuto = null, atualizandoAuto = false, pendenteAuto = false;

function bloqueadoParaAtualizar() {
  if (document.querySelector("dialog[open]")) return true;
  const foco = document.activeElement;
  return !!(foco && foco.closest("#corpo-lanc") && foco.matches("input, select, textarea"));
}
async function atualizacaoAutomatica() {
  if (!usuario || abaAtual !== "lancamentos") return;
  if (document.hidden || bloqueadoParaAtualizar()) { pendenteAuto = true; return; }
  if (atualizandoAuto) { pendenteAuto = true; return; }
  atualizandoAuto = true; pendenteAuto = false;
  try { await carregarLancamentos(); } finally { atualizandoAuto = false; }
  if (pendenteAuto) agendarAtualizacao();
}
function agendarAtualizacao() { clearTimeout(timerAuto); timerAuto = setTimeout(atualizacaoAutomatica, 1500); }

function iniciarObservacao() {
  pararObservacao?.();
  // O lançador só precisa saber do período e das linhas; a matriz também vê os lançamentos chegando.
  const tabelas = usuario.papel === "matriz" ? ["periodos", "linhas_status", "lancamentos"] : ["periodos", "linhas_status"];
  pararObservacao = Dados.observar(tabelas, agendarAtualizacao);
}
function pararObservacaoTempoReal() { pararObservacao?.(); pararObservacao = null; clearTimeout(timerAuto); }

// Pendências: ao fechar uma janela, sair do campo ou voltar para a aba do navegador, atualiza se ficou algo para trás.
document.addEventListener("close", () => { if (pendenteAuto) agendarAtualizacao(); }, true);
document.addEventListener("focusout", () => { if (pendenteAuto) setTimeout(agendarAtualizacao, 300); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) agendarAtualizacao(); });

/* Ao abrir ou recarregar a página, retoma o login desta aba (não pede senha de novo) */
const sessaoSalva = Dados.sessao();
if (sessaoSalva) { usuario = sessaoSalva; iniciarApp(); }

/* ---------- Modo escuro: o boneco vem da direita, vira o interruptor e vai embora ---------- */
const raiz = document.documentElement;
const dormindo = (ms) => new Promise((ok) => setTimeout(ok, ms));
function aplicarTema(escuro) {
  raiz.dataset.tema = escuro ? "dark" : "";
  try { localStorage.setItem("tema", raiz.dataset.tema); } catch { /* sem armazenamento: vale só nesta sessão */ }
  $("#rotulo-tema").textContent = escuro ? "Modo claro" : "Modo escuro";
}

async function cenaInterruptor(escurecer) {
  const boneco = $("#boneco"), cena = $("#cena"), inter = $("#interruptor");
  const PARADA = 42, FORA = innerWidth + 60;
  const VELOCIDADE = 0.28;                           // px por ms: para ele andar mais devagar, diminua
  const FREIO = { ms: 400, px: 56 };                 // ele desacelera ao chegar e acelera ao sair (px = v·t/2, sem tranco)
  const ms = Math.min(5000, Math.max(2200, (FORA - PARADA - FREIO.px) / VELOCIDADE + FREIO.ms));
  // a cadência dos passos acompanha a velocidade real (cerca de 70px por passo), para o pé não "escorregar"
  boneco.style.setProperty("--passo", Math.min(450, Math.max(260, 70 / ((FORA - PARADA) / ms))) + "ms");
  const t = FREIO.ms / ms;
  const chegar = () => boneco.animate([
    { transform: `translateX(${FORA}px)`, offset: 0, easing: "linear" },
    { transform: `translateX(${PARADA + FREIO.px}px)`, offset: 1 - t, easing: "cubic-bezier(.5, 1, .89, 1)" },
    { transform: `translateX(${PARADA}px)`, offset: 1 }], { duration: ms, fill: "forwards" }).finished;
  const sair = () => boneco.animate([
    { transform: `translateX(${PARADA}px)`, offset: 0, easing: "cubic-bezier(.11, 0, .5, 0)" },
    { transform: `translateX(${PARADA + FREIO.px}px)`, offset: t, easing: "linear" },
    { transform: `translateX(${FORA}px)`, offset: 1 }], { duration: ms, fill: "forwards" }).finished;

  // Poses: congela a caminhada onde ela estiver e leva cada articulação até o ângulo pedido (sem estalo)
  const partes = [...boneco.querySelectorAll(".perna, .joelho, .braco, .cotovelo, .tronco, .cabeca")];
  const congelar = () => {
    const atuais = partes.map((el) => getComputedStyle(el).transform);
    partes.forEach((el, i) => { el.style.animation = "none"; el.style.transform = atuais[i]; });
    void boneco.offsetWidth;
  };
  const soltar = () => partes.forEach((el) => { el.style.animation = ""; el.style.transform = ""; el.style.transition = ""; });
  const pose = (angulos, dur) => {
    for (const [classe, graus] of Object.entries(angulos)) {
      const el = boneco.querySelector("." + classe);
      el.style.transition = `transform ${dur}ms ease-in-out`;
      el.style.transform = `rotate(${graus}deg)`;
    }
  };
  const PARADO = { "perna-a": 5, "perna-b": -6, "joelho-a": -3, "joelho-b": -3, "braco-a": 0, "braco-b": 0, "cotovelo-a": 8, "cotovelo-b": 8, tronco: 0, cabeca: 0 };

  inter.dataset.ligado = String(escurecer);          // quem vai apagar encontra a luz acesa (e vice-versa)
  boneco.className = "boneco anda";
  cena.hidden = false;
  await chegar();                                    // da direita para a esquerda, freando no fim
  congelar();
  boneco.className = "boneco";
  pose({ ...PARADO, "braco-a": 82, "cotovelo-a": 14, "braco-b": 10, "cotovelo-b": 20, tronco: -6, cabeca: -4 }, 320);   // inclina e estende o braço
  await dormindo(420);
  pose({ "braco-a": 90, "cotovelo-a": 2, tronco: -8 }, 110);                      // empurra a alavanca
  await dormindo(90);
  inter.dataset.ligado = String(!escurecer);         // vira o interruptor
  raiz.classList.add("trocando");
  aplicarTema(escurecer);
  await dormindo(160);
  boneco.className = "boneco pula";                  // saltinho de satisfação, braço solto
  pose({ ...PARADO, "cotovelo-a": 22, "braco-b": -8, cabeca: 3 }, 300);
  await dormindo(340);
  raiz.classList.remove("trocando");
  boneco.className = "boneco volta";                 // vira de lado; no meio da meia-volta (quase sem largura) retoma a caminhada
  await dormindo(90);
  soltar();
  boneco.className = "boneco anda volta";
  await sair();                                      // vai embora, acelerando
  boneco.getAnimations().forEach((x) => x.cancel());
  soltar();
  boneco.className = "boneco";
  cena.hidden = true;
}

let trocandoTema = false;
$("#btn-tema").addEventListener("click", async () => {
  if (trocandoTema) return;
  trocandoTema = true;
  const escurecer = raiz.dataset.tema !== "dark";
  try {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) aplicarTema(escurecer);  // sem animação para quem pediu
    else await cenaInterruptor(escurecer);
  } finally { trocandoTema = false; }
});
$("#rotulo-tema").textContent = raiz.dataset.tema === "dark" ? "Modo escuro" : "Modo claro";
