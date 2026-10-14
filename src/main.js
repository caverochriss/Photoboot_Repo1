import { CameraController } from './camera.js';
import { createComposition } from './compositor.js';
import { applyVideoFilter, captureFilteredFrame } from './filters.js';
import { SharedCameraView } from './shared-camera-view.js';
import { getSupabaseClient, PHOTO_BUCKET, SUPABASE_CONFIGURED } from './supabase-client.js';

const filterLabels = {
  original: 'Original',
  mono: 'Blanco y negro',
  sepia: 'Sepia',
  vintage: 'Vintage',
  contrast: 'Contraste',
  warm: 'Cálido',
  cool: 'Frío',
};
const layoutLabels = { single: 'Una foto', 'strip-3': 'Tira corta', 'strip-4': 'Tira clásica', 'grid-2x2': 'Cuadrícula' };
const layoutLimits = { single: 1, 'strip-3': 3, 'strip-4': 4, 'grid-2x2': 4 };
const state = { filter: 'original', layout: 'single', photos: [], timerEnabled: false, countdownToken: 0, user: null, album: null };

const byId = (id) => document.getElementById(id);
const toast = byId('toast');
const filterNote = byId('filter-note');
const layoutNote = byId('layout-note');
const cameraStage = byId('camera-stage');
const cameraVideo = byId('camera-video');
const startButton = byId('start-button');
const cameraNote = byId('camera-note');
const captureButton = byId('capture-button');
const timerButton = byId('timer-button');
const switchCameraButton = byId('switch-camera-button');
const stopCameraButton = byId('stop-camera-button');
const countdownOverlay = byId('countdown-overlay');
const filmEffect = byId('film-effect');
const photoCount = byId('photo-count');
const photoGallery = byId('photo-gallery');
const memorySection = document.querySelector('.memory-section');
const generateButton = byId('generate-button');
const downloadComposition = byId('download-composition');
const compositionPreview = byId('composition-preview');
const compositionPreviewWrap = byId('composition-preview-wrap');
const paperColor = byId('paper-color');
const authDialog = byId('auth-dialog');
const authOpen = byId('auth-open');
const authLogout = byId('auth-logout');
const accountLabel = byId('account-label');
const authForm = byId('auth-form');
const authFeedback = byId('auth-feedback');
const authEmail = byId('auth-email');
const authPassword = byId('auth-password');
const displayName = byId('display-name');
const displayNameWrap = byId('display-name-wrap');
const authSubmit = byId('auth-submit');
const albumPanel = byId('shared-album');
const albumSetup = byId('album-setup');
const albumActive = byId('album-active');
const albumDescription = byId('album-description');
const albumMessage = byId('album-message');
const albumPresence = byId('album-presence');
const partnerCameraView = new SharedCameraView({
  elements: {
    panel: byId('partner-call-panel'),
    stage: byId('partner-camera-stage'),
    video: byId('partner-video'),
    note: byId('partner-note'),
    label: byId('partner-camera-label'),
    status: byId('partner-call-status'),
    select: byId('partner-select'),
    startButton: byId('start-partner-call'),
    endButton: byId('end-partner-call'),
    incoming: byId('incoming-call'),
    incomingCaller: byId('incoming-caller'),
    acceptButton: byId('accept-incoming-call'),
    rejectButton: byId('reject-incoming-call'),
  },
  async ensureLocalStream() {
    if (!camera.stream) await camera.start();
    applyVideoFilter(cameraVideo, state.filter);
    return camera.stream;
  },
});

let supabase = null;
let authMode = 'login';
let albumChannel = null;

const camera = new CameraController(cameraVideo, {
  onStatus(status) {
    const isActive = status === 'active';
    cameraStage.classList.toggle('is-live', isActive);
    cameraStage.classList.toggle('is-environment', camera.facingMode === 'environment');
    [captureButton, timerButton, switchCameraButton, stopCameraButton].forEach((button) => {
      button.disabled = !isActive;
    });
    if (status === 'requesting') cameraNote.textContent = 'Solicitando permiso para usar la cámara…';
    if (status === 'active') {
      cameraNote.textContent = 'Cámara activa · lista para capturar';
      startButton.innerHTML = '<span>Entrar en la cabina</span><span aria-hidden="true">↗</span>';
    }
    if (status === 'idle') {
      cameraNote.textContent = 'Cámara apagada · tus fotografías siguen guardadas';
      startButton.innerHTML = '<span>Volver a encender</span><span aria-hidden="true">↗</span>';
    }
  },
});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove('is-visible'), 2800);
}

