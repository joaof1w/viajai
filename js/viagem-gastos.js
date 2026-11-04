/* Aba Gastos: orçamento, despesas por categoria, gráfico, alertas e estimativa por pessoa. */

Painel.registrar("gastos", {
  rotulo: "Gastos",
  icone: "💰",
  async render(painel) {
    desenharGastos(painel, await Api.financas(Painel.id));
  },
});

function desenharGastos(painel, f) {
  const uso = f.percentual_usado;
  const classeBarra = uso === null ? "" : uso > 100 ? "progresso--erro" : uso >= 80 ? "progresso--aviso" : "";
  const fatias = f.categorias.map((c) => ({ valor: c.gasto, cor: c.cor, rotulo: c.rotulo }));
  painel.innerHTML = `
    ${f.alertas.map((a) => `<div class="alerta-linha alerta-linha--${a.nivel === "erro" ? "erro" : "aviso"}" role="alert">⚠ ${escapar(a.texto)}</div>`).join("")}
    <div class="kpis">
      <div class="kpi kpi--destaque"><span>Orçamento</span><strong>${f.orcamento !== null ? Formato.moeda(f.orcamento) : "Não definido"}</strong></div>
      <div class="kpi"><span>Gasto</span><strong>${Formato.moeda(f.gasto)}</strong></div>
      <div class="kpi ${f.saldo !== null && f.saldo < 0 ? "kpi--negativo" : ""}"><span>Saldo disponível</span><strong>${f.saldo !== null ? Formato.moeda(f.saldo) : "—"}</strong></div>
      <div class="kpi"><span>Por pessoa (${f.viajantes})</span><strong>${Formato.moeda(f.gasto_por_pessoa)}</strong>
        ${f.orcamento_por_pessoa !== null ? `<span>planejado ${Formato.moeda(f.orcamento_por_pessoa)}</span>` : ""}</div>
    </div>
    ${uso !== null ? `<div class="bloco" style="padding:14px">
      <div class="barra-categoria__topo"><strong>${uso}% do orçamento usado</strong><span>${Formato.moeda(f.gasto_por_dia)}/dia em média</span></div>
      <div class="progresso ${classeBarra}"><span style="width:${Math.min(100, uso)}%"></span></div></div>` : ""}
    ${f.pode_editar ? `<div class="acoes-linha" style="margin:0 0 14px">
      <button type="button" class="botao botao--primario" id="nova-despesa">＋ Despesa</button>
      <button type="button" class="botao botao--claro" id="definir-orcamento">Planejar orçamento</button></div>` : ""}

    <div class="bloco">
      <h3 style="margin-bottom:12px">Distribuição dos gastos</h3>
      ${f.gasto ? `<div class="grafico-gastos">
        ${graficoRosca(fatias, { centro: Formato.moeda(f.gasto) })}
        <ul class="legenda">${f.categorias.filter((c) => c.gasto).map((c) =>
          `<li><i style="background:${c.cor}"></i>${c.icone} ${escapar(c.rotulo)}<b>${c.percentual_gasto}%</b></li>`).join("")}</ul>
      </div>` : '<p class="texto-apoio">Registre a primeira despesa para ver o gráfico.</p>'}
    </div>

    <div class="bloco">
      <h3 style="margin-bottom:12px">Planejado × gasto por categoria</h3>
      <div class="barras-categoria">${f.categorias.map((c) => {
        const base = c.planejado || Math.max(...f.categorias.map((x) => x.gasto), 1);
        const pct = Math.min(100, Math.round((c.gasto / base) * 100));
        return `<div><div class="barra-categoria__topo"><span>${c.icone} ${escapar(c.rotulo)}</span>
          <span>${Formato.moeda(c.gasto)}${c.planejado !== null ? ` / ${Formato.moeda(c.planejado)}` : ""}</span></div>
          <div class="progresso ${c.estourado ? "progresso--erro" : ""}"><span style="width:${pct}%;background:${c.estourado ? "" : c.cor}"></span></div></div>`;
      }).join("")}</div>
    </div>

    ${f.por_pagador.length > 1 ? `<div class="bloco"><h3 style="margin-bottom:8px">Quem pagou</h3>
      ${f.por_pagador.map((p) => `<div class="linha-info"><span>${escapar(p.nome)}</span><strong>${Formato.moeda(p.valor)}</strong></div>`).join("")}</div>` : ""}

    <div class="bloco">
      <h3 style="margin-bottom:4px">Despesas (${f.despesas.length})</h3>
      ${f.despesas.length ? f.despesas.map((d) => `
        <div class="despesa">
          <span class="despesa__icone" aria-hidden="true">${d.icone}</span>
          <div class="despesa__corpo"><strong>${escapar(d.descricao)}</strong>
            <span>${escapar(d.categoria_rotulo)}${d.data ? ` · ${Formato.data(d.data)}` : ""}${d.pago_por ? ` · pago por ${escapar(d.pago_por.nome.split(" ")[0])}` : ""}</span></div>
          <span class="despesa__valor">${Formato.moeda(d.valor)}</span>
          ${f.pode_editar ? `<button type="button" class="icone-botao" data-editar="${d.id}" aria-label="Editar despesa">✎</button>` : ""}
        </div>`).join("") : '<p class="texto-apoio">Nenhuma despesa registrada.</p>'}
    </div>`;

  $("#nova-despesa", painel)?.addEventListener("click", () => abrirFormularioDespesa(f, painel));
  $("#definir-orcamento", painel)?.addEventListener("click", () => abrirFormularioOrcamento(f, painel));
  $$("[data-editar]", painel).forEach((b) => b.addEventListener("click", () =>
    abrirFormularioDespesa(f, painel, f.despesas.find((d) => d.id === Number(b.dataset.editar)))));
}

