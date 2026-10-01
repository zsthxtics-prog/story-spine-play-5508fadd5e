"use strict";

const STORAGE_KEY = "story-spine-virtual-game-v1";

const BEATS = [
  { id: "OUAT-1", deck: 1, name: "Once Upon a Time", description: "Introduce the main character and setting." },
  { id: "ED-1", deck: 2, name: "Every Day", description: "Establish the character's normal routine." },
  { id: "UOD-1", deck: 3, name: "Until One Day", description: "Introduce the inciting incident." },
  { id: "BOT-1", deck: 4, name: "Because of That 1", description: "Begin the cause-and-effect chain." },
  { id: "BOT-2", deck: 4, name: "Because of That 2", description: "Continue the cause-and-effect chain." },
  { id: "BOT-3", deck: 4, name: "Because of That 3", description: "Escalate the cause-and-effect chain." },
  { id: "BOT-4", deck: 4, name: "Because of That 4", description: "Complete the cause-and-effect chain." },
  { id: "UF-1", deck: 5, name: "Until Finally", description: "Add the climax or resolution." },
  { id: "ES-1", deck: 6, name: "Ever Since", description: "Establish the new normal or lesson." }
];

const DECKS = {
  1: { name: "Once Upon a Time", cards: ["restless", "a brass key", "midnight market", "careful inventor", "foggy harbor", "borrowed coat", "tiny apartment", "secretive", "old lighthouse", "traveling baker", "cracked compass", "quiet village", "unlucky musician", "glass tower", "blue notebook", "underground station", "curious gardener", "empty museum", "patient mechanic", "silver bell"] },
  2: { name: "Every Day", cards: ["before sunrise", "counting footsteps", "the old radio", "watering plants", "missed the bus", "wrote one letter", "checked every lock", "fed the pigeons", "practiced in secret", "made the same tea", "watched the bridge", "polished a trophy", "followed a map", "hid one coin", "visited the bakery", "sang too loudly", "collected buttons", "avoided the attic", "told one joke", "waited by the window"] },
  3: { name: "Until One Day", cards: ["a sudden message", "footprints", "the lights vanished", "unexpected visitor", "broken clock", "wrong delivery", "a distant whistle", "open window", "missing photograph", "strange invitation", "purple smoke", "a secret meeting", "falling stars", "locked suitcase", "power outage", "talking bird", "mysterious package", "vanishing road", "forgotten tunnel", "three loud knocks"] },
  4: { name: "Because of That", cards: ["jealousy", "a locked door", "lost the map", "heavy rain", "changed direction", "made a promise", "ran out of time", "trusted a stranger", "false alarm", "broken ladder", "forgot the password", "a growing crowd", "sudden courage", "spilled the paint", "took a shortcut", "heard a rumor", "switched the signs", "hid the evidence", "called for help", "accidental victory"] },
  5: { name: "Until Finally", cards: ["told the truth", "a hidden lever", "asked for help", "final bargain", "opened the gate", "returned the key", "solved the riddle", "changed the plan", "shared the secret", "crossed the bridge", "faced the fear", "followed the music", "found the missing piece", "worked together", "read the last page", "broke the pattern", "made one choice", "turned around", "used the mirror", "forgave the mistake"] },
  6: { name: "Ever Since", cards: ["new tradition", "trusted nobody", "every full moon", "became a legend", "kept the door open", "never traveled alone", "annual parade", "shared breakfast", "one empty chair", "wore mismatched shoes", "remembered the promise", "taught the lesson", "quiet celebration", "a changed friendship", "visited each winter", "left the light on", "new nickname", "never hurried", "told the story", "watched the stars"] }
};

const els = Object.fromEntries([...document.querySelectorAll("[id]")].map(el => [el.id, el]));
let history = [];
let toastTimer;

