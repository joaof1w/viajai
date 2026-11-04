/* Tela de boas-vindas: fundo com fotografia real (feature 12). */

// Quem já entrou vai direto para a home.
if (Sessao.token()) window.location.replace("app.html");

document.getElementById("fechar-aviso").addEventListener("click", () => document.getElementById("aviso").remove());

carregarFundo();

/**
 * Busca no backend a melhor fotografia verificada para o fundo e a exibe com
 * srcset responsivo (o navegador escolhe a resolução certa para celular, tablet
 * ou computador). Só troca o fundo de reserva depois que a imagem carregou.
 */
async function carregarFundo() {
  let dados;
  try {
    dados = await Api.fundoInicial();
  } catch {
    return; // sem backend/rede: fica o fundo de reserva
  }
  if (!dados.disponivel || !dados.fontes || !dados.fontes.length) return;

  const camada = document.getElementById("fundo");
  const img = new Image();
  img.decoding = "async";
  img.fetchPriority = "high";
  img.alt = "";
  img.sizes = "100vw";
  img.srcset = dados.fontes.map((f) => `${f.url} ${f.largura}w`).join(", ");
  img.src = dados.fontes[dados.fontes.length - 1].url;

  let elemento = img;
  if (dados.fontes_retrato && dados.fontes_retrato.length) {
    // Enquadramento próprio para telas em pé (gerado pelo tools/fotos.py fundo)
    const picture = document.createElement("picture");
    const fonte = document.createElement("source");
    fonte.media = "(max-aspect-ratio: 4/5)";
    fonte.srcset = dados.fontes_retrato.map((f) => `${f.url} ${f.largura}w`).join(", ");
    fonte.sizes = "100vw";
    picture.append(fonte, img);
    elemento = picture;
  }

  img.addEventListener("load", () => {
    camada.classList.add("carregado");
    mostrarCredito(dados);
  });
  img.addEventListener("error", () => elemento.remove()); // fallback: mantém o fundo de reserva
  camada.appendChild(elemento);
}

function mostrarCredito(dados) {
  if (dados.lugar) {
    const local = document.getElementById("local-foto");
    local.textContent = `📍 ${dados.lugar.nome} · ${dados.lugar.local}`;
    local.hidden = false;
  }
  const credito = document.getElementById("credito-fundo");
  const c = dados.credito || {};
  credito.innerHTML = creditoFoto({
    autor: c.autor, licenca: c.licenca, licenca_url: c.licenca_url, pagina_origem: c.pagina_origem, fonte_nome: c.fonte,
  });
  credito.hidden = false;
}
