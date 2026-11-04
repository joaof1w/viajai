/* Página do lugar: fotografias reais (galeria + lightbox), informações, mapa com distâncias,
   avaliações da comunidade e ações (salvar, planejar, comparar, adicionar ao roteiro). */

const id = Number(parametro("id"));
const logado = Boolean(Sessao.token());
let lugar = null;
let fotos = [];

navegacaoInferior("explorar");
ligarVoltar($("#botao-voltar"), "app.html");
iniciar();

async function iniciar() {
  if (!id) { window.location.replace("app.html"); return; }
  try {
    lugar = await Api.detalharLugar(id);
  } catch (erro) {
    $("#conteudo").innerHTML = telaVazia("🧭", "Lugar não encontrado", erro.message);
    return;
  }
  fotos = lugar.fotos || [];
  document.title = `${lugar.nome} · Viajaí`;
  montarGaleria();
  montarConteudo();
  carregarAvaliacoes();
  montarMapa();
}

/* ------------------------------ galeria ---------------------------------- */
function montarGaleria() {
  const galeria = $("#galeria");
  const principal = $(".galeria__principal", galeria);
  principal.classList.remove("esqueleto");
  const favorito = $("#botao-favorito");
  favorito.textContent = lugar.favorito ? "♥" : "♡";
  favorito.setAttribute("aria-pressed", String(lugar.favorito));
  favorito.hidden = !logado;
  favorito.addEventListener("click", alternarFavorito);

  if (!fotos.length) {
    principal.outerHTML = `<div class="galeria__principal" style="position:relative">
        <img src="${escapar(urlImagem(lugar.imagem))}" alt="Ilustração da categoria ${escapar(lugar.categoria)}" />
        <span class="selo-ilustracao">Ilustração · ainda sem foto verificada deste lugar</span></div>`;
    return;
  }
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "galeria__principal";
  botao.setAttribute("aria-label", "Ampliar fotografia");
  botao.innerHTML = `<img src="${escapar(fotos[0].media)}" alt="${escapar(fotos[0].titulo || `Foto de ${lugar.nome}`)}"
      fetchpriority="high" decoding="async" data-reserva="${escapar(urlImagem(lugar.imagem))}" />
    ${fotos.length > 1 ? `<span class="galeria__contador">1 / ${fotos.length}</span>` : ""}`;
  principal.replaceWith(botao);
  let atual = 0;
  botao.addEventListener("click", () => Lightbox.abrir(fotos, atual));

  const credito = document.createElement("p");
  credito.className = "credito-foto";
  credito.innerHTML = creditoFoto(fotos[0]);
  galeria.appendChild(credito);

  if (fotos.length > 1) {
    const miniaturas = document.createElement("div");
    miniaturas.className = "galeria__miniaturas";
    miniaturas.innerHTML = fotos.map((f, i) => `<button type="button" data-i="${i}" aria-current="${i === 0}" aria-label="Foto ${i + 1}">
        <img src="${escapar(f.miniatura)}" alt="" loading="lazy" decoding="async" /></button>`).join("");
    galeria.appendChild(miniaturas);
    $$("button", miniaturas).forEach((b) => b.addEventListener("click", () => {
      atual = Number(b.dataset.i);
      $("img", botao).src = fotos[atual].media;
      $("img", botao).alt = fotos[atual].titulo || `Foto de ${lugar.nome}`;
      $(".galeria__contador", botao).textContent = `${atual + 1} / ${fotos.length}`;
      credito.innerHTML = creditoFoto(fotos[atual]);
      $$("button", miniaturas).forEach((x) => x.setAttribute("aria-current", String(x === b)));
    }));
  }
}

async function alternarFavorito() {
  const botao = $("#botao-favorito");
  try {
    if (lugar.favorito) await Api.removerFavorito(lugar.id); else await Api.salvarFavorito(lugar.id);
    lugar.favorito = !lugar.favorito;
    botao.textContent = lugar.favorito ? "♥" : "♡";
    botao.setAttribute("aria-pressed", String(lugar.favorito));
    toast(lugar.favorito ? "Salvo nos seus favoritos." : "Removido dos salvos.");
  } catch (erro) { toast(erro.message, "erro"); }
}