function initialState() {
  return {
    version: 1,
    phase: "setup",
    players: [],
    activePlayer: 0,
    round1Index: 0,
    round2Turn: 0,
    turnLimit: 12,
    scoring: false,
    story: Object.fromEntries(BEATS.map(beat => [beat.id, ""])),
    seenDecks: [],
    usedCards: [],
    currentDraw: null,
    awaitingJudgment: false,
    judgmentPlayer: null,
    audit: [],
    finishReason: ""
  };
}

let state = loadLocal() || initialState();

function randomInt(max) {
  if (window.crypto?.getRandomValues) {
    const range = 0x100000000;
    const limit = range - (range % max);
    const array = new Uint32Array(1);
    do window.crypto.getRandomValues(array); while (array[0] >= limit);
    return array[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function snapshot() {
  history.push(JSON.stringify(state));
  if (history.length > 30) history.shift();
}

function commit(message) {
  if (message) state.audit.unshift(message);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.version === 1 ? parsed : null;
  } catch { return null; }
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2400);
}

function escapeText(value) { return String(value ?? ""); }
function beatById(id) { return BEATS.find(beat => beat.id === id); }
function eligibleIds(deck) { return BEATS.filter(beat => beat.deck === deck).map(beat => beat.id); }
function nextBeatId(id) { const index = BEATS.findIndex(beat => beat.id === id); return BEATS[index + 1]?.id || null; }

function parsePlayers(raw) {
  return raw.split(/[\n,]+/).map(name => name.trim()).filter(Boolean);
}

function startGame(event) {
  event.preventDefault();
  const names = parsePlayers(els.playersInput.value);
  if (names.length < 3 || names.length > 6) {
    els.setupError.textContent = "Please enter between 3 and 6 players.";
    return;
  }
  if (new Set(names.map(name => name.toLowerCase())).size !== names.length) {
    els.setupError.textContent = "Player names must be unique.";
    return;
  }
  const turnLimit = Number(els.turnLimitInput.value);
  if (!Number.isInteger(turnLimit) || turnLimit < 6 || turnLimit > 30) {
    els.setupError.textContent = "Choose a Round 2 limit from 6 to 30 turns.";
    return;
  }

  snapshot();
  state = initialState();
  state.phase = "round1";
  state.players = names.map(name => ({ name, score: 0, redraws: 1 }));
  state.turnLimit = turnLimit;
  state.scoring = els.scoringInput.checked;
  state.audit = [`Game started with ${names.join(", ")}.`];
  commit();
}

function addRound1Sentence(event) {
  event.preventDefault();
  const text = els.round1Sentence.value.trim();
  if (!text) return;
  snapshot();
  const beat = BEATS[state.round1Index];
  const player = state.players[state.activePlayer];
  state.story[beat.id] = text;
  state.audit.unshift(`${player.name} added ${beat.id}: ${text}`);
  state.round1Index += 1;
  state.activePlayer = (state.activePlayer + 1) % state.players.length;
  els.round1Sentence.value = "";
  if (state.round1Index >= BEATS.length) {
    state.phase = "round2";
    state.activePlayer = 0;
    state.audit.unshift("Round 1 complete. Round 2 began.");
  }
  commit();
}

function drawCard(deckNumber) {
  const deck = DECKS[deckNumber];
  const available = deck.cards.filter(card => !state.usedCards.includes(card));
  const pool = available.length ? available : deck.cards;
  const card = pool[randomInt(pool.length)];
  state.usedCards.push(card);
  return card;
}

function rollAndDraw() {
  if (state.currentDraw || state.awaitingJudgment || state.phase !== "round2") return;
  snapshot();
  const roll = randomInt(6) + 1;
  const card = drawCard(roll);
  state.currentDraw = { roll, card };
  if (!state.seenDecks.includes(roll)) state.seenDecks.push(roll);
  state.audit.unshift(`Turn ${state.round2Turn + 1}: ${state.players[state.activePlayer].name} rolled ${roll} (${DECKS[roll].name}) and drew “${card}.”`);
  commit();
}

function redraw() {
  if (!state.currentDraw) return;
  const player = state.players[state.activePlayer];
  if (player.redraws < 1) return showToast("This player has already used their redraw.");
  snapshot();
  const rejected = state.currentDraw.card;
  player.redraws -= 1;
  state.currentDraw.card = drawCard(state.currentDraw.roll);
  state.audit.unshift(`${player.name} rejected “${rejected}” and redrew “${state.currentDraw.card}” from ${DECKS[state.currentDraw.roll].name}.`);
  commit();
}

function saveRewrite(event) {
  event.preventDefault();
  if (!state.currentDraw) return;
  const id = els.sentenceSelect.value;
  const allowed = eligibleIds(state.currentDraw.roll);
  if (!allowed.includes(id)) return showToast("That sentence does not match the rolled deck.");
  const text = els.editSentence.value.trim();
  if (!text) return;

  snapshot();
  const player = state.players[state.activePlayer];
  const before = state.story[id];
  state.story[id] = text;
  state.audit.unshift(`${player.name} rewrote ${id}: “${before}” → “${text}” using “${state.currentDraw.card}.”`);

  if (els.rippleToggle.checked) {
    const nextId = nextBeatId(id);
    const ripple = els.rippleSentence.value.trim();
    if (nextId && ripple) {
      const rippleBefore = state.story[nextId];
      state.story[nextId] = ripple;
      state.audit.unshift(`${player.name} used One Ripple on ${nextId}: “${rippleBefore}” → “${ripple}.”`);
    }
  }

  state.currentDraw = null;
  els.rippleToggle.checked = false;
  els.rippleSentence.value = "";
  if (state.scoring) {
    state.awaitingJudgment = true;
    state.judgmentPlayer = state.activePlayer;
    commit();
  } else {
    finishTurn();
  }
}

function judge(delta, label) {
  if (!state.awaitingJudgment) return;
  snapshot();
  state.players[state.judgmentPlayer].score += delta;
  state.audit.unshift(`${label}: ${state.players[state.judgmentPlayer].name} ${delta > 0 ? "+1" : "−1"} point.`);
  state.awaitingJudgment = false;
  state.judgmentPlayer = null;
  finishTurn();
}

function finishTurn() {
  state.round2Turn += 1;
  const allDecksSeen = state.seenDecks.length === 6;
  const limitReached = state.round2Turn >= state.turnLimit;
  if (allDecksSeen || limitReached) {
    state.phase = "finished";
    state.finishReason = allDecksSeen ? "All six decks were drawn from at least once." : `The ${state.turnLimit}-turn limit was reached.`;
    state.audit.unshift(`Game ended: ${state.finishReason}`);
  } else {
    state.activePlayer = (state.activePlayer + 1) % state.players.length;
  }
  commit();
}

function updateRippleFields() {
  const id = els.sentenceSelect.value;
  const nextId = nextBeatId(id);
  const show = els.rippleToggle.checked && nextId;
  els.rippleFields.classList.toggle("hidden", !show);
  if (show) {
    els.rippleLabel.textContent = `Optional rewrite for ${nextId} — ${beatById(nextId).name}`;
    els.rippleSentence.value = state.story[nextId];
  }
}

function syncEditSelection() {
  const id = els.sentenceSelect.value;
  els.editSentence.value = state.story[id] || "";
  const hasNext = Boolean(nextBeatId(id));
  els.rippleToggleRow.classList.toggle("hidden", !hasNext);
  if (!hasNext) els.rippleToggle.checked = false;
  updateRippleFields();
}

function render() {
  const isSetup = state.phase === "setup";
  els.setupPanel.classList.toggle("hidden", !isSetup);
  els.gamePanel.classList.toggle("hidden", isSetup);
  els.round1Controls.classList.toggle("hidden", state.phase !== "round1");
  els.round2Controls.classList.toggle("hidden", state.phase !== "round2");
  els.finishedControls.classList.toggle("hidden", state.phase !== "finished");
  els.undoBtn.disabled = history.length === 0;
  els.readStoryBtn.disabled = !Object.values(state.story).some(Boolean);

  if (state.phase === "round1") {
    const beat = BEATS[state.round1Index];
    const player = state.players[state.activePlayer];
    els.phaseLabel.textContent = "Round 1 — Build the Spine";
    els.turnHeading.textContent = `${player.name}'s turn`;
    els.turnCounter.textContent = `Beat ${state.round1Index + 1} of ${BEATS.length}`;
    els.beatName.textContent = `${beat.name} · ${beat.id}`;
    els.beatDescription.textContent = beat.description;
    els.round1Card.className = `story-card round1-card deck-${beat.deck}`;
    els.round1Sentence.placeholder = `${player.name}, add the ${beat.name} sentence…`;
  }

  if (state.phase === "round2") {
    const player = state.players[state.activePlayer];
    els.phaseLabel.textContent = "Round 2 — Rewrite by Chance";
    els.turnHeading.textContent = `${player.name}'s turn`;
    els.turnCounter.textContent = `Turn ${state.round2Turn + 1} of ${state.turnLimit}`;
    els.judgmentPanel.classList.toggle("hidden", !state.awaitingJudgment);
    els.rollBtn.classList.toggle("hidden", Boolean(state.currentDraw) || state.awaitingJudgment);
    els.editForm.classList.toggle("hidden", !state.currentDraw || state.awaitingJudgment);

    if (state.currentDraw) {
      const { roll, card } = state.currentDraw;
      els.dieFace.textContent = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][roll - 1];
      els.dieNumber.textContent = String(roll);
      els.dieFace.setAttribute("aria-label", `Die rolled ${roll}`);
      els.virtualCard.className = `story-card drawn-card revealed deck-${roll}`;
      els.cardNumber.textContent = `${String(roll).padStart(2, "0")} · ${DECKS[roll].name}`;
      els.deckName.textContent = `${DECKS[roll].name} deck`;
      els.cardText.textContent = card;
      const ids = eligibleIds(roll);
      const existing = els.sentenceSelect.value;
      els.sentenceSelect.replaceChildren(...ids.map(id => new Option(`${id} — ${beatById(id).name}`, id)));
      els.sentenceSelect.value = ids.includes(existing) ? existing : ids[0];
      syncEditSelection();
      els.redrawBtn.disabled = player.redraws < 1;
      els.redrawBtn.textContent = player.redraws > 0 ? "Use redraw" : "Redraw used";
    } else {
      els.dieFace.textContent = "?";
      els.dieNumber.textContent = "D6";
      els.dieFace.setAttribute("aria-label", "Die has not been rolled");
      els.virtualCard.className = "story-card drawn-card card-idle";
      els.cardNumber.textContent = "DRAW";
      els.deckName.textContent = state.awaitingJudgment ? "Rewrite saved" : "Ready to roll";
      els.cardText.textContent = state.awaitingJudgment ? "The group decides whether the edit holds together." : "The die chooses the story beat and virtual deck.";
    }
  }

  if (state.phase === "finished") {
    els.phaseLabel.textContent = "Finished";
    els.turnHeading.textContent = "Final story";
    els.turnCounter.textContent = `${state.round2Turn} rewrite turns`;
    els.finishReason.textContent = state.finishReason;
  }

  renderStory();
  renderPlayers();
  renderDecks();
  renderAudit();
}

