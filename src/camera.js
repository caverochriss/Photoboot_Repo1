export class CameraController {
  constructor(video, { onStatus, onError } = {}) {
    this.video = video;
    this.onStatus = onStatus;
    this.onError = onError;
    this.stream = null;
    this.facingMode = 'user';
    this.devices = [];
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Tu navegador no permite acceder a la cámara. Prueba con HTTPS o localhost.');
    }

    this.stop();

    try {
      this.onStatus?.('requesting');
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: this.facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      this.video.srcObject = this.stream;
      await this.video.play();
      await this.refreshDevices();
      this.onStatus?.('active');
    } catch (error) {
      this.stop();
      this.onStatus?.('idle');
      throw this.getReadableError(error);
    }
  }

  async refreshDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    this.devices = devices.filter((device) => device.kind === 'videoinput');
    return this.devices;
  }

  async switchCamera() {
    if (!this.stream) return;
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    await this.start();
  }

  stop({ notify = false } = {}) {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
    if (notify) this.onStatus?.('idle');
  }

  getReadableError(error) {
    const messages = {
      NotAllowedError: 'No se concedió permiso para usar la cámara.',
      PermissionDeniedError: 'No se concedió permiso para usar la cámara.',
      NotFoundError: 'No hemos encontrado ninguna cámara en este dispositivo.',
      NotReadableError: 'La cámara está siendo utilizada por otra aplicación.',
      OverconstrainedError: 'La cámara no admite la configuración solicitada.',
      SecurityError: 'El navegador bloqueó el acceso. Usa HTTPS o localhost.',
    };

    return new Error(messages[error.name] ?? 'No se ha podido iniciar la cámara. Comprueba los permisos del navegador.');
  }
}
