/* Aba Grupo: participantes, convites, permissões e decisões (sugestões com votação). */

Painel.registrar("grupo", {
  rotulo: "Grupo",
  icone: "👥",
  async render(painel) {
    const [grupo, sugestoes] = await Promise.all([Api.participantes(Painel.id), Api.sugestoes(Painel.id)]);
    desenharGrupo(painel, grupo, sugestoes);
  },
});

function desenharGrupo(painel, g, s) {
  const eu = Sessao.usuario()?.id;
  painel.innerHTML = `
    <div class="bloco">
      <h3 style="margin-bottom:6px">Participantes</h3>
      <div class="pessoa"><div class="avatar">${escapar(g.proprietario.iniciais)}</div>
        <div class="pessoa__corpo"><strong>${escapar(g.proprietario.nome)}${g.proprietario.id === eu ? " (você)" : ""}</strong><span>Organizador(a)</span></div></div>
      ${g.participantes.map((p) => `
        <div class="pessoa" data-pid="${p.id}">
          <div class="avatar">${escapar(p.usuario.iniciais)}</div>
          <div class="pessoa__corpo"><strong>${escapar(p.usuario.nome)}${p.usuario.id === eu ? " (você)" : ""}</strong>
            <span>${p.status === "pendente" ? "⏳ Convite pendente · " : p.status === "recusado" ? "Recusou o convite · " : ""}${p.papel === "editor" ? "Editor(a)" : "Viajante"}${p.usuario.email ? ` · ${escapar(p.usuario.email)}` : ""}</span></div>
          ${g.pode_gerenciar && p.status !== "recusado" ? `
            <label class="visualmente-oculto" for="papel-${p.id}">Permissão</label>
            <select id="papel-${p.id}" class="selecao" data-papel style="width:auto;padding:8px">
              <option value="viajante" ${p.papel === "viajante" ? "selected" : ""}>Viajante</option>
              <option value="editor" ${p.papel === "editor" ? "selected" : ""}>Editor</option></select>` : ""}
          ${g.pode_gerenciar || p.usuario.id === eu ? `<button type="button" class="icone-botao" data-remover
            aria-label="${p.usuario.id === eu ? "Sair da viagem" : `Remover ${escapar(p.usuario.nome)}`}">${p.usuario.id === eu ? "⎋" : "✕"}</button>` : ""}
        </div>`).join("")}
      ${g.pode_gerenciar ? `<form id="convidar" class="form" style="margin-top:14px" novalidate>
        <div class="campo"><label for="email-convite">Convidar por e-mail</label>
          <input id="email-convite" class="simples" type="email" name="email" placeholder="amigo@email.com" required /></div>
        <div class="form-grade" style="align-items:end">
          <div class="campo"><label for="papel-convite">Permissão</label>
            <select id="papel-convite" name="papel">${g.papeis.map((p) => `<option value="${p.valor}">${escapar(p.descricao)}</option>`).join("")}</select></div>
          <div class="campo"><button type="submit" class="botao botao--primario">Enviar convite</button></div>
        </div>
        <p class="dica">A pessoa precisa ter uma conta verificada no Viajaí. Só quem aceitar vê os dados da viagem.</p>
      </form>` : `<p class="dica" style="margin-top:10px">Você participa como ${g.meu_papel === "editor" ? "editor(a): pode organizar roteiro, gastos, agenda e checklist" : "viajante: pode ver tudo, sugerir e votar"}.</p>`}
    </div>

    <div class="bloco">
      <h3 style="margin-bottom:4px">Decisões do grupo</h3>
      <p class="texto-apoio" style="font-size:13px;margin-bottom:12px">Sugira atividades e vote. Quem organiza aprova — e a ideia vai direto para o roteiro.</p>
      <form id="sugerir" class="form" novalidate>
        <div class="campo"><label for="s-titulo">Sugestão</label>
          <input id="s-titulo" class="simples" name="titulo" maxlength="160" placeholder="Ex.: Passeio de barco ao pôr do sol" /></div>
        <div class="campo"><label for="s-lugar">Ou um lugar do catálogo</label><select id="s-lugar" name="lugar_id"><option value="">—</option></select></div>
        <div class="campo"><label for="s-desc">Por quê?</label><textarea id="s-desc" name="descricao" maxlength="1000"></textarea></div>
        <button type="submit" class="botao botao--claro">💡 Enviar sugestão</button>
      </form>
      <div style="margin-top:14px">${s.sugestoes.length ? s.sugestoes.map((sug) => cartaoSugestao(sug, s.pode_decidir)).join("")
        : '<p class="texto-mini">Nenhuma sugestão ainda.</p>'}</div>
    </div>`;

  catalogoLugares().then((lugares) => {
    $("#s-lugar", painel).innerHTML += lugares.map((l) => `<option value="${l.id}">${escapar(l.nome)} · ${escapar(l.local)}</option>`).join("");
  });

  $("#convidar", painel)?.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    try {
      const r = await comCarregamento($("button[type=submit]", form), () => Api.convidar(Painel.id, lerFormulario(form)), "Enviando...");
      toast(r.mensagem);
      Painel.recarregarAba();
    } catch (erro) { mostrarErroFormulario(form, erro); }
  });
  $$("[data-papel]", painel).forEach((sel) => sel.addEventListener("change", async () => {
    try { toast((await Api.alterarPapel(Painel.id, sel.closest("[data-pid]").dataset.pid, sel.value)).mensagem); }
    catch (erro) { toast(erro.message, "erro"); }
  }));
  $$("[data-remover]", painel).forEach((b) => b.addEventListener("click", async () => {
    const pid = b.closest("[data-pid]").dataset.pid;
    const souEu = b.textContent.trim() === "⎋";
    if (!(await confirmar(souEu ? "Sair desta viagem? Você perderá o acesso aos dados dela." : "Remover esta pessoa da viagem?",
      { textoConfirmar: souEu ? "Sair" : "Remover", perigo: true }))) return;
    try {
      const r = await Api.removerParticipante(Painel.id, pid);
      toast(r.mensagem);
      if (r.saiu) window.location.href = "viagens.html"; else Painel.recarregarAba();
    } catch (erro) { toast(erro.message, "erro"); }
  }));
  $("#sugerir", painel).addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const form = evento.currentTarget;
    const dados = lerFormulario(form);
    dados.lugar_id = dados.lugar_id ? Number(dados.lugar_id) : null;
    try {
      const r = await comCarregamento($("button[type=submit]", form), () => Api.sugerir(Painel.id, dados), "Enviando...");
      toast(r.mensagem);
      Painel.recarregarAba();
    } catch (erro) { mostrarErroFormulario(form, erro); }
  });
  $$("[data-votar]", painel).forEach((b) => b.addEventListener("click", async () => {
    const atual = b.getAttribute("aria-pressed") === "true";
    try {
      await Api.votar(b.dataset.sugestao, atual ? 0 : Number(b.dataset.votar));
      Painel.recarregarAba();
    } catch (erro) { toast(erro.message, "erro"); }
  }));
  $$("[data-decidir]", painel).forEach((b) => b.addEventListener("click", () => decidirSugestao(b.dataset.sugestao, b.dataset.decidir)));
}

