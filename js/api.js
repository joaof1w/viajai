/* Camada única de acesso à API do backend + controle de sessão no navegador. */

const API_BASE = `${window.location.origin}/api`;
const CHAVE_TOKEN = "viajai:token";
const CHAVE_USUARIO = "viajai:usuario";

const Sessao = {
  salvar(token, usuario) {
    localStorage.setItem(CHAVE_TOKEN, token);
    localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario || {}));
  },
  atualizarUsuario(usuario) {
    localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario || {}));
  },
  token() {
    return localStorage.getItem(CHAVE_TOKEN);
  },
  usuario() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_USUARIO) || "null");
    } catch {
      return null;
    }
  },
  limpar() {
    localStorage.removeItem(CHAVE_TOKEN);
    localStorage.removeItem(CHAVE_USUARIO);
  },
  exigirLogin() {
    if (!this.token()) {
      window.location.href = "login.html";
      return false;
    }
    return true;
  },
};

class ErroApi extends Error {
  constructor(mensagem, status, campo) {
    super(mensagem);
    this.status = status;
    this.campo = campo;
  }
}

async function requisitar(caminho, { metodo = "GET", corpo = null, autenticado = true, formulario = null } = {}) {
  // Com FormData (fotos), o navegador define o Content-Type multipart sozinho.
  const cabecalhos = formulario ? {} : { "Content-Type": "application/json" };
  const token = Sessao.token();
  if (autenticado && token) cabecalhos.Authorization = `Bearer ${token}`;

  let resposta;
  try {
    resposta = await fetch(`${API_BASE}${caminho}`, {
      method: metodo,
      headers: cabecalhos,
      body: formulario || (corpo ? JSON.stringify(corpo) : undefined),
    });
  } catch {
    throw new ErroApi("Não foi possível falar com o servidor. Ele está rodando?", 0);
  }

  const texto = await resposta.text();
  let dados = {};
  try {
    dados = texto ? JSON.parse(texto) : {};
  } catch {
    dados = { erro: resposta.status === 413 ? "Envio grande demais." : "Resposta inesperada do servidor." };
  }

  if (!resposta.ok) {
    if (resposta.status === 401 && autenticado) {
      Sessao.limpar();
      if (!window.location.pathname.endsWith("login.html")) window.location.href = "login.html";
    }
    throw new ErroApi(dados.erro || "Algo deu errado.", resposta.status, dados.campo);
  }
  return dados;
}

