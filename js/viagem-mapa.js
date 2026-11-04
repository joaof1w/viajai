/* Aba Mapa: todos os lugares da viagem no mesmo mapa, trajetos por dia e distâncias reais
   em linha reta (Haversine). Clique no mapa para adicionar uma atividade naquele ponto. */

Painel.registrar("mapa", {
  rotulo: "Mapa",
  icone: "🗺️",
  async render(painel) {
    const dados = await Api.mapaViagem(Painel.id);
    painel.innerHTML = `
      ${dados.sem_localizacao ? `<div class="alerta-linha alerta-linha--info">Não conseguimos localizar "${escapar(dados.viagem.destino)}"
        automaticamente. Escolha um destino do catálogo ao editar a viagem ou marque as atividades no mapa.</div>` : ""}
      <div class="mapa mapa--alto" id="mapa-viagem" role="region" aria-label="Mapa da viagem"></div>
      <div class="legenda-mapa" id="legenda-dias"></div>
      <p class="dica">Toque em dois pontos para medir a distância entre eles${Painel.podeEditar ? "; toque em um espaço vazio para adicionar uma atividade ali" : ""}.
        Distâncias em linha reta — o trajeto real pode ser maior.</p>
      <div class="bloco" id="medicao" hidden></div>
      <div class="bloco"><h3 style="margin-bottom:6px">Distâncias por dia</h3><div id="trechos"></div></div>
      <div class="bloco"><div class="secao" style="padding-top:0"><h3>Por perto</h3>
        <button type="button" id="carregar-proximos">Mostrar no mapa</button></div>
        <div id="proximos"><p class="texto-apoio" style="font-size:13px">Lugares do catálogo${Painel.viagem.lugar_id ? " e estabelecimentos do OpenStreetMap" : ""} perto do destino.</p></div>
      </div>`;
    await montarMapaViagem(painel, dados);
  },
});

