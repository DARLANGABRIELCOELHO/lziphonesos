/* Transforma a folha diagramada em os.js num arquivo PDF. Nao usa a impressao do
   navegador, que muda papel e margens conforme o aparelho. */
(function (global) {
  'use strict';

  const scripts = {};

  function carregarScript(src) {
    if (!scripts[src]) {
      scripts[src] = new Promise((resolve, reject) => {
        const tag = document.createElement('script');
        tag.src = src;
        tag.onload = resolve;
        tag.onerror = () => reject(new Error(`Não foi possível carregar ${src}`));
        document.head.appendChild(tag);
      });
    }
    return scripts[src];
  }

  const preparar = () =>
    Promise.all([
      carregarScript('vendor/pdf-lib.min.js'),
      carregarScript('vendor/fontkit.umd.min.js'),
      carregarScript('vendor/recursos-pdf.js'),
    ]);

  function base64ParaBytes(texto) {
    const binario = atob(texto);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return bytes;
  }

  function corPdf(hex) {
    const { rgb } = global.PDFLib;
    const canal = (inicio) => parseInt(hex.slice(inicio, inicio + 2), 16) / 255;
    return rgb(canal(1), canal(3), canal(5));
  }

  function desenharFolha(pdf, folha, recursos) {
    const { LineCapStyle } = global.PDFLib;
    const { largura, altura } = global.OrdemServico.FOLHA;
    const pagina = pdf.addPage([largura, altura]);
    const y = (valor) => altura - valor;

    for (const op of folha.ops) {
      if (op.tipo === 'texto') {
        pagina.drawText(op.texto, {
          x: op.x,
          y: y(op.y),
          size: op.tamanho,
          font: recursos[op.peso],
          color: corPdf(op.cor),
        });
      } else if (op.tipo === 'linha') {
        pagina.drawLine({
          start: { x: op.x1, y: y(op.y1) },
          end: { x: op.x2, y: y(op.y2) },
          thickness: op.espessura,
          color: corPdf(op.cor),
          dashArray: op.tracejado,
          lineCap: op.redondo ? LineCapStyle.Round : undefined,
        });
      } else if (op.tipo === 'forma') {
        /* drawSvgPath ja inverte o eixo y a partir do ponto dado. */
        pagina.drawSvgPath(op.d, {
          x: 0,
          y: altura,
          color: op.fundo ? corPdf(op.fundo) : undefined,
          borderColor: op.borda ? corPdf(op.borda) : undefined,
          borderWidth: op.borda ? op.espessura : 0,
        });
      } else if (op.tipo === 'logo') {
        pagina.drawImage(recursos.logo, {
          x: op.x,
          y: y(op.y + op.altura),
          width: op.largura,
          height: op.altura,
        });
      } else if (op.tipo === 'assinatura') {
        const imagem = recursos.assinaturas.get(op.dados);
        if (imagem) {
          const medida = imagem.scaleToFit(op.largura, op.altura);
          pagina.drawImage(imagem, {
            x: op.x + (op.largura - medida.width) / 2,
            y: y(op.y + op.altura) + (op.altura - medida.height) / 2,
            width: medida.width,
            height: medida.height,
          });
        }
      }
    }
  }

  function dataUrlParaBytes(url) {
    return base64ParaBytes(url.slice(url.indexOf(',') + 1));
  }

  /* Incorpora cada assinatura uma vez. Imagem inválida deixa a linha em branco, sem travar o PDF. */
  async function embutirAssinaturas(pdf, documento) {
    const mapa = new Map();
    for (const folha of documento.folhas) {
      for (const op of folha.ops) {
        if (op.tipo !== 'assinatura' || mapa.has(op.dados)) continue;
        try {
          mapa.set(op.dados, await pdf.embedPng(dataUrlParaBytes(op.dados)));
        } catch (erro) {
          /* Sem imagem: a linha sai em branco para assinar à caneta. */
        }
      }
    }
    return mapa;
  }

  async function montar(documento, titulo) {
    await preparar();

    const { PDFDocument } = global.PDFLib;
    const dados = global.RecursosPdf;
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(global.fontkit);
    pdf.setTitle(titulo);
    pdf.setAuthor('LZ iPhones');
    pdf.setCreator('Gerador de OS LZ iPhones');
    pdf.setLanguage('pt-BR');

    /* Sem ligaduras: a largura de cada letra precisa bater com metricas.js. */
    const fonte = (bytes) =>
      pdf.embedFont(base64ParaBytes(bytes), { features: { liga: false, clig: false, calt: false } });

    const recursos = {
      medio: await fonte(dados.medio),
      negrito: await fonte(dados.negrito),
      extra: await fonte(dados.extra),
      logo: await pdf.embedPng(base64ParaBytes(dados.logo)),
    };

    recursos.assinaturas = await embutirAssinaturas(pdf, documento);
    documento.folhas.forEach((folha) => desenharFolha(pdf, folha, recursos));
    return pdf.save();
  }

  function baixar(bytes, nomeArquivo) {
    const arquivo = new Blob([bytes], { type: 'application/pdf' });
    const endereco = URL.createObjectURL(arquivo);
    const link = document.createElement('a');
    link.href = endereco;
    link.download = `${nomeArquivo}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(endereco), 60000);
  }

  global.PdfOs = { preparar, montar, baixar };
})(window);