const Api = {
  // autenticação
  cadastrar: (dados) => requisitar("/auth/cadastro", { metodo: "POST", corpo: dados, autenticado: false }),
  verificarCodigo: (dados) => requisitar("/auth/verificar", { metodo: "POST", corpo: dados, autenticado: false }),
  reenviarCodigo: (email) => requisitar("/auth/reenviar-codigo", { metodo: "POST", corpo: { email }, autenticado: false }),
  entrar: (dados) => requisitar("/auth/login", { metodo: "POST", corpo: dados, autenticado: false }),
  sair: () => requisitar("/auth/logout", { metodo: "POST" }),

  // usuário e preferências
  perfil: () => requisitar("/usuarios/eu"),
  opcoesPreferencias: () => requisitar("/preferencias/opcoes", { autenticado: false }),
  salvarPreferencias: (dados) => requisitar("/preferencias", { metodo: "PUT", corpo: dados }),

  // lugares
  listarLugares: (categoria) => requisitar(`/lugares${categoria && categoria !== "todos" ? `?categoria=${categoria}` : ""}`),
  buscarLugares: (filtros) => requisitar(`/lugares/busca?${new URLSearchParams(filtros)}`),
  recomendacoes: (limite = 8, categoria) =>
    requisitar(`/lugares/recomendacoes?limite=${limite}${categoria && categoria !== "todos" ? `&categoria=${categoria}` : ""}`),
  detalharLugar: (id) => requisitar(`/lugares/${id}`),

  // favoritos
  listarFavoritos: () => requisitar("/favoritos"),
  salvarFavorito: (lugarId) => requisitar("/favoritos", { metodo: "POST", corpo: { lugar_id: lugarId } }),
  removerFavorito: (lugarId) => requisitar(`/favoritos/${lugarId}`, { metodo: "DELETE" }),

  // chat com IA (Vai)
  historicoChat: () => requisitar("/chat"),
  enviarMensagem: (texto, viagemId) =>
    requisitar("/chat", { metodo: "POST", corpo: { texto, viagem_id: viagemId || undefined } }),
  permissoesVai: () => requisitar("/chat/permissoes"),
  salvarPermissoesVai: (dados) => requisitar("/chat/permissoes", { metodo: "PUT", corpo: dados }),

  // planejador de viagens
  listarViagens: (status) => requisitar(`/viagens${status ? `?status=${status}` : ""}`),
  criarViagem: (dados) => requisitar("/viagens", { metodo: "POST", corpo: dados }),
  viagem: (id) => requisitar(`/viagens/${id}`),
  editarViagem: (id, dados) => requisitar(`/viagens/${id}`, { metodo: "PUT", corpo: dados }),
  excluirViagem: (id) => requisitar(`/viagens/${id}`, { metodo: "DELETE" }),

  // roteiros
  roteiros: (viagemId) => requisitar(`/viagens/${viagemId}/roteiros`),
  gerarRoteiro: (viagemId, dados) => requisitar(`/viagens/${viagemId}/roteiros/gerar`, { metodo: "POST", corpo: dados }),
  criarRoteiro: (viagemId, dados) => requisitar(`/viagens/${viagemId}/roteiros`, { metodo: "POST", corpo: dados || {} }),
  roteiro: (id) => requisitar(`/roteiros/${id}`),
  duplicarRoteiro: (id) => requisitar(`/roteiros/${id}/duplicar`, { metodo: "POST" }),
  ativarRoteiro: (id) => requisitar(`/roteiros/${id}/ativar`, { metodo: "POST" }),
  excluirRoteiro: (id) => requisitar(`/roteiros/${id}`, { metodo: "DELETE" }),
  reorganizarRoteiro: (id, itens) => requisitar(`/roteiros/${id}/ordem`, { metodo: "PUT", corpo: { itens } }),
  adicionarAtividade: (roteiroId, dados) => requisitar(`/roteiros/${roteiroId}/atividades`, { metodo: "POST", corpo: dados }),
  editarAtividade: (id, dados) => requisitar(`/atividades/${id}`, { metodo: "PATCH", corpo: dados }),
  excluirAtividade: (id) => requisitar(`/atividades/${id}`, { metodo: "DELETE" }),

  // finanças
  financas: (viagemId) => requisitar(`/viagens/${viagemId}/financas`),
  definirOrcamento: (viagemId, dados) => requisitar(`/viagens/${viagemId}/orcamento`, { metodo: "PUT", corpo: dados }),
  registrarDespesa: (viagemId, dados) => requisitar(`/viagens/${viagemId}/despesas`, { metodo: "POST", corpo: dados }),
  editarDespesa: (id, dados) => requisitar(`/despesas/${id}`, { metodo: "PUT", corpo: dados }),
  excluirDespesa: (id) => requisitar(`/despesas/${id}`, { metodo: "DELETE" }),

  // checklist
  checklist: (viagemId) => requisitar(`/viagens/${viagemId}/checklist`),
  sugerirChecklist: (viagemId) => requisitar(`/viagens/${viagemId}/checklist/sugestoes`, { metodo: "POST" }),
  adicionarItem: (viagemId, dados) => requisitar(`/viagens/${viagemId}/checklist`, { metodo: "POST", corpo: dados }),
  importarChecklist: (viagemId, origem) =>
    requisitar(`/viagens/${viagemId}/checklist/importar`, { metodo: "POST", corpo: { origem_viagem_id: origem } }),
  atualizarItem: (id, dados) => requisitar(`/checklist/${id}`, { metodo: "PATCH", corpo: dados }),
  removerItem: (id) => requisitar(`/checklist/${id}`, { metodo: "DELETE" }),

  // calendário
  calendario: (viagemId) => requisitar(`/viagens/${viagemId}/calendario`),
  criarCompromisso: (viagemId, dados) => requisitar(`/viagens/${viagemId}/compromissos`, { metodo: "POST", corpo: dados }),
  editarCompromisso: (id, dados) => requisitar(`/compromissos/${id}`, { metodo: "PUT", corpo: dados }),
  excluirCompromisso: (id) => requisitar(`/compromissos/${id}`, { metodo: "DELETE" }),

  // grupo
  participantes: (viagemId) => requisitar(`/viagens/${viagemId}/participantes`),
  convidar: (viagemId, dados) => requisitar(`/viagens/${viagemId}/participantes`, { metodo: "POST", corpo: dados }),
  alterarPapel: (viagemId, pid, papel) =>
    requisitar(`/viagens/${viagemId}/participantes/${pid}`, { metodo: "PATCH", corpo: { papel } }),
  removerParticipante: (viagemId, pid) => requisitar(`/viagens/${viagemId}/participantes/${pid}`, { metodo: "DELETE" }),
  convites: () => requisitar("/convites"),
  aceitarConvite: (id) => requisitar(`/convites/${id}/aceitar`, { metodo: "POST" }),
  recusarConvite: (id) => requisitar(`/convites/${id}/recusar`, { metodo: "POST" }),
  sugestoes: (viagemId) => requisitar(`/viagens/${viagemId}/sugestoes`),
  sugerir: (viagemId, dados) => requisitar(`/viagens/${viagemId}/sugestoes`, { metodo: "POST", corpo: dados }),
  votar: (sugestaoId, valor) => requisitar(`/sugestoes/${sugestaoId}/voto`, { metodo: "POST", corpo: { valor } }),
  decidir: (sugestaoId, dados) => requisitar(`/sugestoes/${sugestaoId}/decisao`, { metodo: "POST", corpo: dados }),

  // avaliações e comunidade
  avaliacoes: (lugarId, ordenar = "recentes") => requisitar(`/lugares/${lugarId}/avaliacoes?ordenar=${ordenar}`),
  avaliar: (lugarId, formulario) => requisitar(`/lugares/${lugarId}/avaliacoes`, { metodo: "POST", formulario }),
  editarAvaliacao: (id, formulario) => requisitar(`/avaliacoes/${id}`, { metodo: "PUT", formulario }),
  excluirAvaliacao: (id) => requisitar(`/avaliacoes/${id}`, { metodo: "DELETE" }),
  removerFotoAvaliacao: (id, fotoId) => requisitar(`/avaliacoes/${id}/fotos/${fotoId}`, { metodo: "DELETE" }),
  comunidade: () => requisitar("/comunidade"),

  // diário
  diario: () => requisitar("/diario"),
  estatisticas: () => requisitar("/diario/estatisticas"),
  criarRegistro: (formulario) => requisitar("/diario", { metodo: "POST", formulario }),
  editarRegistro: (id, formulario) => requisitar(`/diario/${id}`, { metodo: "PUT", formulario }),
  excluirRegistro: (id) => requisitar(`/diario/${id}`, { metodo: "DELETE" }),
  removerFotoRegistro: (id, fotoId) => requisitar(`/diario/${id}/fotos/${fotoId}`, { metodo: "DELETE" }),
  diarioDaViagem: (viagemId) => requisitar(`/viagens/${viagemId}/diario`),

  // fotos, mapa e comparador
  fotosLugar: (lugarId) => requisitar(`/lugares/${lugarId}/fotos`, { autenticado: false }),
  fundoInicial: () => requisitar("/vitrine/fundo", { autenticado: false }),
  configMapa: () => requisitar("/mapa/config", { autenticado: false }),
  lugaresMapa: () => requisitar("/mapa/lugares", { autenticado: false }),
  mapaViagem: (viagemId) => requisitar(`/viagens/${viagemId}/mapa`),
  proximidades: (lugarId, raio = 5) => requisitar(`/lugares/${lugarId}/proximidades?raio_km=${raio}`),
  comparar: (ids) => requisitar(`/comparador?ids=${ids.join(",")}`),
};

/* Utilidades de interface -------------------------------------------------- */
function mostrarAlerta(elemento, mensagem, tipo = "erro") {
  if (!elemento) return;
  elemento.textContent = mensagem;
  elemento.className = `alerta alerta--${tipo} visivel`;
}

function esconderAlerta(elemento) {
  if (elemento) elemento.className = "alerta";
}

function urlImagem(nomeArquivo) {
  return `assets/${nomeArquivo || "card-praia.svg"}`;
}

/** Imagem do cartão: fotografia real verificada quando houver; senão, a ilustração da categoria. */
function urlCapa(lugar, tamanho = "miniatura") {
  if (lugar && lugar.foto) return lugar.foto[tamanho] || lugar.foto.miniatura;
  return urlImagem(lugar && lugar.imagem);
}