/* ----------------------------- conteúdo ---------------------------------- */
function montarConteudo() {
  $("#conteudo").innerHTML = `
    <div class="secao" style="align-items:center;padding-top:4px">
      <div><span class="categoria">${escapar(lugar.categoria)}</span> <span class="selo selo--cinza">${lugar.tipo === "estabelecimento" ? "Estabelecimento" : "Atração / destino"}</span>
        <h1 style="font-size:26px;margin-top:6px">${escapar(lugar.nome)}</h1>
        <p class="texto-apoio">📍 ${escapar(lugar.local)}</p></div>
      ${lugar.match ? `<div class="match" style="--p:${lugar.match}"><span>${lugar.match}%</span></div>` : ""}
    </div>
    <p style="margin:6px 0 14px;font-size:15px;line-height:1.6">${escapar(lugar.descricao)}</p>

    <div class="lugar-acoes">
      <a href="viagens.html?novo=1&lugar=${lugar.id}"><span>🧳</span>Planejar</a>
      <button type="button" id="add-roteiro"><span>➕</span>Ao roteiro</button>
      <a href="comparar.html?ids=${lugar.id}"><span>⚖️</span>Comparar</a>
      <a href="#avaliacoes"><span>⭐</span>Avaliar</a>
    </div>

    <div class="bloco">
      <div class="linha-info"><span>Avaliação no catálogo</span><strong>⭐ ${lugar.nota} (${lugar.avaliacoes.toLocaleString("pt-BR")})</strong></div>
      <div class="linha-info"><span>Comunidade Viajaí</span><strong id="nota-comunidade">—</strong></div>
      <div class="linha-info"><span>Faixa de preço</span><strong>${escapar(lugar.preco_simbolo)}</strong></div>
      ${logado ? `<div class="linha-info"><span>Distância de você</span><strong>${Formato.km(lugar.distancia_km)} <small class="texto-mini">linha reta</small></strong></div>` : ""}
      <div class="linha-info"><span>Melhor época</span><strong>${escapar(lugar.melhor_epoca || "O ano todo")}</strong></div>
    </div>

    <div class="bloco">
      <div class="secao" style="padding-top:0"><h3>No mapa</h3><span class="texto-mini">raio de 3 km</span></div>
      <div class="mapa" id="mapa-lugar" role="region" aria-label="Mapa do lugar"></div>
      <div id="proximos" style="margin-top:10px"></div>
    </div>

    <section class="bloco" id="avaliacoes" aria-label="Avaliações">
      <h3 style="margin-bottom:12px">Avaliações e experiências</h3>
      <div id="area-avaliacoes">${esqueletos(2, 70)}</div>
    </section>`;
  $("#add-roteiro").addEventListener("click", adicionarAoRoteiro);
}

async function adicionarAoRoteiro() {
  if (!logado) { window.location.href = "login.html"; return; }
  const dados = await Api.listarViagens();
  const abertas = dados.viagens.filter((v) => v.status !== "concluida" && ["proprietario", "editor"].includes(v.meu_papel));
  if (!abertas.length) {
    if (await confirmar("Você ainda não tem viagens em planejamento. Criar uma para este lugar?", { textoConfirmar: "Criar viagem" })) {
      window.location.href = `viagens.html?novo=1&lugar=${lugar.id}`;
    }
    return;
  }
  const corpo = Folha.abrir({
    titulo: `Adicionar ${lugar.nome}`,
    conteudo: `<form class="form">
      <div class="campo"><label for="viagem-alvo">Viagem</label>
        <select id="viagem-alvo">${abertas.map((v) => `<option value="${v.id}" data-dias="${v.duracao_dias}">${escapar(v.titulo)} · ${Formato.periodo(v.data_ida, v.data_volta)}</option>`).join("")}</select></div>
      <div class="campo"><label for="dia-alvo">Dia</label><select id="dia-alvo"></select></div>
      <button type="submit" class="botao botao--primario">Adicionar ao roteiro principal</button></form>`,
  });
  const seletor = $("#viagem-alvo", corpo);
  const dias = () => {
    const n = Number(seletor.selectedOptions[0].dataset.dias);
    $("#dia-alvo", corpo).innerHTML = Array.from({ length: n }, (_, i) => `<option value="${i + 1}">Dia ${i + 1}</option>`).join("");
  };
  dias();
  seletor.addEventListener("change", dias);
  $("form", corpo).addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const viagemId = Number(seletor.value);
    try {
      await comCarregamento($("button", corpo), async () => {
        const roteiros = await Api.roteiros(viagemId);
        const roteiro = roteiros.ativo || (await Api.criarRoteiro(viagemId, { titulo: "Meu roteiro" })).roteiro;
        await Api.adicionarAtividade(roteiro.id, {
          titulo: lugar.nome, dia: Number($("#dia-alvo", corpo).value), lugar_id: lugar.id,
          categoria: lugar.categoria === "gastronomia" ? "restaurante" : "atracao", descricao: lugar.descricao,
        });
      });
      Folha.fechar();
      toast("Adicionado ao roteiro!");
    } catch { /* toast já exibido */ }
  });
}

