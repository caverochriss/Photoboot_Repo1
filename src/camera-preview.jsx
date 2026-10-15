import { useEffect, useState } from 'react';

const formats = {
  single: { count: 0, label: 'Vista individual' },
  duo: { count: 0, label: 'Dúo de cámaras, ambas vistas lado a lado' },
  'strip-3': { count: 2, label: 'Vista de tira corta' },
  'strip-4': { count: 3, label: 'Vista de tira clásica' },
  'grid-2x2': { count: 3, label: 'Vista de cuadrícula' },
};

export default function CameraPreview() {
  const [layout, setLayout] = useState('single');
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [facingMode, setFacingMode] = useState('user');
  const [curtainsOpening, setCurtainsOpening] = useState(false);

  useEffect(() => {
    let curtainTimer;
    const onFormatClick = (event) => {
      const button = event.target.closest('[data-layout]');
      if (button && formats[button.dataset.layout]) setLayout(button.dataset.layout);
    };
    const onCameraStatus = (event) => {
      const { status, facingMode: facing = 'user' } = event.detail;
      setCameraStatus(status);
      setFacingMode(facing);
      if (status === 'active') {
        setCurtainsOpening(true);
        window.clearTimeout(curtainTimer);
        curtainTimer = window.setTimeout(() => setCurtainsOpening(false), 1150);
      }
    };

    // Inicializa la lógica existente tras el primer montaje del árbol React.
    import('./main.js');
    document.addEventListener('click', onFormatClick);
    window.addEventListener('photobooth:camera-status', onCameraStatus);
    return () => {
      document.removeEventListener('click', onFormatClick);
      window.removeEventListener('photobooth:camera-status', onCameraStatus);
      window.clearTimeout(curtainTimer);
    };
  }, []);

  const active = cameraStatus === 'active';
  const frameCount = formats[layout].count;

  return (
    <div className="live-composition" data-layout={layout} aria-label={formats[layout].label}>
      <div className="camera-pair">
        <section className="camera-frame" aria-label="Tu cámara">
          <div className="camera-chrome"><span className="chrome-label">TU VISOR</span><span className="chrome-light" aria-hidden="true" /></div>
          <div className={`camera-stage${active ? ' is-live' : ''}${facingMode === 'environment' ? ' is-environment' : ''}${curtainsOpening ? ' is-opening' : ''}`} id="camera-stage">
            <video id="camera-video" data-filter="original" autoPlay muted playsInline aria-label="Vista previa de tu cámara" />
            <div className="welcome-card" id="welcome-card">
              <span className="welcome-icon" aria-hidden="true">◎</span>
              <h2>La cabina está lista</h2>
              <p>Cuando quieras empezar, activaremos tu cámara solo durante la sesión.</p>
              <button className="button button-primary" id="start-button" type="button"><span>Entrar en la cabina</span><span aria-hidden="true">↗</span></button>
            </div>
            <div className="countdown-overlay" id="countdown-overlay" aria-live="assertive" />
            <div className="film-effect" id="film-effect" aria-hidden="true" />
            <div className="theater-curtain curtain-left" aria-hidden="true" />
            <div className="theater-curtain curtain-right" aria-hidden="true" />
            <div className="live-badge" id="live-badge"><span className="status-dot" aria-hidden="true" /> Cámara activa</div>
            <div className="camera-grid" aria-hidden="true" />
          </div>
          <div className="camera-footer"><span>PHOTOBOOTH / 001</span><span id="session-timer">00:00:00</span></div>
        </section>

        <section className="camera-frame partner-camera-frame" id="partner-camera-frame" aria-label="Cámara de tu pareja">
          <div className="camera-chrome"><span className="chrome-label">VISOR COMPARTIDO</span><span className="chrome-light" aria-hidden="true" /></div>
          <div className="camera-stage partner-camera-stage" id="partner-camera-stage">
            <video id="partner-video" autoPlay muted playsInline aria-label="Vista previa de la cámara de tu pareja" />
            <div className="welcome-card partner-welcome" id="partner-welcome">
              <span className="welcome-icon" aria-hidden="true">◌</span><h2>La otra cabina</h2>
              <p id="partner-note">Inicia sesión, abre el mismo álbum y solicita una vista privada.</p>
            </div>
            <div className="theater-curtain curtain-left" aria-hidden="true" /><div className="theater-curtain curtain-right" aria-hidden="true" />
            <div className="live-badge partner-live-badge" id="partner-live-badge"><span className="status-dot" aria-hidden="true" /> Vista conectada</div>
            <div className="camera-grid" aria-hidden="true" />
          </div>
          <div className="camera-footer"><span id="partner-camera-label">ESPERANDO A TU PAREJA</span><span>WEBRTC · PRIVADO</span></div>
        </section>
      </div>
      {frameCount > 0 && (
        <div className={`preview-placeholders${layout === 'grid-2x2' ? ' is-grid' : ''}`} aria-label="Fotogramas pendientes de la composición">
          {Array.from({ length: frameCount }, (_, index) => <div className="preview-placeholder" key={index}><span>{String(index + 2).padStart(2, '0')}</span></div>)}
        </div>
      )}
    </div>
  );
}
