/* Tela de cadastro: validação em tempo real + verificação do código por e-mail. */

const etapaDados = document.getElementById("etapa-dados");
const etapaCodigo = document.getElementById("etapa-codigo");
const alertaDados = document.getElementById("alerta-dados");
const alertaCodigo = document.getElementById("alerta-codigo");

const campos = {
  nome: document.getElementById("campo-nome"),
  email: document.getElementById("campo-email"),
  senha: document.getElementById("campo-senha"),
  confirmacao: document.getElementById("campo-confirmacao"),
};
const entradas = {
  nome: document.getElementById("nome"),
  email: document.getElementById("email"),
  senha: document.getElementById("senha"),
  confirmacao: document.getElementById("confirmacao"),
};

let emailEmVerificacao = "";

/* ------------------------- validação em tempo real ------------------------- */
function validarCampo(nome, mostrarSucesso = true) {
  const valor = entradas[nome].value;
  let resultado;
  if (nome === "nome") resultado = validarNome(valor);
  else if (nome === "email") resultado = validarEmail(valor);
  else if (nome === "senha") resultado = validarSenha(valor);
  else resultado = confirmarSenha(entradas.senha.value, valor);

  aplicarEstado(campos[nome], valor === "" ? null : resultado, mostrarSucesso);
  return resultado.ok;
}

Object.keys(entradas).forEach((nome) => {
  entradas[nome].addEventListener("input", () => {
    validarCampo(nome);
    if (nome === "senha") {
      atualizarForca(entradas.senha.value);
      if (entradas.confirmacao.value) validarCampo("confirmacao");
    }
  });
  entradas[nome].addEventListener("blur", () => validarCampo(nome));
});

function atualizarForca(senha) {
  const nivel = forcaDaSenha(senha);
  const classes = ["", "fraca", "media", "forte"];
  document.querySelectorAll("#forca span").forEach((barra, indice) => {
    barra.className = indice < nivel ? classes[nivel] : "";
  });
  const regras = {
    tamanho: senha.length >= 6,
    numero: /\d/.test(senha),
    maiuscula: /[A-Z]/.test(senha),
  };
  document.querySelectorAll("#regras li").forEach((item) => {
    item.classList.toggle("ok", regras[item.dataset.regra]);
  });
}

document.getElementById("ver-senha").addEventListener("click", () => {
  const oculto = entradas.senha.type === "password";
  entradas.senha.type = oculto ? "text" : "password";
  entradas.confirmacao.type = oculto ? "text" : "password";
});

/* ------------------------------ etapa 1: conta ----------------------------- */
document.getElementById("form-dados").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  esconderAlerta(alertaDados);

  const valido = ["nome", "email", "senha", "confirmacao"].map((c) => validarCampo(c)).every(Boolean);
  if (!valido) {
    mostrarAlerta(alertaDados, "Confira os campos destacados antes de continuar.");
    return;
  }

  const botao = document.getElementById("botao-cadastrar");
  botao.disabled = true;
  botao.textContent = "Criando conta...";
  try {
    const resposta = await Api.cadastrar({
      nome: entradas.nome.value,
      email: entradas.email.value,
      senha: entradas.senha.value,
      confirmacao_senha: entradas.confirmacao.value,
    });
    emailEmVerificacao = entradas.email.value.trim().toLowerCase();
    irParaCodigo(resposta);
  } catch (erro) {
    if (erro.campo && campos[erro.campo]) {
      aplicarEstado(campos[erro.campo], { ok: false, mensagem: erro.message });
    }
    mostrarAlerta(alertaDados, erro.message);
  } finally {
    botao.disabled = false;
    botao.textContent = "Criar conta";
  }
});

function irParaCodigo(resposta) {
  etapaDados.hidden = true;
  etapaCodigo.hidden = false;
  document.getElementById("email-destino").textContent = emailEmVerificacao;
  window.scrollTo({ top: 0 });
  if (resposta && resposta.codigo_debug) {
    mostrarAlerta(
      alertaCodigo,
      `Modo desenvolvimento: seu código é ${resposta.codigo_debug} (também aparece no terminal do servidor).`,
      "ok"
    );
  }
  digitos[0].focus();
}

/* ---------------------------- etapa 2: código ------------------------------ */
const digitos = Array.from(document.querySelectorAll("#codigo input"));

function limparCodigo() {
  digitos.forEach((entrada) => (entrada.value = ""));
  digitos[0].focus();
}

digitos.forEach((entrada, indice) => {
  // Ao focar, seleciona o conteúdo para que digitar substitua o dígito anterior.
  entrada.addEventListener("focus", () => entrada.select());
  entrada.addEventListener("input", () => {
    entrada.value = entrada.value.replace(/\D/g, "").slice(0, 1);
    if (entrada.value && indice < digitos.length - 1) digitos[indice + 1].focus();
    aplicarEstado(document.getElementById("campo-codigo"), null);
  });
  entrada.addEventListener("keydown", (evento) => {
    if (evento.key === "Backspace" && !entrada.value && indice > 0) digitos[indice - 1].focus();
  });
  entrada.addEventListener("paste", (evento) => {
    evento.preventDefault();
    const texto = (evento.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    texto.split("").forEach((caractere, posicao) => {
      if (digitos[posicao]) digitos[posicao].value = caractere;
    });
    digitos[Math.min(texto.length, 5)].focus();
  });
});

document.getElementById("form-codigo").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  esconderAlerta(alertaCodigo);

  const codigo = digitos.map((d) => d.value).join("");
  if (codigo.length !== 6) {
    aplicarEstado(document.getElementById("campo-codigo"), { ok: false, mensagem: "Digite os 6 dígitos." });
    return;
  }

  const botao = document.getElementById("botao-verificar");
  botao.disabled = true;
  botao.textContent = "Verificando...";
  try {
    const resposta = await Api.verificarCodigo({ email: emailEmVerificacao, codigo });
    Sessao.salvar(resposta.token, resposta.usuario);
    window.location.href = "interesses.html";
  } catch (erro) {
    aplicarEstado(document.getElementById("campo-codigo"), { ok: false, mensagem: erro.message });
    mostrarAlerta(alertaCodigo, erro.message);
    limparCodigo();
  } finally {
    botao.disabled = false;
    botao.textContent = "Verificar código";
  }
});

document.getElementById("botao-reenviar").addEventListener("click", async () => {
  esconderAlerta(alertaCodigo);
  try {
    const resposta = await Api.reenviarCodigo(emailEmVerificacao);
    mostrarAlerta(
      alertaCodigo,
      resposta.codigo_debug ? `Novo código: ${resposta.codigo_debug}` : resposta.mensagem,
      "ok"
    );
  } catch (erro) {
    mostrarAlerta(alertaCodigo, erro.message);
  }
});

document.getElementById("botao-corrigir-email").addEventListener("click", () => {
  etapaCodigo.hidden = true;
  etapaDados.hidden = false;
  esconderAlerta(alertaCodigo);
});

function voltar() {
  if (!etapaCodigo.hidden) {
    etapaCodigo.hidden = true;
    etapaDados.hidden = false;
    return;
  }
  window.location.href = "index.html";
}

document.getElementById("botao-voltar").addEventListener("click", voltar);
