// Gerador de ZIP mínimo, sem dependências, para rodar no navegador.
// Método STORE (sem compressão): fotos e PDFs já vêm comprimidos, e o que
// importa aqui é integridade — os bytes de cada comprovante saem idênticos
// aos que foram guardados (mesmo SHA-256).
//
// Formato: PKZIP clássico (local headers + central directory + EOCD),
// nomes em UTF-8 (flag bit 11). Sem ZIP64: limite prático ~4 GB, muito acima
// do que um acervo de despesas ocupa.

export interface EntradaZip {
  /** caminho dentro do zip, com "/" como separador. Ex.: "comprovantes/a.jpg" */
  nome: string;
  dados: Uint8Array;
  /** data de modificação gravada no zip (padrão: agora) */
  data?: Date;
}

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDataHora(d: Date): { data: number; hora: number } {
  const ano = Math.max(1980, d.getFullYear());
  const data = ((ano - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  return { data, hora };
}

export function montarZip(entradas: EntradaZip[]): Blob {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const e of entradas) {
    const nome = enc.encode(e.nome);
    const { data, hora } = dosDataHora(e.data ?? new Date());
    const crc = crc32(e.dados);
    const tam = e.dados.length;

    // --- local file header (30 bytes + nome) ---
    const lfh = new DataView(new ArrayBuffer(30));
    lfh.setUint32(0, 0x04034b50, true);
    lfh.setUint16(4, 20, true); // versão necessária: 2.0
    lfh.setUint16(6, 0x0800, true); // flags: nomes UTF-8
    lfh.setUint16(8, 0, true); // método: STORE
    lfh.setUint16(10, hora, true);
    lfh.setUint16(12, data, true);
    lfh.setUint32(14, crc, true);
    lfh.setUint32(18, tam, true);
    lfh.setUint32(22, tam, true);
    lfh.setUint16(26, nome.length, true);
    lfh.setUint16(28, 0, true);
    partes.push(new Uint8Array(lfh.buffer), nome, e.dados);

    // --- central directory entry (46 bytes + nome) ---
    const cdh = new DataView(new ArrayBuffer(46));
    cdh.setUint32(0, 0x02014b50, true);
    cdh.setUint16(4, 20, true); // feito por
    cdh.setUint16(6, 20, true); // necessário
    cdh.setUint16(8, 0x0800, true);
    cdh.setUint16(10, 0, true);
    cdh.setUint16(12, hora, true);
    cdh.setUint16(14, data, true);
    cdh.setUint32(16, crc, true);
    cdh.setUint32(20, tam, true);
    cdh.setUint32(24, tam, true);
    cdh.setUint16(28, nome.length, true);
    cdh.setUint16(30, 0, true); // extra
    cdh.setUint16(32, 0, true); // comentário
    cdh.setUint16(34, 0, true); // disco
    cdh.setUint16(36, 0, true); // atributos internos
    cdh.setUint32(38, 0, true); // atributos externos
    cdh.setUint32(42, offset, true); // offset do local header
    central.push(new Uint8Array(cdh.buffer), nome);

    offset += 30 + nome.length + tam;
  }

  const tamCentral = central.reduce((s, p) => s + p.length, 0);

  // --- end of central directory (22 bytes) ---
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(4, 0, true);
  eocd.setUint16(6, 0, true);
  eocd.setUint16(8, entradas.length, true);
  eocd.setUint16(10, entradas.length, true);
  eocd.setUint32(12, tamCentral, true);
  eocd.setUint32(16, offset, true);
  eocd.setUint16(20, 0, true);

  return new Blob([...partes, ...central, new Uint8Array(eocd.buffer)] as BlobPart[], { type: "application/zip" });
}
