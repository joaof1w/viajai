/* Formulário de criação/edição de viagem (usado na lista e na página da viagem). */

let _catalogoLugares = null;

async function catalogoLugares() {
  if (!_catalogoLugares) {
    try { _catalogoLugares = (await Api.lugaresMapa()).lugares; } catch { _catalogoLugares = []; }
  }
  return _catalogoLugares;
}

const TIPOS_VIAGEM = [
  ["lazer", "Lazer"], ["aventura", "Aventura"], ["cultural", "Cultural"], ["romantica", "Romântica"],
  ["familia", "Em família"], ["negocios", "Negócios"], ["mochilao", "Mochilão"],
];

/**
 * Abre a folha com o formulário. `viagem` (opcional) = edição.
 * Resolve com a viagem salva.
 */
async function abrirFormularioViagem({ viagem = null, lugarId = null } = {}) {
  const lugares = await catalogoLugares();
  const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const v = viagem || { viajantes: 1, tipo: "lazer", data_ida: amanha, data_volta: amanha, lugar_id: lugarId ? Number(lugarId) : null };
  const lugarInicial = lugares.find((l) => l.id === v.lugar_id);

  return new Promise((resolver) => {
    const corpo = Folha.abrir({
      titulo: viagem ? "Editar viagem" : "Nova viagem",
      conteudo: `
      <form class="form" novalidate>
        <div class="campo">
          <label for="f-lugar">Destino do catálogo <span class="texto-mini">(opcional)</span></label>
          <select id="f-lugar" name="lugar_id">
            <option value="">— Outro destino (digitar abaixo) —</option>
            ${lugares.map((l) => `<option value="${l.id}" ${l.id === v.lugar_id ? "selected" : ""}>${escapar(l.nome)} · ${escapar(l.local)}</option>`).join("")}
          </select>
        </div>
        <div class="campo">
          <label for="f-destino">Destino</label>
          <input id="f-destino" class="simples" name="destino" maxlength="160" placeholder="Ex.: Lisboa, Portugal"
                 value="${escapar(v.destino || (lugarInicial ? lugarInicial.local : ""))}" required />
        </div>
        <div class="campo">
          <label for="f-titulo">Nome da viagem</label>
          <input id="f-titulo" class="simples" name="titulo" maxlength="120" placeholder="Ex.: Férias de verão"
                 value="${escapar(v.titulo || "")}" />
        </div>
        <div class="form-grade">
          <div class="campo"><label for="f-ida">Partida</label>
            <input id="f-ida" type="date" name="data_ida" value="${escapar(v.data_ida)}" required /></div>
          <div class="campo"><label for="f-volta">Retorno</label>
            <input id="f-volta" type="date" name="data_volta" value="${escapar(v.data_volta)}" required /></div>
        </div>
        <div class="form-grade">
          <div class="campo"><label for="f-viajantes">Viajantes</label>
            <input id="f-viajantes" type="number" min="1" max="50" name="viajantes" value="${escapar(v.viajantes)}" /></div>
          <div class="campo"><label for="f-tipo">Tipo</label>
            <select id="f-tipo" name="tipo">${TIPOS_VIAGEM.map(([valor, rotulo]) =>
              `<option value="${valor}" ${valor === v.tipo ? "selected" : ""}>${rotulo}</option>`).join("")}</select></div>
        </div>
        <div class="campo">
          <label for="f-orcamento">Orçamento total (R$) <span class="texto-mini">(opcional)</span></label>
          <input id="f-orcamento" class="simples" name="orcamento" inputmode="decimal" placeholder="Ex.: 3.500,00"
                 value="${v.orcamento != null ? escapar(String(v.orcamento).replace(".", ",")) : ""}" />
        </div>
        <div class="campo">
          <label for="f-pref">Preferências</label>
          <input id="f-pref" class="simples" name="preferencias" maxlength="1000" placeholder="Ex.: ritmo tranquilo, sem trilhas longas"
                 value="${escapar(v.preferencias || "")}" />
        </div>
        <div class="campo">
          <label for="f-obs">Observações</label>
          <textarea id="f-obs" name="observacoes" maxlength="2000" placeholder="Anotações livres">${escapar(v.observacoes || "")}</textarea>
        </div>
        <button type="submit" class="botao botao--primario">${viagem ? "Salvar alterações" : "Criar viagem"}</button>
      </form>`,
    });

    const form = $("form", corpo);
    const seletor = $("#f-lugar", form);
    const destino = $("#f-destino", form);
    seletor.addEventListener("change", () => {
      const lugar = lugares.find((l) => String(l.id) === seletor.value);
      if (lugar) destino.value = lugar.local;
    });
    $("#f-ida", form).addEventListener("change", (e) => {
      const volta = $("#f-volta", form);
      if (volta.value < e.target.value) volta.value = e.target.value;
      volta.min = e.target.value;
    });

    form.addEventListener("submit", async (evento) => {
      evento.preventDefault();
      const dados = lerFormulario(form);
      dados.lugar_id = dados.lugar_id ? Number(dados.lugar_id) : null;
      dados.viajantes = Number(dados.viajantes || 1);
      if (!dados.orcamento) dados.orcamento = null;
      if (dados.data_volta < dados.data_ida) {
        mostrarErroFormulario(form, { campo: "data_volta", message: "O retorno não pode ser antes da partida." });
        return;
      }
      const botao = $("button[type=submit]", form);
      try {
        const resposta = await comCarregamento(botao, () =>
          viagem ? Api.editarViagem(viagem.id, dados) : Api.criarViagem(dados));
        Folha.fechar();
        toast(resposta.mensagem);
        resolver(resposta.viagem);
      } catch (erro) {
        mostrarErroFormulario(form, erro);
      }
    });
  });
}
