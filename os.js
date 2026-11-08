/* Diagrama a ordem de servico a partir dos dados do formulario. Calcula a posicao de
   cada texto com as larguras reais da fonte (metricas.js), sem perguntar nada ao
   navegador: assim a previa e o PDF saem iguais em computador e celular.
   As medidas da folha estao em milimetros, com y a partir do topo, e viram pontos
   so ao entrar na lista de desenho. Campo vazio sai em branco, para a caneta. */
(function (global) {
  'use strict';

  const LOJA = {
    endereco: 'Rua Conselheiro Antônio Prado, 291, Boituva, SP',
    telefone: '(15) 99185-2555',
    cnpj: 'CNPJ 51.520.033/0001-01',
  };

  const FOLHA = { largura: 595.28, altura: 841.89 };
  const COR = {
    grafite: '#20252b',
    suave: '#4d555e',
    linha: '#8e97a1',
    aluminio: '#d3d7dc',
    painel: '#f1f3f5',
    branco: '#ffffff',
  };

  const pt = (milimetros) => (milimetros * 72) / 25.4;

  const ESQUERDA = 14;
  const DIREITA = 196;
  const LOGO_PROPORCAO = 393 / 1097;
  const LINHAS_SERVICO = 5;
  const LINHAS_CANHOTO = 2;

  /* Medida e quebra de linha */

  function largura(texto, peso, tamanho) {
    const fonte = global.Metricas[peso];
    let soma = 0;
    for (const letra of texto) {
      const medida = fonte.larguras[letra.codePointAt(0)];
      soma += medida === undefined ? fonte.unidades / 2 : medida;
    }
    return (soma / fonte.unidades) * tamanho;
  }

  /* Letras que a fonte nao tem e sairiam como um quadradinho no PDF. */
  function foraDaFonte(texto) {
    const fonte = global.Metricas.medio;
    const fora = new Set();
    for (const letra of texto.replace(/\s/g, '')) {
      if (fonte.larguras[letra.codePointAt(0)] === undefined) fora.add(letra);
    }
    return [...fora];
  }

  function quebrar(texto, peso, tamanho, maximo) {
    const linhas = [];
    for (const paragrafo of texto.split('\n')) {
      let atual = '';
      for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
        const tentativa = atual ? `${atual} ${palavra}` : palavra;
        if (largura(tentativa, peso, tamanho) <= maximo) {
          atual = tentativa;
        } else {
          if (atual) linhas.push(atual);
          atual = '';
          /* Palavra maior que a linha e cortada letra a letra. */
          for (const letra of palavra) {
            if (largura(atual + letra, peso, tamanho) > maximo) {
              linhas.push(atual);
              atual = '';
            }
            atual += letra;
          }
        }
      }
      linhas.push(atual);
    }
    while (linhas.length && !linhas[linhas.length - 1]) linhas.pop();
    return linhas;
  }

  function encurtar(texto, peso, tamanho, maximo) {
    let curto = texto.trimEnd();
    while (curto && largura(`${curto}…`, peso, tamanho) > maximo) {
      curto = [...curto].slice(0, -1).join('').trimEnd();
    }
    return `${curto}…`;
  }

  /* Desenho */

  const n = (valor) => Number(valor.toFixed(3));

  function escrever(ops, conteudo, x, y, tamanho, opcoes = {}) {
    const { peso = 'medio', cor = COR.grafite, valor = false } = opcoes;
    ops.push({ tipo: 'texto', texto: conteudo, x: pt(x), y: pt(y), tamanho, peso, cor, valor });
  }

  function escreverCentro(ops, conteudo, centro, y, tamanho, opcoes = {}) {
    const metade = largura(conteudo, opcoes.peso || 'medio', tamanho) / 2;
    ops.push({
      tipo: 'texto',
      texto: conteudo,
      x: pt(centro) - metade,
      y: pt(y),
      tamanho,
      peso: opcoes.peso || 'medio',
      cor: opcoes.cor || COR.grafite,
      valor: Boolean(opcoes.valor),
    });
  }

  function traco(ops, x1, y1, x2, y2, espessura, cor, extra = {}) {
    ops.push({ tipo: 'linha', x1: pt(x1), y1: pt(y1), x2: pt(x2), y2: pt(y2), espessura: pt(espessura), cor, ...extra });
  }

  /* Retangulo com um raio por canto: superior esquerdo, superior direito, inferior direito, inferior esquerdo. */
  function caminhoRetangulo(x, y, l, a, raios) {
    const [x0, y0, x1, y1] = [pt(x), pt(y), pt(x + l), pt(y + a)];
    const [re, rd, id, ie] = raios.map(pt);
    const k = 0.4477;
    return [
      `M ${n(x0 + re)} ${n(y0)}`,
      `L ${n(x1 - rd)} ${n(y0)}`,
      `C ${n(x1 - rd * k)} ${n(y0)} ${n(x1)} ${n(y0 + rd * k)} ${n(x1)} ${n(y0 + rd)}`,
      `L ${n(x1)} ${n(y1 - id)}`,
      `C ${n(x1)} ${n(y1 - id * k)} ${n(x1 - id * k)} ${n(y1)} ${n(x1 - id)} ${n(y1)}`,
      `L ${n(x0 + ie)} ${n(y1)}`,
      `C ${n(x0 + ie * k)} ${n(y1)} ${n(x0)} ${n(y1 - ie * k)} ${n(x0)} ${n(y1 - ie)}`,
      `L ${n(x0)} ${n(y0 + re)}`,
      `C ${n(x0)} ${n(y0 + re * k)} ${n(x0 + re * k)} ${n(y0)} ${n(x0 + re)} ${n(y0)}`,
      'Z',
    ].join(' ');
  }

  function retangulo(ops, x, y, l, a, raio, estilo) {
    const raios = Array.isArray(raio) ? raio : [raio, raio, raio, raio];
    ops.push({
      tipo: 'forma',
      d: caminhoRetangulo(x, y, l, a, raios),
      fundo: estilo.fundo,
      borda: estilo.borda,
      espessura: estilo.espessura ? pt(estilo.espessura) : undefined,
      valor: Boolean(estilo.valor),
    });
  }

  const circulo = (ops, cx, cy, r, estilo) => retangulo(ops, cx - r, cy - r, r * 2, r * 2, r, estilo);

  /* Blocos do formulario */

  const RAIO = 1.6;
  const BORDA_GRADE = 0.3;
  const BORDA_CELULA = 0.2;

  const contornoGrade = (ops, x, y, l, a) =>
    retangulo(ops, x, y, l, a, RAIO, { borda: COR.grafite, espessura: BORDA_GRADE });

  const divisoria = (ops, x1, y1, x2, y2) => traco(ops, x1, y1, x2, y2, BORDA_CELULA, COR.linha);

  const rotulo = (ops, conteudo, x, y) =>
    escrever(ops, conteudo, x + 2, y + 4, 8.3, { cor: COR.suave });

  /* Escreve o valor na base da celula e reduz a letra se preciso. Se nem assim couber, avisa. */
  function valorCelula(ops, conteudo, celula, nome, estouros, tamanho = 11, base = 2.6) {
    if (!conteudo) return;
    const maximo = pt(celula.l - 4);
    let medida = tamanho;
    while (medida > 7.5 && largura(conteudo, 'medio', medida) > maximo) medida -= 0.25;
    if (largura(conteudo, 'medio', medida) > maximo) estouros.push(nome);
    escrever(ops, conteudo, celula.x + 2, celula.y + celula.a - base, medida, { valor: true });
  }

  function barrasData(ops, celula) {
    const util = celula.l - 4;
    for (const parte of [0.28, 0.58]) {
      escrever(ops, '/', celula.x + 2 + util * parte, celula.y + celula.a - 1.9, 12, { cor: COR.linha });
    }
  }

  function campoData(ops, conteudo, celula, nome, estouros) {
    if (conteudo) valorCelula(ops, conteudo, celula, nome, estouros);
    else barrasData(ops, celula);
  }

  function caixaNumero(ops, y, altura, numero, tamanho, base) {
    const x = 158;
    const l = 38;
    retangulo(ops, x, y, l, altura, RAIO, { borda: COR.grafite, espessura: 0.45 });
    escrever(ops, 'Nº', x + 2.2, y + 3.9, 8.3, { peso: 'negrito' });
    if (numero) escreverCentro(ops, numero, x + l / 2, y + base, tamanho, { peso: 'extra', valor: true });
  }

  function campoValor(ops, valorTexto, x, y, l, a, raios) {
    retangulo(ops, x, y, l, a, raios, { fundo: COR.painel });
    rotulo(ops, 'Valor do serviço', x, y);
    const base = y + a - 2;
    escrever(ops, 'R$', x + 2, base, 11, { peso: 'negrito' });
    if (valorTexto) escrever(ops, valorTexto, x + 9, base, 12, { peso: 'negrito', valor: true });
  }

  function cabecalho(ops, d) {
    ops.push({ tipo: 'logo', x: pt(ESQUERDA), y: pt(11.2), largura: pt(47), altura: pt(47 * LOGO_PROPORCAO) });
    escrever(ops, 'Ordem de serviço', 68, 17.6, 21, { peso: 'extra' });
    escrever(ops, LOJA.endereco, 68, 23, 8.3, { cor: COR.suave });
    escrever(ops, LOJA.telefone, 68, 27.2, 8.3, { cor: COR.suave });
    escrever(ops, LOJA.cnpj, 68 + (largura(LOJA.telefone, 'medio', 8.3) * 25.4) / 72 + 3.5, 27.2, 8.3, { cor: COR.suave });
    caixaNumero(ops, 11.7, 15.8, d.numero, 17, 12.6);
    traco(ops, ESQUERDA, 32.5, DIREITA, 32.5, 0.7, COR.grafite);
  }

  function blocoCliente(ops, d, estouros) {
    const y = 43.2;
    const a = 13.4;
    const corte = 148;
    escrever(ops, 'Cliente', ESQUERDA, 40.6, 11, { peso: 'negrito' });

    divisoria(ops, ESQUERDA, y + a, DIREITA, y + a);
    divisoria(ops, corte, y, corte, y + a * 2);
    contornoGrade(ops, ESQUERDA, y, DIREITA - ESQUERDA, a * 2);

    rotulo(ops, 'Nome', ESQUERDA, y);
    rotulo(ops, 'CPF', corte, y);
    rotulo(ops, 'Telefone para contato', ESQUERDA, y + a);
    rotulo(ops, 'Data de entrada', corte, y + a);

    valorCelula(ops, d.nome, { x: ESQUERDA, y, l: corte - ESQUERDA, a }, 'nome', estouros);
    valorCelula(ops, d.cpf, { x: corte, y, l: DIREITA - corte, a }, 'CPF', estouros);
    valorCelula(ops, d.telefone, { x: ESQUERDA, y: y + a, l: corte - ESQUERDA, a }, 'telefone', estouros);
    campoData(ops, d.dataTexto, { x: corte, y: y + a, l: DIREITA - corte, a }, 'data de entrada', estouros);
  }

  function blocoAparelho(ops, d, estouros) {
    const y = 81;
    const a = 13.4;
    const fim = 155;
    const [cor, senha] = [83, 119];
    const [sim, nao, nota] = [68, 83, 98];
    const pergunta = 11;
    const total = a + pergunta * d.perguntas.length;

    escrever(ops, 'Aparelho', ESQUERDA, 78.7, 11, { peso: 'negrito' });

    divisoria(ops, cor, y, cor, y + a);
    divisoria(ops, senha, y, senha, y + a);
    divisoria(ops, sim, y + a, sim, y + total);
    divisoria(ops, nota, y + a, nota, y + total);
    for (let i = 0; i < d.perguntas.length; i++) {
      divisoria(ops, ESQUERDA, y + a + pergunta * i, fim, y + a + pergunta * i);
    }
    contornoGrade(ops, ESQUERDA, y, fim - ESQUERDA, total);

    rotulo(ops, 'Modelo do aparelho', ESQUERDA, y);
    rotulo(ops, 'Cor', cor, y);
    rotulo(ops, 'Senha', senha, y);
    valorCelula(ops, d.modelo, { x: ESQUERDA, y, l: cor - ESQUERDA, a }, 'modelo', estouros);
    valorCelula(ops, d.cor, { x: cor, y, l: senha - cor, a }, 'cor', estouros);
    valorCelula(ops, d.senha, { x: senha, y, l: fim - senha, a }, 'senha', estouros);

    d.perguntas.forEach((item, i) => {
      const topo = y + a + pergunta * i;
      escrever(ops, item.texto, ESQUERDA + 2, topo + 6.9, 10);
      marcar(ops, sim + 2, topo + 3.7, 'Sim', item.resposta === 'sim');
      marcar(ops, nao + 2, topo + 3.7, 'Não', item.resposta === 'nao');
      if (item.rotuloNota) rotulo(ops, item.rotuloNota, nota, topo);
      /* Sem rotulo, a anotacao fica na mesma linha da pergunta. */
      const base = item.rotuloNota ? 2.3 : pergunta - 6.9;
      valorCelula(ops, item.nota, { x: nota, y: topo, l: fim - nota, a: pergunta }, item.nome, estouros, 10, base);
    });
  }

  function marcar(ops, x, y, texto, marcada) {
    const lado = 3.6;
    retangulo(ops, x, y, lado, lado, 0.5, { borda: COR.grafite, espessura: 0.3 });
    if (marcada) {
      const folga = 0.75;
      traco(ops, x + folga, y + folga, x + lado - folga, y + lado - folga, 0.5, COR.grafite, { valor: true, redondo: true });
      traco(ops, x + lado - folga, y + folga, x + folga, y + lado - folga, 0.5, COR.grafite, { valor: true, redondo: true });
    }
    escrever(ops, texto, x + 4.8, y + 2.95, 9.5);
  }

  const pontoPadrao = (indice) => ({
    x: 169.9 + 8.6 * (indice % 3),
    y: 95.6 + 10.4 * Math.floor(indice / 3),
  });

  function blocoCelular(ops, padrao) {
    const [x, y, l, a] = [161, 75.3, 35, 63.1];
    const botao = (bx, by, altura, raios) =>
      retangulo(ops, bx, by, 0.7, altura, raios, { fundo: COR.grafite });

    botao(x - 0.95, y + 13, 3.4, [0.3, 0, 0, 0.3]);
    botao(x - 0.95, y + 19, 6, [0.3, 0, 0, 0.3]);
    botao(x - 0.95, y + 26.4, 6, [0.3, 0, 0, 0.3]);
    botao(x + l + 0.25, y + 17, 10, [0, 0.3, 0.3, 0]);
    retangulo(ops, x, y, l, a, 6, { borda: COR.grafite, espessura: 0.55 });
    retangulo(ops, x + l / 2 - 5, y + 2.6, 10, 2.4, 1.2, { fundo: COR.grafite });

    for (let i = 1; i < padrao.length; i++) {
      const de = pontoPadrao(padrao[i - 1]);
      const ate = pontoPadrao(padrao[i]);
      traco(ops, de.x, de.y, ate.x, ate.y, 0.8, COR.grafite, { valor: true, redondo: true });
    }
    for (let i = 0; i < 9; i++) {
      const p = pontoPadrao(i);
      circulo(ops, p.x, p.y, 1.45, { fundo: COR.grafite });
    }
    if (padrao.length) {
      const inicio = pontoPadrao(padrao[0]);
      circulo(ops, inicio.x, inicio.y, 2.5, { borda: COR.grafite, espessura: 0.4, valor: true });
    }
    /* O fundo branco mantem o numero legivel quando a linha do desenho passa por ali. */
    padrao.forEach((indice, ordem) => {
      const p = pontoPadrao(indice);
      const [nx, ny] = [p.x + 3, p.y - 2.9];
      circulo(ops, nx, ny, 1.55, { fundo: COR.branco });
      escreverCentro(ops, String(ordem + 1), nx, ny + 0.95, 7.5, { peso: 'extra', valor: true });
    });

    escreverCentro(ops, 'Padrão de', x + l / 2, 131, 8.3, { cor: COR.suave });
    escreverCentro(ops, 'desbloqueio', x + l / 2, 134.6, 8.3, { cor: COR.suave });
  }

  function campoPautado(ops, conteudo, titulo, x, l, y, nome, estouros) {
    const primeira = y + 11.9;
    const passo = 7.4;
    rotulo(ops, titulo, x, y);
    for (let i = 0; i < LINHAS_SERVICO - 1; i++) {
      traco(ops, x + 2, primeira + passo * i, x + l - 2, primeira + passo * i, BORDA_CELULA, COR.aluminio);
    }
    const linhas = quebrar(conteudo, 'medio', 10, pt(l - 4));
    if (linhas.length > LINHAS_SERVICO) estouros.push(nome);
    linhas.slice(0, LINHAS_SERVICO).forEach((linha, i) => {
      if (linha) escrever(ops, linha, x + 2, primeira - 1.5 + passo * i, 10, { valor: true });
    });
  }

  function blocoServico(ops, d, estouros) {
    const y = 149.5;
    const a = 41.6;
    const meio = 105;
    escrever(ops, 'Serviço', ESQUERDA, 147.2, 11, { peso: 'negrito' });
    divisoria(ops, meio, y, meio, y + a);
    contornoGrade(ops, ESQUERDA, y, DIREITA - ESQUERDA, a);
    campoPautado(ops, d.servicos, 'Serviços', ESQUERDA, meio - ESQUERDA, y, 'serviços', estouros);
    campoPautado(ops, d.observacoes, 'Observações', meio, DIREITA - meio, y, 'observações', estouros);
  }

  function blocoAceite(ops, d) {
    const y = 201.4;
    const a = 16;
    const [assina, valor] = [58, 152];
    escrever(ops, 'Concordo com os termos descritos acima.', ESQUERDA, 199, 10);
    campoValor(ops, d.valorTexto, valor, y, DIREITA - valor, a, [0, RAIO, RAIO, 0]);
    divisoria(ops, assina, y, assina, y + a);
    divisoria(ops, valor, y, valor, y + a);
    contornoGrade(ops, ESQUERDA, y, DIREITA - ESQUERDA, a);
    rotulo(ops, 'Data', ESQUERDA, y);
    /* A data da assinatura fica sempre em branco, para nao antedatar. */
    barrasData(ops, { x: ESQUERDA, y, l: assina - ESQUERDA, a });
    rotulo(ops, 'Assinatura do responsável', assina, y);
    if (d.assinaturaCliente) {
      ops.push({ tipo: 'assinatura', x: pt(assina + 2), y: pt(y + 4.5), largura: pt(valor - assina - 4), altura: pt(a - 6), dados: d.assinaturaCliente });
    }
  }

  function linhaCorte(ops) {
    const y = 225;
    traco(ops, -1, y, 211, y, 0.35, COR.grafite, { tracejado: [3.2, 2.4] });

    retangulo(ops, 12.9, y - 2.8, 5.6, 5.6, 0, { fundo: COR.branco });
    const escala = 4.6 / 24;
    const px = (v) => 13.4 + v * escala;
    const py = (v) => y - 2.3 + v * escala;
    const estilo = { borda: COR.grafite, espessura: 0.35 };
    circulo(ops, px(6), py(6), 3 * escala, estilo);
    circulo(ops, px(6), py(18), 3 * escala, estilo);
    traco(ops, px(20), py(4), px(8.12), py(15.88), 0.35, COR.grafite, { redondo: true });
    traco(ops, px(14.47), py(14.48), px(20), py(20), 0.35, COR.grafite, { redondo: true });
    traco(ops, px(8.12), py(8.12), px(12), py(12), 0.35, COR.grafite, { redondo: true });

    const texto = 'Corte aqui';
    const meia = (largura(texto, 'medio', 8.3) * 25.4) / 72 / 2 + 2.5;
    retangulo(ops, 105 - meia, y - 2, meia * 2, 4, 0, { fundo: COR.branco });
    escreverCentro(ops, texto, 105, y + 1, 8.3, { cor: COR.suave });
  }

  /* O canhoto repete o servico em uma frase so; se nao couber, sai resumido. */
  function servicoCanhoto(texto, maximo) {
    const corrido = texto
      .split('\n')
      .map((linha) => linha.trim())
      .filter(Boolean)
      .map((linha, i, todas) => (i < todas.length - 1 && !/[.,;:!?]$/.test(linha) ? `${linha},` : linha))
      .join(' ');
    const linhas = quebrar(corrido, 'medio', 9.5, maximo);
    if (linhas.length <= LINHAS_CANHOTO) return { linhas, resumido: false };
    const curtas = linhas.slice(0, LINHAS_CANHOTO);
    curtas[LINHAS_CANHOTO - 1] = encurtar(curtas[LINHAS_CANHOTO - 1], 'medio', 9.5, maximo);
    return { linhas: curtas, resumido: true };
  }

  function canhoto(ops, d, estouros) {
    const y = 245.2;
    const a = 13.4;
    const b = 14;
    const [cor, data, assina] = [104, 152, 58];
    const total = a + b * 2;

    ops.push({ tipo: 'logo', x: pt(ESQUERDA), y: pt(230.4), largura: pt(34), altura: pt(34 * LOGO_PROPORCAO) });
    escrever(ops, 'Ordem de serviço', 54, 234, 13, { peso: 'extra' });
    escrever(ops, LOJA.endereco, 54, 237.6, 8.3, { cor: COR.suave });
    escrever(ops, LOJA.telefone, 54, 241, 8.3, { cor: COR.suave });
    escrever(ops, LOJA.cnpj, 54 + (largura(LOJA.telefone, 'medio', 8.3) * 25.4) / 72 + 3.5, 241, 8.3, { cor: COR.suave });
    caixaNumero(ops, 230.6, 11.5, d.numero, 13, 9);

    campoValor(ops, d.valorTexto, ESQUERDA, y + a + b, assina - ESQUERDA, b, [0, 0, 0, RAIO]);
    divisoria(ops, cor, y, cor, y + a);
    divisoria(ops, data, y, data, y + a);
    divisoria(ops, ESQUERDA, y + a, DIREITA, y + a);
    divisoria(ops, ESQUERDA, y + a + b, DIREITA, y + a + b);
    divisoria(ops, assina, y + a + b, assina, y + total);
    contornoGrade(ops, ESQUERDA, y, DIREITA - ESQUERDA, total);

    rotulo(ops, 'Modelo', ESQUERDA, y);
    rotulo(ops, 'Cor', cor, y);
    rotulo(ops, 'Data', data, y);
    rotulo(ops, 'Serviço', ESQUERDA, y + a);
    rotulo(ops, 'Assinatura do técnico', assina, y + a + b);
    if (d.assinaturaTecnico) {
      ops.push({ tipo: 'assinatura', x: pt(assina + 2), y: pt(y + a + b + 4.5), largura: pt(DIREITA - assina - 4), altura: pt(b - 6), dados: d.assinaturaTecnico });
    }

    valorCelula(ops, d.modelo, { x: ESQUERDA, y, l: cor - ESQUERDA, a }, 'modelo', estouros);
    valorCelula(ops, d.cor, { x: cor, y, l: data - cor, a }, 'cor', estouros);
    campoData(ops, d.dataTexto, { x: data, y, l: DIREITA - data, a }, 'data de entrada', estouros);

    const servico = servicoCanhoto(d.servicos, pt(DIREITA - ESQUERDA - 4));
    servico.linhas.forEach((linha, i) => {
      escrever(ops, linha, ESQUERDA + 2, y + a + 8.6 + i * 3.9, 9.5, { valor: true });
    });
    return servico.resumido;
  }

  function montar(d) {
    const ops = [];
    const estouros = [];
    cabecalho(ops, d);
    blocoCliente(ops, d, estouros);
    blocoAparelho(ops, d, estouros);
    blocoCelular(ops, d.padrao);
    blocoServico(ops, d, estouros);
    blocoAceite(ops, d);
    linhaCorte(ops);
    const resumido = canhoto(ops, d, estouros);
    return { folhas: [{ ops }], estouros: [...new Set(estouros)], resumido };
  }

  global.OrdemServico = { FOLHA, COR, foraDaFonte, montar };
})(window);
