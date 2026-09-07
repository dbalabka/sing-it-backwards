const DB_NAME = "sing-it-backwards";
const STORE_NAME = "recordings";
const TAKES = { player1: "player1", player2: "player2" };
const DURATION_KEY = "sing-it-backwards-duration";
const THEME_KEY = "sing-it-backwards-theme";
const recordings = { player1: null, player2: null };
const durationSelect = document.querySelector("#duration");
const themeSelect = document.querySelector("#appearance");
const status = document.querySelector("#status");
const cards = [...document.querySelectorAll(".step-card")];
const recordButtons = [...document.querySelectorAll("[data-record]")];
const systemTheme = matchMedia("(prefers-color-scheme: dark)");
let mediaRecorder, stream, chunks = [], activeTake, audioContext, currentSource, timerInterval, stopTimeout, startedAt, discardRecording = false;

function setStatus(message, error = false) { status.textContent = message; status.classList.toggle("error", error); }
function formatTime(ms) { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }
function context() { return audioContext || (audioContext = new (window.AudioContext || window.webkitAudioContext)()); }
function supportedMimeType() { return !window.MediaRecorder ? "" : ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type)) || ""; }
function canvas(take) { return document.querySelector(`#waveform-${take}`); }
function empty(take) { return document.querySelector(`#waveform-empty-${take}`); }
function timer(take) { return document.querySelector(`#timer-${take}`); }
function drawWaveform(take, buffer) {
  const target = canvas(take), ctx = target.getContext("2d"), { width, height } = target, samples = buffer.getChannelData(0), step = Math.max(1, Math.ceil(samples.length / width)), css = getComputedStyle(document.documentElement);
  ctx.fillStyle = css.getPropertyValue("--wave-bg"); ctx.fillRect(0, 0, width, height); ctx.strokeStyle = css.getPropertyValue("--accent"); ctx.lineWidth = 3; ctx.beginPath();
  for (let x = 0; x < width; x += 1) { let min = 1, max = -1; const offset = x * step; for (let i = 0; i < step && offset + i < samples.length; i += 1) { const value = samples[offset + i]; min = Math.min(min, value); max = Math.max(max, value); } ctx.moveTo(x, (1 + min) * height / 2); ctx.lineTo(x, (1 + max) * height / 2); }
  ctx.stroke(); empty(take).classList.add("hidden");
}
function clearWaveform(take) { const target = canvas(take); target.getContext("2d").clearRect(0, 0, target.width, target.height); empty(take).classList.remove("hidden"); timer(take).textContent = "00:00"; }
function blobData(blob) {
  if (blob.arrayBuffer) return blob.arrayBuffer();
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(blob); });
}
async function decode(blob) {
  const audio = context();
  const data = await blobData(blob);
  return new Promise((resolve, reject) => {
    const result = audio.decodeAudioData(data, resolve, reject);
    if (result?.then) result.then(resolve, reject);
  });
}
function openDatabase() { return new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME, 1); request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function store(take, blob) { const db = await openDatabase(); await new Promise((resolve, reject) => { const transaction = db.transaction(STORE_NAME, "readwrite"); transaction.objectStore(STORE_NAME).put(blob, take); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); }); db.close(); }
async function load(take) { const db = await openDatabase(); const blob = await new Promise((resolve, reject) => { const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(take); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); db.close(); return blob; }
async function clearStored() { const db = await openDatabase(); await new Promise((resolve, reject) => { const transaction = db.transaction(STORE_NAME, "readwrite"), storage = transaction.objectStore(STORE_NAME); storage.delete(TAKES.player1); storage.delete(TAKES.player2); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); }); db.close(); }
function updateInterface() {
  const recording = mediaRecorder?.state === "recording", first = Boolean(recordings.player1), second = Boolean(recordings.player2);
  cards.forEach((card) => { const step = Number(card.dataset.step); card.classList.toggle("is-ready", step === 1 || ((step === 2 || step === 3 || step === 5) && first) || (step === 4 && second)); });
  document.querySelector("#listen-first").disabled = !first || recording; document.querySelector("#listen-second").disabled = !second || recording; document.querySelector("#reveal").disabled = !first || recording;
  recordButtons.forEach((button) => { const take = button.dataset.record, isActive = recording && activeTake === take; button.disabled = (take === TAKES.player1 && first) || (take === TAKES.player2 && !first) || (recording && !isActive); button.classList.toggle("is-recording", isActive); button.querySelector(".button-label").textContent = isActive ? "Stop recording" : (take === TAKES.player2 && second ? "Record Player 2 again" : "Record"); });
  durationSelect.disabled = recording;
}
function stopRecording() { if (mediaRecorder?.state === "recording") mediaRecorder.stop(); }
async function startRecording(take) {
  if (take === TAKES.player2 && !recordings.player1) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || !(window.AudioContext || window.webkitAudioContext)) return setStatus("This browser cannot record audio here. Try a current browser.", true);
  try { currentSource?.stop(); stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const mimeType = supportedMimeType(); mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream); activeTake = take; chunks = []; mediaRecorder.ondataavailable = ({ data }) => { if (data.size) chunks.push(data); }; mediaRecorder.onstop = finishRecording; mediaRecorder.start(); startedAt = Date.now(); timer(take).textContent = "00:00"; timerInterval = setInterval(() => { timer(take).textContent = formatTime(Date.now() - startedAt); }, 200); const limit = Number(durationSelect.value); if (limit) stopTimeout = setTimeout(stopRecording, limit * 1000); setStatus(limit ? `Recording ${take === TAKES.player1 ? "Player 1" : "Player 2"} — stops in ${limit} seconds.` : "Recording — press Stop when you are done."); updateInterface(); }
  catch (error) { setStatus(error.name === "NotAllowedError" ? "Microphone permission was denied. Allow it in your browser settings and try again." : "Could not access your microphone. Check it is connected and available.", true); }
}
async function finishRecording() {
  const take = activeTake; clearInterval(timerInterval); clearTimeout(stopTimeout); stream?.getTracks().forEach((track) => track.stop()); const blob = new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" }); activeTake = null;
  if (discardRecording) { discardRecording = false; updateInterface(); return; }
  setStatus("Saving this take…");
  try { await store(take, blob); recordings[take] = blob; drawWaveform(take, await decode(blob)); setStatus(take === TAKES.player1 ? "Player 1 is saved. Player 2, listen to it backwards." : "Player 2 is saved. Play it backwards to hear the restored words."); } catch { setStatus("The recording could not be saved or decoded on this device.", true); } updateInterface();
}
async function play(take, reverse, message) {
  if (!recordings[take]) return;
  try {
    currentSource?.stop();
    setStatus(message);
    // iOS Safari only permits an AudioContext to be resumed while the tap is active.
    // Do this before waiting for IndexedDB audio to decode.
    const audio = context();
    if (audio.state !== "running") await audio.resume();
    const buffer = await decode(recordings[take]);
    if (reverse) for (let i = 0; i < buffer.numberOfChannels; i += 1) buffer.getChannelData(i).reverse();
    const source = audio.createBufferSource(); currentSource = source; source.buffer = buffer; source.connect(audio.destination); source.onended = () => { if (currentSource === source) { currentSource = null; setStatus("Ready for the next turn."); } }; source.start();
  } catch { setStatus("This recording could not be played in this browser.", true); }
}
function applyTheme(choice) { const resolved = choice === "system" ? (systemTheme.matches ? "dark" : "light") : choice; document.documentElement.dataset.theme = resolved; document.documentElement.style.colorScheme = resolved; document.querySelector('meta[name="theme-color"]').content = resolved === "dark" ? "#15122b" : "#f7f5ff"; }
async function newRound() { if (mediaRecorder?.state === "recording") { discardRecording = true; stopRecording(); } const source = currentSource; currentSource = null; source?.stop(); try { await clearStored(); recordings.player1 = null; recordings.player2 = null; clearWaveform(TAKES.player1); clearWaveform(TAKES.player2); setStatus("New round ready. Player 1, record the original line."); } catch { setStatus("Could not clear the saved recordings. Please try again.", true); } updateInterface(); }
recordButtons.forEach((button) => button.addEventListener("click", () => mediaRecorder?.state === "recording" ? stopRecording() : startRecording(button.dataset.record)));
document.querySelector("#listen-first").addEventListener("click", () => play(TAKES.player1, true, "Playing Player 1’s line backwards…")); document.querySelector("#listen-second").addEventListener("click", () => play(TAKES.player2, true, "Playing Player 2’s take backwards…")); document.querySelector("#reveal").addEventListener("click", () => play(TAKES.player1, false, "Revealing Player 1’s original line…")); document.querySelector("#new-round").addEventListener("click", newRound);
durationSelect.addEventListener("change", () => localStorage.setItem(DURATION_KEY, durationSelect.value)); themeSelect.addEventListener("change", () => { const choice = themeSelect.value; if (choice === "system") localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, choice); applyTheme(choice); }); systemTheme.addEventListener("change", () => { if (themeSelect.value === "system") applyTheme("system"); });
async function initialize() { const savedDuration = localStorage.getItem(DURATION_KEY); if (savedDuration && [...durationSelect.options].some((option) => option.value === savedDuration)) durationSelect.value = savedDuration; const savedTheme = localStorage.getItem(THEME_KEY); if (savedTheme === "light" || savedTheme === "dark") themeSelect.value = savedTheme; applyTheme(themeSelect.value); try { for (const take of Object.values(TAKES)) { recordings[take] = await load(take); if (recordings[take]) drawWaveform(take, await decode(recordings[take])); } setStatus(recordings.player2 ? "Both takes are ready. Continue listening or start a new round." : recordings.player1 ? "Player 1’s take is ready for Player 2 to learn backwards." : "New round ready. Player 1, record the original line."); } catch { setStatus("Could not restore a previous recording.", true); } updateInterface(); }
initialize();
