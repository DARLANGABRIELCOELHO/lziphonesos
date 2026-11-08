/* Liga o formulario a folha da OS: le os campos, confere, desenha a previa e gera o PDF.
   Dados do cliente e do aparelho ficam so na memoria da pagina. O numero da OS vem do
   contador no Netlify: a previa mostra o proximo numero, e ele so e reservado ao gerar o PDF. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const form = $('form');
  const documento = $('documento');
  /* Assinaturas na tela: o traço vai para o PDF e para o registro salvo. */
  const pads = {
    cliente: Assinatura.iniciar('assinatura-cliente', () => atualizar()),
    tecnico: Assinatura.iniciar('assinatura-tecnico', () => atualizar()),
  };
  const API_NUMERO = 'api/os/numero';
  let numeroAtual = '';

  const PERGUNTAS = [
    { id: 'ligado', texto: 'Chegou ligado?', nome: 'detalhe de chegou ligado' },
    { id: 'chip', texto: 'Retirou chip e capinha?', nome: 'detalhe de chip e capinha' },
    { id: 'manutencao', texto: 'Já passou por manutenção?', nome: 'detalhe de manutenção' },
    { id: 'agua', texto: 'Já teve contato com água?', nome: 'tempo do contato com água', rotuloNota: 'Há quanto tempo?' },
  ];

  /* Mascaras */

  const digitos = (texto) => texto.replace(/\D/g, '');

  const mascaras = {
    cpf(t) {
      const d = digitos(t).slice(0, 11);
      return d
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3}\.\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/, '$1-$2');
    },
    telefone(t) {
      const d = digitos(t).slice(0, 11);
      if (d.length <= 2) return d.length ? `(${d}` : '';
      const corte = d.length === 11 ? 7 : 6;
      if (d.length <= corte) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
      return `(${d.slice(0, 2)}) ${d.slice(2, corte)}-${d.slice(corte)}`;
    },
    moeda(t) {
      const centavos = parseInt(digitos(t) || '0', 10);
      return centavos ? formatarCentavos(centavos) : '';
    },
  };

  function formatarCentavos(centavos) {
    const reais = Math.floor(centavos / 100);
    const resto = String(centavos % 100).padStart(2, '0');
    return `${String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${resto}`;
  }

  /* Conferencias */

  function cpfValido(valor) {
    const d = digitos(valor);
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    for (const tamanho of [9, 10]) {
      let soma = 0;
      for (let i = 0; i < tamanho; i++) soma += Number(d[i]) * (tamanho + 1 - i);
      const digito = ((soma * 10) % 11) % 10;
      if (digito !== Number(d[tamanho])) return false;
    }
    return true;
  }

  /* Datas: trabalha com ano, mes e dia para nao sofrer com fuso horario. */

  function dataBr(iso) {
    if (!iso) return '';
    const [ano, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${ano}`;
  }

  function hojeIso() {
    const agora = new Date();
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const dia = String(agora.getDate()).padStart(2, '0');
    return `${agora.getFullYear()}-${mes}-${dia}`;
  }

  /* Numero da OS: vem do contador no servidor. */

  const formatarNumero = (texto) => (digitos(texto) ? digitos(texto).padStart(4, '0') : '');

  function mostrarNumero(numero) {
    numeroAtual = numero ? String(numero) : '';
    $('numero').value = numeroAtual ? formatarNumero(numeroAtual) : '';
  }

  /* Mostra o proximo numero sem reservar. Sem conexao, o botao de gerar fica bloqueado. */
  async function buscarPrevisao() {
    const nota = $('numero-nota');
    try {
      const resposta = await fetch(API_NUMERO, { cache: 'no-store' });
      if (!resposta.ok) throw new Error('resposta');
      const dados = await resposta.json();
      mostrarNumero(dados.proximo);
      nota.textContent = 'Número previsto. Só fica definido ao gerar o PDF.';
      nota.classList.remove('erro');
    } catch (erro) {
      mostrarNumero(null);
      nota.textContent = 'Sem conexão com o contador de OS. Para gerar o PDF, é preciso internet.';
      nota.classList.add('erro');
    }
    atualizar();
  }

  /* Reserva o numero: so acontece quando o PDF vai ser gerado. */
  async function reservarNumero() {
    const resposta = await fetch(API_NUMERO, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      cache: 'no-store',
    });
    if (!resposta.ok) throw new Error('resposta');
    const dados = await resposta.json();
    if (!dados.numero) throw new Error('resposta');
    return dados.numero;
  }

  /* Perguntas de sim ou nao */

  function montarPerguntas() {
    $('perguntas').innerHTML = PERGUNTAS.map((p) => `
      <div class="pergunta" role="radiogroup" aria-labelledby="${p.id}-t">
        <span class="pergunta-t" id="${p.id}-t">${p.texto}</span>
        <div class="opcoes">
          <label class="opcao"><input type="radio" name="${p.id}" value="sim"><span>Sim</span></label>
          <label class="opcao"><input type="radio" name="${p.id}" value="nao"><span>Não</span></label>
        </div>
        <label class="campo campo-nota">
          <span>${p.rotuloNota || 'Detalhe (opcional)'}</span>
          <input id="${p.id}-nota" aria-describedby="${p.id}-nota-aviso">
          <small class="aviso" id="${p.id}-nota-aviso"></small>
        </label>
      </div>`).join('');
  }

  /* Clicar de novo na resposta marcada desmarca: sem resposta, a caixa sai vazia para a caneta. */
  const respostas = {};

  function alternarResposta(campo) {
    if (respostas[campo.name] === campo.value) {
      campo.checked = false;
      delete respostas[campo.name];
    } else {
      respostas[campo.name] = campo.value;
    }
    atualizar();
  }

  /* Padrao de desbloqueio */

  let padrao = [];
  let desenhando = false;

  const pontos = $('pontos');
  const centro = (indice) => ({ x: 50 + 100 * (indice % 3), y: 50 + 100 * Math.floor(indice / 3) });

  function montarPontos() {
    for (let i = 0; i < 9; i++) {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'ponto';
      botao.dataset.indice = i;
      botao.setAttribute('aria-label', `Ponto ${i + 1}`);
      botao.setAttribute('aria-pressed', 'false');
      botao.addEventListener('click', () => adicionarPonto(i));
      pontos.appendChild(botao);
    }
  }

  /* Como no celular: passar por cima de um ponto do meio tambem o inclui. */
  function pontoDoMeio(a, b) {
    const [la, ca, lb, cb] = [Math.floor(a / 3), a % 3, Math.floor(b / 3), b % 3];
    if ((la + lb) % 2 || (ca + cb) % 2) return null;
    return ((la + lb) / 2) * 3 + (ca + cb) / 2;
  }

  function adicionarPonto(indice) {
    if (padrao.includes(indice)) return;
    if (padrao.length) {
      const meio = pontoDoMeio(padrao[padrao.length - 1], indice);
      if (meio !== null && !padrao.includes(meio)) padrao.push(meio);
    }
    padrao.push(indice);
    atualizar();
  }

  function pontoSobPonteiro(evento) {
    const caixa = pontos.getBoundingClientRect();
    const celula = caixa.width / 3;
    const x = evento.clientX - caixa.left;
    const y = evento.clientY - caixa.top;
    const coluna = Math.floor(x / celula);
    const linha = Math.floor(y / celula);
    if (coluna < 0 || coluna > 2 || linha < 0 || linha > 2) return null;
    const distancia = Math.hypot(x - (coluna + 0.5) * celula, y - (linha + 0.5) * celula);
    return distancia <= celula * 0.38 ? linha * 3 + coluna : null;
  }

  function aoMoverPonteiro(evento) {
    if (!desenhando) return;
    const indice = pontoSobPonteiro(evento);
    if (indice !== null) adicionarPonto(indice);
  }

  function mostrarPadrao() {
    const traco = padrao.slice(1).map((indice, i) => {
      const de = centro(padrao[i]);
      const ate = centro(indice);
      return `<line x1="${de.x}" y1="${de.y}" x2="${ate.x}" y2="${ate.y}"/>`;
    });
    $('padrao-linhas').innerHTML = traco.join('');

    pontos.querySelectorAll('.ponto').forEach((botao, i) => {
      const ordem = padrao.indexOf(i);
      botao.textContent = ordem < 0 ? '' : String(ordem + 1);
      botao.setAttribute('aria-pressed', String(ordem >= 0));
    });

    $('padrao-apagar').hidden = !padrao.length;
    $('padrao-nota').textContent = padrao.length
      ? `${padrao.length} ${padrao.length === 1 ? 'ponto marcado' : 'pontos marcados'}. No PDF, os pontos saem numerados na ordem.`
      : 'Arraste pelos pontos ou toque um por um, na ordem do desenho. Sem desenho, sai em branco para a caneta.';
  }

  /* Leitura do formulario */

  function lerDados() {
    const texto = (id) => $(id).value.trim();
    const numero = numeroAtual ? formatarNumero(numeroAtual) : '';
    const marcada = (nome) => {
      const campo = form.querySelector(`input[name="${nome}"]:checked`);
      return campo ? campo.value : '';
    };

    return {
      numero,
      nome: texto('nome'),
      cpf: texto('cpf'),
      telefone: texto('telefone'),
      dataTexto: dataBr($('data').value),
      modelo: texto('modelo'),
      cor: texto('cor'),
      senha: texto('senha'),
      padrao: [...padrao],
      perguntas: PERGUNTAS.map((p) => ({
        texto: p.texto,
        nome: p.nome,
        rotuloNota: p.rotuloNota,
        resposta: marcada(p.id),
        nota: texto(`${p.id}-nota`),
      })),
      servicos: $('servicos').value.trim(),
      observacoes: $('observacoes').value.trim(),
      valorTexto: texto('valor'),
      assinaturaCliente: pads.cliente.dataUrl(),
      assinaturaTecnico: pads.tecnico.dataUrl(),
      arquivo: nomeArquivo(numero, texto('nome'), $('data').value),
    };
  }

  function nomeArquivo(numero, nome, dataIso) {
    const partes = nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z ]/g, '')
      .split(/\s+/)
      .filter(Boolean);
    const cliente =
      partes.length > 1 ? `${partes[0]}_${partes[partes.length - 1]}` : partes[0] || 'CLIENTE';
    const data = dataBr(dataIso).replace(/\//g, '-');
    return `OS_${numero}_${cliente}_${data}`;
  }

  /* Avisos */

  function mostrarAviso(id, mensagem) {
    const aviso = $(`${id}-aviso`);
    aviso.textContent = mensagem;
    aviso.closest('.campo').classList.toggle('com-erro', Boolean(mensagem));
  }

  /* Campos de varias linhas e detalhes das perguntas, que avisam se o texto passar do espaco. */
  const AVISOS_DE_ESPACO = {
    serviços: { id: 'servicos', mensagem: 'Serviços não cabe nas 5 linhas da folha. Encurte o texto.' },
    observações: { id: 'observacoes', mensagem: 'Observações não cabe nas 5 linhas da folha. Encurte o texto.' },
  };
  for (const p of PERGUNTAS) {
    AVISOS_DE_ESPACO[p.nome] = {
      id: `${p.id}-nota`,
      mensagem: `O texto de "${p.texto}" não cabe na folha. Encurte o texto.`,
    };
  }

  function conferir(d, folha) {
    const falta = [];
    const exige = (valor, rotulo) => {
      if (!valor) falta.push(rotulo);
    };
    exige(d.dataTexto, 'data de entrada');
    exige(d.nome, 'nome');
    exige(d.telefone, 'telefone');
    exige(d.modelo, 'modelo');

    const erros = [];
    const avisa = (id, condicao, mensagem) => {
      mostrarAviso(id, condicao ? mensagem : '');
      if (condicao) erros.push(mensagem);
    };
    const telefone = digitos(d.telefone);
    avisa('telefone', d.telefone && telefone.length < 10, 'Telefone incompleto. Inclua o DDD.');
    avisa('cpf', d.cpf && !cpfValido(d.cpf), 'CPF inválido. Confira os números.');

    for (const [nome, aviso] of Object.entries(AVISOS_DE_ESPACO)) {
      avisa(aviso.id, folha.estouros.includes(nome), aviso.mensagem);
    }
    for (const nome of folha.estouros) {
      if (!AVISOS_DE_ESPACO[nome]) erros.push(`O campo ${nome} não cabe na folha. Encurte o texto.`);
    }

    const digitado = [
      d.nome, d.modelo, d.cor, d.senha, d.servicos, d.observacoes,
      ...d.perguntas.map((p) => p.nota),
    ].join('');
    const fora = OrdemServico.foraDaFonte(digitado);
    if (fora.length) erros.push(`O PDF não imprime este caractere: ${fora.join(' ')}. Apague para continuar.`);

    return { falta, erros };
  }

  /* Previa: desenha em SVG a mesma folha que vai para o PDF. */

  const escapar = (texto) =>
    texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const n = (valor) => Number(valor.toFixed(3));

  function opParaSvg(op) {
    if (op.tipo === 'texto') {
      const classes = [op.peso, op.valor && 'v'].filter(Boolean).join(' ');
      return `<text x="${n(op.x)}" y="${n(op.y)}" font-size="${op.tamanho}" fill="${op.cor}" class="${classes}">${escapar(op.texto)}</text>`;
    }
    if (op.tipo === 'linha') {
      const extras = [
        op.tracejado ? `stroke-dasharray="${op.tracejado.join(' ')}"` : '',
        op.redondo ? 'stroke-linecap="round"' : '',
        op.valor ? 'class="v"' : '',
      ].join(' ');
      return `<line x1="${n(op.x1)}" y1="${n(op.y1)}" x2="${n(op.x2)}" y2="${n(op.y2)}" stroke="${op.cor}" stroke-width="${n(op.espessura)}" ${extras}/>`;
    }
    if (op.tipo === 'forma') {
      const borda = op.borda ? `stroke="${op.borda}" stroke-width="${n(op.espessura)}"` : '';
      return `<path d="${op.d}" fill="${op.fundo || 'none'}" ${borda} ${op.valor ? 'class="v"' : ''}/>`;
    }
    if (op.tipo === 'assinatura') {
      return `<image href="${op.dados}" x="${n(op.x)}" y="${n(op.y)}" width="${n(op.largura)}" height="${n(op.altura)}" preserveAspectRatio="xMidYMid meet"/>`;
    }
    return `<image href="assets/logo-os.png" x="${n(op.x)}" y="${n(op.y)}" width="${n(op.largura)}" height="${n(op.altura)}"/>`;
  }

  function folhasEmSvg(folha) {
    const { largura, altura } = OrdemServico.FOLHA;
    return folha.folhas
      .map((f) => `<svg class="folha" viewBox="0 0 ${largura} ${altura}" role="img" aria-label="Folha da ordem de serviço">${f.ops.map(opParaSvg).join('')}</svg>`)
      .join('');
  }

  let folha = null;
  let situacao = { falta: [], erros: [] };

  function mostrarPendencias() {
    const { falta, erros } = situacao;
    const linhaStatus = $('pendencias');
    const partes = [];
    if (falta.length) partes.push(`Falta preencher: ${falta.join(', ')}.`);
    partes.push(...erros);
    linhaStatus.classList.toggle('pronto', !partes.length);
    linhaStatus.textContent = partes.length
      ? partes.join(' ')
      : 'OS pronta. O PDF vai para os seus downloads.';
  }

  function atualizar() {
    const d = lerDados();
    mostrarPadrao();
    folha = OrdemServico.montar(d);
    documento.innerHTML = folhasEmSvg(folha);
    $('servicos-nota').hidden = !folha.resumido;
    situacao = conferir(d, folha);
    mostrarPendencias();
  }

  /* Acoes */

  async function gerarPdf() {
    atualizar();
    if (situacao.falta.length || situacao.erros.length) {
      const primeiro = form.querySelector('.com-erro input, .com-erro textarea') ||
        [...form.querySelectorAll('[required]')].find((c) => !c.value.trim());
      if (primeiro) primeiro.focus();
      return;
    }

    const botao = $('gerar');
    const pendencias = $('pendencias');
    botao.disabled = true;
    botao.textContent = 'Reservando número...';

    let numero;
    try {
      numero = await reservarNumero();
    } catch (erro) {
      botao.disabled = false;
      botao.textContent = 'Gerar PDF';
      pendencias.classList.remove('pronto');
      pendencias.textContent = 'Sem conexão com o contador de OS. Nenhum número foi usado. Tente de novo com internet.';
      return;
    }

    mostrarNumero(numero);
    atualizar();
    const d = lerDados();
    botao.textContent = 'Salvando...';
    const salvo = await Registros.enviar('os', d);
    botao.textContent = 'Gerando PDF...';
    try {
      PdfOs.baixar(await PdfOs.montar(folha, d.arquivo), d.arquivo);
      pendencias.textContent = `PDF gerado: ${d.arquivo}.pdf. ` +
        (salvo ? 'OS salva.' : 'Sem conexão: a OS será salva quando a internet voltar.');
    } catch (erro) {
      pendencias.classList.remove('pronto');
      pendencias.textContent = `O PDF não foi gerado, mas o número ${formatarNumero(String(numero))} já foi reservado e não será usado de novo. Tente gerar outra vez.`;
    } finally {
      botao.disabled = false;
      botao.textContent = 'Gerar PDF';
    }
  }

  function preencherInicio() {
    $('data').value = hojeIso();
    buscarPrevisao();
  }

  function limpar() {
    form.reset();
    pads.cliente.limpar();
    pads.tecnico.limpar();
    padrao = [];
    Object.keys(respostas).forEach((nome) => delete respostas[nome]);
    preencherInicio();
    atualizar();
    $('nome').focus();
  }

  form.addEventListener('submit', (evento) => evento.preventDefault());

  form.addEventListener('click', (evento) => {
    if (evento.target.matches('input[type="radio"]')) alternarResposta(evento.target);
  });

  form.addEventListener('input', (evento) => {
    const campo = evento.target;
    if (campo.id === 'cpf') campo.value = mascaras.cpf(campo.value);
    if (campo.id === 'telefone') campo.value = mascaras.telefone(campo.value);
    if (campo.classList.contains('moeda')) campo.value = mascaras.moeda(campo.value);
    atualizar();
  });

  pontos.addEventListener('pointerdown', (evento) => {
    desenhando = true;
    pontos.setPointerCapture(evento.pointerId);
    aoMoverPonteiro(evento);
  });
  pontos.addEventListener('pointermove', aoMoverPonteiro);
  pontos.addEventListener('pointerup', () => { desenhando = false; });
  pontos.addEventListener('pointercancel', () => { desenhando = false; });

  $('padrao-apagar').addEventListener('click', () => {
    padrao = [];
    atualizar();
  });

  $('gerar').addEventListener('click', gerarPdf);
  $('novo').addEventListener('click', () => {
    if (window.confirm('Apagar os dados desta OS?')) limpar();
  });

  montarPerguntas();
  montarPontos();
  preencherInicio();
  atualizar();
  /* As bibliotecas do PDF só são baixadas quando o botão Gerar PDF é usado. */
  /* Envia de novo o que ficou sem conexão em outra vez. */
  Registros.reenviarPendentes();
})();
