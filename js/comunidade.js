/* Feed da comunidade: avaliações recentes e relatos públicos do diário. */

navegacaoInferior("inicio");
ligarVoltar($("#botao-voltar"), "app.html");
carregar();

async function carregar() {
  const feed = $("#feed");
  feed.innerHTML = esqueletos(3, 110);
  let dados;
  try { dados = await Api.comunidade(); } catch (erro) { feed.innerHTML = telaVazia("😕", "Não foi possível carregar", erro.message); return; }
  if (!dados.itens.length) {
    feed.innerHTML = telaVazia("🌎", "A comunidade está começando", "Avalie lugares que você visitou ou torne públicas as memórias do seu diário.", "Explorar lugares");
    $("[data-acao-vazio]", feed).addEventListener("click", () => (window.location.href = "app.html#explorar"));
    return;
  }
  feed.innerHTML = dados.itens.map((item, i) => {
    if (item.tipo === "avaliacao") {
      const a = item.avaliacao;
      return `<article class="registro" data-i="${i}">
          <div class="registro__topo"><span class="registro__data">⭐ Avaliação · ${Formato.relativo(a.criado_em)}</span>
            ${a.experiencia_verificada ? '<span class="selo selo--verde">✓ Viagem verificada</span>' : ""}</div>
          <h3><a href="lugar.html?id=${a.lugar.id}">${escapar(a.lugar.nome)}</a> <span class="texto-mini">${escapar(a.lugar.local)}</span></h3>
          <div>${estrelas(a.nota)} <span class="texto-mini">por ${escapar(a.autor.nome)}</span></div>
          ${a.titulo ? `<h4 style="margin:6px 0 2px">${escapar(a.titulo)}</h4>` : ""}
          <p>${escapar(a.comentario)}</p>${miniaturasFotos(a.fotos)}
        </article>`;
    }
    const r = item.relato;
    return `<article class="registro" data-i="${i}">
        <div class="registro__topo"><span class="registro__data">📔 Relato · ${Formato.data(r.data, { day: "2-digit", month: "short", year: "numeric" })}</span></div>
        <h3>${escapar(r.titulo)}</h3>
        <p class="texto-mini">por ${escapar(r.autor.nome)}${r.lugar ? ` · <a href="lugar.html?id=${r.lugar.id}">${escapar(r.lugar.nome)}</a>` : r.cidade ? ` · ${escapar(r.cidade)}` : ""}</p>
        ${r.nota_pessoal ? estrelas(r.nota_pessoal) : ""}
        ${r.relato ? `<p>${escapar(r.relato)}</p>` : ""}${miniaturasFotos(r.fotos)}
      </article>`;
  }).join("");
  $$("[data-i]", feed).forEach((bloco) => {
    const item = dados.itens[Number(bloco.dataset.i)];
    ligarMiniaturas(bloco, (item.avaliacao || item.relato).fotos);
  });
}
