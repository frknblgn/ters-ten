// Ses kayıt, ters çevirme ve WAV kodlama yardımcıları.
const TersAudio = (() => {
  let sharedCtx = null;
  function ctx() {
    if (!sharedCtx) sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (sharedCtx.state === "suspended") sharedCtx.resume();
    return sharedCtx;
  }

  let micStream = null;
  async function getMicStream() {
    if (micStream && micStream.active) return micStream;
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    return micStream;
  }

  function pickMimeType() {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
    for (const c of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c;
    }
    return "";
  }

  // Records for up to maxMs, or until stop() is called. Resolves with a Blob.
  function recordFor(stream, maxMs) {
    return new Promise((resolve, reject) => {
      const mimeType = pickMimeType();
      let recorder;
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch (e) {
        reject(e);
        return;
      }
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }));
      recorder.onerror = (e) => reject(e.error || e);
      recorder.start();

      const timer = setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, maxMs);

      recorder._tersStop = () => {
        clearTimeout(timer);
        if (recorder.state !== "inactive") recorder.stop();
      };
      recordFor._current = recorder;
    });
  }

  function stopRecording() {
    if (recordFor._current && recordFor._current._tersStop) {
      recordFor._current._tersStop();
      recordFor._current = null;
    }
  }

  async function blobToAudioBuffer(blob) {
    const arrBuf = await blob.arrayBuffer();
    return await ctx().decodeAudioData(arrBuf.slice(0));
  }

  function reverseBuffer(audioBuffer) {
    const out = ctx().createBuffer(audioBuffer.numberOfChannels, audioBuffer.length, audioBuffer.sampleRate);
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const src = audioBuffer.getChannelData(ch);
      const dst = out.getChannelData(ch);
      for (let i = 0; i < src.length; i++) dst[i] = src[src.length - 1 - i];
    }
    return out;
  }

  function resampleChannel(data, fromRate, toRate) {
    if (fromRate === toRate) return data;
    const ratio = fromRate / toRate;
    const newLen = Math.round(data.length / ratio);
    const out = new Float32Array(newLen);
    for (let i = 0; i < newLen; i++) {
      const srcPos = i * ratio;
      const i0 = Math.floor(srcPos);
      const i1 = Math.min(i0 + 1, data.length - 1);
      const frac = srcPos - i0;
      out[i] = data[i0] * (1 - frac) + data[i1] * frac;
    }
    return out;
  }

  const TARGET_SAMPLE_RATE = 16000;

  function audioBufferToWav(audioBuffer, targetRate = TARGET_SAMPLE_RATE) {
    const numCh = 1; // mono is enough for voice and keeps payloads small
    const ch0 = audioBuffer.getChannelData(0);
    const resampled = resampleChannel(ch0, audioBuffer.sampleRate, targetRate);
    const bytesPerSample = 2;
    const blockAlign = numCh * bytesPerSample;
    const dataSize = resampled.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    writeStr(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeStr(view, 8, "WAVE");
    writeStr(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numCh, true);
    view.setUint32(24, targetRate, true);
    view.setUint32(28, targetRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeStr(view, 36, "data");
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < resampled.length; i++) {
      let s = Math.max(-1, Math.min(1, resampled[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
    return buffer;
  }

  function writeStr(view, offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  async function playArrayBuffer(arrayBuffer) {
    const buf = await ctx().decodeAudioData(arrayBuffer.slice(0));
    return playAudioBuffer(buf);
  }

  // Only one clip plays at a time: starting a new one stops whatever is
  // currently playing, so repeated "replay" clicks never stack/overlap.
  let activeSource = null;
  function stopPlayback() {
    if (activeSource) {
      try { activeSource.onended = null; activeSource.stop(); } catch (e) {}
      activeSource = null;
    }
  }

  function playAudioBuffer(audioBuffer) {
    stopPlayback();
    return new Promise((resolve) => {
      const source = ctx().createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx().destination);
      source.onended = () => {
        if (activeSource === source) activeSource = null;
        resolve();
      };
      activeSource = source;
      source.start();
    });
  }

  // Records audio, reverses it, returns {wavArrayBuffer, duration}
  async function recordAndReverse(stream, maxMs) {
    const blob = await recordFor(stream, maxMs);
    const buf = await blobToAudioBuffer(blob);
    const reversed = reverseBuffer(buf);
    const wav = audioBufferToWav(reversed);
    return { wav, duration: reversed.duration };
  }

  // Mic level meter for the mic-test feature.
  function createLevelMeter(stream, onLevel) {
    const audioCtx = ctx();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf;
    function tick() {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      onLevel(Math.min(1, rms * 4));
      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => {
      cancelAnimationFrame(raf);
      try { source.disconnect(); analyser.disconnect(); } catch (e) {}
    };
  }

  return {
    getMicStream,
    recordFor,
    stopRecording,
    blobToAudioBuffer,
    reverseBuffer,
    audioBufferToWav,
    playArrayBuffer,
    playAudioBuffer,
    stopPlayback,
    recordAndReverse,
    createLevelMeter,
  };
})();
