/* Comparador de destinos (até três), com destaques por critério. */

const escolhidos = (parametro("ids") || "").split(",").map(Number).filter(Boolean).slice(0, 3);
let catalogo = [];

navegacaoInferior("explorar");
ligarVoltar($("#botao-voltar"), "app.html");
iniciar();

async function iniciar() {
  try { catalogo = (await Api.lugaresMapa()).lugares; } catch (erro) { toast(erro.message, "erro"); }
  desenharLista();
  atualizar();
  $("#filtro").addEventListener("input", desenharLista);
}

function normalizar(t) { return (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

function desenharLista() {
  const termo = normalizar($("#filtro").value);
  const itens = catalogo.filter((l) => !termo || normalizar(`${l.nome} ${l.local} ${l.categoria}`).includes(termo));
  $("#lista").innerHTML = itens.map((l) => `
    <button type="button" role="listitem" data-id="${l.id}" aria-pressed="${escolhidos.includes(l.id)}">
      ${imagemLugar(l, { alt: "" })}
      <span style="flex:1"><strong style="display:block;font-size:14px">${escapar(l.nome)}</strong>
        <span class="texto-mini">${escapar(l.local)} · ${escapar(l.categoria)} · ⭐ ${l.nota} · ${escapar(l.preco_simbolo)}</span></span>
      <span aria-hidden="true">${escolhidos.includes(l.id) ? "✓" : "＋"}</span>
    </button>`).join("") || '<p class="texto-apoio" style="padding:12px">Nada encontrado.</p>';
  $$("#lista button").forEach((b) => b.addEventListener("click", () => alternar(Number(b.dataset.id))));
}

function alternar(id) {
  const i = escolhidos.indexOf(id);
  if (i >= 0) escolhidos.splice(i, 1);
  else if (escolhidos.length >= 3) { toast("Compare no máximo 3 destinos por vez.", "erro"); return; }
  else escolhidos.push(id);
  history.replaceState(null, "", escolhidos.length ? `?ids=${escolhidos.join(",")}` : "comparar.html");
  desenharLista();
  atualizar();
}

async function atualizar() {
  $("#escolhidos").innerHTML = escolhidos.map((id) => {
    const l = catalogo.find((x) => x.id === id);
    return l ? `<span class="etiqueta">${escapar(l.nome)}<button type="button" data-tirar="${id}" aria-label="Remover ${escapar(l.nome)}">✕</button></span>` : "";
  }).join("") || '<span class="texto-mini">Nenhum destino escolhido.</span>';
  $$("[data-tirar]").forEach((b) => b.addEventListener("click", () => alternar(Number(b.dataset.tirar))));

  const resultado = $("#resultado");
  if (escolhidos.length < 2) {
    resultado.innerHTML = telaVazia("⚖️", "Escolha pelo menos dois destinos", "Comparamos preço, avaliações, atrações por perto, clima, distância e compatibilidade com você.");
    return;
  }
  resultado.innerHTML = esqueletos(1, 320);
  try {
    desenharComparacao(await Api.comparar(escolhidos));
  } catch (erro) {
    resultado.innerHTML = telaVazia("😕", "Não foi possível comparar", erro.message);
  }
}

function desenharComparacao(dados) {
  const d = dados.destaques;
  const vence = (chave, id) => (d[chave] || []).includes(id);
  $("#resultado").innerHTML = `
    <div class="secao"><h2>Lado a lado</h2><span class="texto-mini">${dados.personalizado ? "personalizado para você" : "entre para ver o match"}</span></div>
    <div class="comparador" style="--colunas:${dados.itens.length}">${dados.itens.map((item) => {
      const l = item.lugar;
      const id = l.id;
      const atr = item.atracoes;
      const clima = item.clima;
      return `<article class="comparador__coluna">
        ${imagemLugar(l, { tamanho: "media" })}
        <div class="comparador__corpo">
          <h3><a href="lugar.html?id=${id}">${escapar(l.nome)}</a></h3>
          <p class="texto-mini">📍 ${escapar(item.localizacao.local)}</p>
          ${l.foto ? `<p class="texto-mini" style="margin-top:4px">${creditoFoto(l.foto)}</p>` : '<p class="texto-mini" style="margin-top:4px">Ilustração (sem foto verificada)</p>'}
          <div class="criterio ${vence("menor_preco", id) ? "criterio--vence" : ""}"><span>Faixa de preço</span>${escapar(item.preco.simbolo)}</div>
          <div class="criterio ${vence("melhor_nota", id) ? "criterio--vence" : ""}"><span>Avaliação (catálogo)</span>⭐ ${item.avaliacao.catalogo}
            <small class="texto-mini">(${item.avaliacao.catalogo_total.toLocaleString("pt-BR")})</small></div>
          <div class="criterio ${vence("melhor_comunidade", id) ? "criterio--vence" : ""}"><span>Comunidade Viajaí</span>
            ${item.avaliacao.comunidade !== null ? `⭐ ${item.avaliacao.comunidade} (${item.avaliacao.comunidade_total})` : "Sem avaliações ainda"}</div>
          <div class="criterio ${vence("mais_atracoes", id) ? "criterio--vence" : ""}"><span>Atrações do catálogo em 60 km</span>
            ${atr.catalogo_proximos}${atr.catalogo_proximos ? ` · ${Object.entries(atr.por_categoria).map(([c, n]) => `${escapar(c)} ${n}`).join(", ")}` : ""}
            ${atr.exemplos.length ? `<div class="texto-mini">${atr.exemplos.map(escapar).join(", ")}</div>` : ""}
            ${atr.openstreetmap ? `<div class="texto-mini">OpenStreetMap (5 km): ${Object.entries(atr.openstreetmap).map(([t, n]) => `${escapar(t)} ${n}`).join(", ")}</div>` : ""}</div>
          <div class="criterio"><span>Características</span>${escapar(item.caracteristicas.categoria_nome)} · ${item.caracteristicas.tipo === "estabelecimento" ? "estabelecimento" : "atração/destino"}
            <div class="texto-mini">${escapar(item.caracteristicas.descricao)}</div></div>
          <div class="criterio"><span>Clima</span>${clima ? `${clima.minima_media}°–${clima.maxima_media}°C ${clima.chuva_probabilidade_media !== null ? `· chuva ${clima.chuva_probabilidade_media}%` : ""}
            <div class="texto-mini">Previsão ${escapar(clima.periodo)} (${escapar(clima.fonte)})</div>` : '<span class="texto-mini">Previsão indisponível agora</span>'}
            <div class="texto-mini">Melhor época: ${escapar(item.caracteristicas.melhor_epoca || "o ano todo")}</div></div>
          <div class="criterio ${vence("mais_perto", id) ? "criterio--vence" : ""}"><span>Distância de você</span>
            ${item.localizacao.distancia_km !== null ? `${Formato.km(item.localizacao.distancia_km)} <span class="texto-mini">linha reta</span>` : '<span class="texto-mini">Entre e informe sua cidade</span>'}</div>
          <div class="criterio ${vence("maior_match", id) ? "criterio--vence" : ""}"><span>Compatibilidade</span>
            <div style="display:flex;align-items:center;gap:10px"><div class="match" style="--p:${item.compatibilidade.match}"><span>${item.compatibilidade.match}%</span></div>
            <span class="texto-mini">${item.compatibilidade.combina_com.length ? `Combina com: ${item.compatibilidade.combina_com.map(escapar).join(", ")}` : "Fora dos seus interesses principais"}</span></div></div>
          <a class="botao botao--suave botao--pequeno" style="width:100%;margin-top:10px" href="viagens.html?novo=1&lugar=${id}">🧳 Planejar viagem</a>
        </div>
      </article>`;
    }).join("")}</div>
    <p class="dica">${escapar(dados.aviso_distancias)} "✓ vantagem" marca o melhor resultado em cada critério quando há diferença.</p>`;
}
