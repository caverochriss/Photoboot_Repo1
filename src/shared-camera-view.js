function newCallId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Coordina una vista de cámara entre dos miembros de un álbum.
 * Supabase solo transporta ofertas, respuestas e ICE privados; el vídeo usa
 * WebRTC de navegador a navegador y requiere que ambas personas acepten.
 */
export class SharedCameraView {
  constructor({ elements, ensureLocalStream }) {
    this.elements = elements;
    this.ensureLocalStream = ensureLocalStream;
    this.supabase = null;
    this.album = null;
    this.user = null;
    this.channel = null;
    this.peer = null;
    this.activeCall = null;
    this.pendingIncoming = null;
    this.pendingIce = new Map();
    this.members = new Map();

    elements.startButton.addEventListener('click', () => this.start());
    elements.endButton.addEventListener('click', () => this.end());
    elements.acceptButton.addEventListener('click', () => this.acceptIncoming());
    elements.rejectButton.addEventListener('click', () => this.rejectIncoming());
  }

  setStatus(message, isError = false) {
    this.elements.status.textContent = message;
    this.elements.status.classList.toggle('is-error', isError);
  }

  setPreviewState({ live = false, label = 'ESPERANDO A TU PAREJA', note = 'Inicia sesión, abre el mismo álbum y solicita una vista privada.' } = {}) {
    this.elements.stage.classList.toggle('is-live', live);
    this.elements.label.textContent = label;
    this.elements.note.textContent = note;
    if (!live) {
      this.elements.video.pause();
      this.elements.video.srcObject = null;
    }
  }