/* -------------------------------- mapa ----------------------------------- */
async function montarMapa() {
  const elemento = $("#mapa-lugar");
  const mapa = await criarMapa(elemento, { centro: [lugar.latitude, lugar.longitude], zoom: 13 });
  if (!mapa) return;
  L.marker([lugar.latitude, lugar.longitude], { icon: marcadorNumerado("★", "#16232f"), title: lugar.nome })
    .bindPopup(`<h4>${escapar(lugar.nome)}</h4><div>${escapar(lugar.local)}</div>`).addTo(mapa);
  let dados;
  try { dados = await Api.proximidades(lugar.id, 3); } catch (erro) { $("#proximos").innerHTML = `<p class="dica">${escapar(erro.message)}</p>`; return; }
  dados.catalogo.slice(0, 6).forEach((l) => L.circleMarker([l.latitude, l.longitude], { radius: 8, color: "#ff6b35", fillOpacity: .8 })
    .bindPopup(`<h4>${escapar(l.nome)}</h4><div>${Formato.km(l.distancia_km)} em linha reta</div><a href="lugar.html?id=${l.id}">Ver lugar</a>`).addTo(mapa));
  dados.pontos.forEach((p) => L.circleMarker([p.latitude, p.longitude], { radius: 6, color: "#2f80ed", fillOpacity: .7 })
    .bindPopup(`<h4>${escapar(p.nome)}</h4><div>${escapar(p.tipo)} · ${Formato.km(p.distancia_km)}</div>
      ${p.funcionamento ? `<div>🕘 ${escapar(p.funcionamento)}</div>` : ""}<small>Fonte: OpenStreetMap</small>`).addTo(mapa));
  $("#proximos").innerHTML = `
    ${dados.aviso ? `<p class="dica">Estabelecimentos do OpenStreetMap indisponíveis no momento (${escapar(dados.aviso)}).</p>` : ""}
    ${dados.catalogo.slice(0, 4).map((l) => `<a class="trecho" href="lugar.html?id=${l.id}"><span>🟠 ${escapar(l.nome)}</span><strong>${Formato.km(l.distancia_km)}</strong></a>`).join("")}
    ${dados.pontos.slice(0, 8).map((p) => `<div class="trecho"><span>🔵 ${escapar(p.nome)} <span class="texto-mini">${escapar(p.tipo)}</span></span><strong>${Formato.km(p.distancia_km)}</strong></div>`).join("")}
    <p class="dica">Distâncias em linha reta a partir de ${escapar(lugar.nome)}.</p>`;
}