function renderStory() {
  const completed = BEATS.filter(beat => state.story[beat.id]).length;
  els.storyProgress.textContent = `${completed} / ${BEATS.length} beats`;
  els.emptyStory.classList.toggle("hidden", completed > 0);
  els.storyList.replaceChildren(...BEATS.filter(beat => state.story[beat.id]).map(beat => {
    const li = document.createElement("li");
    li.className = "story-item";
    const label = document.createElement("span");
    label.className = "story-beat";
    label.textContent = beat.name;
    const text = document.createElement("p");
    text.className = "story-text";
    text.textContent = state.story[beat.id];
    li.append(label, text);
    return li;
  }));
}

function renderPlayers() {
  if (!state.players.length) {
    els.playersList.innerHTML = '<p class="empty-state">Add players to begin.</p>';
    return;
  }
  els.playersList.replaceChildren(...state.players.map((player, index) => {
    const row = document.createElement("div");
    row.className = `player-row${index === state.activePlayer && state.phase !== "finished" ? " active" : ""}`;
    const info = document.createElement("div");
    const name = document.createElement("div");
    name.className = "player-name";
    name.textContent = player.name;
    const meta = document.createElement("div");
    meta.className = "player-meta";
    meta.textContent = `${player.redraws} redraw${player.redraws === 1 ? "" : "s"} left`;
    info.append(name, meta);
    const score = document.createElement("div");
    score.className = "score";
    score.textContent = state.scoring ? player.score : "—";
    row.append(info, score);
    return row;
  }));
}

