/* Aba Roteiro: versões, geração pelo Vai, atividades por dia (editar, excluir, reorganizar). */

const Roteiro = {
  dados: null,     // resposta de Api.roteiros (versões, categorias, duração)
  atual: null,     // roteiro exibido (ativo ou outra versão)
  selecionado: null, // versão escolhida no seletor (mantida ao recarregar a aba)
};

const FONTES_ATIVIDADE = {
  catalogo: ["Catálogo Viajaí", "selo--verde"],
  openstreetmap: ["OpenStreetMap", "selo--verde"],
  manual: ["Adicionada por você", "selo--cinza"],
  sugestao: ["Sugestão", "selo--cinza"],
};

Painel.registrar("roteiro", {
  rotulo: "Roteiro",
  icone: "🧭",
  async render(painel, roteiroId = null) {
    Roteiro.dados = await Api.roteiros(Painel.id);
    const escolhido = roteiroId || Roteiro.selecionado;
    const existe = Roteiro.dados.versoes.some((v) => v.id === escolhido);
    Roteiro.selecionado = existe ? escolhido : null;
    Roteiro.atual = existe && escolhido !== Roteiro.dados.ativo?.id ? await Api.roteiro(escolhido) : Roteiro.dados.ativo;
    desenharRoteiro(painel);
    if (parametro("gerar") === "1" && Painel.podeEditar) abrirGeradorRoteiro();
  },
});

function dataDoDia(numero) {
  const [a, m, d] = Roteiro.dados.data_ida.split("-").map(Number);
  const data = new Date(a, m - 1, d + numero - 1);
  return data.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
}

