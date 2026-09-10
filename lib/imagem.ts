/**
 * Reduz a imagem só para a LEITURA automática (menos bytes, resposta mais
 * rápida). O arquivo guardado no cofre e o hash continuam sendo os originais.
 */
export async function reduzirParaLeitura(
  arquivo: File,
  maxLado = 1280,
  qualidade = 0.82,
): Promise<{ base64: string; mime: string } | null> {
  if (!arquivo.type.startsWith("image/")) return null;

  const bitmap = await carregarImagem(arquivo);
  if (!bitmap) return null;

  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * escala));
  const h = Math.max(1, Math.round(bitmap.height * escala));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, w, h);
  if ("close" in bitmap && typeof (bitmap as ImageBitmap).close === "function") {
    (bitmap as ImageBitmap).close();
  }

  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", qualidade));
  if (!blob) return null;

  const buf = await blob.arrayBuffer();
  return { base64: arrayBufferParaBase64(buf), mime: "image/jpeg" };
}

async function carregarImagem(arquivo: File): Promise<ImageBitmap | HTMLImageElement | null> {
  try {
    if ("createImageBitmap" in window) {
      // respeita a orientação EXIF na maioria dos navegadores modernos
      return await createImageBitmap(arquivo, { imageOrientation: "from-image" } as ImageBitmapOptions);
    }
  } catch {
    /* cai para o caminho com <img> */
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function arrayBufferParaBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) {
    bin += String.fromCharCode(...bytes.subarray(i, i + passo));
  }
  return btoa(bin);
}
