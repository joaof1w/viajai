/* Página da viagem: carrega a viagem, monta as abas e o resumo.
   Cada aba é um módulo (viagem-*.js) registrado em Painel.registrar(). */

const Painel = {
  id: Number(parametro("id")),
  viagem: null,
  abas: [],
  abaAtual: null,

  registrar(chave, definicao) {
    this.abas.push({ chave, ...definicao });
  },

  get podeEditar() { return Boolean(this.viagem?.permissoes?.editar); },
  get podeGerenciar() { return Boolean(this.viagem?.permissoes?.gerenciar); },

  async iniciar() {
    if (!Sessao.exigirLogin()) return;
    navegacaoInferior("viagens");
    ligarVoltar($("#botao-voltar"), "viagens.html");
    if (!this.id) { window.location.replace("viagens.html"); return; }
    $("#painel").innerHTML = esqueletos(3, 120);
    try {
      await this.recarregarViagem();
    } catch (erro) {
      $("#painel").innerHTML = telaVazia("🔒", "Viagem indisponível", erro.status === 404
        ? "Ela não existe ou você não tem acesso a ela." : erro.message, "Voltar para minhas viagens");
      $("[data-acao-vazio]")?.addEventListener("click", () => (window.location.href = "viagens.html"));
      return;
    }
    this.montarAbas();
    this.abrir(parametro("aba") || "resumo");
    $("#editar-viagem").addEventListener("click", () => this.editar());
    $("#excluir-viagem").addEventListener("click", () => this.excluir());
  },

  async recarregarViagem() {
    this.viagem = await Api.viagem(this.id);
    document.title = `${this.viagem.titulo} · Viajaí`;
    $("#titulo-pagina").textContent = this.viagem.titulo;
    $("#abrir-vai").href = `chat.html?viagem=${this.id}`;
    $("#editar-viagem").hidden = !this.podeGerenciar;
    $("#excluir-viagem").hidden = !this.podeGerenciar;
    this.montarCapa();
  },

  montarCapa() {
    const v = this.viagem;
    const status = STATUS_VIAGEM[v.status];
    const foto = v.lugar ? imagemLugar(v.lugar, { tamanho: "media", alt: "", eager: true })
      : '<img src="assets/praia.jpg" alt="" />';
    $("#capa").innerHTML = `
      <div class="capa-viagem">
        ${foto}
        <div class="capa-viagem__info">
          <span class="status ${status.classe}">${status.rotulo}</span>
          <h1>${escapar(v.destino)}</h1>
          <div class="capa-viagem__meta">
            <span>🗓️ ${Formato.periodo(v.data_ida, v.data_volta)}</span>
            <span>⏱️ ${v.duracao_dias} ${v.duracao_dias === 1 ? "dia" : "dias"}</span>
            <span>👥 ${v.viajantes}</span>
            <span>${escapar(v.tipo_rotulo)}</span>
            ${v.meu_papel !== "proprietario" ? `<span>Você: ${v.meu_papel === "editor" ? "editor(a)" : "viajante"}</span>` : ""}
          </div>
        </div>
      </div>`;
  },

  montarAbas() {
    $("#abas").innerHTML = this.abas.map((aba) =>
      `<button class="aba" role="tab" data-aba="${aba.chave}" aria-selected="false" aria-controls="painel">${aba.icone} ${aba.rotulo}</button>`).join("");
    $$("#abas .aba").forEach((botao) => botao.addEventListener("click", () => this.abrir(botao.dataset.aba)));
  },

  async abrir(chave) {
    const aba = this.abas.find((a) => a.chave === chave) || this.abas[0];
    this.abaAtual = aba.chave;
    $$("#abas .aba").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.aba === aba.chave)));
    $(`#abas .aba[data-aba="${aba.chave}"]`)?.scrollIntoView({ block: "nearest", inline: "center" });
    const url = new URL(window.location.href);
    url.searchParams.set("aba", aba.chave);
    url.searchParams.delete("gerar");
    history.replaceState(null, "", url);
    const painel = $("#painel");
    painel.innerHTML = esqueletos(3, 96);
    try {
      await aba.render(painel);
    } catch (erro) {
      painel.innerHTML = telaVazia("😕", "Não foi possível carregar esta seção", erro.message);
    }
  },

  recarregarAba() { return this.abrir(this.abaAtual); },

  async editar() {
    const salva = await abrirFormularioViagem({ viagem: this.viagem });
    if (salva) { await this.recarregarViagem(); this.recarregarAba(); }
  },

  async excluir() {
    const ok = await confirmar(`Excluir "${this.viagem.titulo}"? Roteiros, gastos, agenda, checklist e o grupo desta viagem serão apagados.`,
      { textoConfirmar: "Excluir viagem", perigo: true });
    if (!ok) return;
    try {
      const r = await Api.excluirViagem(this.id);
      toast(r.mensagem);
      window.location.href = "viagens.html";
    } catch (erro) {
      toast(erro.message, "erro");
    }
  },
};