/* ----------------------------- avaliações -------------------------------- */
async function carregarAvaliacoes(ordenar = "recentes") {
  const area = $("#area-avaliacoes");
  let dados;
  try { dados = await Api.avaliacoes(lugar.id, ordenar); } catch (erro) { area.innerHTML = `<p class="texto-apoio">${escapar(erro.message)}</p>`; return; }
  const c = dados.comunidade;
  $("#nota-comunidade").textContent = c.total ? `⭐ ${c.media} (${c.total})` : "Sem avaliações ainda";
  const maior = Math.max(1, ...Object.values(c.distribuicao));
  area.innerHTML = `
    ${c.total ? `<div class="resumo-notas">
      <div class="resumo-notas__media"><strong>${c.media}</strong>${estrelas(c.media)}<div class="texto-mini">${c.total} ${c.total === 1 ? "avaliação" : "avaliações"}</div></div>
      <div class="distribuicao">${[5, 4, 3, 2, 1].map((n) => `<div><span>${n}★</span>
        <div class="progresso"><span style="width:${(c.distribuicao[n] / maior) * 100}%;background:#f5a524"></span></div><span>${c.distribuicao[n]}</span></div>`).join("")}</div>
    </div>
    <p class="dica">Média calculada só com avaliações de pessoas da comunidade (uma por pessoa), separada da nota do catálogo.</p>` : ""}
    <div id="minha-avaliacao" style="margin:14px 0"></div>
    ${dados.avaliacoes.length ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
      <h4 style="margin:0">O que dizem os viajantes</h4>
      <label class="visualmente-oculto" for="ordem-av">Ordenar</label>
      <select id="ordem-av" class="selecao" style="width:auto;padding:8px">
        ${[["recentes", "Mais recentes"], ["melhores", "Melhores"], ["piores", "Piores"], ["verificadas", "Verificadas"]].map(([v, r]) =>
          `<option value="${v}" ${v === ordenar ? "selected" : ""}>${r}</option>`).join("")}</select></div>
      <div id="lista-avaliacoes">${dados.avaliacoes.map(cartaoAvaliacao).join("")}</div>`
      : !dados.minha ? telaVazia("⭐", "Seja a primeira pessoa a avaliar", "Conte como foi a sua experiência neste lugar.") : ""}
    ${dados.experiencias.length ? `<h4 style="margin:18px 0 8px">Relatos do diário</h4>${dados.experiencias.map((e) => `
      <div class="registro"><span class="registro__data">${Formato.data(e.data, { day: "2-digit", month: "short", year: "numeric" })} · ${escapar(e.autor.nome)}</span>
        <h3>${escapar(e.titulo)}</h3>${e.relato ? `<p>${escapar(e.relato)}</p>` : ""}${miniaturasFotos(e.fotos)}</div>`).join("")}` : ""}`;
  $("#ordem-av", area)?.addEventListener("change", (e) => carregarAvaliacoes(e.target.value));
  $$(".avaliacao", area).forEach((bloco) => {
    const av = dados.avaliacoes.find((a) => a.id === Number(bloco.dataset.id));
    ligarMiniaturas(bloco, av.fotos);
  });
  $$(".registro", area).forEach((bloco, i) => ligarMiniaturas(bloco, dados.experiencias[i].fotos));
  montarMinhaAvaliacao(dados.minha);
}

function cartaoAvaliacao(a) {
  return `<article class="avaliacao" data-id="${a.id}">
      <div class="avaliacao__topo"><div class="avatar">${escapar(a.autor.iniciais)}</div>
        <div><strong>${escapar(a.autor.nome)}</strong>${a.minha ? " <span class='texto-mini'>(você)</span>" : ""}
          <div class="texto-mini">${estrelas(a.nota)} · ${Formato.relativo(a.criado_em)}${a.editada ? " · editada" : ""}</div></div>
        ${a.experiencia_verificada ? '<span class="selo selo--verde" style="margin-left:auto" title="O autor tem uma viagem concluída no Viajaí que passou por este lugar">✓ Viagem verificada</span>' : ""}
      </div>
      ${a.titulo ? `<h4 style="margin:4px 0">${escapar(a.titulo)}</h4>` : ""}
      <p>${escapar(a.comentario)}</p>
      ${a.data_visita ? `<p class="texto-mini" style="margin-top:4px">Visitou em ${Formato.data(a.data_visita, { month: "long", year: "numeric" })}</p>` : ""}
      ${miniaturasFotos(a.fotos)}
    </article>`;
}

function montarMinhaAvaliacao(minha) {
  const area = $("#minha-avaliacao");
  if (!logado) {
    area.innerHTML = '<a class="botao botao--claro" href="login.html">Entre para avaliar este lugar</a>';
    return;
  }
  if (minha) {
    area.innerHTML = `<div class="bloco" style="background:var(--laranja-claro);border-color:#ffd9c7">
        <strong>Sua avaliação</strong> ${estrelas(minha.nota)}
        <p style="font-size:14px;margin-top:6px">${escapar(minha.comentario)}</p>
        ${miniaturasFotos(minha.fotos, { removivel: true })}
        <div class="acoes-linha"><button type="button" class="botao botao--claro botao--pequeno" data-editar>Editar</button>
          <button type="button" class="botao botao--texto botao--pequeno" data-excluir style="color:var(--vermelho)">Excluir</button></div></div>`;
    ligarMiniaturas(area, minha.fotos);
    $("[data-editar]", area).addEventListener("click", () => formularioAvaliacao(minha));
    $("[data-excluir]", area).addEventListener("click", async () => {
      if (!(await confirmar("Excluir sua avaliação?", { textoConfirmar: "Excluir", perigo: true }))) return;
      try { toast((await Api.excluirAvaliacao(minha.id)).mensagem); carregarAvaliacoes(); } catch (erro) { toast(erro.message, "erro"); }
    });
    $$("[data-remover-foto]", area).forEach((b) => b.addEventListener("click", async () => {
      try { await Api.removerFotoAvaliacao(minha.id, b.dataset.removerFoto); toast("Foto removida."); carregarAvaliacoes(); }
      catch (erro) { toast(erro.message, "erro"); }
    }));
    return;
  }
  area.innerHTML = '<button type="button" class="botao botao--primario">⭐ Avaliar este lugar</button>';
  $("button", area).addEventListener("click", () => formularioAvaliacao(null));
}

function formularioAvaliacao(atual) {
  const corpo = Folha.abrir({
    titulo: atual ? "Editar avaliação" : `Avaliar ${lugar.nome}`,
    conteudo: `<form class="form" novalidate>
      <div class="campo"><label>Sua nota</label><div data-estrelas></div></div>
      <div class="campo"><label for="av-titulo">Título <span class="texto-mini">(opcional)</span></label>
        <input id="av-titulo" class="simples" name="titulo" maxlength="120" value="${escapar(atual?.titulo || "")}" /></div>
      <div class="campo"><label for="av-com">Como foi?</label>
        <textarea id="av-com" name="comentario" maxlength="2000" minlength="10" required placeholder="Conte detalhes que ajudem outros viajantes (mín. 10 caracteres)">${escapar(atual?.comentario || "")}</textarea></div>
      <div class="campo"><label for="av-data">Quando você foi?</label>
        <input id="av-data" type="date" name="data_visita" max="${hojeIso()}" value="${escapar(atual?.data_visita || "")}" /></div>
      <div data-fotos></div>
      <p class="dica">Avaliações ficam visíveis para todos. Uma por pessoa e lugar. O selo "viagem verificada" aparece
        quando você tem uma viagem concluída no Viajaí que passou por aqui.</p>
      <button type="submit" class="botao botao--primario">${atual ? "Salvar" : "Publicar avaliação"}</button></form>`,
  });
  const form = $("form", corpo);
  $("[data-estrelas]", form).appendChild(seletorEstrelas("nota", atual?.nota || 0));
  $("[data-fotos]", form).appendChild(campoFotos("fotos", 6 - (atual?.fotos.length || 0)));
  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const dados = new FormData(form);
    if (!dados.get("nota")) { mostrarErroFormulario(form, { campo: null, message: "Escolha uma nota de 1 a 5 estrelas." }); return; }
    try {
      const r = await comCarregamento($("button[type=submit]", form), () =>
        atual ? Api.editarAvaliacao(atual.id, dados) : Api.avaliar(lugar.id, dados), "Publicando...");
      Folha.fechar();
      toast(r.mensagem);
      carregarAvaliacoes();
    } catch (erro) { mostrarErroFormulario(form, erro); }
  });
}
