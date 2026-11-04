/* Tela de interesses: gostos, orçamento e localização do usuário. */

if (Sessao.exigirLogin()) {
  const alerta = document.getElementById("alerta");
  const grade = document.getElementById("grade-interesses");
  const barraOrcamento = document.getElementById("orcamento");
  const descricaoOrcamento = document.getElementById("descricao-orcamento");
  const seletorCidade = document.getElementById("cidade");

  const selecionados = new Set();
  let orcamentoEscolhido = 2;
  let faixas = [];

  iniciar();

  async function iniciar() {
    try {
      const opcoes = await Api.opcoesPreferencias();
      faixas = opcoes.orcamentos;
      montarInteresses(opcoes.interesses);
      montarOrcamentos(opcoes.orcamentos);
      montarCidades(opcoes.cidades);
      await preencherComPreferenciasAtuais();
    } catch (erro) {
      mostrarAlerta(alerta, erro.message);
    }
  }

  function montarInteresses(interesses) {
    grade.innerHTML = "";
    interesses.forEach((interesse) => {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "interesse";
      botao.dataset.slug = interesse.slug;
      botao.innerHTML = `
        <span class="interesse__icone" style="background:${interesse.cor}">${interesse.icone}</span>
        <span>${interesse.nome}</span>`;
      botao.addEventListener("click", () => {
        botao.classList.toggle("selecionado");
        if (selecionados.has(interesse.slug)) selecionados.delete(interesse.slug);
        else selecionados.add(interesse.slug);
        esconderAlerta(alerta);
      });
      grade.appendChild(botao);
    });
  }

  function montarOrcamentos(orcamentos) {
    barraOrcamento.innerHTML = "";
    orcamentos.forEach((faixa) => {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.textContent = faixa.simbolo;
      botao.dataset.valor = faixa.valor;
      botao.addEventListener("click", () => escolherOrcamento(faixa.valor));
      barraOrcamento.appendChild(botao);
    });
    escolherOrcamento(orcamentoEscolhido);
  }

  function escolherOrcamento(valor) {
    orcamentoEscolhido = valor;
    barraOrcamento.querySelectorAll("button").forEach((botao) => {
      botao.classList.toggle("ativo", Number(botao.dataset.valor) === valor);
    });
    const faixa = faixas.find((f) => f.valor === valor);
    descricaoOrcamento.textContent = faixa ? `${faixa.rotulo} · ${faixa.descricao}` : "";
  }

  function montarCidades(cidades) {
    seletorCidade.innerHTML = "";
    cidades
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"))
      .forEach((cidade) => {
        const opcao = document.createElement("option");
        opcao.value = `${cidade.cidade}|${cidade.estado}`;
        opcao.textContent = `📍 ${cidade.rotulo}`;
        seletorCidade.appendChild(opcao);
      });
    seletorCidade.value = "São Paulo|SP";
  }

  async function preencherComPreferenciasAtuais() {
    const perfil = await Api.perfil();
    Sessao.atualizarUsuario(perfil);
    const preferencias = perfil.preferencias;
    if (!preferencias) return;

    preferencias.interesses.forEach((interesse) => {
      selecionados.add(interesse.slug);
      const botao = grade.querySelector(`[data-slug="${interesse.slug}"]`);
      if (botao) botao.classList.add("selecionado");
    });
    escolherOrcamento(preferencias.orcamento);
    // Comparação sem diferenciar maiúsculas (cadastros antigos gravaram "Rio De Janeiro").
    const chave = `${preferencias.cidade}|${preferencias.estado}`.toLowerCase();
    const opcao = [...seletorCidade.options].find((o) => o.value.toLowerCase() === chave);
    if (opcao) seletorCidade.value = opcao.value;
  }

  document.getElementById("botao-salvar").addEventListener("click", async () => {
    esconderAlerta(alerta);
    if (selecionados.size === 0) {
      mostrarAlerta(alerta, "Escolha pelo menos um interesse para continuar.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const botao = document.getElementById("botao-salvar");
    const [cidade, estado] = seletorCidade.value.split("|");
    botao.disabled = true;
    botao.textContent = "Salvando...";
    try {
      await Api.salvarPreferencias({
        interesses: [...selecionados],
        orcamento: orcamentoEscolhido,
        cidade,
        estado,
      });
      window.location.href = "app.html";
    } catch (erro) {
      mostrarAlerta(alerta, erro.message);
      botao.disabled = false;
      botao.textContent = "Ver minhas recomendações →";
    }
  });
}
