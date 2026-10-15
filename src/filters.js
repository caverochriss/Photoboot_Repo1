export const FILTERS = {
  original: 'none',
  mono: 'grayscale(1)',
  sepia: 'sepia(0.9)',
  vintage: 'sepia(0.45) saturate(0.78) contrast(0.92)',
  contrast: 'contrast(1.45) saturate(1.1)',
  warm: 'sepia(0.2) saturate(1.35) hue-rotate(-8deg)',
  cool: 'saturate(0.85) hue-rotate(12deg) brightness(1.04)',
};

export function applyVideoFilter(video, filter) {
  video.dataset.filter = filter;
}

export function captureFilteredFrame(video, filter, mirror = false) {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) throw new Error('La cámara todavía está preparando la imagen. Inténtalo de nuevo.');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.filter = FILTERS[filter] ?? FILTERS.original;
  if (mirror) {
    context.translate(width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.92);
}

export function captureDuoFrame(localVideo, partnerVideo, filter, mirrorLocal = false) {
  if (!localVideo.videoWidth || !localVideo.videoHeight || !partnerVideo.videoWidth || !partnerVideo.videoHeight) {
    throw new Error('Las dos cámaras todavía no están listas. Espera un momento e inténtalo de nuevo.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1400;
  // Dos paneles cuadrados unidos: el lienzo final queda en formato apaisado 2:1.
  canvas.height = 700;
  const context = canvas.getContext('2d');
  const gutter = 1;
  const panelWidth = (canvas.width - gutter) / 2;
  const panelHeight = canvas.height;

  const drawPanel = (video, x, mirror) => {
    const scale = Math.max(panelWidth / video.videoWidth, panelHeight / video.videoHeight);
    const cropWidth = panelWidth / scale;
    const cropHeight = panelHeight / scale;
    const cropX = (video.videoWidth - cropWidth) / 2;
    const cropY = (video.videoHeight - cropHeight) / 2;
    context.save();
    context.filter = FILTERS[filter] ?? FILTERS.original;
    if (mirror) {
      context.translate(x + panelWidth, 0);
      context.scale(-1, 1);
      context.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, panelWidth, panelHeight);
    } else {
      context.drawImage(video, cropX, cropY, cropWidth, cropHeight, x, 0, panelWidth, panelHeight);
    }
    context.restore();
  };

  drawPanel(localVideo, 0, mirrorLocal);
  drawPanel(partnerVideo, panelWidth + gutter, true);
  context.fillStyle = '#ffffff';
  context.fillRect(panelWidth, 0, gutter, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.92);
}
