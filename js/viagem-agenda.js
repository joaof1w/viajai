/* Aba Agenda (calendário): visões por dia, semana e linha do tempo, com conflitos. */

const Agenda = { dados: null, visao: "dia", diaSelecionado: null };

Painel.registrar("agenda", {
  rotulo: "Agenda",
  icone: "🗓️",
  async render(painel) {
    Agenda.dados = await Api.calendario(Painel.id);
    const dias = Agenda.dados.dias;
    if (!Agenda.diaSelecionado || !dias.includes(Agenda.diaSelecionado)) {
      Agenda.diaSelecionado = dias.includes(hojeIso()) ? hojeIso() : dias[0];
    }
    desenharAgenda(painel);
  },
});

function eventosDoDia(dataIso) {
  return Agenda.dados.eventos.filter((e) => e.inicio.slice(0, 10) === dataIso);
}

function cartaoEvento(e, mini = false) {
  return `<button type="button" class="evento ${e.origem === "roteiro" ? "evento--roteiro" : ""} ${e.conflito ? "evento--conflito" : ""} ${mini ? "evento--mini" : ""}"
      data-evento="${e.chave}">
      <strong>${escapar(e.icone || "")} ${escapar(e.titulo)}</strong>
      <span>${Formato.hora(e.inicio)}–${Formato.hora(e.fim)}${mini ? "" : ` · ${escapar(e.tipo_rotulo || "")}`}
        ${e.origem === "roteiro" ? (mini ? "" : " · do roteiro") : ""}${e.horario_sugerido && !mini ? " (horário sugerido)" : ""}
        ${e.conflito ? " · ⚠ conflito" : ""}</span>
      ${!mini && e.local ? `<span>📍 ${escapar(e.local)}</span>` : ""}
    </button>`;
}