function cartaoSugestao(s, podeDecidir) {
  const aberta = s.status === "aberta";
  return `<div class="sugestao-card">
      <div class="barra-categoria__topo"><strong>${escapar(s.titulo)}</strong>
        <span class="selo ${s.status === "aprovada" ? "selo--verde" : s.status === "rejeitada" ? "selo--cinza" : ""}">${s.status === "aberta" ? "Em votação" : s.status === "aprovada" ? "Aprovada" : "Rejeitada"}</span></div>
      ${s.descricao ? `<p class="texto-apoio" style="font-size:13.5px">${escapar(s.descricao)}</p>` : ""}
      <p class="texto-mini">Sugerida por ${escapar(s.autor.nome.split(" ")[0])}${s.lugar ? ` · <a href="lugar.html?id=${s.lugar.id}">${escapar(s.lugar.nome)}</a>` : ""}${s.decidido_por ? ` · decidido por ${escapar(s.decidido_por.split(" ")[0])}` : ""}</p>
      <div class="votos">
        <button type="button" class="voto" data-votar="1" data-sugestao="${s.id}" aria-pressed="${s.meu_voto === 1}" ${aberta ? "" : "disabled"}>👍 ${s.votos_favor}</button>
        <button type="button" class="voto" data-votar="-1" data-sugestao="${s.id}" aria-pressed="${s.meu_voto === -1}" ${aberta ? "" : "disabled"}>👎 ${s.votos_contra}</button>
        ${aberta && podeDecidir ? `<span style="margin-left:auto;display:flex;gap:6px">
          <button type="button" class="botao botao--claro botao--pequeno" data-decidir="rejeitada" data-sugestao="${s.id}">Rejeitar</button>
          <button type="button" class="botao botao--primario botao--pequeno" data-decidir="aprovada" data-sugestao="${s.id}">Aprovar</button></span>` : ""}
      </div>
    </div>`;
}

async function decidirSugestao(id, decisao) {
  if (decisao === "rejeitada") {
    try { toast((await Api.decidir(id, { decisao })).mensagem); Painel.recarregarAba(); } catch (erro) { toast(erro.message, "erro"); }
    return;
  }
  const dias = Painel.viagem.duracao_dias;
  const corpo = Folha.abrir({
    titulo: "Aprovar sugestão",
    conteudo: `<form class="form"><div class="campo"><label for="dia-sug">Em qual dia do roteiro?</label>
      <select id="dia-sug" name="dia">${Array.from({ length: dias }, (_, i) => `<option value="${i + 1}">Dia ${i + 1} · ${Formato.data(addDias(Painel.viagem.data_ida, i))}</option>`).join("")}</select></div>
      <button type="submit" class="botao botao--primario">Aprovar e adicionar ao roteiro</button></form>`,
  });
  $("form", corpo).addEventListener("submit", async (evento) => {
    evento.preventDefault();
    try {
      const r = await comCarregamento($("button", corpo), () => Api.decidir(id, { decisao, dia: Number($("#dia-sug", corpo).value) }));
      Folha.fechar();
      toast(r.mensagem);
      Painel.recarregarViagem();
      Painel.recarregarAba();
    } catch { /* toast já exibido */ }
  });
}

function addDias(iso, n) {
  const [a, m, d] = iso.split("-").map(Number);
  const data = new Date(a, m - 1, d + n);
  return new Date(data.getTime() - data.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