function desenharRoteiro(painel) {
  const { versoes, duracao_dias: dias } = Roteiro.dados;
  const r = Roteiro.atual;
  const editar = Painel.podeEditar;

  if (!versoes.length) {
    painel.innerHTML = telaVazia("🧭", "Nenhum roteiro ainda",
      editar ? "O Vai monta um roteiro por dia com lugares reais do destino — ou comece do zero."
        : "Quem organiza a viagem ainda não criou o roteiro.", editar ? "✨ Gerar com o Vai" : null) +
      (editar ? '<button type="button" class="botao botao--texto" id="roteiro-manual">Criar roteiro em branco</button>' : "");
    $("[data-acao-vazio]", painel)?.addEventListener("click", abrirGeradorRoteiro);
    $("#roteiro-manual", painel)?.addEventListener("click", criarRoteiroManual);
    return;
  }

  const porDia = {};
  for (let d = 1; d <= dias; d += 1) porDia[d] = [];
  r.atividades.forEach((a) => (porDia[a.dia] = porDia[a.dia] || []).push(a));

  painel.innerHTML = `
    <div class="bloco" style="padding:14px">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <label class="visualmente-oculto" for="versao">Versão do roteiro</label>
        <select id="versao" class="selecao" style="flex:1;min-width:180px;padding:11px 12px">
          ${versoes.map((v) => `<option value="${v.id}" ${v.id === r.id ? "selected" : ""}>
            v${v.versao} · ${escapar(v.titulo)}${v.ativo ? " ★ principal" : ""}</option>`).join("")}
        </select>
        ${editar ? `<button type="button" class="botao botao--primario botao--pequeno" id="gerar">✨ Gerar</button>` : ""}
      </div>
      ${editar ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
        ${!r.ativo ? '<button type="button" class="botao botao--suave botao--pequeno" id="ativar">★ Tornar principal</button>' : ""}
        <button type="button" class="botao botao--claro botao--pequeno" id="duplicar">⧉ Duplicar versão</button>
        <button type="button" class="botao botao--claro botao--pequeno" id="nova-manual">＋ Versão em branco</button>
        <button type="button" class="botao botao--claro botao--pequeno" id="excluir-versao">🗑 Excluir versão</button>
      </div>` : ""}
      <p class="dica">${r.ativo ? "Esta é a versão principal: ela aparece na agenda e no mapa." : "Você está vendo uma versão alternativa."}
        Criada ${r.origem === "gemini" ? "pelo Vai (Gemini)" : r.origem === "local" ? "pelo Vai" : r.origem === "copia" ? "como cópia" : "manualmente"}${r.criado_por ? ` por ${escapar(r.criado_por)}` : ""}.</p>
    </div>

    ${r.observacoes_ia ? `<div class="observacao-ia"><span aria-hidden="true">🧳</span><p>${escapar(r.observacoes_ia)}</p></div>` : ""}

    ${Object.entries(porDia).map(([dia, itens]) => `
      <section class="dia" aria-label="Dia ${dia}">
        <div class="dia__topo">
          <h3>Dia ${dia} <span class="texto-mini" style="text-transform:capitalize">· ${dataDoDia(Number(dia))}</span></h3>
          ${editar ? `<button type="button" class="botao botao--texto botao--linha" style="padding:4px 0" data-nova="${dia}">＋ Atividade</button>` : ""}
        </div>
        ${itens.length ? itens.map((a, i) => cartaoAtividade(a, i, itens.length, Number(dia), dias)).join("")
          : '<p class="texto-apoio" style="font-size:13px;padding:4px 0 8px">Dia livre.</p>'}
      </section>`).join("")}`;

  $("#versao", painel).addEventListener("change", (e) => Painel.abas.find((a) => a.chave === "roteiro").render(painel, Number(e.target.value)));
  $("#gerar", painel)?.addEventListener("click", abrirGeradorRoteiro);
  $("#nova-manual", painel)?.addEventListener("click", criarRoteiroManual);
  $("#ativar", painel)?.addEventListener("click", (e) => comCarregamento(e.currentTarget, async () => {
    const resp = await Api.ativarRoteiro(r.id);
    Roteiro.selecionado = null;
    toast(resp.mensagem);
    Painel.recarregarAba();
  }));
  $("#duplicar", painel)?.addEventListener("click", (e) => comCarregamento(e.currentTarget, async () => {
    const resp = await Api.duplicarRoteiro(r.id);
    Roteiro.selecionado = null;
    toast(resp.mensagem);
    Painel.recarregarAba();
  }, "Duplicando..."));
  $("#excluir-versao", painel)?.addEventListener("click", async () => {
    if (!(await confirmar(`Excluir a versão ${r.versao} do roteiro?`, { textoConfirmar: "Excluir", perigo: true }))) return;
    try {
      toast((await Api.excluirRoteiro(r.id)).mensagem);
      Roteiro.selecionado = null;
      Painel.recarregarAba();
    } catch (erro) { toast(erro.message, "erro"); }
  });
  $$("[data-nova]", painel).forEach((b) => b.addEventListener("click", () => abrirFormularioAtividade({ dia: Number(b.dataset.nova) })));
  $$("[data-editar]", painel).forEach((b) => b.addEventListener("click", () =>
    abrirFormularioAtividade({ atividade: r.atividades.find((a) => a.id === Number(b.dataset.editar)) })));
  $$("[data-excluir]", painel).forEach((b) => b.addEventListener("click", async () => {
    const atividade = r.atividades.find((a) => a.id === Number(b.dataset.excluir));
    if (!(await confirmar(`Remover "${atividade.titulo}" do roteiro?`, { textoConfirmar: "Remover", perigo: true }))) return;
    try {
      await Api.excluirAtividade(atividade.id);
      toast("Atividade removida.");
      Painel.abas.find((a) => a.chave === "roteiro").render(painel, r.id);
    } catch (erro) { toast(erro.message, "erro"); }
  }));
  $$("[data-mover]", painel).forEach((b) => b.addEventListener("click", () => moverAtividade(Number(b.dataset.id), Number(b.dataset.mover), painel)));
}

function cartaoAtividade(a, indice, total, dia, dias) {
  const fonte = FONTES_ATIVIDADE[a.fonte] || FONTES_ATIVIDADE.manual;
  const editar = Painel.podeEditar;
  return `<article class="atividade">
      <div class="atividade__hora">${a.horario ? escapar(a.horario) : "—"}
        ${a.horario_sugerido ? "<small>sugerido</small>" : ""}${a.duracao_min ? `<small>${Formato.duracao(a.duracao_min)}</small>` : ""}</div>
      <div>
        <h4>${a.lugar_id ? `<a href="lugar.html?id=${a.lugar_id}">${escapar(a.titulo)}</a>` : escapar(a.titulo)}</h4>
        ${a.descricao ? `<p>${escapar(a.descricao)}</p>` : ""}
        <div class="atividade__tags">
          <span class="selo">${escapar(a.categoria_rotulo)}</span>
          <span class="selo ${fonte[1]}">${fonte[0]}</span>
          ${a.endereco ? `<span class="texto-mini">📍 ${escapar(a.endereco)}</span>` : ""}
          ${a.latitude == null ? '<span class="texto-mini">sem localização no mapa</span>' : ""}
        </div>
        ${a.funcionamento ? `<p class="dica">🕘 Funcionamento (OpenStreetMap): ${escapar(a.funcionamento)}</p>` : ""}
      </div>
      ${editar ? `<div class="atividade__acoes">
        <button type="button" class="icone-botao" data-mover="-1" data-id="${a.id}" aria-label="Mover para cima"
          ${indice === 0 && dia === 1 ? "disabled" : ""}>↑</button>
        <button type="button" class="icone-botao" data-mover="1" data-id="${a.id}" aria-label="Mover para baixo"
          ${indice === total - 1 && dia === dias ? "disabled" : ""}>↓</button>
        <button type="button" class="icone-botao" data-editar="${a.id}" aria-label="Editar atividade">✎</button>
        <button type="button" class="icone-botao" data-excluir="${a.id}" aria-label="Excluir atividade">🗑</button>
      </div>` : ""}
    </article>`;
}

/** Sobe/desce dentro do dia; nas pontas, passa para o dia anterior/seguinte. */
async function moverAtividade(id, passo, painel) {
  const r = Roteiro.atual;
  const dias = Roteiro.dados.duracao_dias;
  const grupos = {};
  for (let d = 1; d <= dias; d += 1) grupos[d] = [];
  r.atividades.forEach((a) => grupos[a.dia].push(a));
  const atividade = r.atividades.find((a) => a.id === id);
  const lista = grupos[atividade.dia];
  const posicao = lista.indexOf(atividade);
  const destino = posicao + passo;
  if (destino >= 0 && destino < lista.length) {
    [lista[posicao], lista[destino]] = [lista[destino], lista[posicao]];
  } else {
    const novoDia = atividade.dia + passo;
    if (novoDia < 1 || novoDia > dias) return;
    lista.splice(posicao, 1);
    if (passo < 0) grupos[novoDia].push(atividade);
    else grupos[novoDia].unshift(atividade);
    atividade.dia = novoDia;
  }
  const itens = [];
  Object.entries(grupos).forEach(([dia, atividades]) =>
    atividades.forEach((a, ordem) => itens.push({ id: a.id, dia: Number(dia), ordem: ordem + 1 })));
  try {
    const resposta = await Api.reorganizarRoteiro(r.id, itens);
    Roteiro.atual = resposta.roteiro;
    desenharRoteiro(painel);
    $(`[data-editar="${id}"]`, painel)?.closest(".atividade")?.scrollIntoView({ block: "center", behavior: "smooth" });
  } catch (erro) { toast(erro.message, "erro"); }
}

async function criarRoteiroManual() {
  try {
    const r = await Api.criarRoteiro(Painel.id, { titulo: "Meu roteiro" });
    toast(r.mensagem);
    Painel.recarregarAba();
  } catch (erro) { toast(erro.message, "erro"); }
}

/* ------------------------------ geração --------------------------------- */
async function abrirGeradorRoteiro() {
  let opcoes = { interesses: [] };
  let perfil = null;
  try { [opcoes, perfil] = await Promise.all([Api.opcoesPreferencias(), Api.perfil()]); } catch { /* usa padrão */ }
  const meus = new Set((perfil?.preferencias?.interesses || []).map((i) => i.slug));
  const orcamento = perfil?.preferencias?.orcamento || 2;
  const corpo = Folha.abrir({
    titulo: "Gerar roteiro com o Vai",
    conteudo: `
      <p class="texto-apoio">O Vai usa lugares do catálogo Viajaí e estabelecimentos reais do OpenStreetMap perto do destino,
        agrupando por proximidade. Uma <strong>nova versão</strong> é criada — as anteriores continuam salvas.</p>
      <form class="form" style="margin-top:14px">
        <div class="campo"><label>Interesses</label>
          <div class="etiquetas">${opcoes.interesses.map((i) => `<label class="alternador" style="padding:2px 8px 2px 0">
            <input type="checkbox" name="i-${escapar(i.slug)}" ${meus.has(i.slug) ? "checked" : ""}/> ${escapar(i.icone)} ${escapar(i.nome)}</label>`).join("")}</div>
        </div>
        <div class="form-grade">
          <div class="campo"><label for="g-ritmo">Ritmo</label>
            <select id="g-ritmo" name="ritmo">
              <option value="leve">Leve (2 por dia)</option>
              <option value="moderado" selected>Moderado (3 por dia)</option>
              <option value="intenso">Intenso (4 por dia)</option>
            </select></div>
          <div class="campo"><label for="g-orc">Orçamento</label>
            <select id="g-orc" name="orcamento">${[1, 2, 3, 4].map((n) =>
              `<option value="${n}" ${n === orcamento ? "selected" : ""}>${"$".repeat(n)}</option>`).join("")}</select></div>
        </div>
        <label class="alternador"><input type="checkbox" name="incluir_refeicoes" checked /> Incluir almoço e jantar</label>
        <div class="campo"><label for="g-obs">Algo mais? <span class="texto-mini">(opcional)</span></label>
          <textarea id="g-obs" name="observacoes" maxlength="500" placeholder="Ex.: começar tarde, evitar museus no último dia"></textarea></div>
        <button type="submit" class="botao botao--primario">✨ Gerar roteiro</button>
      </form>`,
  });
  const form = $("form", corpo);
  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const dados = lerFormulario(form);
    const corpoReq = {
      ritmo: dados.ritmo, orcamento: Number(dados.orcamento), incluir_refeicoes: dados.incluir_refeicoes,
      observacoes: dados.observacoes,
      interesses: Object.keys(dados).filter((k) => k.startsWith("i-") && dados[k]).map((k) => k.slice(2)),
    };
    try {
      const resposta = await comCarregamento($("button[type=submit]", form), () => Api.gerarRoteiro(Painel.id, corpoReq),
        "O Vai está montando...");
      Folha.fechar();
      Roteiro.selecionado = null;
      toast(`${resposta.mensagem} ${resposta.roteiro.total_atividades} atividades.`);
      await Painel.recarregarViagem();
      Painel.abrir("roteiro");
    } catch (erro) { mostrarErroFormulario(form, erro); }
  });
}

/* ----------------------- seletor de local no mapa ----------------------- */
/** Mini-mapa: um clique define latitude/longitude nos campos ocultos do formulário. */
async function seletorLocalNoMapa(container, form, { latitude, longitude } = {}) {
  const v = Painel.viagem;
  const centro = latitude != null ? [latitude, longitude] : v.latitude != null ? [v.latitude, v.longitude] : [-15.8, -47.9];
  container.innerHTML = `<div class="mapa" style="height:220px"></div>
    <p class="dica" data-coord>${latitude != null ? `📍 ${latitude.toFixed(5)}, ${longitude.toFixed(5)}` : "Toque no mapa para marcar o local (opcional)."}
    </p><button type="button" class="botao botao--texto botao--linha" data-limpar style="padding:4px 0" ${latitude == null ? "hidden" : ""}>Remover local</button>`;
  const mapa = await criarMapa($(".mapa", container), { centro, zoom: latitude != null || v.latitude != null ? 13 : 4 });
  if (!mapa) return;
  let marcador = latitude != null ? L.marker([latitude, longitude]).addTo(mapa) : null;
  mapa.on("click", (e) => {
    const { lat, lng } = e.latlng;
    form.elements.latitude.value = lat.toFixed(6);
    form.elements.longitude.value = lng.toFixed(6);
    if (marcador) marcador.setLatLng(e.latlng); else marcador = L.marker(e.latlng).addTo(mapa);
    $("[data-coord]", container).textContent = `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    $("[data-limpar]", container).hidden = false;
  });
  $("[data-limpar]", container).addEventListener("click", () => {
    form.elements.latitude.value = "";
    form.elements.longitude.value = "";
    if (marcador) { marcador.remove(); marcador = null; }
    $("[data-coord]", container).textContent = "Toque no mapa para marcar o local (opcional).";
    $("[data-limpar]", container).hidden = true;
  });
}

