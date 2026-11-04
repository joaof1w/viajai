/* Lista de viagens: filtros por status, convites pendentes e criação. */

if (Sessao.exigirLogin()) {
  let filtro = "";
  navegacaoInferior("viagens");
  $("#nova-viagem").addEventListener("click", criar);
  $$(".aba").forEach((aba) => aba.addEventListener("click", () => {
    filtro = aba.dataset.status;
    $$(".aba").forEach((a) => a.setAttribute("aria-selected", String(a === aba)));
    carregar();
  }));

  carregar();
  carregarConvites();
  if (parametro("novo")) criar(parametro("lugar"));

  async function criar(lugarId) {
    const viagem = await abrirFormularioViagem({ lugarId: typeof lugarId === "string" ? lugarId : null });
    if (viagem) window.location.href = `viagem.html?id=${viagem.id}`;
  }

  async function carregar() {
    const lista = $("#lista-viagens");
    lista.innerHTML = esqueletos(3, 118);
    try {
      const dados = await Api.listarViagens(filtro);
      ["em_andamento", "futura", "concluida"].forEach((status) => {
        const contador = $(`.aba[data-status="${status}"] .contador`);
        contador.textContent = dados.contagem[status];
        contador.hidden = !dados.contagem[status];
      });
      if (!dados.viagens.length) {
        const vazioTotal = !filtro;
        lista.innerHTML = telaVazia(vazioTotal ? "🗺️" : "🧭",
          vazioTotal ? "Nenhuma viagem por aqui ainda" : "Nada neste filtro",
          vazioTotal ? "Crie sua primeira viagem: o Vai ajuda com roteiro, gastos, agenda e mala." : "Tente outro filtro.",
          vazioTotal ? "Planejar uma viagem" : null);
        $("[data-acao-vazio]", lista)?.addEventListener("click", () => criar());
        return;
      }
      lista.innerHTML = dados.viagens.map(cartaoViagem).join("");
    } catch (erro) {
      lista.innerHTML = telaVazia("😕", "Não foi possível carregar", erro.message);
    }
  }

  function cartaoViagem(v) {
    const status = STATUS_VIAGEM[v.status];
    const capa = v.lugar ? imagemLugar(v.lugar, { classe: "cartao-viagem__foto", alt: "" })
      : `<img class="cartao-viagem__foto" src="assets/card-${v.tipo === "aventura" ? "aventura" : "praia"}.svg" alt="" loading="lazy" />`;
    return `<a class="cartao-viagem" href="viagem.html?id=${v.id}">
        ${capa}
        <div>
          <span class="status ${status.classe}">${status.rotulo}</span>
          ${v.meu_papel !== "proprietario" ? '<span class="selo selo--cinza">Compartilhada comigo</span>' : ""}
          <h3>${escapar(v.titulo)}</h3>
          <div class="cartao-viagem__meta">
            <span>📍 ${escapar(v.destino)}</span>
            <span>🗓️ ${Formato.periodo(v.data_ida, v.data_volta)} · ${v.duracao_dias} ${v.duracao_dias === 1 ? "dia" : "dias"}</span>
            <span>👥 ${v.total_participantes > 1 ? `${v.total_participantes} no grupo` : `${v.viajantes} ${v.viajantes === 1 ? "viajante" : "viajantes"}`}</span>
            ${v.orcamento != null ? `<span>💰 ${Formato.moeda(v.orcamento)}</span>` : ""}
          </div>
        </div>
      </a>`;
  }

  async function carregarConvites() {
    const area = $("#convites");
    try {
      const dados = await Api.convites();
      if (!dados.total) { area.innerHTML = ""; return; }
      area.innerHTML = `<div class="conteudo" style="padding-bottom:0"><div class="bloco">
          <h3>✉️ Convites para viagens</h3>
          ${dados.convites.map((c) => `
            <div class="pessoa" data-convite="${c.id}">
              <div class="pessoa__corpo">
                <strong>${escapar(c.viagem.titulo)}</strong>
                <span>${escapar(c.convidado_por)} convidou você · ${escapar(c.viagem.destino)} ·
                  ${Formato.periodo(c.viagem.data_ida, c.viagem.data_volta)} · como ${c.papel === "editor" ? "editor(a)" : "viajante"}</span>
              </div>
              <button type="button" class="botao botao--claro botao--pequeno" data-recusar>Recusar</button>
              <button type="button" class="botao botao--primario botao--pequeno" data-aceitar>Aceitar</button>
            </div>`).join("")}
        </div></div>`;
      $$("[data-convite]", area).forEach((linha) => {
        const id = linha.dataset.convite;
        $("[data-aceitar]", linha).addEventListener("click", (e) => comCarregamento(e.currentTarget, async () => {
          const r = await Api.aceitarConvite(id);
          toast(r.mensagem);
          window.location.href = `viagem.html?id=${r.viagem_id}`;
        }, "Entrando..."));
        $("[data-recusar]", linha).addEventListener("click", (e) => comCarregamento(e.currentTarget, async () => {
          const r = await Api.recusarConvite(id);
          toast(r.mensagem);
          carregarConvites();
        }, "..."));
      });
    } catch {
      area.innerHTML = "";
    }
  }
}
