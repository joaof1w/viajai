/* Componentes de interface compartilhados pelas telas da expansão.
   Sem dependências: toasts, folhas modais, confirmação, fotos com lazy loading e
   fallback, galeria/lightbox, navegação inferior e formatação. */

/* ----------------------------- segurança -------------------------------- */
/** Escapa texto vindo do usuário ou de fontes externas antes de usar em innerHTML. */
function escapar(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Só aceita links http(s) — evita "javascript:" em atributos href vindos de fora. */
function urlSegura(url) {
  try {
    const u = new URL(url, window.location.origin);
    return ["http:", "https:"].includes(u.protocol) ? u.href : "#";
  } catch {
    return "#";
  }
}

const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
const $$ = (seletor, raiz = document) => Array.from(raiz.querySelectorAll(seletor));
const parametro = (nome) => new URLSearchParams(window.location.search).get(nome);

/* ----------------------------- formatação ------------------------------- */
const Formato = {
  moeda(valor) {
    if (valor === null || valor === undefined || valor === "") return "—";
    return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  },
  data(iso, opcoes = { day: "2-digit", month: "short" }) {
    if (!iso) return "—";
    const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
    return new Date(a, m - 1, d).toLocaleDateString("pt-BR", opcoes);
  },
  dataLonga(iso) {
    return Formato.data(iso, { weekday: "long", day: "2-digit", month: "long" });
  },
  periodo(ida, volta) {
    const anoIgual = ida.slice(0, 4) === volta.slice(0, 4);
    return `${Formato.data(ida)} – ${Formato.data(volta, { day: "2-digit", month: "short", year: anoIgual ? undefined : "numeric" })}`;
  },
  hora(isoDataHora) {
    return isoDataHora ? isoDataHora.slice(11, 16) : "";
  },
  km(valor) {
    if (valor === null || valor === undefined) return "—";
    return valor < 1 ? `${Math.round(valor * 1000)} m` : `${Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
  },
  duracao(minutos) {
    if (!minutos) return "";
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return h ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m} min`;
  },
  relativo(iso) {
    const diff = (Date.now() - new Date(iso + (iso.endsWith("Z") ? "" : "Z")).getTime()) / 1000;
    if (diff < 60) return "agora";
    if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
    if (diff < 86400 * 30) return `há ${Math.floor(diff / 86400)} d`;
    return Formato.data(iso, { day: "2-digit", month: "short", year: "numeric" });
  },
};

const STATUS_VIAGEM = {
  futura: { rotulo: "Futura", classe: "status--futura" },
  em_andamento: { rotulo: "Em andamento", classe: "status--andamento" },
  concluida: { rotulo: "Concluída", classe: "status--concluida" },
};

function hojeIso() {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/* ------------------------------- toasts --------------------------------- */
function toast(mensagem, tipo = "ok") {
  let area = $("#area-toasts");
  if (!area) {
    area = document.createElement("div");
    area.id = "area-toasts";
    area.className = "toasts";
    area.setAttribute("role", "status");
    area.setAttribute("aria-live", "polite");
    document.body.appendChild(area);
  }
  while (area.children.length >= 3) area.firstElementChild.remove(); // no máximo 3 visíveis
  const item = document.createElement("div");
  item.className = `toast toast--${tipo}`;
  item.textContent = mensagem;
  area.appendChild(item);
  setTimeout(() => item.classList.add("toast--saindo"), 3200);
  setTimeout(() => item.remove(), 3600);
}

/** Executa uma ação assíncrona com estado de carregamento no botão e toast de erro. */
async function comCarregamento(botao, acao, textoCarregando = "Salvando...") {
  const original = botao ? botao.innerHTML : "";
  if (botao) {
    botao.disabled = true;
    botao.innerHTML = `<span class="girando" aria-hidden="true"></span> ${escapar(textoCarregando)}`;
  }
  try {
    return await acao();
  } catch (erro) {
    toast(erro.message || "Algo deu errado.", "erro");
    throw erro;
  } finally {
    if (botao) {
      botao.disabled = false;
      botao.innerHTML = original;
    }
  }
}

/* ------------------------- folhas (bottom sheets) ------------------------ */
const Folha = {
  abrir({ titulo, conteudo, aoFechar } = {}) {
    Folha.fechar();
    const folha = document.createElement("div");
    folha.className = "folha";
    folha.innerHTML = `
      <div class="folha__fundo" data-fechar-folha></div>
      <section class="folha__caixa" role="dialog" aria-modal="true" aria-label="${escapar(titulo || "Janela")}">
        <div class="folha__puxador" aria-hidden="true"></div>
        <header class="folha__topo">
          <h2>${escapar(titulo || "")}</h2>
          <button type="button" class="icone-botao" data-fechar-folha aria-label="Fechar">✕</button>
        </header>
        <div class="folha__corpo"></div>
      </section>`;
    const corpo = $(".folha__corpo", folha);
    if (typeof conteudo === "string") corpo.innerHTML = conteudo;
    else if (conteudo) corpo.appendChild(conteudo);
    folha._aoFechar = aoFechar;
    $$("[data-fechar-folha]", folha).forEach((b) => b.addEventListener("click", () => Folha.fechar()));
    document.body.appendChild(folha);
    document.body.classList.add("sem-rolagem");
    Folha._anterior = document.activeElement;
    requestAnimationFrame(() => {
      folha.classList.add("aberta");
      const primeiro = $("input, select, textarea, button:not([data-fechar-folha])", corpo);
      if (primeiro) primeiro.focus({ preventScroll: true });
    });
    return corpo;
  },
  fechar() {
    const folha = $(".folha");
    if (!folha) return;
    if (folha._aoFechar) folha._aoFechar();
    folha.remove();
    document.body.classList.remove("sem-rolagem");
    if (Folha._anterior && Folha._anterior.focus) Folha._anterior.focus({ preventScroll: true });
  },
};

document.addEventListener("keydown", (evento) => {
  if (evento.key !== "Escape") return;
  if ($(".lightbox")) Lightbox.fechar();
  else if ($(".folha")) Folha.fechar();
});

function confirmar(mensagem, { textoConfirmar = "Confirmar", perigo = false } = {}) {
  return new Promise((resolver) => {
    let respondido = false;
    const corpo = Folha.abrir({
      titulo: "Confirmar",
      conteudo: `<p class="texto-apoio">${escapar(mensagem)}</p>
        <div class="acoes-linha">
          <button type="button" class="botao botao--claro" data-nao>Cancelar</button>
          <button type="button" class="botao ${perigo ? "botao--perigo" : "botao--primario"}" data-sim>${escapar(textoConfirmar)}</button>
        </div>`,
      aoFechar: () => { if (!respondido) resolver(false); },
    });
    $("[data-sim]", corpo).addEventListener("click", () => { respondido = true; Folha.fechar(); resolver(true); });
    $("[data-nao]", corpo).addEventListener("click", () => { respondido = true; Folha.fechar(); resolver(false); });
  });
}

/** Lê os campos de um <form> em um objeto (checkbox → booleano). */
function lerFormulario(form) {
  const dados = {};
  $$("input, select, textarea", form).forEach((campo) => {
    if (!campo.name || campo.type === "file") return;
    if (campo.type === "checkbox") dados[campo.name] = campo.checked;
    else if (campo.type === "radio") { if (campo.checked) dados[campo.name] = campo.value; }
    else dados[campo.name] = campo.value.trim();
  });
  return dados;
}

/** Mostra o erro do backend no campo correspondente (ou no topo do formulário). */
function mostrarErroFormulario(form, erro) {
  $$(".campo-erro", form).forEach((e) => e.remove());
  $$(".invalido", form).forEach((e) => e.classList.remove("invalido"));
  const campo = erro.campo && form.querySelector(`[name="${erro.campo}"]`);
  const aviso = document.createElement("p");
  aviso.className = "campo-erro";
  aviso.setAttribute("role", "alert");
  aviso.textContent = erro.message;
  if (campo) {
    campo.classList.add("invalido");
    campo.closest(".campo, label, div").appendChild(aviso);
    campo.focus();
  } else {
    form.prepend(aviso);
  }
}

/* --------------------------- estados de tela ----------------------------- */
function telaVazia(icone, titulo, texto, acao) {
  return `<div class="vazio vazio--rico">
      <div class="vazio__icone" aria-hidden="true">${icone}</div>
      <h3>${escapar(titulo)}</h3>
      ${texto ? `<p>${escapar(texto)}</p>` : ""}
      ${acao ? `<button type="button" class="botao botao--primario botao--pequeno" data-acao-vazio>${escapar(acao)}</button>` : ""}
    </div>`;
}

function esqueletos(quantidade = 3, altura = 92) {
  return `<div class="carregando">${'<div class="esqueleto" style="height:' + altura + 'px"></div>'.repeat(quantidade)}</div>`;
}

/* ------------------------------- fotos ---------------------------------- */
/**
 * <img> com lazy loading, decodificação assíncrona e fallback: se a fotografia
 * real falhar, troca pela ilustração da categoria (nunca deixa imagem quebrada).
 */
function imagemLugar(lugar, { tamanho = "miniatura", classe = "", alt, eager = false } = {}) {
  const foto = lugar && lugar.foto;
  const reserva = urlImagem(lugar && lugar.imagem);
  const fonte = foto ? (foto[tamanho] || foto.miniatura) : reserva;
  const texto = alt ?? (foto ? `Foto de ${lugar.nome}` : `Ilustração da categoria ${lugar?.categoria || ""}`);
  return `<img class="${classe}" src="${escapar(fonte)}" alt="${escapar(texto)}" loading="${eager ? "eager" : "lazy"}"
            decoding="async" data-reserva="${escapar(reserva)}" />`;
}

// Fallback global de imagens (CSP proíbe onerror inline).
document.addEventListener("error", (evento) => {
  const img = evento.target;
  if (!(img instanceof HTMLImageElement)) return;
  if (img.dataset.reserva && img.src.indexOf(img.dataset.reserva) === -1) {
    img.src = img.dataset.reserva;
    img.classList.add("img--ilustracao");
  } else {
    img.classList.add("img--falhou");
  }
}, true);

function creditoFoto(foto) {
  if (!foto) return "";
  const autor = foto.autor_url
    ? `<a href="${escapar(urlSegura(foto.autor_url))}" target="_blank" rel="noopener noreferrer">${escapar(foto.autor || "Autor")}</a>`
    : escapar(foto.autor || "Autor desconhecido");
  const licenca = foto.licenca
    ? (foto.licenca_url
      ? ` · <a href="${escapar(urlSegura(foto.licenca_url))}" target="_blank" rel="noopener noreferrer license">${escapar(foto.licenca)}</a>`
      : ` · ${escapar(foto.licenca)}`)
    : "";
  const fonte = foto.pagina_origem
    ? ` · <a href="${escapar(urlSegura(foto.pagina_origem))}" target="_blank" rel="noopener noreferrer">${escapar(foto.fonte_nome || "fonte")}</a>`
    : "";
  return `Foto: ${autor}${licenca}${fonte}`;
}

/* ------------------------------ lightbox --------------------------------- */
const Lightbox = {
  abrir(fotos, indice = 0) {
    if (!fotos || !fotos.length) return;
    Lightbox.fechar();
    Lightbox.fotos = fotos;
    Lightbox.indice = indice;
    const caixa = document.createElement("div");
    caixa.className = "lightbox";
    caixa.setAttribute("role", "dialog");
    caixa.setAttribute("aria-modal", "true");
    caixa.setAttribute("aria-label", "Fotografia ampliada");
    caixa.innerHTML = `
      <button type="button" class="lightbox__fechar" aria-label="Fechar">✕</button>
      <button type="button" class="lightbox__seta lightbox__seta--ant" aria-label="Foto anterior">‹</button>
      <figure class="lightbox__figura">
        <img alt="" />
        <figcaption></figcaption>
      </figure>
      <button type="button" class="lightbox__seta lightbox__seta--prox" aria-label="Próxima foto">›</button>
      <span class="lightbox__contador"></span>`;
    $(".lightbox__fechar", caixa).addEventListener("click", Lightbox.fechar);
    $(".lightbox__seta--ant", caixa).addEventListener("click", () => Lightbox.ir(-1));
    $(".lightbox__seta--prox", caixa).addEventListener("click", () => Lightbox.ir(1));
    caixa.addEventListener("click", (e) => { if (e.target === caixa) Lightbox.fechar(); });
    let inicioX = null;
    caixa.addEventListener("touchstart", (e) => { inicioX = e.touches[0].clientX; }, { passive: true });
    caixa.addEventListener("touchend", (e) => {
      if (inicioX === null) return;
      const dx = e.changedTouches[0].clientX - inicioX;
      if (Math.abs(dx) > 40) Lightbox.ir(dx < 0 ? 1 : -1);
      inicioX = null;
    });
    document.body.appendChild(caixa);
    document.body.classList.add("sem-rolagem");
    Lightbox.mostrar();
    $(".lightbox__fechar", caixa).focus();
  },
  mostrar() {
    const caixa = $(".lightbox");
    const foto = Lightbox.fotos[Lightbox.indice];
    const img = $("img", caixa);
    img.src = foto.url || foto.media;
    img.alt = foto.titulo || foto.legenda || "Fotografia";
    $("figcaption", caixa).innerHTML = foto.fonte ? creditoFoto(foto) : escapar(foto.legenda || "");
    $(".lightbox__contador", caixa).textContent = `${Lightbox.indice + 1} / ${Lightbox.fotos.length}`;
    const varias = Lightbox.fotos.length > 1;
    $$(".lightbox__seta", caixa).forEach((b) => (b.hidden = !varias));
  },
  ir(passo) {
    Lightbox.indice = (Lightbox.indice + passo + Lightbox.fotos.length) % Lightbox.fotos.length;
    Lightbox.mostrar();
  },
  fechar() {
    const caixa = $(".lightbox");
    if (caixa) caixa.remove();
    if (!$(".folha")) document.body.classList.remove("sem-rolagem");
  },
};

document.addEventListener("keydown", (e) => {
  if (!$(".lightbox")) return;
  if (e.key === "ArrowRight") Lightbox.ir(1);
  if (e.key === "ArrowLeft") Lightbox.ir(-1);
});

/** Miniaturas clicáveis de fotos enviadas pelos usuários (avaliações e diário). */
function miniaturasFotos(fotos, { removivel = false } = {}) {
  if (!fotos || !fotos.length) return "";
  return `<div class="miniaturas">${fotos.map((f, i) => `
      <span class="miniatura">
        <button type="button" class="miniatura__abrir" data-foto="${i}" aria-label="Ampliar foto ${i + 1}">
          <img src="${escapar(f.url)}" alt="${escapar(f.legenda || `Foto ${i + 1}`)}" loading="lazy" decoding="async" />
        </button>
        ${removivel ? `<button type="button" class="miniatura__remover" data-remover-foto="${f.id}" aria-label="Remover foto">✕</button>` : ""}
      </span>`).join("")}</div>`;
}

function ligarMiniaturas(raiz, fotos) {
  $$("[data-foto]", raiz).forEach((b) =>
    b.addEventListener("click", () => Lightbox.abrir(fotos, Number(b.dataset.foto))));
}

/** Campo de upload com pré-visualização e validação no navegador (o backend valida de novo). */
function campoFotos(nome = "fotos", maximo = 6) {
  const bloco = document.createElement("div");
  bloco.className = "campo campo--fotos";
  bloco.innerHTML = `
    <label>Fotos <span class="texto-mini">(JPG, PNG ou WebP, até 5 MB cada)</span></label>
    <label class="seletor-fotos">
      <input type="file" name="${nome}" accept="image/jpeg,image/png,image/webp" multiple />
      <span>📷 Escolher fotos</span>
    </label>
    <div class="previas"></div>`;
  const entrada = $("input", bloco);
  const previas = $(".previas", bloco);
  entrada.addEventListener("change", () => {
    previas.innerHTML = "";
    const arquivos = Array.from(entrada.files);
    const invalidos = arquivos.filter((a) => !["image/jpeg", "image/png", "image/webp"].includes(a.type) || a.size > 5 * 1024 * 1024);
    if (invalidos.length || arquivos.length > maximo) {
      toast(arquivos.length > maximo ? `Escolha no máximo ${maximo} fotos.` : "Alguma foto tem formato inválido ou passa de 5 MB.", "erro");
      entrada.value = "";
      return;
    }
    arquivos.forEach((arquivo) => {
      const img = document.createElement("img");
      img.alt = arquivo.name;
      img.src = URL.createObjectURL(arquivo);
      img.onload = () => URL.revokeObjectURL(img.src);
      previas.appendChild(img);
    });
  });
  return bloco;
}

/* ----------------------------- estrelas --------------------------------- */
function estrelas(nota, maximo = 5) {
  const cheia = Math.round(nota || 0);
  return `<span class="estrelas" aria-label="${nota ?? 0} de ${maximo} estrelas">${"★".repeat(cheia)}<span class="estrelas__vazias">${"★".repeat(Math.max(0, maximo - cheia))}</span></span>`;
}

function seletorEstrelas(nome, valorInicial = 0) {
  const grupo = document.createElement("div");
  grupo.className = "seletor-estrelas";
  grupo.setAttribute("role", "radiogroup");
  grupo.setAttribute("aria-label", "Nota");
  grupo.innerHTML = [5, 4, 3, 2, 1].map((n) => `
      <input type="radio" id="${nome}-${n}" name="${nome}" value="${n}" ${n === Number(valorInicial) ? "checked" : ""} />
      <label for="${nome}-${n}" title="${n} estrela${n > 1 ? "s" : ""}">★</label>`).join("");
  return grupo;
}

/* --------------------------- navegação inferior -------------------------- */
function navegacaoInferior(ativa) {
  const itens = [
    ["inicio", "app.html", "🏠", "Início"],
    ["explorar", "app.html#explorar", "🔍", "Explorar"],
    ["viagens", "viagens.html", "🧳", "Viagens"],
    ["salvos", "app.html#salvos", "🔖", "Salvos"],
    ["perfil", "app.html#perfil", "👤", "Perfil"],
  ];
  const nav = document.createElement("nav");
  nav.className = "nav";
  nav.setAttribute("aria-label", "Navegação principal");
  nav.innerHTML = itens.map(([chave, href, icone, rotulo]) =>
    `<a href="${href}" class="${chave === ativa ? "ativo" : ""}" ${chave === ativa ? 'aria-current="page"' : ""}>
       <span class="icone" aria-hidden="true">${icone}</span>${rotulo}</a>`).join("");
  document.querySelector(".app").appendChild(nav);
  return nav;
}

/** Botão "voltar" padrão: volta no histórico ou vai para um destino seguro. */
function ligarVoltar(botao, destino = "app.html") {
  if (!botao) return;
  botao.addEventListener("click", () => {
    if (document.referrer && new URL(document.referrer).origin === window.location.origin && history.length > 1) history.back();
    else window.location.href = destino;
  });
}

/* ------------------------------- gráficos -------------------------------- */
/** Rosca em SVG (sem bibliotecas). fatias: [{valor, cor, rotulo}] */
function graficoRosca(fatias, { tamanho = 150, espessura = 22, centro = "" } = {}) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  const raio = (tamanho - espessura) / 2;
  const circ = 2 * Math.PI * raio;
  let deslocamento = 0;
  const arcos = total
    ? fatias.filter((f) => f.valor > 0).map((f) => {
      const comprimento = (f.valor / total) * circ;
      const arco = `<circle r="${raio}" cx="${tamanho / 2}" cy="${tamanho / 2}" fill="none" stroke="${f.cor}"
          stroke-width="${espessura}" stroke-dasharray="${Math.max(0, comprimento - 2)} ${circ}"
          stroke-dashoffset="${-deslocamento}"><title>${escapar(f.rotulo)}: ${Formato.moeda(f.valor)}</title></circle>`;
      deslocamento += comprimento;
      return arco;
    }).join("")
    : "";
  return `<svg class="rosca" viewBox="0 0 ${tamanho} ${tamanho}" width="${tamanho}" height="${tamanho}" role="img"
      aria-label="Distribuição dos gastos por categoria">
      <circle r="${raio}" cx="${tamanho / 2}" cy="${tamanho / 2}" fill="none" stroke="var(--trilho)" stroke-width="${espessura}" />
      <g transform="rotate(-90 ${tamanho / 2} ${tamanho / 2})">${arcos}</g>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" class="rosca__centro">${escapar(centro)}</text>
    </svg>`;
}

/* ----------------------------- distâncias -------------------------------- */
/** Haversine — distância em linha reta (rotulada assim na interface). */
function distanciaKm(a, b) {
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/* ------------------------------ mapa base -------------------------------- */
let _configMapa = null;

/** Cria um mapa Leaflet com os tiles configurados no backend (com atribuição). */
async function criarMapa(elemento, { centro = [-15.8, -47.9], zoom = 4 } = {}) {
  if (typeof L === "undefined") {
    elemento.innerHTML = '<p class="texto-apoio mapa__aviso">Não foi possível carregar o mapa.</p>';
    return null;
  }
  if (!_configMapa) {
    try { _configMapa = await Api.configMapa(); } catch { _configMapa = { tile_url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", atribuicao: "© OpenStreetMap" }; }
  }
  const mapa = L.map(elemento, { scrollWheelZoom: false, zoomControl: true }).setView(centro, zoom);
  const camada = L.tileLayer(_configMapa.tile_url, { maxZoom: 19, attribution: _configMapa.atribuicao });
  let falhas = 0;
  camada.on("tileerror", () => {
    falhas += 1;
    if (falhas === 4) {
      const aviso = document.createElement("div");
      aviso.className = "mapa__sem-tiles";
      aviso.textContent = "O fundo do mapa não carregou (sem acesso ao servidor de mapas). Os pontos continuam corretos.";
      elemento.appendChild(aviso);
    }
  });
  camada.addTo(mapa);
  setTimeout(() => mapa.invalidateSize(), 120);
  return mapa;
}

function marcadorNumerado(numero, cor = "#ff6b35") {
  return L.divIcon({
    className: "marcador",
    html: `<span style="background:${cor}">${escapar(numero)}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
  });
}

const CORES_DIA = ["#ff6b35", "#2f80ed", "#16a34a", "#9b51e0", "#e0a100", "#d92d20", "#0ea5a4", "#6b4b3a"];
