/* Aba Checklist: sugestões inteligentes, progresso salvo a cada toque e reuso de listas. */

Painel.registrar("checklist", {
  rotulo: "Checklist",
  icone: "✅",
  async render(painel) {
    desenharChecklist(painel, await Api.checklist(Painel.id));
  },
});

function desenharChecklist(painel, c) {
  const editar = c.pode_editar;
  const grupos = c.categorias.map((cat) => ({ ...cat, itens: c.itens.filter((i) => i.categoria === cat.valor) }))
    .filter((g) => g.itens.length);
  painel.innerHTML = `
    <div class="bloco" style="padding:14px">
      <div class="barra-categoria__topo"><strong>${c.percentual}% pronto</strong><span>${c.concluidos} de ${c.total} itens</span></div>
      <div class="progresso" role="progressbar" aria-valuenow="${c.percentual}" aria-valuemin="0" aria-valuemax="100">
        <span style="width:${c.percentual}%"></span></div>
      <p class="dica" id="estado-salvo">Cada marcação é salva automaticamente${editar ? "" : " (somente organizador e editores alteram)"}.</p>
    </div>
    ${editar ? `<div class="acoes-linha" style="margin:0 0 12px">
        <button type="button" class="botao botao--primario" id="sugerir">✨ Sugerir itens</button>
        <button type="button" class="botao botao--claro" id="importar">⤵ Reusar lista</button></div>
      <form class="bloco" id="form-item" style="padding:12px;display:flex;gap:8px;flex-wrap:wrap" novalidate>
        <label class="visualmente-oculto" for="novo-item">Novo item</label>
        <input id="novo-item" name="texto" maxlength="160" placeholder="Adicionar item..." class="selecao" style="flex:2;min-width:160px" required />
        <label class="visualmente-oculto" for="nova-cat">Categoria</label>
        <select id="nova-cat" name="categoria" class="selecao" style="flex:1;min-width:120px">${c.categorias.map((cat) =>
          `<option value="${cat.valor}">${cat.icone} ${escapar(cat.rotulo)}</option>`).join("")}</select>
        <button type="submit" class="botao botao--primario botao--pequeno">Adicionar</button>
      </form>` : ""}
    ${grupos.length ? grupos.map((g) => `
      <div class="bloco">
        <div class="barra-categoria__topo"><h3>${g.icone} ${escapar(g.rotulo)}</h3>
          <span class="texto-mini">${g.itens.filter((i) => i.concluido).length}/${g.itens.length}</span></div>
        ${g.itens.map((i) => `
          <div class="item-check ${i.concluido ? "feito" : ""}">
            <input type="checkbox" id="item-${i.id}" data-item="${i.id}" ${i.concluido ? "checked" : ""} ${editar ? "" : "disabled"} />
            <label for="item-${i.id}">${escapar(i.texto)}${i.sugerido ? ' <span class="texto-mini">· sugestão</span>' : ""}</label>
            ${editar ? `<button type="button" class="icone-botao" data-remover="${i.id}" aria-label="Remover ${escapar(i.texto)}">✕</button>` : ""}
          </div>`).join("")}
      </div>`).join("") : telaVazia("🎒", "Sua lista está vazia", "Gere sugestões com base no destino, duração e tipo da viagem — ou adicione seus itens.")}`;

  $("#sugerir", painel)?.addEventListener("click", (e) => comCarregamento(e.currentTarget, async () => {
    const r = await Api.sugerirChecklist(Painel.id);
    toast(r.mensagem);
    desenharChecklist(painel, r);
  }, "Pensando na sua mala..."));
  $("#importar", painel)?.addEventListener("click", () => importarLista(painel));
  $("#form-item", painel)?.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    const dados = lerFormulario(form);
    if (!dados.texto) return;
    try {
      const r = await Api.adicionarItem(Painel.id, dados);
      desenharChecklist(painel, r);
      $("#novo-item", painel).focus();
    } catch (erro) { toast(erro.message, "erro"); }
  });
  $$("[data-item]", painel).forEach((caixa) => caixa.addEventListener("change", async () => {
    const linha = caixa.closest(".item-check");
    linha.classList.toggle("feito", caixa.checked);
    try {
      const r = await Api.atualizarItem(caixa.dataset.item, { concluido: caixa.checked });
      $(".progresso span", painel).style.width = `${r.percentual}%`;
      $(".barra-categoria__topo strong", painel).textContent = `${r.percentual}% pronto`;
      $(".barra-categoria__topo span", painel).textContent = `${r.concluidos} de ${r.total} itens`;
      $("#estado-salvo", painel).textContent = "✓ Progresso salvo.";
    } catch (erro) {
      caixa.checked = !caixa.checked;
      linha.classList.toggle("feito", caixa.checked);
      toast(erro.message, "erro");
    }
  }));
  $$("[data-remover]", painel).forEach((b) => b.addEventListener("click", async () => {
    try { desenharChecklist(painel, await Api.removerItem(b.dataset.remover)); } catch (erro) { toast(erro.message, "erro"); }
  }));
}

async function importarLista(painel) {
  const dados = await Api.listarViagens();
  const outras = dados.viagens.filter((v) => v.id !== Painel.id);
  if (!outras.length) { toast("Você ainda não tem outra viagem para reaproveitar a lista.", "erro"); return; }
  const corpo = Folha.abrir({
    titulo: "Reusar lista de outra viagem",
    conteudo: `<p class="texto-apoio">Os itens são copiados desmarcados; o que já existe nesta lista não é duplicado.</p>
      <form class="form" style="margin-top:12px"><div class="campo"><label for="origem">Viagem de origem</label>
        <select id="origem" name="origem">${outras.map((v) => `<option value="${v.id}">${escapar(v.titulo)} · ${Formato.periodo(v.data_ida, v.data_volta)}</option>`).join("")}</select></div>
        <button type="submit" class="botao botao--primario">Importar itens</button></form>`,
  });
  $("form", corpo).addEventListener("submit", async (evento) => {
    evento.preventDefault();
    try {
      const r = await comCarregamento($("button", corpo), () => Api.importarChecklist(Painel.id, Number($("#origem", corpo).value)));
      Folha.fechar();
      toast(r.mensagem);
      desenharChecklist(painel, r);
    } catch { /* toast já exibido */ }
  });
}
