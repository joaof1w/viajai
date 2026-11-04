/* Tela de login: e-mail + senha. */

const alerta = document.getElementById("alerta");
document.getElementById("botao-voltar").addEventListener("click", () => (window.location.href = "index.html"));
const campoEmail = document.getElementById("campo-email");
const campoSenha = document.getElementById("campo-senha");
const entradaEmail = document.getElementById("email");
const entradaSenha = document.getElementById("senha");

entradaEmail.addEventListener("blur", () => {
  aplicarEstado(campoEmail, entradaEmail.value ? validarEmail(entradaEmail.value) : null, false);
});
entradaSenha.addEventListener("input", () => aplicarEstado(campoSenha, null));

document.getElementById("ver-senha").addEventListener("click", () => {
  entradaSenha.type = entradaSenha.type === "password" ? "text" : "password";
});

document.getElementById("form-login").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  esconderAlerta(alerta);

  const email = validarEmail(entradaEmail.value);
  aplicarEstado(campoEmail, email, false);
  if (!email.ok) return;

  if (!entradaSenha.value) {
    aplicarEstado(campoSenha, { ok: false, mensagem: "Informe sua senha." });
    return;
  }

  const botao = document.getElementById("botao-entrar");
  botao.disabled = true;
  botao.textContent = "Entrando...";
  try {
    const resposta = await Api.entrar({ email: entradaEmail.value, senha: entradaSenha.value });
    Sessao.salvar(resposta.token, resposta.usuario);
    window.location.href = resposta.possui_preferencias ? "app.html" : "interesses.html";
  } catch (erro) {
    mostrarAlerta(alerta, erro.message);
    if (erro.campo === "email") aplicarEstado(campoEmail, { ok: false, mensagem: erro.message });
    else aplicarEstado(campoSenha, { ok: false, mensagem: erro.message });
  } finally {
    botao.disabled = false;
    botao.textContent = "Entrar";
  }
});

if (Sessao.token()) window.location.replace("app.html");