async function montarMapaViagem(painel, dados) {
  const v = Painel.viagem;
  const centro = v.latitude != null ? [v.latitude, v.longitude] : dados.pontos[0] ? [dados.pontos[0].latitude, dados.pontos[0].longitude] : [-15.8, -47.9];
  const mapa = await criarMapa($("#mapa-viagem", painel), { centro, zoom: v.latitude != null ? 12 : 4 });
  if (!mapa) return;
  const camadasPorDia = {};
  const limites = [];
  const selecionados = [];

  dados.pontos.forEach((p) => {
    let icone;
    if (p.tipo === "destino") icone = L.divIcon({ className: "marcador", html: '<span style="background:#16232f">★</span>', iconSize: [30, 30], iconAnchor: [15, 15] });
    else if (p.tipo === "compromisso") icone = marcadorNumerado("🗓", "#6b4b3a");
    else icone = marcadorNumerado(p.dia, CORES_DIA[(p.dia - 1) % CORES_DIA.length]);
    const marcador = L.marker([p.latitude, p.longitude], { icon: icone, title: p.titulo, keyboard: true });
    marcador.bindPopup(`<h4>${escapar(p.titulo)}</h4>
      ${p.dia ? `<div>Dia ${p.dia}${p.horario ? ` · ${escapar(p.horario)}` : ""}</div>` : "<div>Destino da viagem</div>"}
      ${p.endereco ? `<div>📍 ${escapar(p.endereco)}</div>` : ""}
      ${p.funcionamento ? `<div>🕘 ${escapar(p.funcionamento)} <small>(OpenStreetMap)</small></div>` : ""}
      ${p.lugar_id ? `<a href="lugar.html?id=${p.lugar_id}">Ver lugar</a>` : ""}`);
    marcador.on("click", () => medir(p));
    const chave = p.dia || 0;
    (camadasPorDia[chave] = camadasPorDia[chave] || L.layerGroup().addTo(mapa)).addLayer(marcador);
    limites.push([p.latitude, p.longitude]);
  });

  dados.trajetos.forEach((t) => {
    const coords = t.pontos.map((ch) => dados.pontos.find((p) => p.chave === ch)).map((p) => [p.latitude, p.longitude]);
    if (coords.length > 1) {
      L.polyline(coords, { color: CORES_DIA[(t.dia - 1) % CORES_DIA.length], weight: 3, dashArray: "6 8", opacity: .85 })
        .addTo(camadasPorDia[t.dia]);
    }
  });
  if (limites.length > 1) mapa.fitBounds(limites, { padding: [36, 36], maxZoom: 15 });

  // Legenda: mostrar/ocultar cada dia
  const dias = Object.keys(camadasPorDia).map(Number).filter((d) => d > 0).sort((a, b) => a - b);
  $("#legenda-dias", painel).innerHTML = dias.map((d) =>
    `<button type="button" aria-pressed="true" data-dia="${d}"><i style="background:${CORES_DIA[(d - 1) % CORES_DIA.length]}"></i>Dia ${d}</button>`).join("");
  $$("#legenda-dias button", painel).forEach((b) => b.addEventListener("click", () => {
    const ligado = b.getAttribute("aria-pressed") === "true";
    b.setAttribute("aria-pressed", String(!ligado));
    const camada = camadasPorDia[b.dataset.dia];
    if (ligado) mapa.removeLayer(camada); else camada.addTo(mapa);
  }));

  $("#trechos", painel).innerHTML = dados.trajetos.length ? dados.trajetos.map((t) => `
    <h4 style="margin:12px 0 4px;font-size:14px">Dia ${t.dia} · ${Formato.km(t.total_km)} no total</h4>
    ${t.trechos.length ? t.trechos.map((tr) => `<div class="trecho"><span>${escapar(tr.de)} → ${escapar(tr.para)}</span><strong>${Formato.km(tr.distancia_km)}</strong></div>`).join("")
      : '<p class="texto-mini">Apenas um ponto com localização neste dia.</p>'}`).join("")
    : '<p class="texto-apoio" style="font-size:13px">Adicione atividades com localização ao roteiro principal para ver os trajetos.</p>';

  function medir(ponto) {
    selecionados.push(ponto);
    if (selecionados.length > 2) selecionados.shift();
    const caixa = $("#medicao", painel);
    caixa.hidden = false;
    if (selecionados.length === 1) {
      caixa.innerHTML = `<strong>📏 ${escapar(ponto.titulo)}</strong><p class="texto-mini">Toque em outro ponto para medir a distância.</p>`;
      return;
    }
    const [a, b] = selecionados;
    const km = distanciaKm([a.latitude, a.longitude], [b.latitude, b.longitude]);
    caixa.innerHTML = `<strong>📏 ${escapar(a.titulo)} → ${escapar(b.titulo)}</strong>
      <p style="font-size:20px;font-weight:800;margin-top:4px">${Formato.km(Math.round(km * 10) / 10)}</p>
      <p class="texto-mini">em linha reta</p>`;
  }

  if (Painel.podeEditar) {
    mapa.on("click", (e) => {
      const { lat, lng } = e.latlng;
      const conteudo = document.createElement("div");
      conteudo.innerHTML = `<p style="margin:0 0 8px">${lat.toFixed(5)}, ${lng.toFixed(5)}</p>
        <button type="button" class="botao botao--primario botao--pequeno">＋ Atividade aqui</button>`;
      $("button", conteudo).addEventListener("click", () => {
        mapa.closePopup();
        abrirFormularioAtividade({ latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) });
      });
      L.popup().setLatLng(e.latlng).setContent(conteudo).openOn(mapa);
    });
  }

  $("#carregar-proximos", painel).addEventListener("click", (e) => comCarregamento(e.currentTarget, async () => {
    const lugares = (await Api.lugaresMapa()).lugares;
    const base = [centro[0], centro[1]];
    const perto = lugares.map((l) => ({ ...l, distancia: distanciaKm(base, [l.latitude, l.longitude]) }))
      .filter((l) => l.distancia <= 60 && l.id !== v.lugar_id).sort((a, b) => a.distancia - b.distancia);
    let pontos = [];
    let aviso = null;
    if (v.lugar_id) {
      try {
        const prox = await Api.proximidades(v.lugar_id, 3);
        pontos = prox.pontos;
        aviso = prox.aviso;
      } catch (erro) { aviso = erro.message; }
    }
    const camada = L.layerGroup().addTo(mapa);
    perto.forEach((l) => L.circleMarker([l.latitude, l.longitude], { radius: 8, color: "#ff6b35", fillOpacity: .8 })
      .bindPopup(`<h4>${escapar(l.nome)}</h4><div>${escapar(l.local)} · ⭐ ${l.nota}</div><a href="lugar.html?id=${l.id}">Ver lugar</a>`).addTo(camada));
    pontos.forEach((p) => L.circleMarker([p.latitude, p.longitude], { radius: 6, color: "#2f80ed", fillOpacity: .7 })
      .bindPopup(`<h4>${escapar(p.nome)}</h4><div>${escapar(p.tipo)} · ${Formato.km(p.distancia_km)}</div>
        ${p.funcionamento ? `<div>🕘 ${escapar(p.funcionamento)}</div>` : ""}<small>Fonte: OpenStreetMap</small>`).addTo(camada));
    $("#proximos", painel).innerHTML = `
      ${aviso ? `<p class="dica">Estabelecimentos do OpenStreetMap indisponíveis agora: ${escapar(aviso)}</p>` : ""}
      ${perto.length ? perto.slice(0, 8).map((l) => `<a class="trecho" href="lugar.html?id=${l.id}"><span>🟠 ${escapar(l.nome)}</span><strong>${Formato.km(Math.round(l.distancia * 10) / 10)}</strong></a>`).join("")
        : '<p class="texto-mini">Nenhum outro lugar do catálogo num raio de 60 km.</p>'}
      ${pontos.slice(0, 10).map((p) => `<div class="trecho"><span>🔵 ${escapar(p.nome)} <span class="texto-mini">${escapar(p.tipo)}</span></span><strong>${Formato.km(p.distancia_km)}</strong></div>`).join("")}`;
  }, "Buscando..."));
}