/* --------------------------- atividade (form) ---------------------------- */
async function abrirFormularioAtividade({ atividade = null, dia = 1, latitude = null, longitude = null, lugarId = null } = {}) {
  if (!Roteiro.dados) Roteiro.dados = await Api.roteiros(Painel.id);
  let roteiro = Roteiro.atual || Roteiro.dados.ativo;
  const lugares = await catalogoLugares();
  const a = atividade || { dia, categoria: "atracao", latitude, longitude, lugar_id: lugarId };
  const corpo = Folha.abrir({
    titulo: atividade ? "Editar atividade" : "Nova atividade",
    conteudo: `
      <form class="form" novalidate>
        <div class="campo"><label for="a-titulo">Atividade</label>
          <input id="a-titulo" class="simples" name="titulo" maxlength="160" required value="${escapar(a.titulo || "")}" placeholder="Ex.: Passeio de barco" /></div>
        <div class="form-grade">
          <div class="campo"><label for="a-dia">Dia</label>
            <select id="a-dia" name="dia">${Array.from({ length: Roteiro.dados.duracao_dias }, (_, i) =>
              `<option value="${i + 1}" ${i + 1 === a.dia ? "selected" : ""}>Dia ${i + 1} · ${dataDoDia(i + 1)}</option>`).join("")}</select></div>
          <div class="campo"><label for="a-cat">Tipo</label>
            <select id="a-cat" name="categoria">${Roteiro.dados.categorias.map((c) =>
              `<option value="${c.valor}" ${c.valor === a.categoria ? "selected" : ""}>${escapar(c.rotulo)}</option>`).join("")}</select></div>
        </div>
        <div class="form-grade">
          <div class="campo"><label for="a-hora">Horário</label>
            <input id="a-hora" type="time" name="horario" value="${escapar(a.horario || "")}" /></div>
          <div class="campo"><label for="a-dur">Duração (min)</label>
            <input id="a-dur" type="number" min="5" max="1440" step="5" name="duracao_min" value="${escapar(a.duracao_min || "")}" /></div>
        </div>
        <div class="campo"><label for="a-lugar">Lugar do catálogo <span class="texto-mini">(opcional)</span></label>
          <select id="a-lugar" name="lugar_id"><option value="">—</option>${lugares.map((l) =>
            `<option value="${l.id}" ${l.id === a.lugar_id ? "selected" : ""}>${escapar(l.nome)} · ${escapar(l.local)}</option>`).join("")}</select></div>
        <div class="campo"><label for="a-end">Endereço / ponto de encontro</label>
          <input id="a-end" class="simples" name="endereco" maxlength="200" value="${escapar(a.endereco || "")}" /></div>
        <div class="campo"><label for="a-desc">Descrição</label>
          <textarea id="a-desc" name="descricao" maxlength="1500">${escapar(a.descricao || "")}</textarea></div>
        <input type="hidden" name="latitude" value="${a.latitude ?? ""}" />
        <input type="hidden" name="longitude" value="${a.longitude ?? ""}" />
        <div class="campo"><label>Local no mapa</label><div data-mapa></div></div>
        <button type="submit" class="botao botao--primario">${atividade ? "Salvar" : "Adicionar ao roteiro"}</button>
      </form>`,
  });
  const form = $("form", corpo);
  seletorLocalNoMapa($("[data-mapa]", form), form, { latitude: a.latitude, longitude: a.longitude });
  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const dados = lerFormulario(form);
    dados.dia = Number(dados.dia);
    dados.lugar_id = dados.lugar_id ? Number(dados.lugar_id) : null;
    dados.duracao_min = dados.duracao_min ? Number(dados.duracao_min) : null;
    ["latitude", "longitude", "horario", "endereco", "descricao"].forEach((c) => { if (dados[c] === "") dados[c] = null; });
    try {
      await comCarregamento($("button[type=submit]", form), async () => {
        if (!atividade && !roteiro) roteiro = (await Api.criarRoteiro(Painel.id, { titulo: "Meu roteiro" })).roteiro;
        return atividade ? Api.editarAtividade(atividade.id, dados) : Api.adicionarAtividade(roteiro.id, dados);
      });
      Folha.fechar();
      toast(atividade ? "Atividade atualizada." : "Atividade adicionada.");
      Painel.recarregarAba();
    } catch (erro) { mostrarErroFormulario(form, erro); }
  });
}