function selectOption(selector, attribute, value, note, labels) {
  document.querySelectorAll(selector).forEach((option) => {
    const isSelected = option.dataset[attribute] === value;
    option.classList.toggle('is-selected', isSelected);
    option.setAttribute('aria-pressed', String(isSelected));
  });
  note.textContent = `${labels[value]} seleccionado`;
}

function invalidateComposition() {
  downloadComposition.hidden = true;
  compositionPreviewWrap.hidden = true;
  generateButton.disabled = state.photos.length === 0;
}

function renderPhotos() {
  photoCount.textContent = `${state.photos.length} ${state.photos.length === 1 ? 'FOTO' : 'FOTOS'}`;
  memorySection.classList.toggle('has-photos', state.photos.length > 0);
  photoGallery.replaceChildren();
  state.photos.forEach((photo, index) => {
    const card = document.createElement('article');
    card.className = 'photo-card';
    const image = document.createElement('img');
    image.src = photo.src;
    image.alt = `Fotografía ${index + 1}, filtro ${filterLabels[photo.filter]}`;
    const footer = document.createElement('div');
    footer.className = 'photo-card-footer';
    const label = document.createElement('span');
    const photographer = photo.displayName ? ` · ${photo.displayName}` : '';
    label.textContent = `FOTO ${String(index + 1).padStart(2, '0')} · ${filterLabels[photo.filter]}${photographer}`;
    const actions = document.createElement('div');
    actions.className = 'photo-card-actions';
    const download = photo.shared ? document.createElement('button') : document.createElement('a');
    download.className = photo.shared ? '' : 'photo-action-link';
    if (photo.shared) download.dataset.downloadPhoto = photo.id;
    else {
      download.href = photo.src;
      download.download = `photobooth-foto-${index + 1}.jpg`;
    }
    download.textContent = 'Guardar';
    actions.append(download);
    if (!photo.shared || photo.userId === state.user?.id) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.dataset.removePhoto = photo.shared ? photo.id : String(index);
      remove.setAttribute('aria-label', `Eliminar fotografía ${index + 1}`);
      remove.textContent = 'Eliminar';
      actions.append(remove);
    }
    footer.append(label, actions);
    card.append(image, footer);
    photoGallery.append(card);
  });
  invalidateComposition();
}

function makePhotoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function savePhotoToAlbum(photo) {
  const albumId = state.album.id;
  const userId = state.user.id;
  const filePath = `${albumId}/${userId}/${makePhotoId()}.jpg`;
  const imageBlob = await fetch(photo.src).then((response) => response.blob());
  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(filePath, imageBlob, { contentType: 'image/jpeg', upsert: false });
  if (uploadError) throw uploadError;

  const displayNameValue = state.user.user_metadata?.display_name || state.user.email?.split('@')[0] || 'PhotoBooth';
  const { error: insertError } = await supabase.from('photos').insert({
    album_id: albumId,
    user_id: userId,
    display_name: displayNameValue,
    storage_path: filePath,
    filter: photo.filter,
  });
  if (insertError) {
    await supabase.storage.from(PHOTO_BUCKET).remove([filePath]);
    throw insertError;
  }

  state.photos = state.photos.filter((item) => item !== photo);
  await refreshSharedPhotos();
}

async function deletePhoto(photo, localIndex) {
  if (!photo.shared) {
    state.photos.splice(localIndex, 1);
    renderPhotos();
    showToast('Fotografía eliminada.');
    return;
  }
  if (photo.userId !== state.user?.id) return;

  const { error } = await supabase.from('photos').delete().eq('id', photo.id);
  if (error) {
    showToast(`No se pudo eliminar: ${error.message}`);
    return;
  }
  const { error: storageError } = await supabase.storage.from(PHOTO_BUCKET).remove([photo.storagePath]);
  await refreshSharedPhotos();
  showToast(storageError ? 'Foto eliminada del álbum; no se pudo limpiar el archivo guardado.' : 'Fotografía eliminada del álbum.');
}

