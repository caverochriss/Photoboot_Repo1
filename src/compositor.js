const PHOTO_WIDTH = 700;
const PHOTO_HEIGHT = 525;
const MARGIN = 56;
const GAP = 20;

const layouts = {
  single: { columns: 1, rows: 1 },
  'strip-3': { columns: 1, rows: 3 },
  'strip-4': { columns: 1, rows: 4 },
  'grid-2x2': { columns: 2, rows: 2 },
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo cargar una de las fotografías.'));
    image.src = src;
  });
}

function drawCover(context, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  const cropX = (image.width - cropWidth) / 2;
  const cropY = (image.height - cropHeight) / 2;
  context.drawImage(image, cropX, cropY, cropWidth, cropHeight, x, y, width, height);
}

export async function createComposition(photos, layoutName, backgroundColor) {
  if (!photos.length) throw new Error('Haz al menos una fotografía antes de generar la tira.');
  const layout = layouts[layoutName] ?? layouts.single;
  const columns = layoutName === 'grid-2x2' ? Math.min(2, photos.length) : layout.columns;
  const rows = layoutName === 'grid-2x2' ? Math.ceil(photos.length / 2) : Math.min(layout.rows, photos.length);
  const canvas = document.createElement('canvas');
  canvas.width = MARGIN * 2 + columns * PHOTO_WIDTH + (columns - 1) * GAP;
  canvas.height = MARGIN * 2 + rows * PHOTO_HEIGHT + (rows - 1) * GAP + 48;

  const context = canvas.getContext('2d');
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const capacity = layout.rows * layout.columns;
  const selectedPhotos = photos.slice(-capacity);
  const images = await Promise.all(selectedPhotos.map((photo) => loadImage(photo.src)));
  images.forEach((image, index) => {
    const column = layoutName === 'grid-2x2' ? index % 2 : 0;
    const row = layoutName === 'grid-2x2' ? Math.floor(index / 2) : index;
    const x = MARGIN + column * (PHOTO_WIDTH + GAP);
    const y = MARGIN + row * (PHOTO_HEIGHT + GAP);
    context.fillStyle = 'rgba(30, 30, 25, 0.12)';
    context.fillRect(x - 5, y - 5, PHOTO_WIDTH + 10, PHOTO_HEIGHT + 10);
    drawCover(context, image, x, y, PHOTO_WIDTH, PHOTO_HEIGHT);
  });

  context.fillStyle = backgroundColor === '#252623' ? '#e9e7dc' : '#282a25';
  context.font = '500 18px sans-serif';
  context.textAlign = 'center';
  context.fillText('PHOTOBOOTH  ·  STUDIO 01', canvas.width / 2, canvas.height - 20);
  return canvas.toDataURL('image/png');
}