function desenharAgenda(painel) {
  const d = Agenda.dados;
  const visoes = [["dia", "Dia"], ["semana", "Semana"], ["linha", "Linha do tempo"]];
  painel.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:12px">
      <div class="abas" role="tablist" aria-label="Visualização" style="padding:0">${visoes.map(([v, r]) =>
        `<button class="aba" role="tab" data-visao="${v}" aria-selected="${Agenda.visao === v}">${r}</button>`).join("")}</div>
      ${d.pode_editar ? '<button type="button" class="botao botao--primario botao--pequeno" id="novo-compromisso">＋ Compromisso</button>' : ""}
    </div>
    ${d.conflitos.length ? `<div class="alerta-linha alerta-linha--erro" role="alert">⚠ ${d.conflitos.length} conflito(s) de horário:
      ${d.conflitos.map(([a, b]) => {
        const ea = d.eventos.find((e) => e.chave === a);
        const eb = d.eventos.find((e) => e.chave === b);
        return `<br>• ${escapar(ea.titulo)} × ${escapar(eb.titulo)} (${Formato.data(ea.inicio)})`;
      }).join("")}</div>` : ""}
    ${!d.roteiro_ativo ? "" : `<p class="dica" style="margin:-4px 0 10px">Atividades com horário do roteiro principal (v${d.roteiro_ativo.versao}) entram aqui automaticamente, em azul.</p>`}
    <div id="visao-agenda"></div>`;

  const area = $("#visao-agenda", painel);
  if (Agenda.visao === "dia") area.innerHTML = visaoDia();
  if (Agenda.visao === "semana") area.innerHTML = visaoSemana();
  if (Agenda.visao === "linha") area.innerHTML = visaoLinha();

  $$("[data-visao]", painel).forEach((b) => b.addEventListener("click", () => { Agenda.visao = b.dataset.visao; desenharAgenda(painel); }));
  $$("[data-dia]", painel).forEach((b) => b.addEventListener("click", () => { Agenda.diaSelecionado = b.dataset.dia; Agenda.visao = "dia"; desenharAgenda(painel); }));
  $("#novo-compromisso", painel)?.addEventListener("click", () => abrirFormularioCompromisso({ data: Agenda.diaSelecionado }));
  $$("[data-evento]", painel).forEach((b) => b.addEventListener("click", () => clicarEvento(b.dataset.evento)));
  $$("[data-sem-horario]", painel).forEach((b) => b.addEventListener("click", () => Painel.abrir("roteiro")));
}

function visaoDia() {
  const d = Agenda.dados;
  const dia = Agenda.diaSelecionado;
  const eventos = eventosDoDia(dia);
  const semHorario = d.sem_horario.filter((a) => a.data === dia);
  return `
    <div class="abas" style="padding:0 0 12px">${d.dias.map((data, i) => `
      <button class="aba" data-dia="${data}" aria-selected="${data === dia}">Dia ${i + 1} · ${Formato.data(data, { day: "2-digit", month: "2-digit" })}</button>`).join("")}</div>
    <h3 style="text-transform:capitalize;margin-bottom:10px">${Formato.dataLonga(dia)}</h3>
    ${eventos.length ? eventos.map((e) => cartaoEvento(e)).join("") : '<p class="texto-apoio">Nenhum compromisso com horário neste dia.</p>'}
    ${semHorario.length ? `<h4 style="margin:16px 0 8px;font-size:13px;color:var(--tinta-media)">Sem horário definido (roteiro)</h4>
      ${semHorario.map((a) => `<button type="button" class="evento evento--roteiro" data-sem-horario><strong>🧭 ${escapar(a.titulo)}</strong>
        <span>Defina um horário na aba Roteiro para entrar na agenda</span></button>`).join("")}` : ""}`;
}

function visaoSemana() {
  const dias = Agenda.dados.dias;
  // Semanas de segunda a domingo cobrindo o período da viagem
  const [a, m, dd] = dias[0].split("-").map(Number);
  const inicio = new Date(a, m - 1, dd);
  inicio.setDate(inicio.getDate() - ((inicio.getDay() + 6) % 7));
  const fim = dias[dias.length - 1];
  const semanas = [];
  const cursor = new Date(inicio);
  while (true) {
    const semana = [];
    for (let i = 0; i < 7; i += 1) {
      semana.push(new Date(cursor.getTime() - cursor.getTimezoneOffset() * 60000).toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 1);
    }
    semanas.push(semana);
    if (semana[6] >= fim) break;
  }
  return semanas.map((semana) => `<div class="semana" style="margin-bottom:12px">${semana.map((data) => {
    const naViagem = dias.includes(data);
    const eventos = eventosDoDia(data);
    return `<div class="semana__dia ${naViagem ? "" : "semana__dia--fora"}">
        <h4>${Formato.data(data, { weekday: "short", day: "2-digit" })}</h4>
        ${eventos.map((e) => cartaoEvento(e, true)).join("")}
        ${naViagem && !eventos.length ? '<span class="texto-mini">livre</span>' : ""}
      </div>`;
  }).join("")}</div>`).join("") + '<p class="dica">Deslize para o lado para ver a semana inteira.</p>';
}

function visaoLinha() {
  const dias = Agenda.dados.dias;
  return `<div class="linha-tempo">${dias.map((data, i) => {
    const eventos = eventosDoDia(data);
    return `<div class="linha-tempo__dia">
        <h4>Dia ${i + 1} · ${Formato.dataLonga(data)}</h4>
        ${eventos.length ? eventos.map((e) => cartaoEvento(e)).join("") : '<p class="texto-mini">Sem compromissos com horário.</p>'}
      </div>`;
  }).join("")}</div>`;
}

function clicarEvento(chave) {
  const evento = Agenda.dados.eventos.find((e) => e.chave === chave);
  if (evento.origem === "roteiro") {
    const corpo = Folha.abrir({
      titulo: evento.titulo,
      conteudo: `<p class="texto-apoio">${Formato.dataLonga(evento.inicio)} · ${Formato.hora(evento.inicio)}–${Formato.hora(evento.fim)}</p>
        ${evento.observacoes ? `<p style="margin-top:10px;font-size:14px">${escapar(evento.observacoes)}</p>` : ""}
        <p class="dica">Esta atividade vem do roteiro principal. Para mudar horário ou dia, edite-a na aba Roteiro.</p>
        <button type="button" class="botao botao--primario" style="margin-top:14px" data-ir>Abrir roteiro</button>`,
    });
    $("[data-ir]", corpo).addEventListener("click", () => { Folha.fechar(); Painel.abrir("roteiro"); });
    return;
  }
  if (Agenda.dados.pode_editar) abrirFormularioCompromisso({ compromisso: evento });
  else Folha.abrir({ titulo: evento.titulo, conteudo: `<p class="texto-apoio">${Formato.dataLonga(evento.inicio)} · ${Formato.hora(evento.inicio)}</p>
    ${evento.local ? `<p>📍 ${escapar(evento.local)}</p>` : ""}${evento.observacoes ? `<p style="margin-top:8px">${escapar(evento.observacoes)}</p>` : ""}` });
}

function abrirFormularioCompromisso({ compromisso = null, data = null } = {}) {
  const c = compromisso || { tipo: "passeio", duracao_min: 60, inicio: `${data || Agenda.dados.dias[0]}T09:00` };
  const corpo = Folha.abrir({
    titulo: compromisso ? "Editar compromisso" : "Novo compromisso",
    conteudo: `
      <form class="form" novalidate>
        <div class="campo"><label for="c-titulo">Título</label>
          <input id="c-titulo" class="simples" name="titulo" maxlength="160" required value="${escapar(c.titulo || "")}" placeholder="Ex.: Check-in na pousada" /></div>
        <div class="form-grade">
          <div class="campo"><label for="c-tipo">Tipo</label>
            <select id="c-tipo" name="tipo">${Agenda.dados.tipos.map((t) =>
              `<option value="${t.valor}" ${t.valor === c.tipo ? "selected" : ""}>${t.icone} ${escapar(t.rotulo)}</option>`).join("")}</select></div>
          <div class="campo"><label for="c-dur">Duração (min)</label>
            <input id="c-dur" type="number" min="5" step="5" name="duracao_min" value="${escapar(c.duracao_min)}" /></div>
        </div>
        <div class="campo"><label for="c-inicio">Início</label>
          <input id="c-inicio" type="datetime-local" name="inicio" value="${escapar(c.inicio.slice(0, 16))}" required /></div>
        <div class="campo"><label for="c-local">Local</label>
          <input id="c-local" class="simples" name="local" maxlength="200" value="${escapar(c.local || "")}" /></div>
        <div class="campo"><label for="c-obs">Observações</label>
          <textarea id="c-obs" name="observacoes" maxlength="1500" placeholder="Código da reserva, contato...">${escapar(c.observacoes || "")}</textarea></div>
        <input type="hidden" name="latitude" value="${c.latitude ?? ""}" /><input type="hidden" name="longitude" value="${c.longitude ?? ""}" />
        <div class="campo"><label>Local no mapa</label><div data-mapa></div></div>
        <button type="submit" class="botao botao--primario">${compromisso ? "Salvar" : "Adicionar à agenda"}</button>
        ${compromisso ? '<button type="button" class="botao botao--texto" data-excluir style="color:var(--vermelho)">Excluir compromisso</button>' : ""}
      </form>`,
  });
  const form = $("form", corpo);
  seletorLocalNoMapa($("[data-mapa]", form), form, { latitude: c.latitude, longitude: c.longitude });
  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const dados = lerFormulario(form);
    dados.duracao_min = Number(dados.duracao_min || 60);
    ["latitude", "longitude", "local", "observacoes"].forEach((k) => { if (dados[k] === "") dados[k] = null; });
    try {
      await comCarregamento($("button[type=submit]", form), () =>
        compromisso ? Api.editarCompromisso(compromisso.id, dados) : Api.criarCompromisso(Painel.id, dados));
      Folha.fechar();
      Agenda.diaSelecionado = dados.inicio.slice(0, 10);
      toast(compromisso ? "Compromisso atualizado." : "Compromisso adicionado à agenda.");
      Painel.recarregarAba();
    } catch (erro) { mostrarErroFormulario(form, erro); }
  });
  $("[data-excluir]", form)?.addEventListener("click", async () => {
    if (!(await confirmar(`Excluir "${compromisso.titulo}"?`, { textoConfirmar: "Excluir", perigo: true }))) return;
    try {
      await Api.excluirCompromisso(compromisso.id);
      toast("Compromisso excluído.");
      Painel.recarregarAba();
    } catch (erro) { toast(erro.message, "erro"); }
  });
}