async function downloadSharedPhoto(photo) {
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(photo.storagePath);
  if (error) throw error;
  const objectUrl = URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `photobooth-${photo.displayName || 'foto'}-${photo.id.slice(0, 6)}.jpg`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function setAuthFeedback(message, isError = false) {
  authFeedback.textContent = message;
  authFeedback.classList.toggle('is-error', isError);
}

function setAlbumMessage(message, isError = false) {
  albumMessage.textContent = message;
  albumMessage.classList.toggle('is-error', isError);
}

function showAlbumSetup(message = '') {
  albumSetup.hidden = !state.user;
  albumActive.hidden = true;
  albumPresence.textContent = state.user ? 'SIN ÁLBUM' : 'SIN SESIÓN';
  albumPresence.classList.remove('is-connected');
  albumDescription.textContent = state.user
    ? 'Crea un álbum y comparte su código, o introduce el código que te han enviado.'
    : 'Inicia sesión para crear o abrir un álbum con otra persona.';
  setAlbumMessage(message);
}

async function refreshSharedPhotos() {
  if (!supabase || !state.album) return;
  const albumId = state.album.id;
  const { data, error } = await supabase
    .from('photos')
    .select('id,album_id,user_id,display_name,storage_path,filter,created_at')
    .eq('album_id', albumId)
    .order('created_at', { ascending: true });
  if (error) {
    setAlbumMessage(`No se pudieron actualizar las fotos: ${error.message}`, true);
    return;
  }

  let sharedPhotos;
  try {
    sharedPhotos = await Promise.all(data.map(async (photo) => {
      const { data: signed, error: signedError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(photo.storage_path, 3600);
      if (signedError) throw signedError;
      return {
        id: photo.id,
        albumId: photo.album_id,
        userId: photo.user_id,
        displayName: photo.display_name,
        storagePath: photo.storage_path,
        filter: photo.filter,
        createdAt: photo.created_at,
        src: signed.signedUrl,
        shared: true,
      };
    }));
  } catch (error) {
    setAlbumMessage(`No se pudieron cargar las imágenes del álbum: ${error.message}`, true);
    return;
  }

  if (state.album?.id !== albumId) return;
  const localPhotos = state.photos.filter((photo) => !photo.shared);
  state.photos = [...sharedPhotos, ...localPhotos].sort((a, b) =>
    new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime(),
  );
  renderPhotos();
}

async function activateAlbum(album) {
  if (state.album?.id === album.id) {
    await refreshSharedPhotos();
    return;
  }
  state.album = album;
  localStorage.setItem('photobooth.albumId', album.id);
  albumSetup.hidden = true;
  albumActive.hidden = false;
  albumPresence.textContent = 'ÁLBUM ACTIVO';
  albumPresence.classList.add('is-connected');
  byId('active-album-name').textContent = album.name;
  byId('active-invite-code').textContent = album.invite_code;
  albumDescription.textContent = 'Las fotos que captures aparecerán aquí en los dos equipos.';
  setAlbumMessage('Conectando las fotografías del álbum…');

  if (albumChannel) await supabase.removeChannel(albumChannel);
  albumChannel = supabase
    .channel(`photos-${album.id}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'photos',
      filter: `album_id=eq.${album.id}`,
    }, () => refreshSharedPhotos())
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') setAlbumMessage('Álbum sincronizado en tiempo real.');
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setAlbumMessage('El álbum está abierto, pero la conexión en tiempo real no está disponible. Recarga para actualizar.', true);
      }
    });
  await refreshSharedPhotos();
  await partnerCameraView.activate({ supabase, album, user: state.user });
}

async function handleAuthSession(session) {
  const previousUserId = state.user?.id;
  if (previousUserId && previousUserId !== session?.user?.id) {
    if (albumChannel && supabase) await supabase.removeChannel(albumChannel);
    await partnerCameraView.deactivate({ announce: true });
    albumChannel = null;
    state.album = null;
    localStorage.removeItem('photobooth.albumId');
    state.photos = state.photos.filter((photo) => !photo.shared);
    renderPhotos();
  }
  state.user = session?.user ?? null;
  authOpen.hidden = Boolean(state.user);
  authLogout.hidden = !state.user;
  accountLabel.textContent = state.user
    ? (state.user.user_metadata?.display_name || state.user.email)
    : 'Sin sesión';
  albumPanel.hidden = !SUPABASE_CONFIGURED;

  if (!state.user) {
    if (albumChannel && supabase) await supabase.removeChannel(albumChannel);
    await partnerCameraView.deactivate({ announce: true });
    albumChannel = null;
    state.album = null;
    localStorage.removeItem('photobooth.albumId');
    state.photos = state.photos.filter((photo) => !photo.shared);
    renderPhotos();
    showAlbumSetup();
    return;
  }

  if (previousUserId === state.user.id && state.album) return;

  showAlbumSetup();
  const savedAlbumId = localStorage.getItem('photobooth.albumId');
  if (savedAlbumId) {
    const { data: album, error } = await supabase
      .from('photo_albums')
      .select('id,name,invite_code,owner_id')
      .eq('id', savedAlbumId)
      .maybeSingle();
    if (!error && album) await activateAlbum(album);
    else localStorage.removeItem('photobooth.albumId');
  }
}

async function initializeSupabase() {
  if (!SUPABASE_CONFIGURED) {
    albumPanel.hidden = false;
    showAlbumSetup();
    setAlbumMessage('Para activar las cuentas, configura la URL y la publishable key de Supabase.', true);
    return;
  }
  try {
    supabase = await getSupabaseClient();
    supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => handleAuthSession(session), 0);
    });
    const { data: { session } } = await supabase.auth.getSession();
    await handleAuthSession(session);
  } catch (error) {
    setAlbumMessage(`No se pudo conectar con Supabase: ${error.message}`, true);
  }
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function playFilmAdvance() {
  cameraStage.classList.remove('is-film-advancing');
  filmEffect.classList.remove('is-running');
  captureButton.classList.remove('is-firing');
  void cameraStage.offsetWidth;
  cameraStage.classList.add('is-film-advancing');
  filmEffect.classList.add('is-running');
  captureButton.classList.add('is-firing');
  window.setTimeout(() => {
    cameraStage.classList.remove('is-film-advancing');
    filmEffect.classList.remove('is-running');
    captureButton.classList.remove('is-firing');
  }, 680);
}

async function takePhoto() {
  if (!camera.stream || captureButton.disabled) return;
  if (!state.album && state.photos.filter((photo) => !photo.shared).length >= layoutLimits[state.layout]) {
    showToast(`Este formato admite ${layoutLimits[state.layout]} foto${layoutLimits[state.layout] === 1 ? '' : 's'}.`);
    return;
  }

  const token = ++state.countdownToken;
  captureButton.disabled = true;
  timerButton.disabled = true;
  try {
    if (state.timerEnabled) {
      countdownOverlay.classList.add('is-visible');
      for (let count = 3; count > 0; count -= 1) {
        if (token !== state.countdownToken) return;
        countdownOverlay.textContent = String(count);
        await wait(1000);
      }
    }
    if (token !== state.countdownToken || !camera.stream) return;
    countdownOverlay.textContent = '✦';
    playFilmAdvance();
    cameraStage.classList.add('is-flashing');
    const src = captureFilteredFrame(cameraVideo, state.filter, camera.facingMode === 'user');
    const photo = { src, filter: state.filter, createdAt: new Date().toISOString(), shared: false };
    state.photos.push(photo);
    renderPhotos();
    if (state.album && state.user) {
      try {
        await savePhotoToAlbum(photo);
        showToast('Foto guardada y compartida con el álbum.');
      } catch (error) {
        showToast(`Se guardó en esta sesión, pero no se pudo compartir: ${error.message}`);
      }
    } else {
      showToast('Fotografía guardada en esta sesión. Inicia sesión y abre un álbum para compartirla.');
    }
    window.setTimeout(() => cameraStage.classList.remove('is-flashing'), 280);
  } catch (error) {
    showToast(error.message || 'No se pudo capturar la fotografía.');
  } finally {
    countdownOverlay.classList.remove('is-visible');
    countdownOverlay.textContent = '';
    captureButton.disabled = !camera.stream;
    timerButton.disabled = !camera.stream;
  }
}

document.querySelectorAll('[data-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    selectOption('[data-filter]', 'filter', state.filter, filterNote, filterLabels);
    applyVideoFilter(cameraVideo, state.filter);
  });
});

document.querySelectorAll('[data-layout]').forEach((button) => {
  button.addEventListener('click', () => {
    state.layout = button.dataset.layout;
    selectOption('[data-layout]', 'layout', state.layout, layoutNote, layoutLabels);
    renderPhotos();
  });
});

startButton.addEventListener('click', async () => {
  try {
    await camera.start();
    applyVideoFilter(cameraVideo, state.filter);
    showToast('Cámara activada. Ya puedes hacer fotografías.');
  } catch (error) {
    cameraNote.textContent = error.message;
    showToast(error.message);
  }
});

switchCameraButton.addEventListener('click', async () => {
  try {
    await camera.switchCamera();
    applyVideoFilter(cameraVideo, state.filter);
    showToast(camera.facingMode === 'environment' ? 'Cámara trasera activada.' : 'Cámara frontal activada.');
  } catch (error) {
    cameraNote.textContent = error.message;
    showToast(error.message);
  }
});

stopCameraButton.addEventListener('click', () => {
  state.countdownToken += 1;
  countdownOverlay.classList.remove('is-visible');
  countdownOverlay.textContent = '';
  camera.stop({ notify: true });
  showToast('Cámara apagada. Las fotos de esta sesión se conservan.');
});

captureButton.addEventListener('click', takePhoto);
timerButton.addEventListener('click', () => {
  state.timerEnabled = !state.timerEnabled;
  timerButton.setAttribute('aria-pressed', String(state.timerEnabled));
  cameraNote.textContent = state.timerEnabled ? 'Cuenta atrás de 3 segundos activada' : 'Cámara activa · lista para capturar';
});

photoGallery.addEventListener('click', async (event) => {
  const downloadButton = event.target.closest('[data-download-photo]');
  if (downloadButton) {
    const photo = state.photos.find((item) => item.shared && item.id === downloadButton.dataset.downloadPhoto);
    if (!photo) return;
    try {
      await downloadSharedPhoto(photo);
    } catch (error) {
      showToast(`No se pudo descargar: ${error.message}`);
    }
    return;
  }

  const removeButton = event.target.closest('[data-remove-photo]');
  if (!removeButton) return;
  const key = removeButton.dataset.removePhoto;
  const sharedPhoto = state.photos.find((item) => item.shared && item.id === key);
  const localIndex = sharedPhoto ? -1 : Number(key);
  const photo = sharedPhoto ?? state.photos[localIndex];
  if (photo) await deletePhoto(photo, localIndex);
});

function setAuthMode(mode) {
  authMode = mode;
  const isSignup = mode === 'signup';
  displayNameWrap.hidden = !isSignup;
  displayName.required = isSignup;
  authPassword.autocomplete = isSignup ? 'new-password' : 'current-password';
  authSubmit.textContent = isSignup ? 'Crear cuenta' : 'Entrar';
  byId('auth-title').textContent = isSignup ? 'Crea tu cuenta' : 'Entra en tu espacio';
  byId('show-login').classList.toggle('is-active', !isSignup);
  byId('show-signup').classList.toggle('is-active', isSignup);
  setAuthFeedback('');
}

authOpen.addEventListener('click', () => {
  setAuthMode('login');
  authDialog.showModal();
  if (!SUPABASE_CONFIGURED) {
    setAuthFeedback('Primero conecta el proyecto Supabase en src/supabase-config.js y ejecuta supabase/setup.sql.', true);
  }
});
byId('auth-close').addEventListener('click', () => authDialog.close());
byId('show-login').addEventListener('click', () => setAuthMode('login'));
byId('show-signup').addEventListener('click', () => setAuthMode('signup'));

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!SUPABASE_CONFIGURED) {
    setAuthFeedback('Configura primero la URL y la publishable key de Supabase.', true);
    return;
  }
  authSubmit.disabled = true;
  setAuthFeedback('Conectando…');
  try {
    supabase ??= await getSupabaseClient();
    const email = authEmail.value.trim();
    const password = authPassword.value;
    if (authMode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName.value.trim() },
          emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
        },
      });
      if (error) throw error;
      if (data.session) {
        authDialog.close();
        showToast('Cuenta creada. Ya puedes abrir un álbum compartido.');
      } else {
        setAuthFeedback('Cuenta creada. Revisa tu correo para confirmar la dirección y después inicia sesión.');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      authDialog.close();
      showToast('Has iniciado sesión.');
    }
  } catch (error) {
    setAuthFeedback(error.message || 'No se pudo completar el acceso.', true);
  } finally {
    authSubmit.disabled = false;
  }
});

authLogout.addEventListener('click', async () => {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) showToast(`No se pudo cerrar sesión: ${error.message}`);
  else showToast('Sesión cerrada.');
});

byId('create-album').addEventListener('click', async () => {
  const name = byId('album-name').value.trim();
  if (!name) {
    setAlbumMessage('Escribe un nombre para el álbum.', true);
    return;
  }
  const button = byId('create-album');
  button.disabled = true;
  try {
    const { data, error } = await supabase.rpc('create_photo_album', { p_name: name });
    if (error) throw error;
    await activateAlbum(data);
    showToast('Álbum creado. Comparte el código para invitar a otra persona.');
  } catch (error) {
    setAlbumMessage(`No se pudo crear el álbum: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
});

byId('join-album').addEventListener('click', async () => {
  const inviteCode = byId('invite-code').value.trim().toUpperCase();
  if (!inviteCode) {
    setAlbumMessage('Introduce el código de invitación.', true);
    return;
  }
  const button = byId('join-album');
  button.disabled = true;
  try {
    const { data, error } = await supabase.rpc('join_photo_album', { p_invite_code: inviteCode });
    if (error) throw error;
    await activateAlbum(data);
    showToast(`Te has unido a ${data.name}.`);
  } catch (error) {
    setAlbumMessage(`No se pudo abrir el álbum: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
});

byId('copy-invite').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(byId('active-invite-code').textContent);
    showToast('Código copiado. Envíalo a la otra persona.');
  } catch {
    setAlbumMessage(`Copia este código para compartirlo: ${byId('active-invite-code').textContent}`);
  }
});

byId('leave-album').addEventListener('click', async () => {
  if (albumChannel && supabase) await supabase.removeChannel(albumChannel);
  await partnerCameraView.deactivate({ announce: true });
  albumChannel = null;
  state.album = null;
  localStorage.removeItem('photobooth.albumId');
  state.photos = state.photos.filter((photo) => !photo.shared);
  renderPhotos();
  showAlbumSetup('Has cambiado de álbum. Puedes crear otro o introducir un código.');
});

generateButton.addEventListener('click', async () => {
  if (!state.photos.length) return;
  generateButton.disabled = true;
  generateButton.textContent = 'Preparando composición…';
  try {
    const imageUrl = await createComposition(state.photos, state.layout, paperColor.value);
    compositionPreview.src = imageUrl;
    compositionPreviewWrap.hidden = false;
    downloadComposition.href = imageUrl;
    downloadComposition.hidden = false;
    showToast('Composición lista para guardar en tu ordenador.');
  } catch (error) {
    showToast(error.message || 'No se pudo generar la composición.');
  } finally {
    generateButton.innerHTML = 'Generar composición <span aria-hidden="true">→</span>';
    generateButton.disabled = state.photos.length === 0;
  }
});

window.addEventListener('pagehide', () => {
  camera.stop();
  partnerCameraView.deactivate({ announce: true });
});
selectOption('[data-filter]', 'filter', state.filter, filterNote, filterLabels);
selectOption('[data-layout]', 'layout', state.layout, layoutNote, layoutLabels);
applyVideoFilter(cameraVideo, state.filter);
renderPhotos();
initializeSupabase();