function renderDecks() {
  els.deckTracker.replaceChildren(...Object.entries(DECKS).map(([number, deck]) => {
    const chip = document.createElement("div");
    chip.className = `deck-chip deck-${number}${state.seenDecks.includes(Number(number)) ? " seen" : ""}`;
    chip.innerHTML = `<span class="deck-number">0${number}</span><span class="deck-name">${deck.name}</span><span class="deck-status">${state.seenDecks.includes(Number(number)) ? "DRAWN" : "IN PLAY"}</span>`;
    return chip;
  }));
}

function renderAudit() {
  els.auditList.replaceChildren(...state.audit.map(entry => {
    const li = document.createElement("li");
    li.textContent = entry;
    return li;
  }));
}

function readStory() {
  const text = BEATS.map(beat => state.story[beat.id]).filter(Boolean).join(" ");
  if (!text || !window.speechSynthesis) return showToast("Read-aloud is not supported in this browser.");
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

function downloadState(filename = "story-spine-save.json") {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function loadState(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const loaded = JSON.parse(reader.result);
      if (loaded?.version !== 1 || !Array.isArray(loaded.players) || !loaded.story) throw new Error("Invalid save");
      snapshot();
      state = loaded;
      commit("Save file loaded.");
      showToast("Game loaded.");
    } catch { showToast("That file is not a valid Story Spine save."); }
  };
  reader.readAsText(file);
}

