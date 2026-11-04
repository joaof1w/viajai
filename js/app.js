/* Tela principal: recomendações, busca, salvos e perfil. */

if (Sessao.exigirLogin()) {
  const estado = {
    perfil: null,
    categoria: "todos",
    salvos: new Set(),
    aba: "inicio",
  };

  const el = (id) => document.getElementById(id);

  iniciar();

  /* --------------------------------------------------------------------- */
  async function iniciar() {
    montarNavegacao();
    try {
      estado.perfil = await Api.perfil();
      Sessao.atualizarUsuario(estado.perfil);
      if (!estado.perfil.possui_preferencias) {
        window.location.href = "interesses.html";
        return;
      }
      mostrarCabecalho();
      montarFiltros();
      await Promise.all([carregarSalvos(false), carregarInicio()]);
      preencherPerfil();
      carregarResumoViagens();
      abrirAbaDoEndereco();
    } catch (erro) {
      el("lista-lugares").innerHTML = mensagemVazia("😕", erro.message);
    }
  }

  function mostrarCabecalho() {
    el("nome-usuario").textContent = `${estado.perfil.nome} ✈️`;
    el("saudacao").textContent = "Bem-vindo de volta";
    el("avatar").textContent = estado.perfil.iniciais;
    el("avatar-perfil").textContent = estado.perfil.iniciais;
  }

  /* ----------------------------- filtros -------------------------------- */
  function montarFiltros() {
    const interesses = estado.perfil.preferencias?.interesses || [];
    const categorias = [{ slug: "todos", nome: "Todos" }, ...interesses];
    const container = el("filtros");
    container.innerHTML = "";
    categorias.forEach((categoria) => {
      const botao = document.createElement("button");
      botao.className = `filtro ${categoria.slug === estado.categoria ? "ativo" : ""}`;
      botao.textContent = categoria.nome;
      botao.dataset.slug = categoria.slug;
      botao.addEventListener("click", () => {
        estado.categoria = categoria.slug;
        container.querySelectorAll(".filtro").forEach((f) => f.classList.toggle("ativo", f.dataset.slug === categoria.slug));
        if (estado.aba === "explorar") buscar();
        else carregarInicio();
      });
      container.appendChild(botao);
    });
  }

  /* ------------------------------ início -------------------------------- */
  async function carregarInicio() {
    const destaques = el("destaques");
    const lista = el("lista-lugares");
    destaques.innerHTML = "";
    lista.className = "carregando";
    lista.innerHTML = '<div class="esqueleto"></div><div class="esqueleto"></div><div class="esqueleto"></div>';

    try {
      const dados = await Api.recomendacoes(10, estado.categoria);
      destaques.innerHTML = "";
      dados.lugares.slice(0, 6).forEach((lugar) => destaques.appendChild(cartaoDestaque(lugar)));

      lista.className = "";
      lista.innerHTML = "";
      const restantes = dados.lugares.slice(0, 10);
      if (!restantes.length) {
        lista.innerHTML = mensagemVazia("🧭", "Nenhum lugar encontrado para esses interesses.");
      }
      restantes.forEach((lugar) => lista.appendChild(cartaoLista(lugar)));
      el("contador-lugares").textContent = `${dados.total} ${dados.total === 1 ? "local" : "locais"}`;
    } catch (erro) {
      lista.className = "";
      lista.innerHTML = mensagemVazia("😕", erro.message);
    }
  }

  /* ------------------------------ busca --------------------------------- */
  async function buscar() {
    const lista = el("lista-busca");
    lista.innerHTML = '<div class="carregando"><div class="esqueleto"></div><div class="esqueleto"></div></div>';
    const filtros = {
      q: el("entrada-busca").value.trim(),
      categoria: estado.categoria,
      ordenar: el("filtro-ordem").value,
    };
    const preco = el("filtro-preco").value;
    if (preco) filtros.preco_maximo = preco;
    if (!filtros.q) delete filtros.q;

    try {
      const dados = await Api.buscarLugares(filtros);
      lista.innerHTML = "";
      if (!dados.lugares.length) {
        lista.innerHTML = mensagemVazia("🔍", "Nada encontrado. Tente outra palavra ou remova os filtros.");
      }
      dados.lugares.forEach((lugar) => lista.appendChild(cartaoLista(lugar)));
      el("contador-busca").textContent = `${dados.total} ${dados.total === 1 ? "resultado" : "resultados"}`;
    } catch (erro) {
      lista.innerHTML = mensagemVazia("😕", erro.message);
    }
  }

  let temporizador;
  el("entrada-busca").addEventListener("input", () => {
    clearTimeout(temporizador);
    trocarAba("explorar");
    temporizador = setTimeout(buscar, 320);
  });
  el("filtro-preco").addEventListener("change", buscar);
  el("filtro-ordem").addEventListener("change", buscar);
  el("botao-filtros").addEventListener("click", () => {
    trocarAba("explorar");
    el("painel-filtros").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  el("ver-mapa").addEventListener("click", abrirMapaGeral);

  /** Mapa com todo o catálogo: destinos e atrações (laranja) e restaurantes/estabelecimentos (azul). */
  async function abrirMapaGeral() {
    const corpo = Folha.abrir({
      titulo: "Lugares no mapa",
      conteudo: `<div class="legenda-mapa"><span class="selo">● Atrações e destinos</span>
        <span class="selo selo--cinza" style="color:var(--azul)">● Restaurantes e estabelecimentos</span></div>
        <div class="mapa mapa--alto" role="region" aria-label="Mapa dos lugares"></div>
        <p class="dica">Toque em um ponto para ver o lugar.</p>`,
    });
    const mapa = await criarMapa($(".mapa", corpo), { centro: [-15.8, -47.9], zoom: 4 });
    if (!mapa) return;
    try {
      const { lugares } = await Api.lugaresMapa();
      lugares.forEach((l) => {
        L.circleMarker([l.latitude, l.longitude], {
          radius: 9, weight: 2, color: "#fff", fillOpacity: 0.95,
          fillColor: l.tipo === "estabelecimento" ? "#2f80ed" : "#ff6b35",
        }).bindPopup(`<h4>${escapar(l.nome)}</h4><div>${escapar(l.local)} · ⭐ ${l.nota} · ${escapar(l.preco_simbolo)}</div>
          <a href="lugar.html?id=${l.id}">Ver detalhes e fotos</a>`).addTo(mapa);
      });
      mapa.fitBounds(lugares.map((l) => [l.latitude, l.longitude]), { padding: [24, 24] });
    } catch (erro) { toast(erro.message, "erro"); }
  }

  el("ver-todos").addEventListener("click", () => {
    trocarAba("explorar");
    buscar();
  });

  /* ----------------------------- favoritos ------------------------------- */
  async function carregarSalvos(renderizar = true) {
    try {
      const dados = await Api.listarFavoritos();
      estado.salvos = new Set(dados.lugares.map((l) => l.id));
      if (renderizar) {
        const lista = el("lista-salvos");
        lista.innerHTML = "";
        if (!dados.lugares.length) {
          lista.innerHTML = mensagemVazia("🔖", "Você ainda não salvou nenhum lugar. Toque no ♥ dos cartões.");
        }
        dados.lugares.forEach((lugar) => lista.appendChild(cartaoLista(lugar)));
        el("contador-salvos").textContent = `${dados.total} ${dados.total === 1 ? "lugar" : "lugares"}`;
      }
      el("perfil-salvos").textContent = estado.salvos.size;
    } catch (erro) {
      el("lista-salvos").innerHTML = mensagemVazia("😕", erro.message);
    }
  }

  async function alternarFavorito(lugar, botao) {
    const salvo = estado.salvos.has(lugar.id);
    try {
      if (salvo) {
        await Api.removerFavorito(lugar.id);
        estado.salvos.delete(lugar.id);
      } else {
        await Api.salvarFavorito(lugar.id);
        estado.salvos.add(lugar.id);
      }
      if (botao) botao.textContent = estado.salvos.has(lugar.id) ? "♥" : "♡";
      el("perfil-salvos").textContent = estado.salvos.size;
      if (estado.aba === "salvos") carregarSalvos();
    } catch (erro) {
      alert(erro.message);
    }
  }

  /* ------------------------------ cartões -------------------------------- */
  function cartaoDestaque(lugar) {
    const cartao = document.createElement("article");
    cartao.className = "destaque";
    cartao.innerHTML = `
      <div class="destaque__foto">${imagemLugar(lugar, { tamanho: "media" })}</div>
      <span class="destaque__etiqueta ${lugar.categoria === "gastronomia" ? "destaque__etiqueta--laranja" : ""}">${lugar.categoria}</span>
      <button class="destaque__coracao" type="button">${estado.salvos.has(lugar.id) ? "♥" : "♡"}</button>
      <div class="match match--sobre" style="--p:${lugar.match}"><span>${lugar.match}%</span></div>
      <div class="destaque__info">
        <h3>${lugar.nome}</h3>
        <div class="destaque__meta">
          <span>📍 ${lugar.local}</span>
        </div>
        <div class="destaque__meta">
          <span>⭐ ${lugar.nota} (${lugar.avaliacoes.toLocaleString("pt-BR")})</span>
          <span>${lugar.preco_simbolo}</span>
        </div>
      </div>`;
    cartao.querySelector(".destaque__coracao").addEventListener("click", (evento) => {
      evento.stopPropagation();
      alternarFavorito(lugar, evento.currentTarget);
    });
    cartao.addEventListener("click", () => abrirDetalhes(lugar));
    return cartao;
  }

  function cartaoLista(lugar) {
    const cartao = document.createElement("article");
    cartao.className = "cartao";
    cartao.innerHTML = `
      ${imagemLugar(lugar, { classe: "cartao__foto" })}
      <div class="cartao__corpo">
        <h3>${lugar.nome}</h3>
        <div class="cartao__linha"><span>📍 ${lugar.local}</span></div>
        <div class="cartao__linha">
          <span class="nota">⭐ ${lugar.nota}</span>
          <span>${lugar.distancia_km} km</span>
          <span class="categoria">· ${lugar.categoria}</span>
          <span>${lugar.preco_simbolo}</span>
        </div>
      </div>
      <div class="match" style="--p:${lugar.match}"><span>${lugar.match}%</span></div>`;
    cartao.addEventListener("click", () => abrirDetalhes(lugar));
    return cartao;
  }

  function mensagemVazia(icone, texto) {
    return `<div class="vazio"><div class="vazio__icone">${icone}</div><p>${texto}</p></div>`;
  }

  /* ------------------------------ detalhes ------------------------------- */
  function abrirDetalhes(lugar) {
    el("modal-foto").style.backgroundImage = `url('${urlCapa(lugar, "media")}')`;
    el("modal-credito").innerHTML = lugar.foto ? creditoFoto(lugar.foto) : "Ilustração da categoria — ainda sem fotografia verificada deste lugar.";
    el("modal-pagina").href = `lugar.html?id=${lugar.id}`;
    el("modal-planejar").href = `viagens.html?novo=1&lugar=${lugar.id}`;
    el("modal-nome").textContent = lugar.nome;
    el("modal-local").textContent = `📍 ${lugar.local} · ${lugar.categoria}`;
    el("modal-descricao").textContent = lugar.descricao;
    el("modal-nota").textContent = `⭐ ${lugar.nota} (${lugar.avaliacoes.toLocaleString("pt-BR")})`;
    el("modal-preco").textContent = lugar.preco_simbolo;
    el("modal-distancia").textContent = `${lugar.distancia_km} km`;
    el("modal-epoca").textContent = lugar.melhor_epoca || "O ano todo";
    const anel = el("modal-match");
    anel.style.setProperty("--p", lugar.match);
    anel.querySelector("span").textContent = `${lugar.match}%`;

    const botao = el("modal-favoritar");
    const atualizar = () => {
      botao.textContent = estado.salvos.has(lugar.id) ? "♥ Salvo — remover" : "♥ Salvar";
    };
    atualizar();
    botao.onclick = async () => {
      await alternarFavorito(lugar, null);
      atualizar();
      atualizarCoracao(lugar);
    };
    el("modal").classList.add("aberto");
  }

  /** Sincroniza o ♥ do cartão de destaque correspondente ao lugar. */
  function atualizarCoracao(lugar) {
    document.querySelectorAll("#destaques .destaque").forEach((cartao) => {
      if (cartao.querySelector("h3").textContent !== lugar.nome) return;
      cartao.querySelector(".destaque__coracao").textContent = estado.salvos.has(lugar.id) ? "♥" : "♡";
    });
  }

  document.querySelectorAll("[data-fechar]").forEach((elemento) =>
    elemento.addEventListener("click", () => el("modal").classList.remove("aberto"))
  );

  /* ------------------------------ navegação ------------------------------ */
  function montarNavegacao() {
    document.querySelectorAll(".nav button").forEach((botao) => {
      botao.addEventListener("click", () => trocarAba(botao.dataset.aba));
    });
    el("fab-chat").addEventListener("click", () => (window.location.href = "chat.html"));
    el("botao-interesses").addEventListener("click", () => (window.location.href = "interesses.html"));
    window.addEventListener("hashchange", abrirAbaDoEndereco);
    el("atalho-salvos").addEventListener("click", () => trocarAba("salvos"));
    el("botao-sair").addEventListener("click", async () => {
      try { await Api.sair(); } catch { /* token já inválido */ }
      Sessao.limpar();
      window.location.href = "index.html";
    });
  }

  /** Permite que outras telas abram uma aba específica (app.html#salvos, #perfil...). */
  function abrirAbaDoEndereco() {
    const aba = window.location.hash.replace("#", "");
    if (["inicio", "explorar", "salvos", "perfil"].includes(aba) && aba !== estado.aba) trocarAba(aba);
  }

  async function carregarResumoViagens() {
    try {
      const dados = await Api.listarViagens();
      el("perfil-viagens").textContent = `${dados.contagem.futura + dados.contagem.em_andamento} ativas · ${dados.contagem.concluida} concluídas`;
      if (dados.convites_pendentes) {
        el("contador-convites").textContent = dados.convites_pendentes;
        el("contador-convites").hidden = false;
      }
    } catch { /* resumo é opcional */ }
  }

  function trocarAba(aba) {
    estado.aba = aba;
    ["inicio", "explorar", "salvos", "perfil"].forEach((nome) => {
      el(`aba-${nome}`).hidden = nome !== aba;
    });
    document.querySelectorAll(".nav button").forEach((botao) =>
      botao.classList.toggle("ativo", botao.dataset.aba === aba)
    );
    document.querySelector(".filtros").style.display = aba === "perfil" || aba === "salvos" ? "none" : "flex";
    document.querySelector(".busca").style.display = aba === "perfil" ? "none" : "flex";
    if (aba === "salvos") carregarSalvos();
    if (aba === "explorar" && !el("lista-busca").children.length) buscar();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ------------------------------- perfil -------------------------------- */
  function preencherPerfil() {
    const perfil = estado.perfil;
    el("perfil-nome").textContent = perfil.nome;
    el("perfil-email").textContent = perfil.email;
    el("perfil-verificado").textContent = perfil.verificado ? "Sim ✓" : "Não";
    const preferencias = perfil.preferencias;
    if (!preferencias) return;
    el("perfil-orcamento").textContent = `${preferencias.orcamento_simbolo} · ${preferencias.orcamento_rotulo}`;
    el("perfil-local").textContent = `${preferencias.cidade}, ${preferencias.estado}`;
    el("perfil-interesses").innerHTML = preferencias.interesses
      .map((i) => `<span class="etiqueta">${i.icone} ${i.nome}</span>`)
      .join("");
  }
}
