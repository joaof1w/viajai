/* Conversa com o assistente de IA (Vai). */

if (Sessao.exigirLogin()) {
  const listaMensagens = document.getElementById("mensagens");
  const entrada = document.getElementById("entrada");
  const botaoEnviar = document.getElementById("botao-enviar");
  const areaSugestoes = document.getElementById("sugestoes");

  const seletorViagem = document.getElementById("foco-viagem");
  ligarVoltar(document.getElementById("botao-voltar"), "app.html");
  document.getElementById("botao-permissoes").addEventListener("click", abrirPermissoes);

  carregarHistorico();
  carregarViagens();

  /* Viagem em foco: escolher uma viagem autoriza o Vai a usar os dados dela nesta conversa. */
  async function carregarViagens() {
    try {
      const dados = await Api.listarViagens();
      dados.viagens.filter((v) => v.status !== "concluida").forEach((viagem) => {
        const opcao = document.createElement("option");
        opcao.value = viagem.id;
        opcao.textContent = `🧳 ${viagem.titulo}`;
        seletorViagem.appendChild(opcao);
      });
      const pedida = parametro("viagem");
      if (pedida && [...seletorViagem.options].some((o) => o.value === pedida)) seletorViagem.value = pedida;
    } catch { /* sem viagens: só conversa geral */ }
  }

  async function abrirPermissoes() {
    let dados;
    try {
      dados = await Api.permissoesVai();
    } catch (erro) {
      toast(erro.message, "erro");
      return;
    }
    const corpo = Folha.abrir({
      titulo: "O que o Vai pode consultar",
      conteudo: `<p class="texto-apoio">Você decide. Sem autorização, o Vai usa apenas seus interesses, orçamento e
        cidade. Escolher uma viagem no seletor do chat libera os dados só daquela viagem.</p>
        <form class="form" style="margin-top:12px">
          ${dados.escopos.map((e) => `<label class="alternador"><input type="checkbox" name="${e.chave}" ${e.ativo ? "checked" : ""}/>
            ${escapar(e.rotulo)}</label>`).join("")}
          <button type="submit" class="botao botao--primario" style="margin-top:12px">Salvar permissões</button>
        </form>`,
    });
    const form = corpo.querySelector("form");
    form.addEventListener("submit", async (evento) => {
      evento.preventDefault();
      await comCarregamento(form.querySelector("button"), async () => {
        await Api.salvarPermissoesVai(lerFormulario(form));
        Folha.fechar();
        toast("Permissões do Vai atualizadas.");
      });
    });
  }

  function mostrarAcoes(acoes) {
    if (!acoes || !acoes.length) return;
    const bloco = document.createElement("div");
    bloco.className = "acoes-vai";
    acoes.forEach((acao) => {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.textContent = acao.rotulo;
      botao.addEventListener("click", () => executarAcao(acao));
      bloco.appendChild(botao);
    });
    listaMensagens.appendChild(bloco);
    listaMensagens.scrollTop = listaMensagens.scrollHeight;
  }

  function executarAcao(acao) {
    if (acao.tipo === "criar_viagem") window.location.href = `viagens.html?novo=1${acao.lugar_id ? `&lugar=${acao.lugar_id}` : ""}`;
    if (acao.tipo === "gerar_roteiro") window.location.href = `viagem.html?id=${acao.viagem_id}&aba=roteiro&gerar=1`;
    if (acao.tipo === "abrir_viagem") window.location.href = `viagem.html?id=${acao.viagem_id}&aba=${acao.aba}`;
    if (acao.tipo === "comparar") window.location.href = "comparar.html";
  }

  async function carregarHistorico() {
    try {
      const dados = await Api.historicoChat();
      dados.mensagens.forEach((mensagem) => adicionarMensagem(mensagem.autor, mensagem.texto));
      montarSugestoes(dados.sugestoes);
    } catch (erro) {
      adicionarMensagem("ia", `Não consegui carregar a conversa: ${erro.message}`);
    }
  }

  function montarSugestoes(sugestoes) {
    areaSugestoes.innerHTML = "";
    (sugestoes || []).forEach((texto) => {
      const botao = document.createElement("button");
      botao.className = "sugestao";
      botao.type = "button";
      botao.textContent = texto;
      botao.addEventListener("click", () => enviar(texto));
      areaSugestoes.appendChild(botao);
    });
  }

  function adicionarMensagem(autor, texto) {
    const bloco = document.createElement("div");
    bloco.className = `mensagem mensagem--${autor === "ia" ? "ia" : "usuario"}`;
    const mini = document.createElement("div");
    mini.className = "mensagem__mini";
    mini.textContent = autor === "ia" ? "🧳" : (Sessao.usuario()?.iniciais || "EU");
    const bolha = document.createElement("div");
    bolha.className = "mensagem__bolha";
    bolha.textContent = texto;
    bloco.append(mini, bolha);
    listaMensagens.appendChild(bloco);
    listaMensagens.scrollTop = listaMensagens.scrollHeight;
    return bloco;
  }

  function mostrarDigitando() {
    const bloco = document.createElement("div");
    bloco.className = "mensagem mensagem--ia";
    bloco.id = "digitando";
    bloco.innerHTML = `
      <div class="mensagem__mini">🧳</div>
      <div class="mensagem__bolha digitando"><span></span><span></span><span></span></div>`;
    listaMensagens.appendChild(bloco);
    listaMensagens.scrollTop = listaMensagens.scrollHeight;
  }

  async function enviar(texto) {
    const pergunta = (texto || entrada.value).trim();
    if (!pergunta) return;

    entrada.value = "";
    adicionarMensagem("usuario", pergunta);
    mostrarDigitando();
    botaoEnviar.disabled = true;

    try {
      const resposta = await Api.enviarMensagem(pergunta, seletorViagem.value);
      document.getElementById("digitando")?.remove();
      adicionarMensagem("ia", resposta.resposta.texto);
      mostrarAcoes(resposta.acoes);
      document.getElementById("selo-ia").textContent = resposta.origem === "gemini" ? "Gemini" : "IA";
    } catch (erro) {
      document.getElementById("digitando")?.remove();
      adicionarMensagem("ia", `Ops: ${erro.message}`);
    } finally {
      botaoEnviar.disabled = false;
      entrada.focus();
    }
  }

  document.getElementById("form-chat").addEventListener("submit", (evento) => {
    evento.preventDefault();
    enviar();
  });
}