function resetGame() {
  if (!confirm("Start a new game? The current browser save will be replaced.")) return;
  snapshot();
  state = initialState();
  commit();
}

function undo() {
  if (!history.length) return;
  state = JSON.parse(history.pop());
  state.audit.unshift("Latest action undone by the host.");
  commit();
  showToast("Latest action undone.");
}

els.setupForm.addEventListener("submit", startGame);
els.round1Form.addEventListener("submit", addRound1Sentence);
els.rollBtn.addEventListener("click", rollAndDraw);
els.editForm.addEventListener("submit", saveRewrite);
els.redrawBtn.addEventListener("click", redraw);
els.sentenceSelect.addEventListener("change", syncEditSelection);
els.rippleToggle.addEventListener("change", updateRippleFields);
els.makesSenseBtn.addEventListener("click", () => judge(1, "Makes sense"));
els.storyBreakBtn.addEventListener("click", () => judge(-1, "Story Break"));
els.readStoryBtn.addEventListener("click", readStory);
els.newGameBtn.addEventListener("click", resetGame);
els.undoBtn.addEventListener("click", undo);
els.saveBtn.addEventListener("click", () => downloadState());
els.exportBtn.addEventListener("click", () => downloadState("story-spine-final-game.json"));
els.loadInput.addEventListener("change", event => event.target.files[0] && loadState(event.target.files[0]));

render();
