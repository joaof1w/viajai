/* Viajaí — VERSÃO DE DEMONSTRAÇÃO sem servidor.
 *
 * Intercepta as chamadas a /api/* e as responde aqui mesmo, no navegador, com os dados salvos
 * em localStorage (somente neste navegador). Reimplementa as regras principais do backend Flask
 * (validações, match, roteiro, finanças, checklist, agenda, avaliações, diário, comparador e Vai).
 * Não há contas reais, e-mail, convites entre pessoas, upload de fotos, fotos reais nem
 * integrações externas — para isso é preciso o backend (veja README/DEPLOY).
 */
(function () {
  "use strict";
  const D = window.DEMO_DADOS;
  const CHAVE = "viajai-demo-db";
  const nativeFetch = window.fetch.bind(window);

  /* ------------------------------ banco local ------------------------------ */
  const vazio = () => ({ seq: {}, usuarios: [], codigos: {}, viagens: [], roteiros: [], atividades: [], despesas: [],
    planejamento: {}, itens: [], compromissos: [], sugestoes: [], avaliacoes: [], diario: [] });
  let db;
  try { db = JSON.parse(localStorage.getItem(CHAVE)) || vazio(); } catch { db = vazio(); }
  for (const [k, v] of Object.entries(vazio())) if (!(k in db)) db[k] = v;
  const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(db)); } catch { /* cota cheia */ } };
  const novoId = (t) => (db.seq[t] = (db.seq[t] || 0) + 1);
  const agora = () => new Date().toISOString().slice(0, 19);

  class Erro extends Error {
    constructor(status, mensagem, campo) { super(mensagem); this.status = status; this.campo = campo; }
  }
  const invalido = (msg, campo) => new Erro(422, msg, campo);

  /* ------------------------------- utilidades ------------------------------ */
  const norm = (t) => (t || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const hojeIso = () => { const a = new Date(); return new Date(a - a.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const addDias = (iso, n) => { const [a, m, d] = iso.split("-").map(Number); const x = new Date(a, m - 1, d + n);
    return new Date(x - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const diasEntre = (a, b) => Math.round((new Date(b + "T00:00") - new Date(a + "T00:00")) / 86400000);
  const arred1 = (n) => Math.round(n * 10) / 10;
  const hav = (a, b) => {
    const r = (g) => (g * Math.PI) / 180, dl = r(b[0] - a[0]), dn = r(b[1] - a[1]);
    const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dn / 2) ** 2;
    return arred1(2 * 6371 * Math.asin(Math.sqrt(h)));
  };
  const coordsCidade = (cidade, estado) => {
    const c = norm(cidade).trim(), uf = (estado || "").toUpperCase();
    const lista = D.cidades_coord;
    let h = lista.find((x) => norm(x[0]) === c && x[1] === uf) || lista.find((x) => x[1] === uf) || lista.find((x) => x[0] === "são paulo");
    return [h[2], h[3]];
  };
  const iniciais = (nome) => { const p = nome.split(/\s+/).filter(Boolean); return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); };

  /* ------------------------------- validação ------------------------------- */
  const txt = (v, campo, rotulo, { min = 1, max = 255, obrig = true } = {}) => {
    const t = (v == null ? "" : String(v)).trim();
    if (!t) { if (obrig) throw invalido(`Informe ${rotulo}.`, campo); return null; }
    if (t.length < min) throw invalido(`${rotulo} deve ter ao menos ${min} caracteres.`, campo);
    if (t.length > max) throw invalido(`${rotulo} deve ter no máximo ${max} caracteres.`, campo);
    return t;
  };
  const inteiro = (v, campo, rotulo, { min = null, max = null, obrig = true } = {}) => {
    if (v === null || v === undefined || v === "") { if (obrig) throw invalido(`Informe ${rotulo}.`, campo); return null; }
    const n = Number(String(v).trim());
    if (!Number.isInteger(n)) throw invalido(`${rotulo} deve ser um número inteiro.`, campo);
    if (min !== null && n < min) throw invalido(`${rotulo} deve ser no mínimo ${min}.`, campo);
    if (max !== null && n > max) throw invalido(`${rotulo} deve ser no máximo ${max}.`, campo);
    return n;
  };
  const dinheiro = (v, campo, rotulo, obrig = true) => {
    if (v === null || v === undefined || v === "") { if (obrig) throw invalido(`Informe ${rotulo}.`, campo); return null; }
    let n;
    if (typeof v === "number") n = v;
    else {
      let t = String(v).replace("R$", "").replace(/\s/g, "");
      if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
      n = Number(t);
    }
    if (!Number.isFinite(n)) throw invalido(`${rotulo} inválido.`, campo);
    if (n < 0) throw invalido(`${rotulo} não pode ser negativo.`, campo);
    if (n > 10000000) throw invalido(`${rotulo} muito alto.`, campo);
    return Math.round(n * 100);
  };
  const data = (v, campo, rotulo, obrig = true) => {
    if (!v) { if (obrig) throw invalido(`Informe ${rotulo}.`, campo); return null; }
    const t = String(v).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || isNaN(new Date(t + "T00:00"))) throw invalido(`${rotulo} inválida (use AAAA-MM-DD).`, campo);
    return t;
  };
  const hora = (v, campo, rotulo) => {
    if (!v) return null;
    const t = String(v).slice(0, 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw invalido(`${rotulo} inválido (use HH:MM).`, campo);
    return t;
  };
  const dataHora = (v, campo, rotulo) => {
    if (!v) throw invalido(`Informe ${rotulo}.`, campo);
    const t = String(v).slice(0, 16);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t) || isNaN(new Date(t))) throw invalido(`${rotulo} inválido.`, campo);
    return t;
  };
  const escolha = (v, opcoes, campo, rotulo, padrao) => {
    if ((v === null || v === undefined || v === "") && padrao) return padrao;
    const t = String(v || "").toLowerCase();
    if (!opcoes.includes(t)) throw invalido(`${rotulo} inválido.`, campo);
    return t;
  };
  const coord = (lat, lon) => {
    if ((lat === null || lat === undefined || lat === "") && (lon === null || lon === undefined || lon === "")) return [null, null];
    const a = Number(lat), b = Number(lon);
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) throw invalido("Coordenadas inválidas.", "latitude");
    return [Math.round(a * 1e6) / 1e6, Math.round(b * 1e6) / 1e6];
  };
  const bool = (v) => v === true || ["1", "true", "sim", "on", "yes"].includes(String(v).toLowerCase());
  const horaMin = (h) => (h ? Number(h.slice(0, 2)) * 60 + Number(h.slice(3)) : null);
  const minHora = (m) => { m = Math.max(0, Math.min(1439, Math.round(m))); return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };

  /* ------------------------------- catálogo -------------------------------- */
  const SIMBOLO = (n) => "$".repeat(Math.max(1, Math.min(4, n)));
  const interessePorSlug = (s) => D.interesses.find((i) => i.slug === s);
  const lugarPorId = (id) => D.lugares.find((l) => l.id === Number(id));
  const tipoLugar = (l) => (l.categoria === "gastronomia" ? "estabelecimento" : "atracao");
  const popularidade = (id) => db.usuarios.filter((u) => (u.favoritos || []).includes(id)).length;

  function calcMatch(l, pref, dist) {
    if (!pref) return Math.min(99, Math.round(44 + 12 + (l.nota - 4) * 20));
    let p = 44;
    const ints = new Set(pref.interesses);
    if (ints.has(l.categoria)) p += 24; else if (ints.size) p -= 6;
    p += (l.nota - 4) * 12;
    p += { 0: 9, 1: 4 }[Math.abs(l.faixa_preco - pref.orcamento)] ?? -7;
    if (dist <= 60) p += 10; else if (dist <= 300) p += 6; else if (dist <= 1200) p += 3;
    p += Math.min(5, popularidade(l.id));
    return Math.max(35, Math.min(99, Math.round(p)));
  }
  const distUsuario = (l, pref) => (pref ? hav(coordsCidade(pref.cidade, pref.estado), [l.latitude, l.longitude]) : 0);
  function lugarDict(l, u, extra = {}) {
    const pref = u && u.preferencia;
    const dist = distUsuario(l, pref);
    return { id: l.id, nome: l.nome, categoria: l.categoria, cidade: l.cidade, estado: l.estado, local: `${l.cidade}, ${l.estado}`,
      descricao: l.descricao, nota: Math.round(l.nota * 10) / 10, avaliacoes: l.avaliacoes, faixa_preco: l.faixa_preco,
      preco_simbolo: SIMBOLO(l.faixa_preco), imagem: D.imagens[l.categoria] || "card-praia.svg", foto: null, total_fotos: 0,
      tipo: tipoLugar(l), latitude: l.latitude, longitude: l.longitude, melhor_epoca: l.melhor_epoca,
      favorito: !!(u && (u.favoritos || []).includes(l.id)), match: calcMatch(l, pref, dist), distancia_km: dist, ...extra };
  }

  /* -------------------------------- usuários ------------------------------- */
  const prefDict = (p) => {
    const f = D.faixas.find((x) => x.valor === p.orcamento) || D.faixas[1];
    return { orcamento: p.orcamento, orcamento_simbolo: f.simbolo, orcamento_rotulo: f.rotulo, orcamento_descricao: f.descricao,
      cidade: p.cidade, estado: p.estado, interesses: p.interesses.map(interessePorSlug).filter(Boolean), atualizado_em: p.atualizado_em };
  };
  const usuarioDict = (u, comPref) => {
    const d = { id: u.id, nome: u.nome, primeiro_nome: u.nome.split(" ")[0], iniciais: iniciais(u.nome), email: u.email,
      verificado: u.verificado, criado_em: u.criado_em };
    if (comPref) d.preferencias = u.preferencia ? prefDict(u.preferencia) : null;
    return d;
  };
  const nomeValido = (n) => {
    n = (n || "").trim();
    if (n.length < 3) throw invalido("Informe seu nome completo (mínimo 3 caracteres).", "nome");
    if (!/^[A-Za-zÀ-ÿ'\s.-]+$/.test(n)) throw invalido("O nome deve conter apenas letras.", "nome");
    return n;
  };
  const emailValido = (e) => {
    e = (e || "").trim().toLowerCase();
    if (!e) throw invalido("Informe um e-mail.", "email");
    if (e.length > 120 || !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(e) || e.includes("..")) throw invalido("E-mail inválido. Use o formato nome@dominio.com.", "email");
    return e;
  };

  /* ------------------------------- viagens --------------------------------- */
  const TIPOS_VIAGEM = D.tipos_viagem;
  const statusViagem = (v) => (v.data_volta < hojeIso() ? "concluida" : v.data_ida <= hojeIso() ? "em_andamento" : "futura");
  const duracao = (v) => diasEntre(v.data_ida, v.data_volta) + 1;
  function viagemDict(v, u, resumo = false) {
    const l = v.lugar_id ? lugarPorId(v.lugar_id) : null;
    const d = { id: v.id, titulo: v.titulo, destino: v.destino, lugar_id: v.lugar_id, latitude: v.latitude, longitude: v.longitude,
      data_ida: v.data_ida, data_volta: v.data_volta, duracao_dias: duracao(v), viajantes: v.viajantes, tipo: v.tipo,
      tipo_rotulo: TIPOS_VIAGEM[v.tipo] || v.tipo, status: statusViagem(v),
      orcamento: v.orcamento_centavos != null ? v.orcamento_centavos / 100 : null,
      proprietario: { id: u.id, nome: u.nome }, compartilhada: false, total_participantes: 1, meu_papel: "proprietario" };
    if (l) d.lugar = { id: l.id, nome: l.nome, categoria: l.categoria, imagem: D.imagens[l.categoria], foto: null };
    if (!resumo) { d.observacoes = v.observacoes; d.preferencias = v.preferencias; d.criado_em = v.criado_em; }
    return d;
  }
  function viagemDoUsuario(id, u) {
    const v = db.viagens.find((x) => x.id === Number(id) && x.usuario_id === u.id);
    if (!v) throw new Erro(404, "Viagem não encontrada.");
    return v;
  }
  function validarViagem(d, atual) {
    const val = (c) => (c in d ? d[c] : atual ? atual[c] : null);
    const lid = "lugar_id" in d ? d.lugar_id : atual ? atual.lugar_id : null;
    let lugar = null;
    if (lid) { lugar = lugarPorId(inteiro(lid, "lugar_id", "destino do catálogo", { min: 1 })); if (!lugar) throw invalido("Destino do catálogo não encontrado.", "lugar_id"); }
    const destino = txt(val("destino") || (lugar ? `${lugar.cidade}, ${lugar.estado}` : null), "destino", "o destino", { min: 2, max: 160 });
    const titulo = txt(val("titulo") || `Viagem para ${destino}`, "titulo", "o nome da viagem", { min: 2, max: 120 });
    const ida = data(val("data_ida"), "data_ida", "a data de partida");
    const volta = data(val("data_volta"), "data_volta", "a data de retorno");
    if (volta < ida) throw invalido("A data de retorno não pode ser antes da partida.", "data_volta");
    if (diasEntre(ida, volta) + 1 > 90) throw invalido("A viagem pode ter no máximo 90 dias.", "data_volta");
    const orc = dinheiro("orcamento" in d ? d.orcamento : atual && atual.orcamento_centavos != null ? atual.orcamento_centavos / 100 : null, "orcamento", "o orçamento", false);
    return { lugar, campos: { destino, titulo, data_ida: ida, data_volta: volta,
      viajantes: inteiro(val("viajantes") ?? 1, "viajantes", "a quantidade de viajantes", { min: 1, max: 50 }),
      tipo: escolha(val("tipo"), Object.keys(TIPOS_VIAGEM), "tipo", "tipo de viagem", "lazer"), orcamento_centavos: orc,
      observacoes: txt(val("observacoes"), "observacoes", "as observações", { max: 2000, obrig: false }),
      preferencias: txt(val("preferencias"), "preferencias", "as preferências", { max: 1000, obrig: false }) } };
  }
  function aplicarCoordenadas(v, d, lugar) {
    const [la, lo] = coord(d.latitude, d.longitude);
    if (la !== null) { v.latitude = la; v.longitude = lo; }
    else if (lugar) { v.latitude = lugar.latitude; v.longitude = lugar.longitude; }
    else if (!("latitude" in v) || v.latitude === undefined) { v.latitude = null; v.longitude = null; }
  }

  const roteiroAtivo = (vid) => db.roteiros.find((r) => r.viagem_id === vid && r.ativo);
  const atividadesDe = (rid) => db.atividades.filter((a) => a.roteiro_id === rid).sort((a, b) => a.dia - b.dia || a.ordem - b.ordem || a.id - b.id);

  function resumoViagem(v) {
    const gasto = db.despesas.filter((x) => x.viagem_id === v.id).reduce((s, x) => s + x.valor_centavos, 0);
    const itens = db.itens.filter((i) => i.viagem_id === v.id), feitos = itens.filter((i) => i.concluido).length;
    const r = roteiroAtivo(v.id);
    return { gasto: gasto / 100, orcamento: v.orcamento_centavos != null ? v.orcamento_centavos / 100 : null,
      checklist_total: itens.length, checklist_concluidos: feitos, checklist_percentual: itens.length ? Math.round((feitos * 100) / itens.length) : 0,
      compromissos: db.compromissos.filter((c) => c.viagem_id === v.id).length,
      roteiro_versoes: db.roteiros.filter((x) => x.viagem_id === v.id).length, roteiro_atividades: r ? atividadesDe(r.id).length : 0 };
  }

  /* -------------------------------- roteiros ------------------------------- */
  const CAT_ATIV = { atracao: "Atração", restaurante: "Restaurante", experiencia: "Experiência", natureza: "Natureza", cultura: "Cultura",
    compras: "Compras", transporte: "Deslocamento", descanso: "Tempo livre", outro: "Outro" };
  const ativDict = (a) => ({ id: a.id, roteiro_id: a.roteiro_id, dia: a.dia, ordem: a.ordem, titulo: a.titulo, descricao: a.descricao,
    categoria: a.categoria, categoria_rotulo: CAT_ATIV[a.categoria] || a.categoria, horario: a.horario, horario_sugerido: !!a.horario_sugerido,
    duracao_min: a.duracao_min, lugar_id: a.lugar_id, ponto_id: null, endereco: a.endereco, latitude: a.latitude, longitude: a.longitude,
    funcionamento: null, fonte: a.fonte });
  const roteiroDict = (r, comAtiv = true) => {
    const d = { id: r.id, viagem_id: r.viagem_id, versao: r.versao, titulo: r.titulo, origem: r.origem, ativo: r.ativo, parametros: r.parametros || {},
      observacoes_ia: r.observacoes_ia, criado_por: r.criado_por, criado_em: r.criado_em, total_atividades: atividadesDe(r.id).length };
    if (comAtiv) d.atividades = atividadesDe(r.id).map(ativDict);
    return d;
  };
  function novaVersao(v, u, titulo, origem, parametros, obs) {
    if (db.roteiros.filter((r) => r.viagem_id === v.id).length >= 20) throw new Erro(400, "Limite de 20 versões de roteiro. Exclua versões antigas.");
    db.roteiros.filter((r) => r.viagem_id === v.id).forEach((r) => (r.ativo = false));
    const versao = Math.max(0, ...db.roteiros.filter((r) => r.viagem_id === v.id).map((r) => r.versao)) + 1;
    const r = { id: novoId("roteiro"), viagem_id: v.id, versao, titulo: titulo || `Roteiro do Vai · versão ${versao}`, origem, ativo: true,
      parametros: parametros || {}, observacoes_ia: obs || null, criado_por: u.nome, criado_em: agora() };
    db.roteiros.push(r);
    return r;
  }
  function roteiroDoUsuario(id, u) {
    const r = db.roteiros.find((x) => x.id === Number(id));
    if (!r) throw new Erro(404, "Roteiro não encontrado.");
    viagemDoUsuario(r.viagem_id, u);
    return r;
  }
  function atividadeDoUsuario(id, u) {
    const a = db.atividades.find((x) => x.id === Number(id));
    if (!a) throw new Erro(404, "Atividade não encontrada.");
    roteiroDoUsuario(a.roteiro_id, u);
    return a;
  }
  function validarAtividade(d, v, atual) {
    const val = (c, p) => (c in d ? d[c] : atual ? atual[c] : p);
    const lid = val("lugar_id");
    const lugar = lid ? lugarPorId(lid) : null;
    if (lid && !lugar) throw invalido("Lugar do catálogo não encontrado.", "lugar_id");
    let [la, lo] = coord(val("latitude"), val("longitude"));
    if (la === null && lugar) { la = lugar.latitude; lo = lugar.longitude; }
    const c = { titulo: txt(val("titulo"), "titulo", "o título da atividade", { min: 2, max: 160 }),
      descricao: txt(val("descricao"), "descricao", "a descrição", { max: 1500, obrig: false }),
      dia: inteiro(val("dia", 1), "dia", "o dia", { min: 1, max: duracao(v) }),
      categoria: escolha(val("categoria"), Object.keys(CAT_ATIV), "categoria", "categoria", "atracao"),
      horario: hora(val("horario"), "horario", "o horário"),
      duracao_min: inteiro(val("duracao_min"), "duracao_min", "a duração (min)", { min: 5, max: 1440, obrig: false }),
      endereco: txt(val("endereco"), "endereco", "o endereço", { max: 200, obrig: false }),
      lugar_id: lugar ? lugar.id : null, latitude: la, longitude: lo };
    if ("horario" in d) c.horario_sugerido = false;
    return c;
  }

  const DURACAO = { praia: 180, natureza: 180, aventura: 180, museus: 120, cultura: 120, gastronomia: 90 };
  const CAT_DE = { praia: "natureza", natureza: "natureza", aventura: "experiencia", museus: "cultura", cultura: "cultura", gastronomia: "restaurante" };

  function gerarPlano(v, par) {
    const centro = v.latitude != null ? [v.latitude, v.longitude] : null;
    const cand = [];
    for (const l of D.lugares) {
      if (centro) { if (hav(centro, [l.latitude, l.longitude]) > 80) continue; }
      else if (!norm(v.destino).includes(norm(l.cidade))) continue;
      let p = 2 + (l.nota - 4) * 2;
      p += par.interesses.includes(l.categoria) ? 3 : 0;
      p += Math.abs(l.faixa_preco - par.orcamento) <= 1 ? 1 : -1.5;
      if (v.lugar_id === l.id) p += 10;
      cand.push({ l, p, refeicao: l.categoria === "gastronomia" });
    }
    cand.sort((a, b) => b.p - a.p);
    const dias = duracao(v), porDia = { leve: 2, moderado: 3, intenso: 4 }[par.ritmo] || 3;
    const passeios = cand.filter((c) => !c.refeicao), refeicoes = cand.filter((c) => c.refeicao);
    const caps = Array.from({ length: dias }, (_, i) => (i + 1 === dias && dias > 1 ? Math.max(1, porDia - 1) : porDia));
    let escolhidos = passeios.slice(0, caps.reduce((a, b) => a + b, 0));
    // vizinho mais próximo a partir do centro
    const rota = []; let atual = centro;
    while (escolhidos.length) {
      const prox = atual ? escolhidos.reduce((m, c) => (hav(atual, [c.l.latitude, c.l.longitude]) < hav(atual, [m.l.latitude, m.l.longitude]) ? c : m)) : escolhidos[0];
      rota.push(prox); escolhidos = escolhidos.filter((c) => c !== prox); atual = [prox.l.latitude, prox.l.longitude];
    }
    const item = (dia, c, minuto, dur, prefixo) => ({ dia, titulo: prefixo ? `${prefixo}: ${c.l.nome}` : c.l.nome, descricao: c.l.descricao,
      categoria: prefixo ? "restaurante" : CAT_DE[c.l.categoria] || "atracao", horario: minHora(minuto), horario_sugerido: true, duracao_min: dur,
      lugar_id: c.l.id, endereco: `${c.l.cidade}, ${c.l.estado}`, latitude: c.l.latitude, longitude: c.l.longitude, fonte: "catalogo" });
    const usados = new Set(), plano = []; let cursor = 0;
    caps.forEach((cap, i) => {
      const dia = i + 1, doDia = rota.slice(cursor, cursor + cap); cursor += cap;
      let minuto = 9 * 60; const itens = [];
      const centroDia = doDia.length ? [doDia.reduce((s, c) => s + c.l.latitude, 0) / doDia.length, doDia.reduce((s, c) => s + c.l.longitude, 0) / doDia.length] : null;
      const refProx = () => {
        const livres = par.incluir_refeicoes ? refeicoes.filter((r) => !usados.has(r.l.id)) : [];
        if (!livres.length || !centroDia) return null;
        const e = livres.reduce((m, r) => (hav(centroDia, [r.l.latitude, r.l.longitude]) - r.p < hav(centroDia, [m.l.latitude, m.l.longitude]) - m.p ? r : m));
        usados.add(e.l.id); return e;
      };
      const metade = Math.ceil(doDia.length / 2);
      doDia.forEach((c, idx) => {
        if (idx === metade) { const a = refProx(); if (a) { minuto = Math.max(minuto, 720); itens.push(item(dia, a, minuto, 75, "Almoço")); minuto += 95; } }
        itens.push(item(dia, c, minuto, DURACAO[c.l.categoria] || 90)); minuto += (DURACAO[c.l.categoria] || 90) + 30;
      });
      if (doDia.length) { const j = refProx(); if (j) itens.push(item(dia, j, Math.max(minuto, 19 * 60 + 30), 90, "Jantar")); }
      if (!itens.length) itens.push({ dia, titulo: `Tempo livre em ${v.destino}`, categoria: "descanso", horario: null, horario_sugerido: false, duracao_min: null, fonte: "sugestao",
        descricao: "Não encontramos mais opções confirmadas para este dia. Adicione atividades manualmente." });
      if (dia === dias && dias > 1) itens.push({ dia, titulo: "Retorno", categoria: "transporte", horario: null, horario_sugerido: false, duracao_min: null, fonte: "sugestao",
        descricao: "Reserve tempo para o check-out e o deslocamento de volta." });
      plano.push(...itens);
    });
    return { plano, total: cand.length };
  }

  /* -------------------------------- finanças ------------------------------- */
  const CAT_DESP = { hospedagem: { rotulo: "Hospedagem", icone: "🏨", cor: "#2f80ed" }, alimentacao: { rotulo: "Alimentação", icone: "🍽️", cor: "#ff6b35" },
    transporte: { rotulo: "Transporte", icone: "🚗", cor: "#16a34a" }, passeios: { rotulo: "Passeios", icone: "🎟️", cor: "#9b51e0" }, outros: { rotulo: "Outros", icone: "🧾", cor: "#93a1ad" } };
  const reais = (c) => Math.round(((c || 0) / 100) * 100) / 100;
  const despDict = (d) => { const i = CAT_DESP[d.categoria] || CAT_DESP.outros;
    return { id: d.id, descricao: d.descricao, categoria: d.categoria, categoria_rotulo: i.rotulo, icone: i.icone, valor: d.valor_centavos / 100,
      data: d.data, pago_por: d.pago_por_id ? { id: d.pago_por_id, nome: (db.usuarios.find((u) => u.id === d.pago_por_id) || {}).nome } : null, criado_por: (db.usuarios.find((u) => u.id === d.criado_por_id) || {}).nome }; };
  function resumoFinanceiro(v, u) {
    const desp = db.despesas.filter((d) => d.viagem_id === v.id).sort((a, b) => ((b.data || v.data_ida) + String(b.id).padStart(8, "0")).localeCompare((a.data || v.data_ida) + String(a.id).padStart(8, "0")));
    const gasto = desp.reduce((s, d) => s + d.valor_centavos, 0), orc = v.orcamento_centavos, plan = db.planejamento[v.id] || {};
    const cats = Object.entries(CAT_DESP).map(([chave, info]) => { const t = desp.filter((d) => d.categoria === chave).reduce((s, d) => s + d.valor_centavos, 0), p = plan[chave];
      return { categoria: chave, ...info, gasto: reais(t), planejado: p != null ? reais(p) : null, percentual_gasto: gasto ? Math.round((t * 1000) / gasto) / 10 : 0, estourado: p != null && t > p }; });
    const alertas = [];
    if (orc) { const uso = gasto / orc;
      if (uso > 1) alertas.push({ nivel: "erro", texto: `Orçamento ultrapassado em R$ ${reais(gasto - orc).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.` });
      else if (uso >= 0.8) alertas.push({ nivel: "aviso", texto: `Atenção: ${Math.round(uso * 100)}% do orçamento já foi usado.` }); }
    cats.filter((c) => c.estourado).forEach((c) => alertas.push({ nivel: "aviso", texto: `${c.rotulo} passou do valor planejado.` }));
    const pessoas = Math.max(1, v.viajantes), pag = {};
    desp.forEach((d) => { if (d.pago_por_id) { const n = (db.usuarios.find((x) => x.id === d.pago_por_id) || {}).nome; pag[n] = (pag[n] || 0) + d.valor_centavos; } });
    return { moeda: "BRL", orcamento: orc != null ? reais(orc) : null, gasto: reais(gasto), saldo: orc != null ? reais(orc - gasto) : null,
      percentual_usado: orc ? Math.round((gasto * 1000) / orc) / 10 : null, viajantes: pessoas, orcamento_por_pessoa: orc ? reais(orc / pessoas) : null,
      gasto_por_pessoa: reais(gasto / pessoas), gasto_por_dia: reais(gasto / duracao(v)), categorias: cats,
      por_pagador: Object.entries(pag).sort((a, b) => b[1] - a[1]).map(([nome, val]) => ({ nome, valor: reais(val) })), alertas,
      despesas: desp.map(despDict), pode_editar: true, membros: [{ id: u.id, nome: u.nome }] };
  }
  function validarDespesa(d, v, atual) {
    const val = (c) => (c in d ? d[c] : atual ? atual[c] : null);
    let pago = "pago_por_id" in d ? d.pago_por_id : atual ? atual.pago_por_id : null;
    if (pago) { pago = inteiro(pago, "pago_por_id", "quem pagou", { min: 1 }); if (pago !== v.usuario_id) throw invalido("Quem pagou precisa participar da viagem.", "pago_por_id"); } else pago = null;
    const cent = dinheiro("valor" in d ? d.valor : atual ? atual.valor_centavos / 100 : null, "valor", "o valor");
    if (cent === 0) throw invalido("O valor precisa ser maior que zero.", "valor");
    return { descricao: txt(val("descricao"), "descricao", "a descrição", { min: 2, max: 160 }), categoria: escolha(val("categoria"), Object.keys(CAT_DESP), "categoria", "categoria", "outros"),
      valor_centavos: cent, data: data(val("data"), "data", "a data", false), pago_por_id: pago };
  }

  /* -------------------------------- checklist ------------------------------ */
  const CAT_CHECK = { documentos: { rotulo: "Documentos", icone: "🪪" }, roupas: { rotulo: "Roupas", icone: "👕" }, eletronicos: { rotulo: "Eletrônicos", icone: "🔌" },
    higiene: { rotulo: "Higiene", icone: "🧴" }, saude: { rotulo: "Saúde", icone: "💊" }, outros: { rotulo: "Outros", icone: "🎒" } };
  const chaveItem = (t) => norm(t).replace(/[^a-z0-9]/g, "");
  function checklistResp(v) {
    const ordem = Object.keys(CAT_CHECK);
    const itens = db.itens.filter((i) => i.viagem_id === v.id).sort((a, b) => ordem.indexOf(a.categoria) - ordem.indexOf(b.categoria) || a.ordem - b.ordem || a.id - b.id);
    const feitos = itens.filter((i) => i.concluido).length;
    return { itens: itens.map((i) => ({ id: i.id, categoria: i.categoria, categoria_rotulo: (CAT_CHECK[i.categoria] || CAT_CHECK.outros).rotulo, texto: i.texto, concluido: i.concluido, sugerido: i.sugerido, ordem: i.ordem })),
      total: itens.length, concluidos: feitos, percentual: itens.length ? Math.round((feitos * 100) / itens.length) : 0,
      categorias: Object.entries(CAT_CHECK).map(([valor, x]) => ({ valor, ...x })), pode_editar: true };
  }
  function sugerirItens(v, u) {
    const dias = duracao(v), lista = [...D.checklist.base];
    lista.push(["roupas", `Roupas para ${dias} ${dias === 1 ? "dia" : "dias"} (inclua uma muda extra)`]);
    if (dias >= 4) lista.push(["higiene", "Sabão ou saquinhos para roupa suja"]);
    if (v.viajantes > 1) lista.push(["outros", "Combinar com o grupo quem leva itens compartilhados"]);
    const cats = new Set(u.preferencia ? u.preferencia.interesses : []);
    const l = v.lugar_id ? lugarPorId(v.lugar_id) : null; if (l) cats.add(l.categoria);
    cats.forEach((c) => lista.push(...(D.checklist.interesse[c] || [])));
    lista.push(...(D.checklist.tipo[v.tipo] || []));
    if (!l && !norm(v.destino).includes("brasil") && !/,\s*[A-Z]{2}$/.test(v.destino.trim())) lista.push(["documentos", "Conferir se o destino exige passaporte, visto ou vacinas"]);
    const vistos = new Set();
    return lista.filter(([, t]) => (vistos.has(chaveItem(t)) ? false : vistos.add(chaveItem(t))));
  }
  function itemDoUsuario(id, u) {
    const i = db.itens.find((x) => x.id === Number(id));
    if (!i) throw new Erro(404, "Item não encontrado.");
    return [i, viagemDoUsuario(i.viagem_id, u)];
  }

  /* -------------------------------- agenda --------------------------------- */
  const TIPOS_COMP = { passeio: { rotulo: "Passeio", icone: "🎟️" }, reserva: { rotulo: "Reserva", icone: "📌" }, transporte: { rotulo: "Transporte", icone: "✈️" },
    hospedagem: { rotulo: "Hospedagem", icone: "🏨" }, refeicao: { rotulo: "Refeição", icone: "🍽️" }, outro: { rotulo: "Outro", icone: "🗓️" } };
  const somarMin = (iso, m) => { const d = new Date(iso); d.setMinutes(d.getMinutes() + m); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  const compDict = (c) => { const i = TIPOS_COMP[c.tipo] || TIPOS_COMP.outro;
    return { id: c.id, titulo: c.titulo, tipo: c.tipo, tipo_rotulo: i.rotulo, icone: i.icone, inicio: c.inicio, fim: somarMin(c.inicio, c.duracao_min), duracao_min: c.duracao_min,
      local: c.local, latitude: c.latitude, longitude: c.longitude, observacoes: c.observacoes }; };
  function calendario(v) {
    const eventos = [], semHorario = [];
    db.compromissos.filter((c) => c.viagem_id === v.id).forEach((c) => eventos.push({ ...compDict(c), chave: `c${c.id}`, origem: "agenda" }));
    const r = roteiroAtivo(v.id);
    if (r) atividadesDe(r.id).forEach((a) => {
      const dia = addDias(v.data_ida, a.dia - 1);
      if (!a.horario) { semHorario.push({ ...ativDict(a), data: dia, origem: "roteiro" }); return; }
      const inicio = `${dia}T${a.horario}`, dur = a.duracao_min || 60;
      eventos.push({ chave: `a${a.id}`, id: a.id, origem: "roteiro", titulo: a.titulo, tipo: a.categoria, tipo_rotulo: CAT_ATIV[a.categoria], icone: "🧭", inicio, fim: somarMin(inicio, dur),
        duracao_min: dur, local: a.endereco, observacoes: a.descricao, horario_sugerido: !!a.horario_sugerido, latitude: a.latitude, longitude: a.longitude });
    });
    eventos.sort((a, b) => a.inicio.localeCompare(b.inicio));
    const conflitos = [];
    eventos.forEach((a, i) => { for (const b of eventos.slice(i + 1)) { if (b.inicio >= a.fim) break; conflitos.push([a.chave, b.chave]); } });
    const em = new Set(conflitos.flat());
    eventos.forEach((e) => (e.conflito = em.has(e.chave)));
    return { dias: Array.from({ length: duracao(v) }, (_, i) => addDias(v.data_ida, i)), eventos, sem_horario: semHorario, conflitos,
      tipos: Object.entries(TIPOS_COMP).map(([valor, x]) => ({ valor, ...x })), roteiro_ativo: r ? { id: r.id, versao: r.versao } : null, pode_editar: true };
  }
  function validarComp(d, v, atual) {
    const val = (c) => (c in d ? d[c] : atual ? atual[c] : null);
    const inicio = dataHora(val("inicio"), "inicio", "o início");
    if (inicio.slice(0, 10) < addDias(v.data_ida, -1) || inicio.slice(0, 10) > addDias(v.data_volta, 1)) throw invalido("O compromisso precisa estar dentro do período da viagem (±1 dia).", "inicio");
    const [la, lo] = coord(val("latitude"), val("longitude"));
    return { titulo: txt(val("titulo"), "titulo", "o título", { min: 2, max: 160 }), tipo: escolha(val("tipo"), Object.keys(TIPOS_COMP), "tipo", "tipo", "outro"), inicio,
      duracao_min: inteiro(val("duracao_min") || 60, "duracao_min", "a duração (min)", { min: 5, max: 10080 }), local: txt(val("local"), "local", "o local", { max: 200, obrig: false }),
      observacoes: txt(val("observacoes"), "observacoes", "as observações", { max: 1500, obrig: false }), latitude: la, longitude: lo };
  }

  /* ------------------------- avaliações, diário, grupo --------------------- */
  const VISIB = { privado: "Só eu", participantes: "Participantes da viagem", publico: "Comunidade Viajaí" };
  const autor = (id) => db.usuarios.find((u) => u.id === id) || { nome: "Viajante", id };
  function avalDict(a, u, comLugar) {
    const au = autor(a.usuario_id), l = lugarPorId(a.lugar_id);
    const d = { id: a.id, lugar_id: a.lugar_id, nota: a.nota, titulo: a.titulo, comentario: a.comentario, data_visita: a.data_visita, experiencia_verificada: a.experiencia_verificada,
      autor: { id: au.id, nome: au.nome.split(" ")[0], iniciais: iniciais(au.nome) }, minha: !!u && u.id === a.usuario_id, fotos: [], criado_em: a.criado_em,
      editada: !!a.editada };
    if (comLugar) d.lugar = { id: l.id, nome: l.nome, local: `${l.cidade}, ${l.estado}` };
    return d;
  }
  const verificada = (u, lugarId) => db.viagens.some((v) => v.usuario_id === u.id && statusViagem(v) === "concluida" &&
    (v.lugar_id === lugarId || (roteiroAtivo(v.id) && atividadesDe(roteiroAtivo(v.id).id).some((a) => a.lugar_id === lugarId))));
  function diarioDict(r, u) {
    const l = r.lugar_id ? lugarPorId(r.lugar_id) : null, v = r.viagem_id ? db.viagens.find((x) => x.id === r.viagem_id) : null, au = autor(r.usuario_id);
    return { id: r.id, titulo: r.titulo, relato: r.relato, data: r.data, local: r.local, cidade: r.cidade, estado: r.estado, nota_pessoal: r.nota_pessoal,
      visibilidade: r.visibilidade, visibilidade_rotulo: VISIB[r.visibilidade], viagem: v ? { id: v.id, titulo: v.titulo } : null, lugar: l ? { id: l.id, nome: l.nome } : null,
      autor: { id: au.id, nome: au.nome.split(" ")[0] }, meu: !!u && u.id === r.usuario_id, fotos: [] };
  }
  function sugDict(s, u) { return { id: s.id, titulo: s.titulo, descricao: s.descricao, lugar: s.lugar_id ? { id: s.lugar_id, nome: lugarPorId(s.lugar_id).nome } : null,
    autor: { id: s.autor_id, nome: autor(s.autor_id).nome }, status: s.status, votos_favor: s.votos.filter((x) => x.valor > 0).length, votos_contra: s.votos.filter((x) => x.valor < 0).length,
    saldo: s.votos.reduce((t, x) => t + x.valor, 0), meu_voto: (s.votos.find((x) => x.usuario_id === u.id) || {}).valor || 0, decidido_por: s.decidido_por, atividade_id: s.atividade_id, criado_em: s.criado_em }; }
  const sugResp = (v, u) => ({ sugestoes: db.sugestoes.filter((s) => s.viagem_id === v.id).sort((a, b) => (a.status !== "aberta") - (b.status !== "aberta") || b.votos.length - a.votos.length).map((s) => sugDict(s, u)), pode_decidir: true, membros: 1 });

  /* ------------------------------- assistente Vai -------------------------- */
  const ESCOPOS = { usar_favoritos: "Destinos favoritos", usar_viagens: "Viagens planejadas, roteiros e agenda", usar_financas: "Orçamentos e gastos", usar_diario: "Experiências registradas no diário" };
  const brl = (n) => `R$ ${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  function responderVai(pergunta, u, viagemFoco) {
    const t = norm(pergunta), nome = u.nome.split(" ")[0], pref = u.preferencia, perm = u.permissoes || {};
    const lugares = D.lugares.map((l) => lugarDict(l, u)).sort((a, b) => b.match - a.match || b.nota - a.nota);
    const linha = (l) => `• ${l.nome} — ${l.local} · nota ${l.nota} · ${l.preco_simbolo} · ${l.match}% de match`;
    const foco = viagemFoco || (perm.usar_viagens ? db.viagens.filter((v) => v.usuario_id === u.id && statusViagem(v) !== "concluida").sort((a, b) => a.data_ida.localeCompare(b.data_ida))[0] : null);
    const acoes = [];
    const quer = (...ps) => ps.some((p) => t.includes(p));
    if (quer("criar viagem", "planejar", "nova viagem", "quero ir", "organizar uma viagem")) {
      const l = D.lugares.find((x) => [x.nome, x.cidade].some((n) => norm(n).length > 3 && t.includes(norm(n))));
      acoes.push({ tipo: "criar_viagem", rotulo: l ? `Planejar viagem para ${l.nome}` : "Criar uma nova viagem", ...(l ? { lugar_id: l.id } : {}) });
      return { texto: "Vamos planejar! Toque em 'Criar viagem' abaixo: informe destino, datas e quantas pessoas vão. Depois eu monto o roteiro por dia, e você acompanha gastos, agenda e checklist da mala.", acoes };
    }
    if (foco && quer("minha viagem", "proxima viagem", "gasto", "orcamento da viagem", "saldo", "agenda", "compromisso", "calendario", "conflito", "mala", "checklist", "levar", "falta")) {
      const n = `'${foco.titulo}' (${foco.destino})`, vid = foco.id;
      if (quer("gasto", "orcamento", "saldo", "dinheiro")) {
        if (!perm.usar_financas && !viagemFoco) return { texto: "Para analisar gastos eu preciso da permissão 'Orçamentos e gastos' (ícone 🔒 no topo do chat) — ou selecione esta viagem no seletor do chat.", acoes };
        const f = resumoFinanceiro(foco, u);
        const l = [`Finanças de ${n}:`, f.orcamento !== null ? `• Orçamento: ${brl(f.orcamento)} · gasto: ${brl(f.gasto)} · saldo: ${brl(f.saldo)}` : `• Gasto até agora: ${brl(f.gasto)} (orçamento ainda não definido)`, `• Por pessoa: ${brl(f.gasto_por_pessoa)}`];
        f.categorias.filter((c) => c.gasto).forEach((c) => l.push(`• ${c.rotulo}: ${brl(c.gasto)}`)); f.alertas.forEach((a) => l.push(`⚠ ${a.texto}`));
        acoes.push({ tipo: "abrir_viagem", aba: "gastos", rotulo: "Abrir gastos da viagem", viagem_id: vid });
        return { texto: l.join("\n"), acoes };
      }
      if (quer("agenda", "compromisso", "calendario", "conflito")) {
        const c = calendario(foco); acoes.push({ tipo: "abrir_viagem", aba: "agenda", rotulo: "Abrir agenda da viagem", viagem_id: vid });
        if (!c.eventos.length) return { texto: `A agenda de ${n} ainda está vazia. Adicione reservas e passeios na aba Agenda.`, acoes };
        const l = [`Próximos compromissos de ${n}:`, ...c.eventos.slice(0, 6).map((e) => `• ${e.inicio.replace("T", " ")} — ${e.titulo}${e.conflito ? " ⚠ conflito" : ""}`)];
        if (c.conflitos.length) l.push(`Há ${c.conflitos.length} conflito(s) de horário — vale reorganizar.`);
        return { texto: l.join("\n"), acoes };
      }
      if (quer("mala", "checklist", "levar", "falta")) {
        const c = checklistResp(foco); acoes.push({ tipo: "abrir_viagem", aba: "checklist", rotulo: "Abrir checklist", viagem_id: vid });
        if (!c.total) return { texto: `Ainda não há checklist para ${n}. Na aba Checklist eu gero sugestões para a viagem.`, acoes };
        const pend = c.itens.filter((i) => !i.concluido).slice(0, 6).map((i) => i.texto);
        return { texto: `Checklist de ${n}: ${c.concluidos} de ${c.total} itens prontos.${pend.length ? `\nAinda falta: ${pend.join(", ")}.` : ""}`, acoes };
      }
      const dias = diasEntre(hojeIso(), foco.data_ida), quando = dias > 0 ? `faltam ${dias} dias` : dias === 0 ? "é hoje!" : "já começou";
      return { texto: `Sua viagem ${n}: ${foco.data_ida} a ${foco.data_volta} — ${quando}.`, acoes };
    }
    if (quer("minha viagem", "proxima viagem", "gasto", "agenda", "mala", "checklist") && !foco)
      return { texto: perm.usar_viagens ? "Você ainda não tem viagens planejadas. Que tal criar a primeira? É só tocar em 'Viagens'." : "Para falar das suas viagens eu preciso da sua autorização. Ative 'Viagens planejadas' nas permissões do Vai (ícone 🔒 no topo do chat) ou escolha uma viagem no seletor.", acoes };
    if (quer("roteiro", "itinerario", "programacao", "3 dias", "fim de semana")) {
      const top = lugares.slice(0, 3);
      return { texto: [`Um roteiro de 3 dias pensado no seu perfil, ${nome}:`, ...top.map((l, i) => `\nDia ${i + 1} — ${l.nome} (${l.local})\n${l.descricao} Faixa de preço ${l.preco_simbolo}.`), "\nQuer que eu ajuste para mais dias ou outro orçamento?"].join("\n"), acoes };
    }
    if (quer("melhor epoca", "epoca", "quando ir", "clima", "temporada")) return { texto: ["Melhores épocas para os destinos do seu perfil:", ...lugares.slice(0, 3).map((l) => `• ${l.nome}: ${l.melhor_epoca || "boa o ano todo"}.`)].join("\n"), acoes };
    if (quer("preco", "custo", "quanto custa", "orcamento", "barato", "gastar")) return { texto: [`Seu orçamento está em '${pref ? prefDict(pref).orcamento_rotulo : "Moderado"}'. Nessa faixa eu recomendo:`, ...lugares.slice(0, 4).map(linha), "Posso filtrar só as opções mais econômicas, se preferir."].join("\n"), acoes };
    if (quer("praia", "mar", "litoral")) return { texto: "Praias que combinam com você:\n" + lugares.filter((l) => l.categoria === "praia").slice(0, 3).map(linha).join("\n"), acoes };
    if (quer("comer", "restaurante", "comida", "gastronomia", "jantar")) return { texto: "Para comer bem:\n" + lugares.filter((l) => l.categoria === "gastronomia").slice(0, 3).map(linha).join("\n"), acoes };
    if (quer("comparar", "qual e melhor", "qual o melhor")) { acoes.push({ tipo: "comparar", rotulo: "Comparar destinos" }); return { texto: "Posso comparar até 3 destinos lado a lado — preço, notas, atrações, distância e compatibilidade com você.", acoes }; }
    if (quer("perto", "proximo", "aqui")) return { texto: `Perto de ${pref ? pref.cidade : "você"}:\n` + [...lugares].sort((a, b) => a.distancia_km - b.distancia_km).slice(0, 3).map((l) => `${linha(l)} · ${l.distancia_km} km`).join("\n"), acoes };
    if (quer("oi", "ola", "bom dia", "boa tarde", "boa noite", "tudo bem")) return { texto: `Oi, ${nome}! Posso sugerir roteiros, melhores épocas, preços e lugares que combinam com os seus interesses. O que você quer saber?`, acoes };
    if (quer("obrigad", "valeu", "brigad")) return { texto: "Por nada! Boa viagem ✈️", acoes };
    const ints = pref ? pref.interesses.map((s) => interessePorSlug(s).nome).join(", ") : "ainda não definidos";
    return { texto: `${nome}, com base nos seus interesses (${ints}), estas são as melhores opções agora:\n${lugares.slice(0, 3).map(linha).join("\n")}\n\nPosso montar um roteiro, comparar preços ou indicar a melhor época — é só pedir.`, acoes };
  }

  /* ---------------------------------- rotas -------------------------------- */
  const rotas = [];
  const rota = (metodo, padrao, fn, { auth = true } = {}) => rotas.push({ metodo, re: new RegExp("^" + padrao.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$"), fn, auth });
  const ok = (corpo, status = 200) => [status, corpo];
  const lista = (arr) => arr;
  const usuarioDe = (req) => db.usuarios.find((u) => u.token && u.token === req.token) || null;

  /* auth */
  rota("POST", "/auth/cadastro", (r) => {
    const nome = nomeValido(r.corpo.nome), email = emailValido(r.corpo.email), senha = r.corpo.senha || "";
    if (senha.length < 6) throw invalido("A senha deve ter no mínimo 6 caracteres.", "senha");
    if (!senha.trim()) throw invalido("A senha não pode conter apenas espaços.", "senha");
    if (r.corpo.confirmacao_senha !== undefined && senha !== r.corpo.confirmacao_senha) throw invalido("As senhas não conferem.", "confirmacao_senha");
    let u = db.usuarios.find((x) => x.email === email);
    if (u && u.verificado) throw new Erro(409, "Este e-mail já está cadastrado. Faça login.", "email");
    if (!u) { u = { id: novoId("usuario"), email, verificado: false, token: null, criado_em: agora(), favoritos: [], mensagens: [], permissoes: {}, preferencia: null }; db.usuarios.push(u); }
    u.nome = nome; u.senha = senha;
    const codigo = String(Math.floor(Math.random() * 1e6)).padStart(6, "0"); db.codigos[email] = { codigo, expira: Date.now() + 15 * 60000 };
    salvar();
    return ok({ usuario: usuarioDict(u), mensagem: `Enviamos um código de 6 dígitos para ${email}.`, codigo_debug: codigo }, 201);
  }, { auth: false });
  rota("POST", "/auth/verificar", (r) => {
    const email = emailValido(r.corpo.email), cod = String(r.corpo.codigo || "").replace(/\D/g, "");
    if (cod.length !== 6) throw invalido("O código deve ter 6 dígitos.", "codigo");
    const u = db.usuarios.find((x) => x.email === email);
    if (!u) throw new Erro(404, "Não encontramos um cadastro com este e-mail.", "email");
    if (u.verificado) throw new Erro(400, "Esta conta já foi verificada. Faça login.", "email");
    const c = db.codigos[email];
    if (!c || c.codigo !== cod || c.expira < Date.now()) throw new Erro(400, "Código inválido ou expirado.", "codigo");
    delete db.codigos[email]; u.verificado = true; u.token = crypto.randomUUID().replace(/-/g, "");
    salvar();
    return ok({ token: u.token, usuario: usuarioDict(u, true), mensagem: "Conta verificada com sucesso!" });
  }, { auth: false });
  rota("POST", "/auth/reenviar-codigo", (r) => {
    const email = emailValido(r.corpo.email), u = db.usuarios.find((x) => x.email === email);
    if (!u) throw new Erro(404, "Não encontramos um cadastro com este e-mail.", "email");
    if (u.verificado) throw new Erro(400, "Esta conta já está verificada.", "email");
    const codigo = String(Math.floor(Math.random() * 1e6)).padStart(6, "0"); db.codigos[email] = { codigo, expira: Date.now() + 15 * 60000 }; salvar();
    return ok({ mensagem: `Novo código enviado para ${email}.`, codigo_debug: codigo });
  }, { auth: false });
  rota("POST", "/auth/login", (r) => {
    const email = emailValido(r.corpo.email), u = db.usuarios.find((x) => x.email === email);
    if (!u || u.senha !== (r.corpo.senha || "")) throw new Erro(401, "E-mail ou senha incorretos.");
    if (!u.verificado) throw new Erro(403, "Confirme o código enviado para o seu e-mail antes de entrar.", "email");
    u.token = crypto.randomUUID().replace(/-/g, ""); salvar();
    return ok({ token: u.token, usuario: usuarioDict(u, true), possui_preferencias: !!u.preferencia });
  }, { auth: false });
  rota("POST", "/auth/logout", (r) => { r.u.token = null; salvar(); return ok({ mensagem: "Sessão encerrada." }); });

  rota("GET", "/usuarios/eu", (r) => ok({ ...usuarioDict(r.u, true), total_salvos: r.u.favoritos.length, possui_preferencias: !!r.u.preferencia }));
  rota("GET", "/preferencias/opcoes", () => ok({ interesses: D.interesses, orcamentos: D.faixas, cidades: D.cidades }), { auth: false });
  rota("GET", "/preferencias", (r) => ok({ preferencias: r.u.preferencia ? prefDict(r.u.preferencia) : null }));
  const salvarPref = (r) => {
    const slugs = r.corpo.interesses;
    if (!Array.isArray(slugs) || !slugs.length) throw invalido("Escolha pelo menos um interesse.", "interesses");
    const ok_ = slugs.filter((s) => interessePorSlug(s));
    if (!ok_.length) throw invalido("Interesses inválidos.", "interesses");
    const orc = inteiro(r.corpo.orcamento ?? 2, "orcamento", "o orçamento", { min: 1, max: 4 });
    const cidade = (r.corpo.cidade || "").trim(), estado = (r.corpo.estado || "").trim().toUpperCase().slice(0, 2);
    if (!cidade) throw invalido("Informe sua cidade.", "cidade");
    if (estado.length !== 2) throw invalido("Informe o estado (UF).", "estado");
    r.u.preferencia = { orcamento: orc, cidade, estado, interesses: ok_, atualizado_em: agora() }; salvar();
    return ok({ mensagem: "Preferências salvas!", preferencias: prefDict(r.u.preferencia) });
  };
  rota("PUT", "/preferencias", salvarPref); rota("POST", "/preferencias", salvarPref);

  /* lugares */
  const filtrarLugares = (q, u) => {
    let ls = D.lugares.slice();
    if (q.categoria && q.categoria !== "todos") ls = ls.filter((l) => l.categoria === q.categoria);
    if (q.q) { const t = norm(q.q).trim(); ls = ls.filter((l) => [l.nome, l.cidade, l.descricao].some((x) => norm(x).includes(t))); }
    if (q.preco_maximo) ls = ls.filter((l) => l.faixa_preco <= Number(q.preco_maximo));
    if (q.estado) ls = ls.filter((l) => l.estado === q.estado.toUpperCase());
    if (q.nota_minima) ls = ls.filter((l) => l.nota >= Number(q.nota_minima));
    const ord = q.ordenar || "nota";
    const cmp = { nota: (a, b) => b.nota - a.nota || b.avaliacoes - a.avaliacoes, populares: (a, b) => popularidade(b.id) - popularidade(a.id) || b.nota - a.nota,
      preco: (a, b) => a.faixa_preco - b.faixa_preco || b.nota - a.nota, nome: (a, b) => a.nome.localeCompare(b.nome), match: (a, b) => b.nota - a.nota };
    ls.sort(cmp[ord] || cmp.nota);
    let itens = ls.slice(0, Number(q.limite) || 60).map((l) => lugarDict(l, u));
    if (ord === "match") itens.sort((a, b) => b.match - a.match);
    return itens;
  };
  rota("GET", "/lugares", (r) => { const l = filtrarLugares({ categoria: r.q.categoria, limite: r.q.limite }, r.u); return ok({ total: l.length, lugares: l }); }, { auth: false });
  rota("GET", "/lugares/busca", (r) => { const l = filtrarLugares(r.q, r.u); return ok({ total: l.length, filtros: r.q, lugares: l }); }, { auth: false });
  rota("GET", "/lugares/recomendacoes", (r) => {
    const pref = r.u.preferencia;
    if (!pref) throw new Erro(400, "Escolha seus interesses para receber recomendações.", "interesses");
    let cats = pref.interesses; if (r.q.categoria && r.q.categoria !== "todos") cats = [r.q.categoria];
    let cand = D.lugares.filter((l) => cats.includes(l.categoria) && l.faixa_preco <= pref.orcamento + 1);
    if (!cand.length) cand = D.lugares.slice();
    const l = cand.map((x) => lugarDict(x, r.u)).sort((a, b) => b.match - a.match || b.nota - a.nota).slice(0, Number(r.q.limite) || 8);
    return ok({ perfil: { interesses: pref.interesses, orcamento: pref.orcamento, cidade: pref.cidade, estado: pref.estado }, total: l.length, lugares: l });
  });
  rota("GET", "/lugares/:id", (r) => { const l = lugarPorId(r.p.id); if (!l) throw new Erro(404, "Lugar não encontrado."); return ok({ ...lugarDict(l, r.u), fotos: [] }); }, { auth: false });
  rota("GET", "/lugares/:id/fotos", (r) => { const l = lugarPorId(r.p.id); if (!l) throw new Erro(404, "Lugar não encontrado.");
    return ok({ lugar_id: l.id, fotos: [], ilustracao: { imagem: D.imagens[l.categoria], aviso: "Ainda não há fotografia verificada deste lugar. Exibindo uma ilustração." } }); }, { auth: false });

  /* favoritos */
  rota("GET", "/favoritos", (r) => { const l = r.u.favoritos.map(lugarPorId).filter(Boolean).map((x) => lugarDict(x, r.u)); return ok({ total: l.length, lugares: l }); });
  rota("POST", "/favoritos", (r) => { const l = lugarPorId(r.corpo.lugar_id); if (!l) throw new Erro(404, "Lugar não encontrado.");
    if (!r.u.favoritos.includes(l.id)) r.u.favoritos.unshift(l.id); salvar(); return ok({ mensagem: `${l.nome} foi salvo.`, favorito: { id: l.id, lugar: lugarDict(l, r.u) } }, 201); });
  rota("DELETE", "/favoritos/:id", (r) => { const id = Number(r.p.id); if (!r.u.favoritos.includes(id)) throw new Erro(404, "Este lugar não está nos seus salvos.");
    r.u.favoritos = r.u.favoritos.filter((x) => x !== id); salvar(); return ok({ mensagem: "Removido dos salvos.", lugar_id: id }); });

  /* chat */
  rota("GET", "/chat", (r) => {
    if (!r.u.mensagens.length) r.u.mensagens.push({ id: novoId("msg"), autor: "ia", texto: "Olá! Sou o Vai, seu assistente de viagem inteligente. 🌎 Com base no seu perfil, já preparei ótimas sugestões! Como posso te ajudar hoje?", criado_em: agora() });
    salvar();
    return ok({ total: r.u.mensagens.length, mensagens: r.u.mensagens, sugestoes: ["Sugerir roteiro", "Melhores épocas", "Ver preços", "Minha próxima viagem", "Como estão meus gastos?", "O que falta na mala?"] });
  });
  rota("POST", "/chat", (r) => {
    const texto = (r.corpo.texto || "").trim();
    if (!texto) throw invalido("Escreva uma pergunta.", "texto");
    if (texto.length > 1000) throw invalido("Mensagem muito longa (máximo 1000 caracteres).", "texto");
    const foco = r.corpo.viagem_id ? viagemDoUsuario(r.corpo.viagem_id, r.u) : null;
    r.u.mensagens.push({ id: novoId("msg"), autor: "usuario", texto, criado_em: agora() });
    const resp = responderVai(texto, r.u, foco);
    const msg = { id: novoId("msg"), autor: "ia", texto: resp.texto, criado_em: agora() }; r.u.mensagens.push(msg); salvar();
    return ok({ resposta: msg, origem: "local", acoes: resp.acoes, permissoes: r.u.permissoes }, 201);
  });
  rota("GET", "/chat/permissoes", (r) => ok({ escopos: Object.entries(ESCOPOS).map(([chave, rotulo]) => ({ chave, rotulo, ativo: !!r.u.permissoes[chave] })) }));
  rota("PUT", "/chat/permissoes", (r) => { Object.keys(ESCOPOS).forEach((k) => { if (k in r.corpo) r.u.permissoes[k] = bool(r.corpo[k]); }); salvar();
    return ok({ mensagem: "Permissões do Vai atualizadas.", escopos: Object.entries(ESCOPOS).map(([chave, rotulo]) => ({ chave, rotulo, ativo: !!r.u.permissoes[chave] })) }); });

  /* viagens */
  rota("GET", "/viagens", (r) => {
    const todas = db.viagens.filter((v) => v.usuario_id === r.u.id).map((v) => viagemDict(v, r.u, true));
    const cont = { futura: 0, em_andamento: 0, concluida: 0 }; todas.forEach((v) => cont[v.status]++);
    const abertas = todas.filter((v) => v.status !== "concluida").sort((a, b) => (a.status !== "em_andamento") - (b.status !== "em_andamento") || a.data_ida.localeCompare(b.data_ida));
    const conc = todas.filter((v) => v.status === "concluida").sort((a, b) => b.data_volta.localeCompare(a.data_volta));
    let itens = abertas.concat(conc); if (cont[r.q.status] !== undefined) itens = itens.filter((v) => v.status === r.q.status);
    return ok({ total: itens.length, contagem: cont, convites_pendentes: 0, viagens: itens, tipos: Object.entries(TIPOS_VIAGEM).map(([valor, rotulo]) => ({ valor, rotulo })) });
  });
  rota("POST", "/viagens", (r) => {
    const { lugar, campos } = validarViagem(r.corpo);
    const v = { id: novoId("viagem"), usuario_id: r.u.id, lugar_id: lugar ? lugar.id : null, criado_em: agora(), ...campos };
    aplicarCoordenadas(v, r.corpo, lugar); db.viagens.push(v); salvar();
    return ok({ mensagem: "Viagem criada!", viagem: viagemDict(v, r.u) }, 201);
  });
  rota("GET", "/viagens/:id", (r) => { const v = viagemDoUsuario(r.p.id, r.u);
    return ok({ ...viagemDict(v, r.u), resumo: resumoViagem(v), permissoes: { editar: true, gerenciar: true } }); });
  const editarViagem = (r) => { const v = viagemDoUsuario(r.p.id, r.u); const antes = v.destino + v.lugar_id;
    const { lugar, campos } = validarViagem(r.corpo, v); Object.assign(v, campos); v.lugar_id = lugar ? lugar.id : null;
    if (v.destino + v.lugar_id !== antes || "latitude" in r.corpo) { v.latitude = undefined; aplicarCoordenadas(v, r.corpo, lugar); }
    salvar(); return ok({ mensagem: "Viagem atualizada.", viagem: viagemDict(v, r.u) }); };
  rota("PUT", "/viagens/:id", editarViagem); rota("PATCH", "/viagens/:id", editarViagem);
  rota("DELETE", "/viagens/:id", (r) => { const v = viagemDoUsuario(r.p.id, r.u); const rids = db.roteiros.filter((x) => x.viagem_id === v.id).map((x) => x.id);
    db.viagens = db.viagens.filter((x) => x !== v); db.roteiros = db.roteiros.filter((x) => x.viagem_id !== v.id); db.atividades = db.atividades.filter((a) => !rids.includes(a.roteiro_id));
    ["despesas", "itens", "compromissos", "sugestoes"].forEach((k) => (db[k] = db[k].filter((x) => x.viagem_id !== v.id))); delete db.planejamento[v.id];
    db.diario.forEach((d) => { if (d.viagem_id === v.id) d.viagem_id = null; }); salvar();
    return ok({ mensagem: `A viagem '${v.titulo}' foi excluída.`, viagem_id: v.id }); });

  /* roteiros */
  rota("GET", "/viagens/:id/roteiros", (r) => { const v = viagemDoUsuario(r.p.id, r.u); const vs = db.roteiros.filter((x) => x.viagem_id === v.id).sort((a, b) => b.versao - a.versao); const at = roteiroAtivo(v.id);
    return ok({ versoes: vs.map((x) => roteiroDict(x, false)), ativo: at ? roteiroDict(at) : null, categorias: Object.entries(CAT_ATIV).map(([valor, rotulo]) => ({ valor, rotulo })), duracao_dias: duracao(v), data_ida: v.data_ida }); });
  rota("POST", "/viagens/:id/roteiros", (r) => { const v = viagemDoUsuario(r.p.id, r.u); const ro = novaVersao(v, r.u, txt(r.corpo.titulo || "Meu roteiro", "titulo", "o título", { max: 120 }), "manual"); salvar();
    return ok({ mensagem: "Roteiro criado.", roteiro: roteiroDict(ro) }, 201); });
  rota("POST", "/viagens/:id/roteiros/gerar", (r) => {
    const v = viagemDoUsuario(r.p.id, r.u), pref = r.u.preferencia, c = r.corpo;
    const par = { interesses: (Array.isArray(c.interesses) && c.interesses.length ? c.interesses : pref ? pref.interesses : []).slice(0, 10),
      orcamento: inteiro(c.orcamento || (pref ? pref.orcamento : 2), "orcamento", "o orçamento", { min: 1, max: 4 }), ritmo: escolha(c.ritmo, ["leve", "moderado", "intenso"], "ritmo", "ritmo", "moderado"),
      incluir_refeicoes: c.incluir_refeicoes === undefined ? true : bool(c.incluir_refeicoes), observacoes: txt(c.observacoes, "observacoes", "as observações", { max: 500, obrig: false }) };
    const { plano, total } = gerarPlano(v, par);
    const obs = `Roteiro montado com ${total} opções reais perto de ${v.destino} (catálogo Viajaí), agrupadas por proximidade para reduzir deslocamentos. Horários são sugestões de distribuição do dia: confirme funcionamento e reservas. (Versão de demonstração: sem estabelecimentos do OpenStreetMap.)`;
    const ro = novaVersao(v, r.u, null, "local", par, obs); const ord = {};
    plano.forEach((p) => { ord[p.dia] = (ord[p.dia] || 0) + 1; db.atividades.push({ id: novoId("atividade"), roteiro_id: ro.id, ordem: ord[p.dia], ...p }); }); salvar();
    return ok({ mensagem: "Roteiro gerado pelo Vai!", roteiro: roteiroDict(ro), total_candidatos: total }, 201);
  });
  rota("GET", "/roteiros/:id", (r) => ok(roteiroDict(roteiroDoUsuario(r.p.id, r.u))));
  rota("DELETE", "/roteiros/:id", (r) => { const ro = roteiroDoUsuario(r.p.id, r.u); const outros = db.roteiros.filter((x) => x.viagem_id === ro.viagem_id && x !== ro);
    db.roteiros = db.roteiros.filter((x) => x !== ro); db.atividades = db.atividades.filter((a) => a.roteiro_id !== ro.id);
    if (ro.ativo && outros.length) outros.reduce((m, x) => (x.versao > m.versao ? x : m)).ativo = true; salvar(); return ok({ mensagem: "Versão excluída.", roteiro_id: ro.id }); });
  rota("POST", "/roteiros/:id/duplicar", (r) => { const o = roteiroDoUsuario(r.p.id, r.u); const v = viagemDoUsuario(o.viagem_id, r.u);
    const c = novaVersao(v, r.u, `${o.titulo} (cópia)`.slice(0, 120), "copia", o.parametros, o.observacoes_ia);
    atividadesDe(o.id).forEach((a) => db.atividades.push({ ...a, id: novoId("atividade"), roteiro_id: c.id })); salvar(); return ok({ mensagem: "Versão duplicada.", roteiro: roteiroDict(c) }, 201); });
  rota("POST", "/roteiros/:id/ativar", (r) => { const ro = roteiroDoUsuario(r.p.id, r.u); db.roteiros.filter((x) => x.viagem_id === ro.viagem_id).forEach((x) => (x.ativo = x === ro)); salvar();
    return ok({ mensagem: `Versão ${ro.versao} definida como principal.`, roteiro: roteiroDict(ro) }); });
  rota("PUT", "/roteiros/:id/ordem", (r) => { const ro = roteiroDoUsuario(r.p.id, r.u); const v = viagemDoUsuario(ro.viagem_id, r.u);
    if (!Array.isArray(r.corpo.itens) || !r.corpo.itens.length) throw invalido("Envie a nova ordem das atividades.", "itens");
    const ats = atividadesDe(ro.id); const mudancas = r.corpo.itens.map((i) => { const a = ats.find((x) => x.id === Number(i.id)); if (!a) throw invalido("Atividade não pertence a este roteiro.", "itens");
      return [a, inteiro(i.dia, "itens", "o dia", { min: 1, max: duracao(v) }), inteiro(i.ordem, "itens", "a ordem", { min: 0, max: 10000 })]; });
    mudancas.forEach(([a, d, o]) => { a.dia = d; a.ordem = o; }); salvar(); return ok({ mensagem: "Roteiro reorganizado.", roteiro: roteiroDict(ro) }); });
  rota("POST", "/roteiros/:id/atividades", (r) => { const ro = roteiroDoUsuario(r.p.id, r.u); const v = viagemDoUsuario(ro.viagem_id, r.u);
    if (atividadesDe(ro.id).length >= 300) throw new Erro(400, "Este roteiro já tem atividades demais.");
    const c = validarAtividade(r.corpo, v); const a = { id: novoId("atividade"), roteiro_id: ro.id, horario_sugerido: false, fonte: "manual", funcionamento: null, ...c,
      ordem: Math.max(0, ...atividadesDe(ro.id).filter((x) => x.dia === c.dia).map((x) => x.ordem)) + 1 };
    db.atividades.push(a); salvar(); return ok({ mensagem: "Atividade adicionada.", atividade: ativDict(a) }, 201); });
  const editarAtiv = (r) => { const a = atividadeDoUsuario(r.p.id, r.u); const ro = db.roteiros.find((x) => x.id === a.roteiro_id); const v = viagemDoUsuario(ro.viagem_id, r.u);
    const c = validarAtividade(r.corpo, v, a); if (c.dia !== a.dia) c.ordem = Math.max(0, ...atividadesDe(ro.id).filter((x) => x.dia === c.dia).map((x) => x.ordem)) + 1;
    Object.assign(a, c); salvar(); return ok({ mensagem: "Atividade atualizada.", atividade: ativDict(a) }); };
  rota("PUT", "/atividades/:id", editarAtiv); rota("PATCH", "/atividades/:id", editarAtiv);
  rota("DELETE", "/atividades/:id", (r) => { const a = atividadeDoUsuario(r.p.id, r.u); db.atividades = db.atividades.filter((x) => x !== a); salvar(); return ok({ mensagem: "Atividade removida.", atividade_id: a.id }); });

  /* finanças */
  rota("GET", "/viagens/:id/financas", (r) => ok(resumoFinanceiro(viagemDoUsuario(r.p.id, r.u), r.u)));
  rota("PUT", "/viagens/:id/orcamento", (r) => { const v = viagemDoUsuario(r.p.id, r.u);
    if ("orcamento" in r.corpo) v.orcamento_centavos = dinheiro(r.corpo.orcamento, "orcamento", "o orçamento", false);
    const pl = r.corpo.planejamento || {}; if (typeof pl !== "object") throw invalido("Planejamento por categoria inválido.", "planejamento");
    db.planejamento[v.id] = db.planejamento[v.id] || {};
    Object.entries(pl).forEach(([cat, val]) => { if (!CAT_DESP[cat]) throw invalido("Categoria inválida.", "planejamento"); const c = dinheiro(val, "planejamento", "o valor planejado", false);
      if (c === null) delete db.planejamento[v.id][cat]; else db.planejamento[v.id][cat] = c; });
    salvar(); return ok({ mensagem: "Orçamento atualizado.", financas: resumoFinanceiro(v, r.u) }); });
  rota("POST", "/viagens/:id/despesas", (r) => { const v = viagemDoUsuario(r.p.id, r.u); const d = { id: novoId("despesa"), viagem_id: v.id, criado_por_id: r.u.id, ...validarDespesa(r.corpo, v) };
    db.despesas.push(d); salvar(); return ok({ mensagem: "Despesa registrada.", despesa: despDict(d), financas: resumoFinanceiro(v, r.u) }, 201); });
  const despDoUsuario = (id, u) => { const d = db.despesas.find((x) => x.id === Number(id)); if (!d) throw new Erro(404, "Despesa não encontrada."); return [d, viagemDoUsuario(d.viagem_id, u)]; };
  const editarDesp = (r) => { const [d, v] = despDoUsuario(r.p.id, r.u); Object.assign(d, validarDespesa(r.corpo, v, d)); salvar(); return ok({ mensagem: "Despesa atualizada.", despesa: despDict(d), financas: resumoFinanceiro(v, r.u) }); };
  rota("PUT", "/despesas/:id", editarDesp); rota("PATCH", "/despesas/:id", editarDesp);
  rota("DELETE", "/despesas/:id", (r) => { const [d, v] = despDoUsuario(r.p.id, r.u); db.despesas = db.despesas.filter((x) => x !== d); salvar(); return ok({ mensagem: "Despesa excluída.", financas: resumoFinanceiro(v, r.u) }); });

  /* checklist */
  rota("GET", "/viagens/:id/checklist", (r) => ok(checklistResp(viagemDoUsuario(r.p.id, r.u))));
  rota("POST", "/viagens/:id/checklist/sugestoes", (r) => { const v = viagemDoUsuario(r.p.id, r.u); const ex = new Set(db.itens.filter((i) => i.viagem_id === v.id).map((i) => chaveItem(i.texto))); let n = 0;
    sugerirItens(v, r.u).forEach(([cat, t], ordem) => { if (ex.has(chaveItem(t)) || db.itens.filter((i) => i.viagem_id === v.id).length >= 300) return; db.itens.push({ id: novoId("item"), viagem_id: v.id, categoria: cat, texto: t, concluido: false, sugerido: true, ordem }); n++; });
    salvar(); return ok({ ...checklistResp(v), mensagem: n ? `${n} sugestões adicionadas.` : "Sua lista já tem todas as sugestões." }); });
  rota("POST", "/viagens/:id/checklist", (r) => { const v = viagemDoUsuario(r.p.id, r.u); const lst = db.itens.filter((i) => i.viagem_id === v.id);
    if (lst.length >= 300) throw new Erro(400, "Sua lista atingiu o limite de itens.");
    const t = txt(r.corpo.texto, "texto", "o item", { max: 160 }); if (lst.some((i) => chaveItem(i.texto) === chaveItem(t))) throw invalido("Este item já está na lista.", "texto");
    const i = { id: novoId("item"), viagem_id: v.id, texto: t, categoria: escolha(r.corpo.categoria, Object.keys(CAT_CHECK), "categoria", "categoria", "outros"), concluido: false, sugerido: false, ordem: Math.max(0, ...lst.map((x) => x.ordem)) + 1 };
    db.itens.push(i); salvar(); return ok({ mensagem: "Item adicionado.", item: { id: i.id, texto: i.texto, categoria: i.categoria }, ...checklistResp(v) }, 201); });
  rota("POST", "/viagens/:id/checklist/importar", (r) => { const v = viagemDoUsuario(r.p.id, r.u); const oid = inteiro(r.corpo.origem_viagem_id, "origem_viagem_id", "a viagem de origem", { min: 1 });
    if (oid === v.id) throw invalido("Escolha outra viagem como origem.", "origem_viagem_id"); const o = viagemDoUsuario(oid, r.u);
    const ex = new Set(db.itens.filter((i) => i.viagem_id === v.id).map((i) => chaveItem(i.texto))); let n = 0;
    db.itens.filter((i) => i.viagem_id === o.id).forEach((i) => { if (ex.has(chaveItem(i.texto))) return; db.itens.push({ ...i, id: novoId("item"), viagem_id: v.id, concluido: false }); ex.add(chaveItem(i.texto)); n++; });
    salvar(); return ok({ mensagem: `${n} itens importados de '${o.titulo}'.`, ...checklistResp(v) }); });
  const atualizarItem = (r) => { const [i, v] = itemDoUsuario(r.p.id, r.u); const c = r.corpo;
    if ("concluido" in c) i.concluido = bool(c.concluido); if ("texto" in c) i.texto = txt(c.texto, "texto", "o item", { max: 160 });
    if ("categoria" in c) i.categoria = escolha(c.categoria, Object.keys(CAT_CHECK), "categoria", "categoria"); salvar();
    return ok({ item: { id: i.id, texto: i.texto, concluido: i.concluido }, ...checklistResp(v) }); };
  rota("PATCH", "/checklist/:id", atualizarItem); rota("PUT", "/checklist/:id", atualizarItem);
  rota("DELETE", "/checklist/:id", (r) => { const [i, v] = itemDoUsuario(r.p.id, r.u); db.itens = db.itens.filter((x) => x !== i); salvar(); return ok({ mensagem: "Item removido.", ...checklistResp(v) }); });

  /* agenda */
  rota("GET", "/viagens/:id/calendario", (r) => ok(calendario(viagemDoUsuario(r.p.id, r.u))));
  rota("POST", "/viagens/:id/compromissos", (r) => { const v = viagemDoUsuario(r.p.id, r.u); const c = { id: novoId("comp"), viagem_id: v.id, ...validarComp(r.corpo, v) }; db.compromissos.push(c); salvar();
    return ok({ mensagem: "Compromisso adicionado à agenda.", compromisso: compDict(c) }, 201); });
  const compDoUsuario = (id, u) => { const c = db.compromissos.find((x) => x.id === Number(id)); if (!c) throw new Erro(404, "Compromisso não encontrado."); return [c, viagemDoUsuario(c.viagem_id, u)]; };
  const editarComp = (r) => { const [c, v] = compDoUsuario(r.p.id, r.u); Object.assign(c, validarComp(r.corpo, v, c)); salvar(); return ok({ mensagem: "Compromisso atualizado.", compromisso: compDict(c) }); };
  rota("PUT", "/compromissos/:id", editarComp); rota("PATCH", "/compromissos/:id", editarComp);
  rota("DELETE", "/compromissos/:id", (r) => { const [c] = compDoUsuario(r.p.id, r.u); db.compromissos = db.compromissos.filter((x) => x !== c); salvar(); return ok({ mensagem: "Compromisso excluído.", compromisso_id: c.id }); });

  /* grupo (somente você: não há outras contas reais na demonstração) */
  const grupo = (v, u) => ({ proprietario: { id: u.id, nome: u.nome, iniciais: iniciais(u.nome) }, participantes: [],
    papeis: [{ valor: "viajante", descricao: "Viajante — visualiza, sugere e vota" }, { valor: "editor", descricao: "Editor — organiza roteiro, gastos, agenda e checklist" }], meu_papel: "proprietario", pode_gerenciar: true });
  rota("GET", "/viagens/:id/participantes", (r) => ok(grupo(viagemDoUsuario(r.p.id, r.u), r.u)));
  rota("POST", "/viagens/:id/participantes", (r) => { viagemDoUsuario(r.p.id, r.u); throw new Erro(503, "Convites entre pessoas exigem o servidor do Viajaí e ficam indisponíveis nesta versão de demonstração."); });
  rota("GET", "/convites", () => ok({ total: 0, convites: [] }));
  rota("GET", "/viagens/:id/sugestoes", (r) => ok(sugResp(viagemDoUsuario(r.p.id, r.u), r.u)));
  rota("POST", "/viagens/:id/sugestoes", (r) => { const v = viagemDoUsuario(r.p.id, r.u); const lugar = r.corpo.lugar_id ? lugarPorId(r.corpo.lugar_id) : null; if (r.corpo.lugar_id && !lugar) throw invalido("Lugar não encontrado.", "lugar_id");
    db.sugestoes.push({ id: novoId("sug"), viagem_id: v.id, autor_id: r.u.id, titulo: txt(r.corpo.titulo || (lugar && lugar.nome), "titulo", "a sugestão", { min: 2, max: 160 }),
      descricao: txt(r.corpo.descricao, "descricao", "a descrição", { max: 1000, obrig: false }), lugar_id: lugar ? lugar.id : null, status: "aberta", votos: [{ usuario_id: r.u.id, valor: 1 }], decidido_por: null, atividade_id: null, criado_em: agora() });
    salvar(); return ok({ mensagem: "Sugestão enviada ao grupo.", ...sugResp(v, r.u) }, 201); });
  const sugDoUsuario = (id, u) => { const s = db.sugestoes.find((x) => x.id === Number(id)); if (!s) throw new Erro(404, "Sugestão não encontrada."); return [s, viagemDoUsuario(s.viagem_id, u)]; };
  rota("POST", "/sugestoes/:id/voto", (r) => { const [s, v] = sugDoUsuario(r.p.id, r.u); if (s.status !== "aberta") throw new Erro(400, "A votação desta sugestão já foi encerrada.");
    const val = inteiro(r.corpo.valor, "valor", "o voto", { min: -1, max: 1 }); s.votos = s.votos.filter((x) => x.usuario_id !== r.u.id); if (val !== 0) s.votos.push({ usuario_id: r.u.id, valor: val }); salvar(); return ok(sugResp(v, r.u)); });
  rota("POST", "/sugestoes/:id/decisao", (r) => { const [s, v] = sugDoUsuario(r.p.id, r.u); if (s.status !== "aberta") throw new Erro(400, "Esta sugestão já foi decidida.");
    const dec = escolha(r.corpo.decisao, ["aprovada", "rejeitada"], "decisao", "decisão");
    if (dec === "aprovada") { const dia = inteiro(r.corpo.dia || 1, "dia", "o dia", { min: 1, max: duracao(v) }); let ro = roteiroAtivo(v.id) || novaVersao(v, r.u, "Roteiro do grupo", "manual"); const l = s.lugar_id ? lugarPorId(s.lugar_id) : null;
      const a = { id: novoId("atividade"), roteiro_id: ro.id, dia, ordem: Math.max(0, ...atividadesDe(ro.id).filter((x) => x.dia === dia).map((x) => x.ordem)) + 1, titulo: s.titulo, descricao: s.descricao || (l && l.descricao) || null,
        categoria: "atracao", horario: null, horario_sugerido: false, duracao_min: null, lugar_id: l ? l.id : null, endereco: null, latitude: l ? l.latitude : null, longitude: l ? l.longitude : null, fonte: "sugestao" };
      db.atividades.push(a); s.atividade_id = a.id; }
    s.status = dec; s.decidido_por = r.u.nome; salvar(); return ok({ mensagem: dec === "aprovada" ? "Aprovada e adicionada ao roteiro!" : "Sugestão rejeitada.", ...sugResp(v, r.u) }); });

  /* avaliações / comunidade */
  rota("GET", "/lugares/:id/avaliacoes", (r) => {
    const l = lugarPorId(r.p.id); if (!l) throw new Erro(404, "Lugar não encontrado.");
    let avs = db.avaliacoes.filter((a) => a.lugar_id === l.id);
    const ord = { recentes: (a, b) => b.criado_em.localeCompare(a.criado_em), melhores: (a, b) => b.nota - a.nota, piores: (a, b) => a.nota - b.nota, verificadas: (a, b) => b.experiencia_verificada - a.experiencia_verificada };
    avs = avs.slice().sort(ord[r.q.ordenar] || ord.recentes);
    const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }; avs.forEach((a) => dist[a.nota]++); const total = avs.length;
    const exp = db.diario.filter((d) => d.lugar_id === l.id && d.visibilidade === "publico").sort((a, b) => b.data.localeCompare(a.data)).slice(0, 10);
    const minha = r.u ? db.avaliacoes.find((a) => a.lugar_id === l.id && a.usuario_id === r.u.id) : null;
    return ok({ lugar_id: l.id, comunidade: { media: total ? arred1(avs.reduce((s, a) => s + a.nota, 0) / total) : null, total, distribuicao: dist, verificadas: avs.filter((a) => a.experiencia_verificada).length },
      catalogo: { nota: Math.round(l.nota * 10) / 10, avaliacoes: l.avaliacoes }, avaliacoes: avs.map((a) => avalDict(a, r.u)), minha: minha ? avalDict(minha, r.u) : null, experiencias: exp.map((e) => diarioDict(e, r.u)) });
  }, { auth: false });
  const validarAval = (d, atual) => { const val = (c) => (c in d ? d[c] : atual ? atual[c] : null); const dv = data(val("data_visita"), "data_visita", "a data da visita", false);
    if (dv && dv > hojeIso()) throw invalido("A data da visita não pode estar no futuro.", "data_visita");
    return { nota: inteiro(val("nota"), "nota", "a nota", { min: 1, max: 5 }), titulo: txt(val("titulo"), "titulo", "o título", { max: 120, obrig: false }), comentario: txt(val("comentario"), "comentario", "o comentário", { min: 10, max: 2000 }), data_visita: dv }; };
  rota("POST", "/lugares/:id/avaliacoes", (r) => { const l = lugarPorId(r.p.id); if (!l) throw new Erro(404, "Lugar não encontrado.");
    if (db.avaliacoes.some((a) => a.lugar_id === l.id && a.usuario_id === r.u.id)) throw new Erro(409, "Você já avaliou este lugar. Edite a sua avaliação.", "nota");
    const a = { id: novoId("aval"), usuario_id: r.u.id, lugar_id: l.id, criado_em: agora(), ...validarAval(r.corpo) }; a.experiencia_verificada = verificada(r.u, l.id); db.avaliacoes.push(a); salvar();
    return ok({ mensagem: "Obrigado por compartilhar sua experiência!", avaliacao: avalDict(a, r.u) }, 201); });
  const avalPropria = (id, u) => { const a = db.avaliacoes.find((x) => x.id === Number(id) && x.usuario_id === u.id); if (!a) throw new Erro(404, "Avaliação não encontrada."); return a; };
  const editarAval = (r) => { const a = avalPropria(r.p.id, r.u); Object.assign(a, validarAval(r.corpo, a)); a.experiencia_verificada = verificada(r.u, a.lugar_id); a.editada = true; salvar(); return ok({ mensagem: "Avaliação atualizada.", avaliacao: avalDict(a, r.u) }); };
  rota("PUT", "/avaliacoes/:id", editarAval); rota("POST", "/avaliacoes/:id", editarAval);
  rota("DELETE", "/avaliacoes/:id", (r) => { const a = avalPropria(r.p.id, r.u); db.avaliacoes = db.avaliacoes.filter((x) => x !== a); salvar(); return ok({ mensagem: "Avaliação excluída.", avaliacao_id: a.id }); });
  rota("GET", "/comunidade", (r) => { const itens = [...db.avaliacoes.map((a) => ({ tipo: "avaliacao", criado_em: a.criado_em, avaliacao: avalDict(a, r.u, true) })),
    ...db.diario.filter((d) => d.visibilidade === "publico").map((d) => ({ tipo: "relato", criado_em: d.criado_em, relato: diarioDict(d, r.u) }))].sort((a, b) => b.criado_em.localeCompare(a.criado_em)); return ok({ itens: itens.slice(0, 30) }); }, { auth: false });

  /* diário */
  const validarDiario = (d, u, atual) => { const val = (c) => (c in d ? d[c] : atual ? atual[c] : null);
    let v = null; if (val("viagem_id") && val("viagem_id") !== "0") v = viagemDoUsuario(inteiro(val("viagem_id"), "viagem_id", "a viagem", { min: 1 }), u);
    let l = null; if (val("lugar_id") && val("lugar_id") !== "0") { l = lugarPorId(val("lugar_id")); if (!l) throw invalido("Lugar não encontrado.", "lugar_id"); }
    const dt = data(val("data") || (v && v.data_ida), "data", "a data"); if (dt > hojeIso()) throw invalido("O diário registra experiências já vividas: a data não pode estar no futuro.", "data");
    const vis = escolha(val("visibilidade"), Object.keys(VISIB), "visibilidade", "visibilidade", "privado"); if (vis === "participantes" && !v) throw invalido("Para compartilhar com os participantes, vincule o registro a uma viagem.", "visibilidade");
    return { viagem_id: v ? v.id : null, lugar_id: l ? l.id : null, titulo: txt(val("titulo"), "titulo", "o título", { min: 2, max: 140 }), relato: txt(val("relato"), "relato", "o relato", { max: 8000, obrig: false }), data: dt,
      local: txt(val("local") || (l && l.nome), "local", "o local", { max: 160, obrig: false }), cidade: txt(val("cidade") || (l && l.cidade), "cidade", "a cidade", { max: 80, obrig: false }),
      estado: txt(val("estado") || (l && l.estado), "estado", "o estado/país", { max: 60, obrig: false }), nota_pessoal: inteiro(val("nota_pessoal"), "nota_pessoal", "a nota", { min: 1, max: 5, obrig: false }), visibilidade: vis }; };
  rota("GET", "/diario", (r) => { const rs = db.diario.filter((d) => d.usuario_id === r.u.id).sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id); const g = {};
    rs.forEach((d) => (g[d.data.slice(0, 4)] = g[d.data.slice(0, 4)] || []).push(diarioDict(d, r.u)));
    return ok({ total: rs.length, linha_do_tempo: Object.entries(g).map(([ano, registros]) => ({ ano, registros })), visibilidades: Object.entries(VISIB).map(([valor, rotulo]) => ({ valor, rotulo })) }); });
  rota("POST", "/diario", (r) => { const d = { id: novoId("diario"), usuario_id: r.u.id, criado_em: agora(), ...validarDiario(r.corpo, r.u) }; db.diario.push(d); salvar(); return ok({ mensagem: "Memória registrada no seu diário.", registro: diarioDict(d, r.u) }, 201); });
  rota("GET", "/diario/estatisticas", (r) => { const vs = db.viagens.filter((v) => v.usuario_id === r.u.id), conc = vs.filter((v) => statusViagem(v) === "concluida"), rs = db.diario.filter((d) => d.usuario_id === r.u.id);
    const dest = new Set(), est = new Set(), lug = new Set(), cats = {};
    conc.forEach((v) => { dest.add(v.destino.trim().toLowerCase()); const l = v.lugar_id && lugarPorId(v.lugar_id); if (l) { est.add(l.estado); lug.add(l.id); cats[l.categoria] = (cats[l.categoria] || 0) + 1; } });
    rs.forEach((d) => { if (d.cidade) dest.add(d.cidade.trim().toLowerCase()); if (d.estado) est.add(d.estado.trim().toUpperCase()); const l = d.lugar_id && lugarPorId(d.lugar_id); if (l) { lug.add(l.id); cats[l.categoria] = (cats[l.categoria] || 0) + 1; } });
    const notas = rs.map((d) => d.nota_pessoal).filter(Boolean); const fav = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
    return ok({ viagens_concluidas: conc.length, viagens_planejadas: vs.length - conc.length, dias_viajados: conc.reduce((s, v) => s + duracao(v), 0), destinos_conhecidos: dest.size, estados_visitados: [...est].sort(), lugares_do_catalogo: lug.size,
      registros: rs.length, fotos: 0, nota_media_pessoal: notas.length ? arred1(notas.reduce((a, b) => a + b, 0) / notas.length) : null, categoria_favorita: fav ? fav[0] : null,
      viagens: conc.sort((a, b) => b.data_ida.localeCompare(a.data_ida)).map((v) => ({ id: v.id, titulo: v.titulo, destino: v.destino, data_ida: v.data_ida, data_volta: v.data_volta, duracao_dias: duracao(v) })) }); });
  const diarioProprio = (id, u) => { const d = db.diario.find((x) => x.id === Number(id) && x.usuario_id === u.id); if (!d) throw new Erro(404, "Registro não encontrado."); return d; };
  const editarDiario = (r) => { const d = diarioProprio(r.p.id, r.u); Object.assign(d, validarDiario(r.corpo, r.u, d)); salvar(); return ok({ mensagem: "Registro atualizado.", registro: diarioDict(d, r.u) }); };
  rota("PUT", "/diario/:id", editarDiario); rota("POST", "/diario/:id", editarDiario);
  rota("DELETE", "/diario/:id", (r) => { const d = diarioProprio(r.p.id, r.u); db.diario = db.diario.filter((x) => x !== d); salvar(); return ok({ mensagem: "Registro excluído.", registro_id: d.id }); });
  rota("GET", "/viagens/:id/diario", (r) => { const v = viagemDoUsuario(r.p.id, r.u); return ok({ registros: db.diario.filter((d) => d.viagem_id === v.id && (d.usuario_id === r.u.id || d.visibilidade !== "privado")).sort((a, b) => a.data.localeCompare(b.data)).map((d) => diarioDict(d, r.u)) }); });

  /* fundo, mapa e comparador */
  rota("GET", "/vitrine/fundo", () => ok({ disponivel: false }), { auth: false });
  rota("GET", "/mapa/config", () => ok({ tile_url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", atribuicao: '&copy; <a href="https://www.openstreetmap.org/copyright">colaboradores do OpenStreetMap</a>', integracoes_externas: false, aviso_distancias: "Distâncias em linha reta — o trajeto real pode ser maior." }), { auth: false });
  rota("GET", "/mapa/lugares", () => ok({ lugares: D.lugares.map((l) => ({ id: l.id, nome: l.nome, categoria: l.categoria, tipo: tipoLugar(l), local: `${l.cidade}, ${l.estado}`, latitude: l.latitude, longitude: l.longitude, nota: Math.round(l.nota * 10) / 10, preco_simbolo: SIMBOLO(l.faixa_preco), foto: null, imagem: D.imagens[l.categoria] })) }), { auth: false });
  rota("GET", "/viagens/:id/mapa", (r) => { const v = viagemDoUsuario(r.p.id, r.u); const pontos = [], dias = {};
    if (v.latitude != null) pontos.push({ chave: "destino", tipo: "destino", titulo: v.destino, latitude: v.latitude, longitude: v.longitude, dia: null });
    const ro = roteiroAtivo(v.id);
    if (ro) atividadesDe(ro.id).forEach((a) => { if (a.latitude == null) return; const p = { chave: `a${a.id}`, tipo: "atividade", id: a.id, titulo: a.titulo, categoria: a.categoria, dia: a.dia, ordem: a.ordem, horario: a.horario,
      latitude: a.latitude, longitude: a.longitude, lugar_id: a.lugar_id, endereco: a.endereco, funcionamento: null }; pontos.push(p); (dias[a.dia] = dias[a.dia] || []).push(p); });
    db.compromissos.filter((c) => c.viagem_id === v.id && c.latitude != null).forEach((c) => pontos.push({ chave: `c${c.id}`, tipo: "compromisso", id: c.id, titulo: c.titulo, dia: diasEntre(v.data_ida, c.inicio.slice(0, 10)) + 1, horario: c.inicio.slice(11, 16), latitude: c.latitude, longitude: c.longitude, endereco: c.local }));
    const trajetos = Object.entries(dias).sort((a, b) => a[0] - b[0]).map(([dia, its]) => { its.sort((a, b) => (a.horario || "99:99").localeCompare(b.horario || "99:99") || a.ordem - b.ordem);
      const trechos = its.slice(1).map((b, i) => ({ de: its[i].titulo, para: b.titulo, distancia_km: hav([its[i].latitude, its[i].longitude], [b.latitude, b.longitude]) }));
      return { dia: Number(dia), pontos: its.map((p) => p.chave), trechos, total_km: arred1(trechos.reduce((s, t) => s + t.distancia_km, 0)) }; });
    return ok({ viagem: { id: v.id, destino: v.destino, latitude: v.latitude, longitude: v.longitude }, pontos, trajetos, sem_localizacao: v.latitude == null && !pontos.length }); });
  rota("GET", "/lugares/:id/proximidades", (r) => { const l = lugarPorId(r.p.id); if (!l) throw new Erro(404, "Lugar não encontrado.");
    const cat = D.lugares.filter((o) => o.id !== l.id).map((o) => ({ id: o.id, nome: o.nome, categoria: o.categoria, latitude: o.latitude, longitude: o.longitude, distancia_km: hav([l.latitude, l.longitude], [o.latitude, o.longitude]) })).filter((o) => o.distancia_km <= 60).sort((a, b) => a.distancia_km - b.distancia_km);
    return ok({ lugar: { id: l.id, nome: l.nome, latitude: l.latitude, longitude: l.longitude }, catalogo: cat, pontos: [], aviso: "Estabelecimentos do OpenStreetMap indisponíveis na versão de demonstração.", raio_km: 5, fonte_pontos: "OpenStreetMap (Overpass API)" }); }, { auth: false });
  rota("GET", "/comparador", (r) => {
    const ids = [...new Set((r.q.ids || "").split(",").filter(Boolean).map(Number))]; if (ids.some(Number.isNaN)) throw invalido("Lista de destinos inválida.", "ids");
    if (ids.length < 2 || ids.length > 3) throw invalido("Escolha de 2 a 3 destinos para comparar.", "ids"); const ls = ids.map(lugarPorId); if (ls.some((x) => !x)) throw invalido("Algum destino não foi encontrado.", "ids");
    const pref = r.u && r.u.preferencia, ints = new Set(pref ? pref.interesses : []);
    const itens = ls.map((l) => { const viz = D.lugares.filter((o) => o.id !== l.id && hav([l.latitude, l.longitude], [o.latitude, o.longitude]) <= 60), porCat = {}; viz.forEach((o) => (porCat[o.categoria] = (porCat[o.categoria] || 0) + 1));
      const avs = db.avaliacoes.filter((a) => a.lugar_id === l.id), dist = pref ? distUsuario(l, pref) : null; const cats = new Set([l.categoria, ...Object.keys(porCat)]);
      return { lugar: lugarDict(l, r.u), preco: { faixa: l.faixa_preco, simbolo: SIMBOLO(l.faixa_preco) }, avaliacao: { catalogo: Math.round(l.nota * 10) / 10, catalogo_total: l.avaliacoes, comunidade: avs.length ? arred1(avs.reduce((s, a) => s + a.nota, 0) / avs.length) : null, comunidade_total: avs.length },
        atracoes: { catalogo_proximos: viz.length, por_categoria: porCat, exemplos: viz.sort((a, b) => b.nota - a.nota).slice(0, 4).map((o) => o.nome), openstreetmap: null },
        caracteristicas: { categoria: l.categoria, categoria_nome: interessePorSlug(l.categoria).nome, tipo: tipoLugar(l), melhor_epoca: l.melhor_epoca, descricao: l.descricao }, clima: null,
        localizacao: { local: `${l.cidade}, ${l.estado}`, latitude: l.latitude, longitude: l.longitude, distancia_km: dist }, compatibilidade: { match: calcMatch(l, pref, dist || 0), combina_com: [...cats].filter((c) => ints.has(c)).map((c) => interessePorSlug(c).nome) } }; });
    const melhor = (f, rev = true) => { const v = itens.map((i) => [f(i), i.lugar.id]).filter(([x]) => x !== null && x !== undefined); if (v.length < 2) return null; const alvo = (rev ? Math.max : Math.min)(...v.map((x) => x[0])); const w = v.filter((x) => x[0] === alvo).map((x) => x[1]); return w.length < itens.length ? w : null; };
    return ok({ itens, destaques: { menor_preco: melhor((i) => i.preco.faixa, false), melhor_nota: melhor((i) => i.avaliacao.catalogo), melhor_comunidade: melhor((i) => i.avaliacao.comunidade), mais_atracoes: melhor((i) => i.atracoes.catalogo_proximos),
      mais_perto: melhor((i) => i.localizacao.distancia_km, false), maior_match: melhor((i) => i.compatibilidade.match) }, personalizado: !!pref, aviso_distancias: "Distâncias em linha reta a partir da sua cidade." });
  }, { auth: false });
  rota("GET", "/saude", () => ok({ status: "ok", app: "Viajaí (demonstração)" }), { auth: false });
  rota("GET", "/relatorios/destinos", () => ok({ ranking_destinos: [], interesses_mais_escolhidos: [], lugares_por_categoria: [], estatisticas: {} }), { auth: false });

  /* ------------------------------ interceptação ---------------------------- */
  async function corpoDe(init) {
    const b = init && init.body;
    if (!b) return {};
    if (typeof b === "string") { try { return JSON.parse(b); } catch { return {}; } }
    if (b instanceof FormData) { const o = {}; for (const [k, v] of b.entries()) if (!(v instanceof File)) o[k] = v; return o; }
    return {};
  }
  async function atender(url, init) {
    const metodo = ((init && init.method) || "GET").toUpperCase();
    const u = new URL(url, window.location.href);
    const caminho = u.pathname.slice(u.pathname.indexOf("/api/") + 4).replace(/\/+$/, "") || "/";
    const q = Object.fromEntries(u.searchParams.entries());
    const cab = (init && init.headers) || {};
    const auth = cab.Authorization || cab.authorization || "";
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    const req = { metodo, q, corpo: await corpoDe(init), token, p: {}, u: null };
    req.u = usuarioDe(req);
    for (const r of rotas) {
      if (r.metodo !== metodo) continue;
      const m = r.re.exec(caminho);
      if (!m) continue;
      req.p = m.groups || {};
      try {
        if (r.auth && !req.u) throw new Erro(401, "Sessão expirada. Faça login novamente.");
        const [status, corpo] = r.fn(req);
        return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
      } catch (e) {
        if (!(e instanceof Erro)) { console.error(e); return new Response(JSON.stringify({ erro: "Erro interno na demonstração." }), { status: 500, headers: { "Content-Type": "application/json" } }); }
        return new Response(JSON.stringify({ erro: e.message, ...(e.campo ? { campo: e.campo } : {}) }), { status: e.status, headers: { "Content-Type": "application/json" } });
      }
    }
    return new Response(JSON.stringify({ erro: "Rota de API inexistente." }), { status: 404, headers: { "Content-Type": "application/json" } });
  }
  window.fetch = function (entrada, init) {
    const url = typeof entrada === "string" ? entrada : entrada.url;
    if (/\/api\//.test(url) && new URL(url, window.location.href).origin === window.location.origin) return atender(url, init);
    return nativeFetch(entrada, init);
  };

  /* ------------------------------ aviso na tela ---------------------------- */
  window.addEventListener("DOMContentLoaded", () => {
    const app = document.querySelector(".app");
    if (!app || sessionStorage.getItem("viajai-demo-aviso") === "off") return;
    const barra = document.createElement("div");
    barra.className = "demo-aviso";
    barra.setAttribute("role", "note");
    barra.innerHTML = '<span>🧪 <strong>Versão de demonstração</strong> — roda só no seu navegador; os dados ficam salvos aqui. Sem fotos reais, e-mail ou convites entre pessoas.</span>' +
      '<button type="button" data-apagar>Apagar dados</button><button type="button" data-fechar aria-label="Fechar aviso">✕</button>';
    barra.querySelector("[data-fechar]").addEventListener("click", () => { sessionStorage.setItem("viajai-demo-aviso", "off"); barra.remove(); });
    barra.querySelector("[data-apagar]").addEventListener("click", () => {
      if (confirm("Apagar todas as contas e dados desta demonstração neste navegador?")) {
        localStorage.removeItem(CHAVE); localStorage.removeItem("viajai:token"); localStorage.removeItem("viajai:usuario"); window.location.href = "index.html";
      }
    });
    app.prepend(barra);
  });
})();
