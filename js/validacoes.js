/* Validações do formulário (espelham as regras do backend). */

const SENHA_MINIMA = 6;
const REGEX_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

function validarNome(nome) {
  const valor = (nome || "").trim();
  if (valor.length < 3) return { ok: false, mensagem: "Informe seu nome completo." };
  if (!/^[A-Za-zÀ-ÿ'\s.-]+$/.test(valor)) return { ok: false, mensagem: "Use apenas letras." };
  return { ok: true, mensagem: "Tudo certo!" };
}

function validarEmail(email) {
  const valor = (email || "").trim().toLowerCase();
  if (!valor) return { ok: false, mensagem: "Informe um e-mail." };
  if (!REGEX_EMAIL.test(valor) || valor.includes("..")) {
    return { ok: false, mensagem: "E-mail inválido. Ex.: nome@dominio.com" };
  }
  return { ok: true, mensagem: "E-mail válido." };
}

function validarSenha(senha) {
  const valor = senha || "";
  if (valor.length < SENHA_MINIMA) {
    return { ok: false, mensagem: `Mínimo de ${SENHA_MINIMA} caracteres (faltam ${SENHA_MINIMA - valor.length}).` };
  }
  if (!valor.trim()) return { ok: false, mensagem: "A senha não pode ser só espaços." };
  return { ok: true, mensagem: "Senha válida." };
}

function confirmarSenha(senha, confirmacao) {
  if (!confirmacao) return { ok: false, mensagem: "Repita a senha." };
  if (senha !== confirmacao) return { ok: false, mensagem: "As senhas não conferem." };
  return { ok: true, mensagem: "As senhas conferem." };
}

/** Retorna 0 (vazia), 1 (fraca), 2 (média) ou 3 (forte). */
function forcaDaSenha(senha) {
  const valor = senha || "";
  if (!valor) return 0;
  if (valor.length < SENHA_MINIMA) return 1;
  let pontos = 1;
  if (valor.length >= 10) pontos++;
  if (/[A-Z]/.test(valor) && /[a-z]/.test(valor)) pontos++;
  if (/\d/.test(valor)) pontos++;
  if (/[^A-Za-z0-9]/.test(valor)) pontos++;
  if (pontos >= 4) return 3;
  if (pontos >= 2) return 2;
  return 1;
}

/** Aplica o estado visual (válido/inválido) em um .campo. */
function aplicarEstado(campo, resultado, mostrarSucesso = true) {
  const mensagem = campo.querySelector(".campo__mensagem");
  const marca = campo.querySelector(".campo__estado");
  campo.classList.remove("valido", "invalido");
  if (resultado === null) {
    if (mensagem) mensagem.textContent = "";
    if (marca) marca.textContent = "";
    return;
  }
  campo.classList.add(resultado.ok ? "valido" : "invalido");
  if (mensagem) mensagem.textContent = resultado.ok && !mostrarSucesso ? "" : resultado.mensagem;
  if (marca) marca.textContent = resultado.ok ? "✓" : "!";
}
