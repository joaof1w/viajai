/* Histórico e diário: estatísticas, linha do tempo, memórias com fotos e visibilidade. */

if (Sessao.exigirLogin()) {
  let dados = null;
  let viagens = [];
  navegacaoInferior("perfil");
  ligarVoltar($("#botao-voltar"), "app.html#perfil");
  $("#novo-registro").addEventListener("click", () => formulario());
  carregar().then(() => {
    if (parametro("novo")) formulario(null, Number(parametro("viagem")) || null);
  });

  async function carregar() {
    $("#linha-tempo").innerHTML = esqueletos(3, 120);
    try {
      const [diario, estatisticas, lista] = await Promise.all([Api.diario(), Api.estatisticas(), Api.listarViagens()]);
      dados = diario;
      viagens = lista.viagens;
      desenharEstatisticas(estatisticas);
      desenharLinha();
    } catch (erro) {
      $("#linha-tempo").innerHTML = telaVazia("😕", "Não foi possível carregar o diário", erro.message);
    }
  }

  function desenharEstatisticas(e) {
    $("#estatisticas").innerHTML = `
      <div class="estatisticas">
        <div class="estatistica"><strong>${e.viagens_concluidas}</strong><span>viagens feitas</span></div>
        <div class="estatistica"><strong>${e.dias_viajados}</strong><span>dias viajando</span></div>
        <div class="estatistica"><strong>${e.destinos_conhecidos}</strong><span>destinos</span></div>
        <div class="estatistica"><strong>${e.estados_visitados.length}</strong><span>estados/países</span></div>
        <div class="estatistica"><strong>${e.registros}</strong><span>memórias</span></div>
        <div class="estatistica"><strong>${e.fotos}</strong><span>fotos</span></div>
      </div>
      ${e.estados_visitados.length || e.nota_media_pessoal ? `<div class="bloco" style="padding:14px">
        ${e.estados_visitados.length ? `<p style="font-size:13.5px"><strong>Por onde você passou:</strong> ${e.estados_visitados.map(escapar).join(" · ")}</p>` : ""}
        ${e.nota_media_pessoal ? `<p style="font-size:13.5px;margin-top:6px"><strong>Sua nota média:</strong> ${estrelas(e.nota_media_pessoal)} ${e.nota_media_pessoal}</p>` : ""}
        ${e.categoria_favorita ? `<p style="font-size:13.5px;margin-top:6px"><strong>Seu estilo favorito:</strong> ${escapar(e.categoria_favorita)}</p>` : ""}
      </div>` : ""}
      ${e.viagens.length ? `<div class="bloco"><h3 style="margin-bottom:6px">Viagens concluídas</h3>${e.viagens.map((v) =>
        `<a class="linha-info" href="viagem.html?id=${v.id}"><span>${escapar(v.titulo)}<br><span class="texto-mini">${Formato.periodo(v.data_ida, v.data_volta)}</span></span>
         <strong>${v.duracao_dias} dias</strong></a>`).join("")}</div>` : ""}`;
  }

  function desenharLinha() {
    const area = $("#linha-tempo");
    if (!dados.total) {
      area.innerHTML = telaVazia("📔", "Seu diário está em branco", "Registre lugares visitados, relatos, fotos e a sua nota para cada experiência.", "Registrar a primeira memória");
      $("[data-acao-vazio]", area).addEventListener("click", () => formulario());
      return;
    }
    area.innerHTML = dados.linha_do_tempo.map((grupo) => `
      <p class="ano">${escapar(grupo.ano)}</p>
      ${grupo.registros.map((r) => `
        <article class="registro" data-id="${r.id}">
          <div class="registro__topo">
            <span class="registro__data">${Formato.data(r.data, { day: "2-digit", month: "long" })}${r.local ? ` · ${escapar(r.local)}` : r.cidade ? ` · ${escapar(r.cidade)}` : ""}</span>
            <span class="selo ${r.visibilidade === "privado" ? "selo--cinza" : r.visibilidade === "publico" ? "selo--verde" : ""}">${escapar(r.visibilidade_rotulo)}</span>
          </div>
          <h3>${escapar(r.titulo)}</h3>
          ${r.nota_pessoal ? `<div>${estrelas(r.nota_pessoal)}</div>` : ""}
          ${r.relato ? `<p>${escapar(r.relato)}</p>` : ""}
          ${miniaturasFotos(r.fotos)}
          <p class="texto-mini" style="margin-top:8px">${r.viagem ? `🧳 <a href="viagem.html?id=${r.viagem.id}">${escapar(r.viagem.titulo)}</a>` : ""}
            ${r.lugar ? ` · 📍 <a href="lugar.html?id=${r.lugar.id}">${escapar(r.lugar.nome)}</a>` : ""}</p>
          <div class="acoes-linha" style="margin-top:10px">
            <button type="button" class="botao botao--claro botao--pequeno" data-editar>Editar</button>
            <button type="button" class="botao botao--texto botao--pequeno" data-excluir style="color:var(--vermelho)">Excluir</button>
          </div>
        </article>`).join("")}`).join("");
    $$(".registro", area).forEach((bloco) => {
      const registro = encontrar(Number(bloco.dataset.id));
      ligarMiniaturas(bloco, registro.fotos);
      $("[data-editar]", bloco).addEventListener("click", () => formulario(registro));
      $("[data-excluir]", bloco).addEventListener("click", async () => {
        if (!(await confirmar(`Excluir "${registro.titulo}" e suas fotos?`, { textoConfirmar: "Excluir", perigo: true }))) return;
        try { toast((await Api.excluirRegistro(registro.id)).mensagem); carregar(); } catch (erro) { toast(erro.message, "erro"); }
      });
    });
  }

  function encontrar(id) {
    for (const grupo of dados.linha_do_tempo) {
      const r = grupo.registros.find((x) => x.id === id);
      if (r) return r;
    }
    return null;
  }

  async function formulario(atual = null, viagemId = null) {
    const lugares = await catalogoLugares();
    const r = atual || { visibilidade: "privado", data: hojeIso(), viagem: viagemId ? { id: viagemId } : null };
    const vinculaveis = viagens.filter((v) => v.status !== "futura");
    const corpo = Folha.abrir({
      titulo: atual ? "Editar memória" : "Nova memória",
      conteudo: `<form class="form" novalidate>
        <div class="campo"><label for="r-titulo">Título</label>
          <input id="r-titulo" class="simples" name="titulo" maxlength="140" required value="${escapar(r.titulo || "")}" placeholder="Ex.: Pôr do sol na duna" /></div>
        <div class="form-grade">
          <div class="campo"><label for="r-data">Data</label><input id="r-data" type="date" name="data" max="${hojeIso()}" value="${escapar(r.data)}" /></div>
          <div class="campo"><label for="r-vis">Quem pode ver</label>
            <select id="r-vis" name="visibilidade">${dados.visibilidades.map((v) =>
              `<option value="${v.valor}" ${v.valor === r.visibilidade ? "selected" : ""}>${escapar(v.rotulo)}</option>`).join("")}</select></div>
        </div>
        <div class="campo"><label for="r-viagem">Viagem</label>
          <select id="r-viagem" name="viagem_id"><option value="">— Nenhuma —</option>${vinculaveis.map((v) =>
            `<option value="${v.id}" ${r.viagem && r.viagem.id === v.id ? "selected" : ""}>${escapar(v.titulo)}</option>`).join("")}</select></div>
        <div class="campo"><label for="r-lugar">Lugar do catálogo</label>
          <select id="r-lugar" name="lugar_id"><option value="">—</option>${lugares.map((l) =>
            `<option value="${l.id}" ${r.lugar && r.lugar.id === l.id ? "selected" : ""}>${escapar(l.nome)} · ${escapar(l.local)}</option>`).join("")}</select></div>
        <div class="form-grade">
          <div class="campo"><label for="r-cidade">Cidade</label><input id="r-cidade" class="simples" name="cidade" maxlength="80" value="${escapar(r.cidade || "")}" /></div>
          <div class="campo"><label for="r-estado">Estado ou país</label><input id="r-estado" class="simples" name="estado" maxlength="60" value="${escapar(r.estado || "")}" /></div>
        </div>
        <div class="campo"><label for="r-local">Local visitado</label><input id="r-local" class="simples" name="local" maxlength="160" value="${escapar(r.local || "")}" /></div>
        <div class="campo"><label>Sua avaliação pessoal</label><div data-estrelas></div></div>
        <div class="campo"><label for="r-relato">Relato</label>
          <textarea id="r-relato" name="relato" maxlength="8000" style="min-height:130px" placeholder="O que você viu, comeu, sentiu...">${escapar(r.relato || "")}</textarea></div>
        ${atual && atual.fotos.length ? `<div class="campo"><label>Fotos atuais</label>${miniaturasFotos(atual.fotos, { removivel: true })}</div>` : ""}
        <div data-fotos></div>
        <button type="submit" class="botao botao--primario">${atual ? "Salvar" : "Guardar memória"}</button></form>`,
    });
    const form = $("form", corpo);
    $("[data-estrelas]", form).appendChild(seletorEstrelas("nota_pessoal", r.nota_pessoal || 0));
    $("[data-fotos]", form).appendChild(campoFotos("fotos", 6 - (atual?.fotos.length || 0)));
    if (atual) {
      ligarMiniaturas(form, atual.fotos);
      $$("[data-remover-foto]", form).forEach((b) => b.addEventListener("click", async () => {
        try { await Api.removerFotoRegistro(atual.id, b.dataset.removerFoto); b.closest(".miniatura").remove(); toast("Foto removida."); carregar(); }
        catch (erro) { toast(erro.message, "erro"); }
      }));
    }
    form.addEventListener("submit", async (evento) => {
      evento.preventDefault();
      const envio = new FormData(form);
      if (!envio.get("nota_pessoal")) envio.set("nota_pessoal", "");
      try {
        const resposta = await comCarregamento($("button[type=submit]", form), () =>
          atual ? Api.editarRegistro(atual.id, envio) : Api.criarRegistro(envio), "Guardando...");
        Folha.fechar();
        toast(resposta.mensagem);
        carregar();
      } catch (erro) { mostrarErroFormulario(form, erro); }
    });
  }
}
