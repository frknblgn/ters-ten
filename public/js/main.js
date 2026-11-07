(() => {
  const socket = io();

  const $ = (sel) => document.querySelector(sel);
  const el = {
    screens: {
      home: $("#screen-home"),
      lobby: $("#screen-lobby"),
      game: $("#screen-game"),
      end: $("#screen-end"),
    },
    topbarRoom: $("#topbar-room"),
    topbarRoomCode: $("#topbar-room-code"),
    btnMicTestTop: $("#btn-mic-test-top"),
    btnLeave: $("#btn-leave"),

    inputName: $("#input-name"),
    btnCreateRoom: $("#btn-create-room"),
    inputJoinCode: $("#input-join-code"),
    btnJoinRoom: $("#btn-join-room"),
    homeError: $("#home-error"),

    lobbyRoomCode: $("#lobby-room-code"),
    btnCopyCode: $("#btn-copy-code"),
    btnCopyLink: $("#btn-copy-link"),
    btnMicTest: $("#btn-mic-test"),
    playerCount: $("#player-count"),
    readyCountChip: $("#ready-count-chip"),
    playerList: $("#player-list"),
    narrationsOptions: $("#narrations-options"),
    turnsSummary: $("#turns-summary"),
    timingOptions: $("#timing-options"),
    timingSummary: $("#timing-summary"),
    hostControls: $("#host-controls"),
    btnStartGame: $("#btn-start-game"),
    startHint: $("#start-hint"),
    guestReadyControls: $("#guest-ready-controls"),
    btnToggleReady: $("#btn-toggle-ready"),

    gameTurnLabel: $("#game-turn-label"),
    gameNarratorLabel: $("#game-narrator-label"),
    gameTimerBar: $("#game-timer-bar"),
    gameTimerText: $("#game-timer-text"),
    btnResetLobbyGame: $("#btn-reset-lobby-game"),
    phaseWaiting: $("#phase-waiting"),
    waitingText: $("#waiting-text"),
    phaseNarrator: $("#phase-narrator"),
    celebrityName: $("#celebrity-name"),
    btnRecordNarration: $("#btn-record-narration"),
    narrationGrace: $("#narration-grace"),
    narrationGraceSeconds: $("#narration-grace-seconds"),
    btnRerecordNarration: $("#btn-rerecord-narration"),
    btnSendNowNarration: $("#btn-send-now-narration"),
    narratorStatus: $("#narrator-status"),
    btnReplayReversed: $("#btn-replay-reversed"),
    replayReversedCount: $("#replay-reversed-count"),
    phaseMimic: $("#phase-mimic"),
    btnRecordMimic: $("#btn-record-mimic"),
    mimicStatus: $("#mimic-status"),
    phaseGuess: $("#phase-guess"),
    btnReplayMimic: $("#btn-replay-mimic"),
    inputGuess: $("#input-guess"),
    btnSubmitGuess: $("#btn-submit-guess"),
    guessStatus: $("#guess-status"),
    phaseResult: $("#phase-result"),
    resultCelebration: $("#result-celebration"),
    resultAnswer: $("#result-answer"),
    resultList: $("#result-list"),
    scoreboardList: $("#scoreboard-list"),

    finalScoreboard: $("#final-scoreboard"),
    btnBackToLobby: $("#btn-back-to-lobby"),

    toast: $("#toast"),
  };

  const TIMING_PRESET_LABELS = {
    short: { title: "Kısa", sub: "25 / 35 / 20s" },
    normal: { title: "Normal", sub: "35 / 45 / 30s" },
    long: { title: "Uzun", sub: "50 / 65 / 45s" },
    custom: { title: "Özel", sub: "" },
  };

  let myId = null;
  let currentRoom = null;
  let isHost = false;
  let micStream = null;
  let reversedNarrationBuffer = null; // AudioBuffer of reversed celebrity audio (listener side)
  let mimicReversedBuffer = null; // AudioBuffer after reversing my own mimic recording
  let countdownHandle = null;
  let turnContext = null; // {narratorId, celebrity?}

  function showScreen(name) {
    Object.values(el.screens).forEach((s) => s.classList.add("hidden"));
    el.screens[name].classList.remove("hidden");
  }

  function toast(msg, ms = 2600) {
    el.toast.textContent = msg;
    el.toast.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.toast.classList.add("hidden"), ms);
  }

  function getName() {
    return (el.inputName.value || "").trim() || "Oyuncu";
  }

  function saveName(name) {
    try { localStorage.setItem("tersten_name", name); } catch (e) {}
  }
  try {
    const saved = localStorage.getItem("tersten_name");
    if (saved) el.inputName.value = saved;
  } catch (e) {}

  // ---------- HOME ----------
  el.btnCreateRoom.addEventListener("click", () => {
    const name = getName();
    saveName(name);
    socket.emit("room:create", { name }, (res) => {
      if (!res?.ok) return showHomeError(res?.error || "Oda oluşturulamadı.");
      enterRoom(res.room);
    });
  });

  el.btnJoinRoom.addEventListener("click", () => {
    const name = getName();
    const code = (el.inputJoinCode.value || "").trim();
    if (!code) return showHomeError("Oda kodu gir.");
    saveName(name);
    socket.emit("room:join", { code, name }, (res) => {
      if (!res?.ok) return showHomeError(res?.error || "Katılamadın.");
      enterRoom(res.room);
    });
  });

  function showHomeError(msg) {
    el.homeError.textContent = msg;
    el.homeError.classList.remove("hidden");
  }

  function enterRoom(room) {
    el.homeError.classList.add("hidden");
    currentRoom = room;
    el.topbarRoom.classList.remove("hidden");
    el.btnMicTestTop.classList.remove("hidden");
    el.btnLeave.classList.remove("hidden");
    el.topbarRoomCode.textContent = room.code;
    el.lobbyRoomCode.textContent = room.code;
    showScreen("lobby");
    renderRoom(room);

    const url = new URL(window.location.href);
    url.searchParams.set("room", room.code);
    window.history.replaceState({}, "", url.toString());
  }

  // ---------- TOPBAR ----------
  el.btnLeave.addEventListener("click", () => {
    socket.emit("room:leave");
    window.location.href = window.location.pathname;
  });

  el.btnCopyCode.addEventListener("click", () => copyText(currentRoom.code, "Oda kodu kopyalandı."));
  el.btnCopyLink.addEventListener("click", () => {
    const url = new URL(window.location.href);
    url.searchParams.set("room", currentRoom.code);
    copyText(url.toString(), "Davet bağlantısı kopyalandı.");
  });

  function copyText(text, msg) {
    navigator.clipboard?.writeText(text).then(() => toast(msg)).catch(() => toast(text));
  }

  // ---------- MIC TEST ----------
  let micTestStop = null;
  function openMicTestModal() {
    let modal = document.getElementById("mic-test-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "mic-test-modal";
      modal.style.cssText =
        "position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:100;";
      modal.innerHTML = `
        <div style="background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:24px;max-width:360px;width:90%;text-align:center;">
          <h3 style="margin-top:0;">🎙 Mikrofon Testi</h3>
          <p class="muted small">Konuş ve seviyeyi izle.</p>
          <div style="background:var(--panel-2);border-radius:999px;height:20px;overflow:hidden;margin:16px 0;border:1px solid var(--border);">
            <div id="mic-level-bar" style="height:100%;width:0%;background:linear-gradient(90deg,var(--primary),var(--accent-2));transition:width .08s;"></div>
          </div>
          <p class="muted small">Kısa bir kayıt yapıp tersten nasıl duyulduğunu dinleyebilirsin.</p>
          <button id="mic-test-record" class="btn btn-record btn-block">🔴 3sn Kayıt Yap</button>
          <p id="mic-test-status" class="muted small"></p>
          <div id="mic-test-playback" class="hidden" style="display:flex;gap:8px;margin-top:4px;">
            <button id="mic-test-play-normal" class="btn btn-secondary" style="flex:1;">▶ Düz Dinle</button>
            <button id="mic-test-play-reversed" class="btn btn-success" style="flex:1;">🔁 Tersten Dinle</button>
          </div>
          <button id="mic-test-close" class="btn btn-ghost btn-block">Kapat</button>
        </div>`;
      document.body.appendChild(modal);
      modal.querySelector("#mic-test-close").addEventListener("click", closeMicTestModal);
      modal.querySelector("#mic-test-record").addEventListener("click", recordMicTestClip);
      modal.querySelector("#mic-test-play-normal").addEventListener("click", () => {
        if (modal._normalBuffer) TersAudio.playAudioBuffer(modal._normalBuffer);
      });
      modal.querySelector("#mic-test-play-reversed").addEventListener("click", () => {
        if (modal._reversedBuffer) TersAudio.playAudioBuffer(modal._reversedBuffer);
      });
    }
    modal.classList.remove("hidden");
    document.getElementById("mic-test-playback").classList.add("hidden");
    document.getElementById("mic-test-status").textContent = "";
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        micTestStop = TersAudio.createLevelMeter(stream, (level) => {
          const bar = document.getElementById("mic-level-bar");
          if (bar) bar.style.width = Math.round(level * 100) + "%";
        });
        modal._stream = stream;
      })
      .catch(() => toast("Mikrofona erişilemedi."));
  }

  async function recordMicTestClip() {
    const modal = document.getElementById("mic-test-modal");
    const btn = document.getElementById("mic-test-record");
    const status = document.getElementById("mic-test-status");
    if (!modal._stream) return toast("Mikrofona erişilemedi.");

    btn.disabled = true;
    btn.classList.add("recording");
    btn.textContent = "🔴 Kaydediliyor...";
    status.textContent = "Konuş!";
    document.getElementById("mic-test-playback").classList.add("hidden");

    try {
      const blob = await TersAudio.recordFor(modal._stream, 3000);
      const buffer = await TersAudio.blobToAudioBuffer(blob);
      modal._normalBuffer = buffer;
      modal._reversedBuffer = TersAudio.reverseBuffer(buffer);
      status.textContent = "Kayıt hazır, dinleyebilirsin.";
      document.getElementById("mic-test-playback").classList.remove("hidden");
    } catch (e) {
      status.textContent = "Kayıt hatası: " + (e.message || e);
    }
    btn.disabled = false;
    btn.classList.remove("recording");
    btn.textContent = "🔴 3sn Kayıt Yap";
  }

  function closeMicTestModal() {
    const modal = document.getElementById("mic-test-modal");
    if (modal) {
      modal.classList.add("hidden");
      if (modal._stream) modal._stream.getTracks().forEach((t) => t.stop());
      modal._stream = null;
      modal._normalBuffer = null;
      modal._reversedBuffer = null;
    }
    TersAudio.stopRecording();
    if (micTestStop) micTestStop();
    micTestStop = null;
  }
  el.btnMicTest.addEventListener("click", openMicTestModal);
  el.btnMicTestTop.addEventListener("click", openMicTestModal);

  // ---------- LOBBY ----------
  function renderNarrationOptions(settings) {
    el.narrationsOptions.innerHTML = "";
    for (let n = 1; n <= 4; n++) {
      const btn = document.createElement("button");
      btn.className = "choice-btn" + (settings.narrationsPerPerson === n ? " active" : "");
      btn.textContent = n + "×";
      btn.disabled = !isHost || currentRoom.state !== "lobby";
      btn.addEventListener("click", () => socket.emit("room:updateSettings", { narrationsPerPerson: n }));
      el.narrationsOptions.appendChild(btn);
    }
  }

  function renderTimingOptions(settings) {
    el.timingOptions.innerHTML = "";
    ["short", "normal", "long"].forEach((key) => {
      const info = TIMING_PRESET_LABELS[key];
      const btn = document.createElement("button");
      btn.className = "choice-btn" + (settings.timingPreset === key ? " active" : "");
      btn.innerHTML = `${info.title}<small>${info.sub}</small>`;
      btn.disabled = !isHost || currentRoom.state !== "lobby";
      btn.addEventListener("click", () => socket.emit("room:updateSettings", { timingPreset: key }));
      el.timingOptions.appendChild(btn);
    });
    const customBtn = document.createElement("button");
    customBtn.className = "choice-btn" + (settings.timingPreset === "custom" ? " active" : "");
    customBtn.innerHTML = `Özel<small>${settings.timing.narrate}/${settings.timing.mimic}/${settings.timing.guess}s</small>`;
    customBtn.disabled = !isHost || currentRoom.state !== "lobby";
    customBtn.addEventListener("click", () => {
      if (!isHost) return;
      const narrate = parseInt(prompt("Anlatım süresi (sn):", settings.timing.narrate) || settings.timing.narrate, 10);
      const mimic = parseInt(prompt("Taklit süresi (sn):", settings.timing.mimic) || settings.timing.mimic, 10);
      const guess = parseInt(prompt("Tahmin süresi (sn):", settings.timing.guess) || settings.timing.guess, 10);
      socket.emit("room:updateSettings", { timingPreset: "custom", timing: { narrate, mimic, guess } });
    });
    el.timingOptions.appendChild(customBtn);
    el.timingSummary.textContent = `Anlatıcı: ${settings.timing.narrate}sn • Taklit: ${settings.timing.mimic}sn • Tahmin: ${settings.timing.guess}sn`;
  }

  function renderPlayerList(room) {
    el.playerList.innerHTML = "";
    room.players.forEach((p) => {
      const card = document.createElement("div");
      card.className = "player-card" + (p.isHost ? " is-host" : "");
      const initial = (p.name || "?").slice(0, 1).toUpperCase();
      const isMe = p.id === myId;
      card.innerHTML = `
        <div class="player-avatar">${initial}</div>
        <div class="player-meta">
          <div class="player-name">${escapeHtml(p.name)}${isMe ? " (Sen)" : ""}${p.isHost ? '<span class="host-tag">Oda Sahibi</span>' : ""}</div>
          <div class="player-status ${p.ready ? "ready" : ""}">${room.state !== "lobby" ? "Puan: " + p.score : p.ready ? "✓ Hazır" : "Hazırlanıyor..."}</div>
        </div>`;
      el.playerList.appendChild(card);
    });
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function renderRoom(room) {
    currentRoom = room;
    myId = socket.id;
    isHost = room.hostId === myId;

    el.playerCount.textContent = room.players.length;
    const readyCount = room.players.filter((p) => p.ready).length;
    el.readyCountChip.textContent = `${readyCount}/${room.players.length} Hazır`;

    renderPlayerList(room);
    renderNarrationOptions(room.settings);
    renderTimingOptions(room.settings);

    el.turnsSummary.textContent = `${room.players.length} × ${room.settings.narrationsPerPerson} = ${room.players.length * room.settings.narrationsPerPerson} Tur`;

    el.hostControls.classList.toggle("hidden", !isHost || room.state !== "lobby");
    el.guestReadyControls.classList.toggle("hidden", isHost || room.state !== "lobby");

    const me = room.players.find((p) => p.id === myId);
    if (me) {
      // Button label is the action it performs: not ready yet -> offer to mark ready;
      // already ready -> offer to undo.
      el.btnToggleReady.textContent = me.ready ? "Hazır Değilim" : "✓ Hazırım!";
      el.btnToggleReady.classList.toggle("btn-success", !me.ready);
      el.btnToggleReady.classList.toggle("btn-secondary", me.ready);
    }

    el.btnResetLobbyGame.classList.toggle("hidden", !isHost || room.state !== "playing");

    const allOthersReady = room.players.filter((p) => p.id !== room.hostId).every((p) => p.ready);
    const enoughPlayers = room.players.length >= 2;
    el.btnStartGame.disabled = !(allOthersReady && enoughPlayers);
    el.startHint.textContent = !enoughPlayers
      ? "Başlamak için en az 2 oyuncu gerek."
      : !allOthersReady
      ? "Herkesin hazır olmasını bekliyorsun."
      : "Herkes hazır, başlayabilirsin!";

    renderScoreboard(room);

    if (room.state === "playing") {
      showScreen("game");
      el.gameTurnLabel.textContent = `${room.turnIndex + 1} / ${room.totalTurns}`;
    } else if (room.state === "lobby") {
      showScreen("lobby");
    }
  }

  let lastScores = {};
  function renderScoreboard(room) {
    const sorted = [...room.players].sort((a, b) => b.score - a.score);
    el.scoreboardList.innerHTML = sorted
      .map((p, i) => {
        const popped = lastScores[p.id] !== undefined && p.score > lastScores[p.id];
        return `<div class="score-row${popped ? " score-pop" : ""}" data-player-id="${p.id}"><span><span class="rank">#${i + 1}</span>${escapeHtml(p.name)}</span><strong>${p.score}</strong></div>`;
      })
      .join("");
    const next = {};
    sorted.forEach((p) => { next[p.id] = p.score; });
    lastScores = next;
  }

  el.btnToggleReady.addEventListener("click", () => {
    const me = currentRoom.players.find((p) => p.id === myId);
    socket.emit("room:setReady", { ready: !me?.ready });
  });

  el.btnStartGame.addEventListener("click", () => socket.emit("room:startGame"));

  el.btnResetLobbyGame.addEventListener("click", () => {
    if (!confirm("Oyunu durdurup herkesi lobiye döndürmek istiyor musun? Skorlar sıfırlanacak.")) return;
    socket.emit("room:returnToLobby");
  });

  // ---------- SOCKET EVENTS ----------
  socket.on("connect", () => { myId = socket.id; });

  socket.on("room:update", (room) => renderRoom(room));

  socket.on("game:turnSkipped", ({ reason, narratorId }) => {
    const p = currentRoom?.players.find((x) => x.id === narratorId);
    toast(`${p ? p.name : "Oyuncu"} süresi doldu, sıradaki tura geçiliyor...`);
  });

  socket.on("game:turnStart", (data) => {
    turnContext = { narratorId: data.narratorId, celebrity: null };
    resetGamePhases();
    el.gameTurnLabel.textContent = `${data.turnIndex + 1} / ${data.totalTurns}`;
    el.gameNarratorLabel.textContent = data.narratorName;

    const amNarrator = data.narratorId === myId;
    startCountdown(data.deadline, amNarrator ? "Anlatım" : "Bekleniyor");

    if (!amNarrator) {
      el.phaseWaiting.classList.remove("hidden");
      el.waitingText.textContent = `${data.narratorName} ünlüyü okuyor, hazırlan...`;
    }
  });

  socket.on("game:yourTurn", async ({ celebrity, deadline }) => {
    turnContext.celebrity = celebrity;
    el.phaseWaiting.classList.add("hidden");
    el.phaseNarrator.classList.remove("hidden");
    el.celebrityName.textContent = celebrity;
    el.narrationGrace.classList.add("hidden");
    el.btnRecordNarration.classList.remove("hidden");
    el.btnRecordNarration.disabled = false;
    el.btnRecordNarration.classList.remove("recording");
    el.btnRecordNarration.textContent = "🔴 Kaydı Başlat";
    el.narratorStatus.textContent = "Hazır olduğunda kayda bas.";

    let graceInterval = null;
    let finalized = false;

    function clearGrace() {
      if (graceInterval) clearInterval(graceInterval);
      graceInterval = null;
      el.narrationGrace.classList.add("hidden");
    }

    async function beginRecording() {
      clearGrace();
      el.btnRecordNarration.classList.remove("hidden");
      el.btnRecordNarration.disabled = false;
      el.btnRecordNarration.classList.add("recording");
      el.btnRecordNarration.textContent = "⏹ Kaydı Bitir";
      el.btnRecordNarration.onclick = stopRecordingClick;
      el.narratorStatus.textContent = "Konuşuyorsun... bitirince durdur.";

      let stream;
      try {
        stream = await TersAudio.getMicStream();
      } catch (e) {
        el.narratorStatus.textContent = "Mikrofon hatası: " + (e.message || e);
        el.btnRecordNarration.disabled = false;
        el.btnRecordNarration.classList.remove("recording");
        el.btnRecordNarration.textContent = "🔴 Kaydı Başlat";
        el.btnRecordNarration.onclick = beginRecording;
        return;
      }

      const capMs = Math.max(3000, deadline - Date.now());
      TersAudio.recordFor(stream, capMs)
        .then(onRecordingStopped)
        .catch((e) => {
          el.narratorStatus.textContent = "Kayıt hatası: " + (e.message || e);
          el.btnRecordNarration.disabled = false;
          el.btnRecordNarration.classList.remove("recording");
          el.btnRecordNarration.textContent = "🔴 Kaydı Başlat";
          el.btnRecordNarration.onclick = beginRecording;
        });
    }

    async function onRecordingStopped(blob) {
      if (finalized) return;
      el.btnRecordNarration.disabled = true;
      el.btnRecordNarration.textContent = "⏳ İşleniyor...";
      let wav;
      try {
        const buffer = await TersAudio.blobToAudioBuffer(blob);
        const reversed = TersAudio.reverseBuffer(buffer);
        wav = TersAudio.audioBufferToWav(reversed);
      } catch (e) {
        el.narratorStatus.textContent = "Ses işlenemedi, tekrar dene.";
        el.btnRecordNarration.disabled = false;
        el.btnRecordNarration.classList.remove("recording");
        el.btnRecordNarration.textContent = "🔴 Kaydı Başlat";
        el.btnRecordNarration.onclick = beginRecording;
        return;
      }
      showGrace(wav);
    }

    function stopRecordingClick() {
      TersAudio.stopRecording();
      el.btnRecordNarration.disabled = true;
      el.btnRecordNarration.textContent = "⏳ İşleniyor...";
    }

    function showGrace(wav) {
      el.btnRecordNarration.classList.add("hidden");
      el.narrationGrace.classList.remove("hidden");
      el.narratorStatus.textContent = "";

      let remaining = 3;
      el.narrationGraceSeconds.textContent = remaining;
      graceInterval = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearGrace();
          finalizeSend(wav);
        } else {
          el.narrationGraceSeconds.textContent = remaining;
        }
      }, 1000);

      el.btnSendNowNarration.onclick = () => {
        clearGrace();
        finalizeSend(wav);
      };
      el.btnRerecordNarration.onclick = () => {
        clearGrace();
        beginRecording();
      };
    }

    function finalizeSend(wav) {
      if (finalized) return;
      finalized = true;
      socket.emit("turn:submitNarration", { audio: wav, mimeType: "audio/wav" });
      el.phaseNarrator.classList.add("hidden");
      el.phaseWaiting.classList.remove("hidden");
      el.waitingText.textContent = "Kaydın gönderildi, diğer oyuncular dinleyip tahmin ediyor...";
    }

    el.btnRecordNarration.onclick = beginRecording;
  });

  socket.on("game:narrationReady", async (data) => {
    el.phaseWaiting.classList.add("hidden");
    el.phaseMimic.classList.remove("hidden");
    el.btnRecordMimic.classList.remove("hidden", "recording");
    el.btnRecordMimic.disabled = false;
    el.btnRecordMimic.textContent = "🔴 Taklit Kaydını Başlat";
    el.mimicStatus.textContent = "";

    const arrBuf = data.audio instanceof ArrayBuffer ? data.audio : data.audio.buffer.slice(data.audio.byteOffset, data.audio.byteOffset + data.audio.byteLength);
    try {
      reversedNarrationBuffer = await TersAudio.blobToAudioBuffer(new Blob([arrBuf], { type: "audio/wav" }));
    } catch (e) {
      reversedNarrationBuffer = null;
    }

    function playReversed() {
      if (reversedNarrationBuffer) TersAudio.playAudioBuffer(reversedNarrationBuffer);
    }

    let playsLeft = 2; // 1 auto-play + 2 manual replays = 3 listens total
    el.replayReversedCount.textContent = playsLeft;
    el.btnReplayReversed.disabled = false;
    playReversed();

    el.btnReplayReversed.onclick = () => {
      if (playsLeft <= 0) return;
      playsLeft -= 1;
      el.replayReversedCount.textContent = playsLeft;
      playReversed();
      if (playsLeft <= 0) el.btnReplayReversed.disabled = true;
    };

    startCountdown(data.deadline, "Taklit");

    let mimicDoneSent = false;

    async function beginMimicRecording() {
      el.btnRecordMimic.disabled = false;
      el.btnRecordMimic.classList.add("recording");
      el.btnRecordMimic.textContent = "✅ Taklit Tamamla";
      el.btnRecordMimic.onclick = stopMimicRecording;
      el.mimicStatus.textContent = "Konuşuyorsun... bitirince tamamlaya bas.";

      let stream;
      try {
        stream = await TersAudio.getMicStream();
      } catch (e) {
        el.mimicStatus.textContent = "Mikrofon hatası: " + (e.message || e);
        resetMimicButton();
        return;
      }

      TersAudio.recordFor(stream, 120000)
        .then(onMimicStopped)
        .catch((e) => {
          el.mimicStatus.textContent = "Kayıt hatası: " + (e.message || e);
          resetMimicButton();
        });
    }

    function resetMimicButton() {
      el.btnRecordMimic.disabled = false;
      el.btnRecordMimic.classList.remove("recording");
      el.btnRecordMimic.textContent = "🔴 Taklit Kaydını Başlat";
      el.btnRecordMimic.onclick = beginMimicRecording;
    }

    function stopMimicRecording() {
      TersAudio.stopRecording();
      el.btnRecordMimic.disabled = true;
      el.btnRecordMimic.textContent = "⏳ İşleniyor...";
    }

    async function onMimicStopped(blob) {
      if (mimicDoneSent) return;
      try {
        const myBuffer = await TersAudio.blobToAudioBuffer(blob);
        mimicReversedBuffer = TersAudio.reverseBuffer(myBuffer);
      } catch (e) {
        mimicReversedBuffer = null;
      }
      finishMimic();
    }

    function finishMimic() {
      if (mimicDoneSent) return;
      mimicDoneSent = true;
      TersAudio.stopRecording();
      socket.emit("turn:mimicDone");
      el.phaseMimic.classList.add("hidden");
      el.phaseWaiting.classList.remove("hidden");
      el.waitingText.textContent = "Taklidin tamam! Diğer oyuncular bekleniyor...";
    }

    el.btnRecordMimic.onclick = beginMimicRecording;
  });

  socket.on("game:guessPhaseStart", (data) => {
    if (turnContext?.narratorId === myId) return; // narrator just waits for the result
    TersAudio.stopRecording();
    startGuessPhase(data.deadline);
  });

  function startGuessPhase(deadline) {
    resetGamePhases();
    el.phaseGuess.classList.remove("hidden");
    el.inputGuess.value = "";
    el.guessStatus.textContent = "";
    startCountdown(deadline, "Tahmin");

    if (mimicReversedBuffer) TersAudio.playAudioBuffer(mimicReversedBuffer);
    el.btnReplayMimic.onclick = () => {
      if (mimicReversedBuffer) TersAudio.playAudioBuffer(mimicReversedBuffer);
    };

    let submitted = false;
    const doSubmit = () => {
      if (submitted) return;
      submitted = true;
      socket.emit("turn:submitGuess", { guess: el.inputGuess.value });
      el.guessStatus.textContent = "Gönderildi! Sonuç bekleniyor...";
      el.btnSubmitGuess.disabled = true;
      el.inputGuess.disabled = true;
    };

    el.btnSubmitGuess.onclick = doSubmit;
    el.inputGuess.onkeydown = (e) => { if (e.key === "Enter") doSubmit(); };
    el.btnSubmitGuess.disabled = false;
    el.inputGuess.disabled = false;

    clearTimeout(guessPhaseAutoSubmit);
    const remainMs = Math.max(500, deadline - Date.now() + 300);
    guessPhaseAutoSubmit = setTimeout(doSubmit, remainMs);
  }
  let guessPhaseAutoSubmit = null;

  socket.on("game:turnResult", (data) => {
    clearTimeout(guessPhaseAutoSubmit);
    resetGamePhases();
    el.phaseResult.classList.remove("hidden");
    el.resultAnswer.textContent = data.celebrity;
    el.resultList.innerHTML = data.results
      .map(
        (r, i) => `<div class="result-row ${r.correct ? "correct" : "wrong"}" style="animation-delay:${i * 80}ms">
          <span>${escapeHtml(r.name)}</span>
          <span>${r.guess ? '"' + escapeHtml(r.guess) + '"' : "(cevap yok)"}</span>
          <span class="result-badge">${r.correct ? "+1 ✓" : "✗"}</span>
        </div>`
      )
      .join("");

    const anyCorrect = data.results.some((r) => r.correct);
    el.resultCelebration.classList.toggle("hidden", !anyCorrect);
    if (anyCorrect) {
      el.resultCelebration.style.animation = "none";
      void el.resultCelebration.offsetWidth;
      el.resultCelebration.style.animation = "";
    }
    stopCountdown();
  });

  socket.on("game:over", (data) => {
    showScreen("end");
    const sorted = [...data.scores];
    el.finalScoreboard.innerHTML = sorted
      .map((p, i) => `<div class="score-row"><span><span class="rank">#${i + 1}</span>${escapeHtml(p.name)}</span><strong>${p.score}</strong></div>`)
      .join("");
    el.btnBackToLobby.classList.toggle("hidden", !isHost);
  });

  el.btnBackToLobby.addEventListener("click", () => socket.emit("room:returnToLobby"));

  function resetGamePhases() {
    [el.phaseWaiting, el.phaseNarrator, el.phaseMimic, el.phaseGuess, el.phaseResult].forEach((p) =>
      p.classList.add("hidden")
    );
  }

  function startCountdown(deadline, label) {
    stopCountdown();
    const total = Math.max(1, deadline - Date.now());
    const start = Date.now();
    function tick() {
      const remain = Math.max(0, deadline - Date.now());
      const pct = Math.max(0, Math.min(100, (remain / total) * 100));
      el.gameTimerBar.style.width = pct + "%";
      el.gameTimerText.textContent = `${label} • ${Math.ceil(remain / 1000)}sn`;
      if (remain <= 0) {
        clearInterval(countdownHandle);
        countdownHandle = null;
      }
    }
    tick();
    countdownHandle = setInterval(tick, 200);
  }
  function stopCountdown() {
    if (countdownHandle) clearInterval(countdownHandle);
    countdownHandle = null;
  }

  // ---------- AUTO-JOIN VIA URL ----------
  (function autoJoinFromUrl() {
    const url = new URL(window.location.href);
    const roomParam = url.searchParams.get("room");
    if (roomParam) el.inputJoinCode.value = roomParam.toUpperCase();
  })();
})();