  async activate({ supabase, album, user }) {
    await this.deactivate({ announce: false });
    if (!window.RTCPeerConnection) {
      this.elements.panel.hidden = false;
      this.setStatus('Tu navegador no permite compartir una vista de cámara.', true);
      return;
    }

    this.supabase = supabase;
    this.album = album;
    this.user = user;
    this.elements.panel.hidden = false;
    this.setPreviewState({ note: 'Selecciona a la otra persona y solicita una vista privada.' });
    await this.refreshMembers();

    this.channel = supabase
      .channel(`camera-view-${album.id}-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'photo_call_signals',
        filter: `recipient_id=eq.${user.id}`,
      }, ({ new: signal }) => this.handleSignal(signal))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'photo_album_members',
        filter: `album_id=eq.${album.id}`,
      }, () => this.refreshMembers())
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.setStatus('No se pudo abrir la señalización privada de cámara.', true);
        }
      });
  }

  async deactivate({ announce = false } = {}) {
    if (announce && this.activeCall) {
      await this.sendSignal('hangup', {}, this.activeCall.partnerId, this.activeCall.id).catch(() => {});
    }
    if (this.channel && this.supabase) await this.supabase.removeChannel(this.channel);
    this.channel = null;
    this.closePeer();
    this.supabase = null;
    this.album = null;
    this.user = null;
    this.pendingIncoming = null;
    this.pendingIce.clear();
    this.members.clear();
    this.elements.panel.hidden = true;
    this.elements.incoming.hidden = true;
    this.elements.select.replaceChildren(new Option('Nadie conectado al álbum', ''));
    this.elements.select.disabled = true;
    this.elements.startButton.disabled = true;
    this.elements.endButton.hidden = true;
    this.setPreviewState();
  }

  async refreshMembers() {
    if (!this.supabase || !this.album || !this.user) return;
    const { data, error } = await this.supabase
      .from('photo_album_members')
      .select('user_id,display_name')
      .eq('album_id', this.album.id)
      .order('joined_at', { ascending: true });
    if (error) {
      this.setStatus(`No se pudo consultar quién está en el álbum: ${error.message}`, true);
      return;
    }

    const previous = this.elements.select.value;
    this.members = new Map(data.map((member) => [member.user_id, member.display_name || 'PhotoBooth']));
    const partners = data.filter((member) => member.user_id !== this.user.id);
    this.elements.select.replaceChildren();
    if (!partners.length) {
      this.elements.select.add(new Option('Aún no hay otra persona en el álbum', ''));
      this.elements.select.disabled = true;
      this.elements.startButton.disabled = true;
      this.setStatus('Comparte el código del álbum para habilitar la segunda vista.');
      return;
    }

    this.elements.select.add(new Option('Elige a una persona', ''));
    partners.forEach((member) => this.elements.select.add(new Option(member.display_name || 'PhotoBooth', member.user_id)));
    this.elements.select.disabled = Boolean(this.activeCall);
    this.elements.select.value = partners.some((member) => member.user_id === previous) ? previous : partners[0].user_id;
    this.elements.startButton.disabled = Boolean(this.activeCall);
    if (!this.activeCall) this.setStatus('La vista se comparte solo cuando ambas personas aceptan.');
  }

  async start() {
    const partnerId = this.elements.select.value;
    if (!partnerId || !this.album || !this.user) return;
    try {
      const stream = await this.ensureLocalStream();
      const callId = newCallId();
      const peer = this.createPeer(partnerId, callId);
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await this.sendSignal('offer', { description: peer.localDescription }, partnerId, callId);
      this.elements.startButton.disabled = true;
      this.elements.endButton.hidden = false;
      this.setPreviewState({ label: 'ESPERANDO CONFIRMACIÓN', note: 'Tu pareja debe aceptar compartir su vista.' });
      this.setStatus('Solicitud privada enviada. Esperando su confirmación…');
    } catch (error) {
      this.closePeer();
      this.setStatus(error.message || 'No se pudo iniciar la vista compartida.', true);
    }
  }

  createPeer(partnerId, callId) {
    this.closePeer();
    const peer = new RTCPeerConnection();
    this.peer = peer;
    this.activeCall = { partnerId, id: callId };
    peer.onicecandidate = ({ candidate }) => {
      if (candidate && this.activeCall) {
        this.sendSignal('ice', { candidate: candidate.toJSON() }, partnerId, callId).catch((error) => {
          this.setStatus(`No se pudo enviar la conexión de cámara: ${error.message}`, true);
        });
      }
    };
    peer.ontrack = ({ streams }) => {
      const [stream] = streams;
      if (!stream) return;
      this.elements.video.srcObject = stream;
      this.elements.video.play().catch(() => {});
      const name = this.members.get(partnerId) || 'Tu pareja';
      this.setPreviewState({ live: true, label: `VISTA DE ${name.toUpperCase()}`, note: 'La vista se transmite directamente entre ambos navegadores.' });
      this.elements.endButton.hidden = false;
      this.setStatus('Vista privada conectada.');
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed') {
        this.setStatus('La conexión de cámara ha fallado. Puedes intentarlo otra vez.', true);
        this.end({ notify: false });
      }
      if (peer.connectionState === 'disconnected') this.setStatus('La otra cámara parece desconectada.');
    };
    return peer;
  }

  async handleSignal(signal) {
    if (!signal || signal.album_id !== this.album?.id || signal.recipient_id !== this.user?.id) return;
    try {
      const { signal_type: type, sender_id: senderId, call_id: callId, payload = {} } = signal;
      if (type === 'offer') {
        if (this.activeCall || this.pendingIncoming) {
          await this.sendSignal('reject', {}, senderId, callId).catch(() => {});
          return;
        }
        this.pendingIncoming = { senderId, callId, description: payload.description };
        const name = this.members.get(senderId) || 'Una persona del álbum';
        this.elements.incomingCaller.textContent = `${name} quiere compartir su cámara contigo.`;
        this.elements.incoming.hidden = false;
        this.setStatus('Tú decides cuándo activar y compartir tu cámara.');
        return;
      }
      if (type === 'ice' && this.pendingIncoming?.callId === callId && this.pendingIncoming.senderId === senderId) {
        this.queueIce(callId, payload.candidate);
        return;
      }
      if (!this.activeCall || callId !== this.activeCall.id || senderId !== this.activeCall.partnerId) return;
      if (type === 'answer' && payload.description) {
        await this.peer.setRemoteDescription(new RTCSessionDescription(payload.description));
        await this.flushIce(callId);
        this.setStatus('Conectando las dos cámaras…');
      }
      if (type === 'ice' && payload.candidate) {
        this.queueIce(callId, payload.candidate);
        if (this.peer?.remoteDescription) await this.flushIce(callId);
      }
      if (type === 'hangup' || type === 'reject') {
        const reason = type === 'reject' ? 'La otra persona ha rechazado la solicitud.' : 'La otra persona ha cerrado la vista compartida.';
        this.end({ notify: false });
        this.setStatus(reason);
      }
    } catch (error) {
      this.setStatus(error.message || 'No se pudo procesar la conexión privada de cámara.', true);
    } finally {
      // El receptor borra las ofertas/respuestas/candidatos tras procesarlos.
      // Así no quedan SDP ni direcciones ICE almacenadas de forma indefinida.
      this.supabase?.from('photo_call_signals').delete().eq('id', signal.id).then(() => {}).catch(() => {});
    }
  }

  async acceptIncoming() {
    const incoming = this.pendingIncoming;
    if (!incoming) return;
    try {
      const stream = await this.ensureLocalStream();
      const peer = this.createPeer(incoming.senderId, incoming.callId);
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      await peer.setRemoteDescription(new RTCSessionDescription(incoming.description));
      await this.flushIce(incoming.callId);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await this.sendSignal('answer', { description: peer.localDescription }, incoming.senderId, incoming.callId);
      this.pendingIncoming = null;
      this.elements.incoming.hidden = true;
      this.elements.startButton.disabled = true;
      this.elements.endButton.hidden = false;
      this.setStatus('Conectando las dos cámaras…');
    } catch (error) {
      this.closePeer();
      this.setStatus(error.message || 'No se pudo aceptar la vista compartida.', true);
    }
  }

  async rejectIncoming() {
    const incoming = this.pendingIncoming;
    this.pendingIncoming = null;
    this.elements.incoming.hidden = true;
    if (incoming) await this.sendSignal('reject', {}, incoming.senderId, incoming.callId).catch(() => {});
    this.setStatus('Solicitud de vista rechazada.');
  }

  queueIce(callId, candidate) {
    const candidates = this.pendingIce.get(callId) || [];
    candidates.push(candidate);
    this.pendingIce.set(callId, candidates);
  }

  async flushIce(callId) {
    if (!this.peer || !this.peer.remoteDescription) return;
    const candidates = this.pendingIce.get(callId) || [];
    this.pendingIce.delete(callId);
    for (const candidate of candidates) await this.peer.addIceCandidate(new RTCIceCandidate(candidate));
  }

  async sendSignal(type, payload, recipientId, callId) {
    if (!this.supabase || !this.album || !this.user) throw new Error('La vista compartida no está preparada.');
    const { error } = await this.supabase.from('photo_call_signals').insert({
      album_id: this.album.id,
      sender_id: this.user.id,
      recipient_id: recipientId,
      call_id: callId,
      signal_type: type,
      payload,
    });
    if (error) throw error;
  }

  closePeer() {
    this.peer?.close();
    this.peer = null;
    this.activeCall = null;
  }

  async end({ notify = true } = {}) {
    const call = this.activeCall;
    if (notify && call) await this.sendSignal('hangup', {}, call.partnerId, call.id).catch(() => {});
    this.closePeer();
    this.elements.endButton.hidden = true;
    this.elements.incoming.hidden = true;
    this.setPreviewState({ note: 'La vista se transmite solo mientras ambos la mantienen abierta.' });
    await this.refreshMembers();
    if (this.album) this.setStatus('Vista compartida finalizada.');
  }
}
