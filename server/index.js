const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { RoomManager, MAX_PLAYERS, TIMING_PRESETS, isGuessCorrect } = require("./rooms");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 12 * 1024 * 1024, // reversed voice clips as WAV
});

app.use(express.static(path.join(__dirname, "..", "public")));

const manager = new RoomManager();
const RESULT_PAUSE_MS = 4500;

function broadcastRoom(room) {
  io.to(room.code).emit("room:update", room.publicState());
}

function clearTurnTimer(room) {
  if (room.currentTurn && room.currentTurn.timer) {
    clearTimeout(room.currentTurn.timer);
    room.currentTurn.timer = null;
  }
}

function endGame(room) {
  room.state = "finished";
  clearTurnTimer(room);
  room.currentTurn = null;
  const scores = [...room.players.values()]
    .map((p) => ({ id: p.id, name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score);
  io.to(room.code).emit("game:over", { scores });
  broadcastRoom(room);
}

function startNextTurn(room) {
  clearTurnTimer(room);

  if (room.turnIndex >= room.turnQueue.length) {
    endGame(room);
    return;
  }

  // skip players who disconnected mid-game
  let narratorId = room.turnQueue[room.turnIndex];
  while (narratorId && !room.players.has(narratorId)) {
    room.turnIndex++;
    if (room.turnIndex >= room.turnQueue.length) {
      endGame(room);
      return;
    }
    narratorId = room.turnQueue[room.turnIndex];
  }

  const narrator = room.players.get(narratorId);
  const celebrity = room.nextCelebrity();
  const deadline = Date.now() + room.settings.timing.narrate * 1000;

  room.currentTurn = {
    narratorId,
    celebrity,
    phase: "narrating",
    guesses: new Map(),
    mimicDone: new Set(),
    timer: null,
  };

  io.to(room.code).emit("game:turnStart", {
    turnIndex: room.turnIndex,
    totalTurns: room.totalTurns,
    narratorId,
    narratorName: narrator.name,
    timing: room.settings.timing,
    deadline,
  });

  const narratorSocket = io.sockets.sockets.get(narratorId);
  if (narratorSocket) {
    narratorSocket.emit("game:yourTurn", { celebrity, deadline });
  }

  room.currentTurn.timer = setTimeout(() => {
    // narrator failed to submit in time -> skip turn with no scoring
    room.turnIndex++;
    io.to(room.code).emit("game:turnSkipped", { reason: "timeout", narratorId });
    startNextTurn(room);
  }, room.settings.timing.narrate * 1000 + 1500);

  broadcastRoom(room);
}

function beginGuessPhase(room) {
  const turn = room.currentTurn;
  if (!turn || turn.phase === "guessing") return;
  clearTurnTimer(room);
  turn.phase = "guessing";

  const guessMs = room.settings.timing.guess * 1000;
  const deadline = Date.now() + guessMs;
  io.to(room.code).emit("game:guessPhaseStart", { deadline });

  room.currentTurn.timer = setTimeout(() => {
    finalizeTurn(room);
  }, guessMs + 1000);
}

function finalizeTurn(room) {
  clearTurnTimer(room);
  const turn = room.currentTurn;
  if (!turn) return;

  const results = [];
  for (const [playerId, guessText] of turn.guesses.entries()) {
    const player = room.players.get(playerId);
    if (!player) continue;
    const correct = isGuessCorrect(guessText, turn.celebrity);
    if (correct) player.score += 1;
    results.push({ playerId, name: player.name, guess: guessText, correct });
  }
  // include listeners who never guessed
  for (const player of room.players.values()) {
    if (player.id === turn.narratorId) continue;
    if (!turn.guesses.has(player.id)) {
      results.push({ playerId: player.id, name: player.name, guess: "", correct: false });
    }
  }

  io.to(room.code).emit("game:turnResult", {
    narratorId: turn.narratorId,
    narratorName: room.players.get(turn.narratorId)?.name || "?",
    celebrity: turn.celebrity,
    results,
  });
  broadcastRoom(room);

  room.turnIndex++;
  room.currentTurn = null;
  setTimeout(() => startNextTurn(room), RESULT_PAUSE_MS);
}

io.on("connection", (socket) => {
  socket.on("room:create", (payload, cb) => {
    const name = (payload?.name || "").trim().slice(0, 24) || "Oyuncu";
    const room = manager.create(socket.id);
    room.addPlayer(socket.id, name);
    socket.join(room.code);
    socket.data.roomCode = room.code;
    cb?.({ ok: true, room: room.publicState() });
    broadcastRoom(room);
  });

  socket.on("room:join", (payload, cb) => {
    const code = (payload?.code || "").trim().toUpperCase();
    const name = (payload?.name || "").trim().slice(0, 24) || "Oyuncu";
    const room = manager.get(code);
    if (!room) return cb?.({ ok: false, error: "Oda bulunamadı." });
    if (room.state !== "lobby") return cb?.({ ok: false, error: "Oyun zaten başladı." });
    if (room.playerCount >= MAX_PLAYERS) return cb?.({ ok: false, error: "Oda dolu." });

    room.addPlayer(socket.id, name);
    socket.join(room.code);
    socket.data.roomCode = room.code;
    cb?.({ ok: true, room: room.publicState() });
    broadcastRoom(room);
  });

  socket.on("room:setReady", (payload) => {
    const room = manager.get(socket.data.roomCode);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    player.ready = !!payload?.ready;
    broadcastRoom(room);
  });

  socket.on("room:updateSettings", (payload) => {
    const room = manager.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id || room.state !== "lobby") return;

    if (payload?.narrationsPerPerson) {
      const n = Math.max(1, Math.min(4, parseInt(payload.narrationsPerPerson, 10) || 2));
      room.settings.narrationsPerPerson = n;
    }
    if (payload?.timingPreset && TIMING_PRESETS[payload.timingPreset]) {
      room.settings.timingPreset = payload.timingPreset;
      room.settings.timing = { ...TIMING_PRESETS[payload.timingPreset] };
    } else if (payload?.timingPreset === "custom" && payload?.timing) {
      room.settings.timingPreset = "custom";
      room.settings.timing = {
        narrate: clampSeconds(payload.timing.narrate, 35),
        mimic: clampSeconds(payload.timing.mimic, 45),
        guess: clampSeconds(payload.timing.guess, 30),
      };
    }
    broadcastRoom(room);
  });

  socket.on("room:startGame", () => {
    const room = manager.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id || room.state !== "lobby") return;
    if (room.playerCount < 2) return;

    room.state = "playing";
    room.buildTurnQueue();
    broadcastRoom(room);
    startNextTurn(room);
  });

  socket.on("turn:submitNarration", (payload) => {
    const room = manager.get(socket.data.roomCode);
    if (!room || !room.currentTurn) return;
    const turn = room.currentTurn;
    if (turn.phase !== "narrating" || turn.narratorId !== socket.id) return;
    if (!payload?.audio) return;

    turn.phase = "mimicking";
    clearTurnTimer(room);

    const audioBuffer = Buffer.isBuffer(payload.audio) ? payload.audio : Buffer.from(payload.audio);
    const mimicMs = room.settings.timing.mimic * 1000;
    const deadline = Date.now() + mimicMs;

    socket.to(room.code).emit("game:narrationReady", {
      audio: audioBuffer,
      mimeType: payload.mimeType || "audio/wav",
      deadline,
    });

    room.currentTurn.timer = setTimeout(() => {
      beginGuessPhase(room);
    }, mimicMs + 1000);
  });

  socket.on("turn:mimicDone", () => {
    const room = manager.get(socket.data.roomCode);
    if (!room || !room.currentTurn) return;
    const turn = room.currentTurn;
    if (turn.phase !== "mimicking" || turn.narratorId === socket.id) return;
    if (!room.players.has(socket.id)) return;

    turn.mimicDone.add(socket.id);

    const listenerCount = room.playerCount - 1;
    if (turn.mimicDone.size >= listenerCount && listenerCount > 0) {
      beginGuessPhase(room);
    }
  });

  socket.on("turn:submitGuess", (payload) => {
    const room = manager.get(socket.data.roomCode);
    if (!room || !room.currentTurn) return;
    const turn = room.currentTurn;
    if (turn.phase !== "guessing" || turn.narratorId === socket.id) return;
    if (!room.players.has(socket.id)) return;

    turn.guesses.set(socket.id, (payload?.guess || "").slice(0, 60));

    const listenerCount = room.playerCount - 1;
    if (turn.guesses.size >= listenerCount && listenerCount > 0) {
      finalizeTurn(room);
    }
  });

  socket.on("room:returnToLobby", () => {
    const room = manager.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.id) return;
    clearTurnTimer(room);
    room.state = "lobby";
    room.currentTurn = null;
    room.turnQueue = [];
    room.turnIndex = 0;
    room.totalTurns = 0;
    for (const p of room.players.values()) {
      p.ready = false;
      p.score = 0;
    }
    broadcastRoom(room);
  });

  socket.on("room:leave", () => handleLeave(socket));
  socket.on("disconnect", () => handleLeave(socket));

  function handleLeave(socket) {
    const code = socket.data.roomCode;
    const room = manager.get(code);
    if (!room) return;
    const wasNarrator = room.currentTurn?.narratorId === socket.id;
    room.removePlayer(socket.id);

    if (room.isEmpty()) {
      manager.delete(room.code);
      return;
    }

    if (room.state === "playing" && wasNarrator) {
      io.to(room.code).emit("game:turnSkipped", { reason: "narrator_left", narratorId: socket.id });
      room.turnIndex++;
      room.currentTurn = null;
      startNextTurn(room);
    } else if (room.state === "playing" && room.playerCount < 2) {
      endGame(room);
    } else {
      broadcastRoom(room);
    }
  }
});

function clampSeconds(v, fallback) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(10, Math.min(180, n));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`TERS-TEN sunucusu http://localhost:${PORT} adresinde çalışıyor`);
});
