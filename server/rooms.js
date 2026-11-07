const { nanoid } = require("nanoid");
const { CELEBRITIES, shuffle, isGuessCorrect } = require("./celebrities");

const MAX_PLAYERS = 10;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const TIMING_PRESETS = {
  short: { narrate: 25, mimic: 35, guess: 20 },
  normal: { narrate: 35, mimic: 45, guess: 30 },
  long: { narrate: 50, mimic: 65, guess: 45 },
};

function makeRoomCode() {
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return s;
}

class Room {
  constructor(code, hostSocketId) {
    this.code = code;
    this.hostId = hostSocketId;
    this.players = new Map(); // socketId -> {id, name, ready, score, connected}
    this.state = "lobby"; // lobby | playing | finished
    this.settings = {
      narrationsPerPerson: 2,
      timingPreset: "normal",
      timing: { ...TIMING_PRESETS.normal },
    };
    this.celebrityQueue = [];
    this.turnQueue = [];
    this.turnIndex = 0;
    this.totalTurns = 0;
    this.currentTurn = null; // {narratorId, celebrity, phase, guesses: Map, timer}
    this.createdAt = Date.now();
  }

  addPlayer(socketId, name) {
    this.players.set(socketId, {
      id: socketId,
      name,
      ready: false,
      score: 0,
      connected: true,
    });
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    if (this.hostId === socketId) {
      const next = [...this.players.keys()][0];
      this.hostId = next || null;
    }
  }

  get playerCount() {
    return this.players.size;
  }

  isEmpty() {
    return this.players.size === 0;
  }

  nextCelebrity() {
    if (this.celebrityQueue.length === 0) {
      this.celebrityQueue = shuffle(CELEBRITIES);
    }
    return this.celebrityQueue.pop();
  }

  buildTurnQueue() {
    const ids = [...this.players.keys()];
    let queue = [];
    for (let r = 0; r < this.settings.narrationsPerPerson; r++) {
      queue = queue.concat(shuffle(ids));
    }
    this.turnQueue = queue;
    this.totalTurns = queue.length;
    this.turnIndex = 0;
  }

  publicState() {
    return {
      code: this.code,
      hostId: this.hostId,
      state: this.state,
      settings: this.settings,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        ready: p.ready,
        score: p.score,
        connected: p.connected,
        isHost: p.id === this.hostId,
      })),
      totalTurns: this.totalTurns,
      turnIndex: this.turnIndex,
    };
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  create(hostSocketId) {
    let code;
    do {
      code = makeRoomCode();
    } while (this.rooms.has(code));
    const room = new Room(code, hostSocketId);
    this.rooms.set(code, room);
    return room;
  }

  get(code) {
    return this.rooms.get((code || "").toUpperCase());
  }

  delete(code) {
    this.rooms.delete(code);
  }
}

module.exports = {
  RoomManager,
  MAX_PLAYERS,
  TIMING_PRESETS,
  isGuessCorrect,
};