function abrirFormularioDespesa(f, painel, despesa = null) {
  const d = despesa || { categoria: "alimentacao", data: hojeIso() >= Painel.viagem.data_ida && hojeIso() <= Painel.viagem.data_volta ? hojeIso() : "" };
  const corpo = Folha.abrir({
    titulo: despesa ? "Editar despesa" : "Nova despesa",
    conteudo: `<form class="form" novalidate>
      <div class="campo"><label for="d-desc">Descrição</label>
        <input id="d-desc" class="simples" name="descricao" maxlength="160" required value="${escapar(d.descricao || "")}" placeholder="Ex.: Jantar no centro" /></div>
      <div class="form-grade">
        <div class="campo"><label for="d-valor">Valor (R$)</label>
          <input id="d-valor" class="simples" name="valor" inputmode="decimal" required value="${d.valor != null ? escapar(String(d.valor).replace(".", ",")) : ""}" placeholder="0,00" /></div>
        <div class="campo"><label for="d-cat">Categoria</label>
          <select id="d-cat" name="categoria">${f.categorias.map((c) =>
            `<option value="${c.categoria}" ${c.categoria === d.categoria ? "selected" : ""}>${c.icone} ${escapar(c.rotulo)}</option>`).join("")}</select></div>
      </div>
      <div class="form-grade">
        <div class="campo"><label for="d-data">Data</label><input id="d-data" type="date" name="data" value="${escapar(d.data || "")}" /></div>
        <div class="campo"><label for="d-pago">Pago por</label>
          <select id="d-pago" name="pago_por_id"><option value="">—</option>${f.membros.map((m) =>
            `<option value="${m.id}" ${d.pago_por && d.pago_por.id === m.id ? "selected" : ""}>${escapar(m.nome)}</option>`).join("")}</select></div>
      </div>
      <button type="submit" class="botao botao--primario">${despesa ? "Salvar" : "Registrar despesa"}</button>
      ${despesa ? '<button type="button" class="botao botao--texto" data-excluir style="color:var(--vermelho)">Excluir despesa</button>' : ""}
    </form>`,
  });
  const form = $("form", corpo);
  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const dados = lerFormulario(form);
    dados.pago_por_id = dados.pago_por_id ? Number(dados.pago_por_id) : null;
    if (!dados.data) dados.data = null;
    try {
      const r = await comCarregamento($("button[type=submit]", form), () =>
        despesa ? Api.editarDespesa(despesa.id, dados) : Api.registrarDespesa(Painel.id, dados));
      Folha.fechar();
      toast(r.mensagem);
      desenharGastos(painel, r.financas);
      r.financas.alertas.forEach((a) => a.nivel === "erro" && toast(a.texto, "erro"));
    } catch (erro) { mostrarErroFormulario(form, erro); }
  });
  $("[data-excluir]", form)?.addEventListener("click", async () => {
    if (!(await confirmar(`Excluir "${despesa.descricao}"?`, { textoConfirmar: "Excluir", perigo: true }))) return;
    try {
      const r = await Api.excluirDespesa(despesa.id);
      toast(r.mensagem);
      desenharGastos(painel, r.financas);
    } catch (erro) { toast(erro.message, "erro"); }
  });
}

function abrirFormularioOrcamento(f, painel) {
  const valor = (v) => (v !== null && v !== undefined ? String(v).replace(".", ",") : "");
  const corpo = Folha.abrir({
    titulo: "Planejar orçamento",
    conteudo: `<form class="form" novalidate>
      <div class="campo"><label for="o-total">Orçamento total (R$)</label>
        <input id="o-total" class="simples" name="orcamento" inputmode="decimal" value="${valor(f.orcamento)}" placeholder="Ex.: 4.000,00" /></div>
      <p class="dica" style="margin-bottom:8px">Opcional: quanto você pretende gastar em cada categoria.</p>
      ${f.categorias.map((c) => `<div class="campo"><label for="o-${c.categoria}">${c.icone} ${escapar(c.rotulo)}</label>
        <input id="o-${c.categoria}" class="simples" name="cat-${c.categoria}" inputmode="decimal" value="${valor(c.planejado)}" /></div>`).join("")}
      <button type="submit" class="botao botao--primario">Salvar orçamento</button>
    </form>`,
  });
  const form = $("form", corpo);
  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const dados = lerFormulario(form);
    const planejamento = {};
    f.categorias.forEach((c) => { planejamento[c.categoria] = dados[`cat-${c.categoria}`] || null; });
    try {
      const r = await comCarregamento($("button[type=submit]", form), () =>
        Api.definirOrcamento(Painel.id, { orcamento: dados.orcamento || null, planejamento }));
      Folha.fechar();
      toast(r.mensagem);
      await Painel.recarregarViagem();
      desenharGastos(painel, r.financas);
    } catch (erro) { mostrarErroFormulario(form, erro); }
  });
}