/* ------------------------------- Resumo ---------------------------------- */
Painel.registrar("resumo", {
  rotulo: "Resumo",
  icone: "📋",
  async render(painel) {
    const v = Painel.viagem;
    const r = v.resumo;
    const [calendario, diario] = await Promise.all([
      Api.calendario(v.id).catch(() => null),
      Api.diarioDaViagem(v.id).catch(() => ({ registros: [] })),
    ]);
    const dias = Math.round((new Date(v.data_ida + "T00:00") - new Date(hojeIso() + "T00:00")) / 86400000);
    const contagem = v.status === "futura" ? (dias === 1 ? "Falta 1 dia!" : `Faltam ${dias} dias`)
      : v.status === "em_andamento" ? "Boa viagem! Ela está acontecendo agora." : "Viagem concluída. Que tal registrar as memórias?";
    const uso = r.orcamento ? Math.round((r.gasto / r.orcamento) * 100) : null;
    const proximos = (calendario?.eventos || []).filter((e) => e.inicio.slice(0, 10) >= hojeIso()).slice(0, 4);

    painel.innerHTML = `
      <div class="alerta-linha alerta-linha--info">⏳ ${escapar(contagem)}</div>
      <div class="kpis">
        <button type="button" class="kpi kpi--destaque" data-ir="gastos" style="text-align:left;cursor:pointer;font-family:inherit">
          <span>Gasto${r.orcamento ? " / orçamento" : ""}</span>
          <strong>${Formato.moeda(r.gasto)}${r.orcamento ? ` <small style="font-size:12px;opacity:.7">de ${Formato.moeda(r.orcamento)}</small>` : ""}</strong>
          ${uso !== null ? `<div class="progresso ${uso > 100 ? "progresso--erro" : uso >= 80 ? "progresso--aviso" : ""}" style="margin-top:8px"><span style="width:${Math.min(100, uso)}%"></span></div>` : ""}
        </button>
        <button type="button" class="kpi" data-ir="checklist" style="text-align:left;cursor:pointer;font-family:inherit">
          <span>Checklist</span><strong>${r.checklist_percentual}%</strong>
          <div class="progresso" style="margin-top:8px"><span style="width:${r.checklist_percentual}%"></span></div>
        </button>
        <button type="button" class="kpi" data-ir="roteiro" style="text-align:left;cursor:pointer;font-family:inherit">
          <span>Roteiro</span><strong>${r.roteiro_atividades} atividades</strong>
          <span>${r.roteiro_versoes} ${r.roteiro_versoes === 1 ? "versão" : "versões"}</span>
        </button>
        <button type="button" class="kpi" data-ir="grupo" style="text-align:left;cursor:pointer;font-family:inherit">
          <span>Grupo</span><strong>${v.total_participantes} ${v.total_participantes === 1 ? "pessoa" : "pessoas"}</strong>
          <span>Organizado por ${escapar(v.proprietario.nome.split(" ")[0])}</span>
        </button>
      </div>

      ${!r.roteiro_atividades && Painel.podeEditar ? `
        <div class="observacao-ia"><span aria-hidden="true">🧳</span><div>
          <strong>Deixe o Vai montar o roteiro</strong>
          <p class="texto-apoio" style="font-size:13px">Atividades organizadas por dia, agrupadas por proximidade, com lugares reais do destino.</p>
          <button type="button" class="botao botao--primario botao--pequeno" style="margin-top:10px" data-gerar>✨ Gerar roteiro</button>
        </div></div>` : ""}

      <div class="bloco">
        <div class="secao" style="padding-top:0"><h3>Próximos compromissos</h3><button type="button" data-ir="agenda">Ver agenda</button></div>
        ${proximos.length ? proximos.map((e) => `
          <div class="evento ${e.origem === "roteiro" ? "evento--roteiro" : ""} ${e.conflito ? "evento--conflito" : ""}">
            <strong>${escapar(e.icone || "")} ${escapar(e.titulo)}</strong>
            <span>${Formato.data(e.inicio)} · ${Formato.hora(e.inicio)}${e.conflito ? " · ⚠ conflito de horário" : ""}</span>
          </div>`).join("") : '<p class="texto-apoio">Nada agendado ainda.</p>'}
      </div>

      ${v.preferencias || v.observacoes ? `<div class="bloco">
        ${v.preferencias ? `<h3>Preferências</h3><p class="texto-apoio" style="margin-bottom:10px">${escapar(v.preferencias)}</p>` : ""}
        ${v.observacoes ? `<h3>Observações</h3><p class="texto-apoio" style="white-space:pre-line">${escapar(v.observacoes)}</p>` : ""}
      </div>` : ""}

      <div class="bloco">
        <div class="secao" style="padding-top:0"><h3>📔 Memórias desta viagem</h3>
          ${v.status !== "futura" ? `<a href="diario.html?novo=1&viagem=${v.id}">＋ Registrar</a>` : ""}</div>
        ${diario.registros.length ? diario.registros.map((reg) => `
          <div class="registro" style="margin-bottom:8px">
            <span class="registro__data">${Formato.data(reg.data)} · ${escapar(reg.autor.nome)}</span>
            <h3>${escapar(reg.titulo)}</h3>
            ${reg.relato ? `<p>${escapar(reg.relato.slice(0, 220))}${reg.relato.length > 220 ? "…" : ""}</p>` : ""}
          </div>`).join("") : `<p class="texto-apoio">${v.status === "futura"
            ? "Depois da viagem, registre aqui os melhores momentos." : "Nenhuma memória compartilhada ainda."}</p>`}
      </div>`;
    $$("[data-ir]", painel).forEach((b) => b.addEventListener("click", () => Painel.abrir(b.dataset.ir)));
    $("[data-gerar]", painel)?.addEventListener("click", () => { Painel.abrir("roteiro").then(() => abrirGeradorRoteiro()); });
  },
});

document.addEventListener("DOMContentLoaded", () => Painel.iniciar());
