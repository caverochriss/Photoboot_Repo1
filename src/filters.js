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
