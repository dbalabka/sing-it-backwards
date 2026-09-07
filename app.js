const DB_NAME = "sing-it-backwards";
const STORE_NAME = "recordings";
const RECORDING_KEY = "latest";
const DURATION_KEY = "sing-it-backwards-duration";

const recordButton = document.querySelector("#record");
const playButton = document.querySelector("#play");
const reverseButton = document.querySelector("#reverse-play");
const durationSelect = document.querySelector("#duration");
const status = document.querySelector("#status");
const timer = document.querySelector("#timer");
const canvas = document.querySelector("#waveform");
const emptyWaveform = document.querySelector("#waveform-empty");
const context2d = canvas.getContext("2d");

let mediaRecorder;
let stream;
let chunks = [];
let recordingBlob;
let audioContext;
let currentSource;
let timerInterval;
let stopTimeout;
let startedAt = 0;

function setStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function getAudioContext() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  return audioContext;
}

function getSupportedMimeType() {
  if (!window.MediaRecorder) return "";
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function updateButtons() {
  const unavailable = !recordingBlob || Boolean(mediaRecorder?.state === "recording");
  playButton.disabled = unavailable;
  reverseButton.disabled = unavailable;
}

function drawWaveform(buffer) {
  const width = canvas.width;
  const height = canvas.height;
  const samples = buffer.getChannelData(0);
  const step = Math.max(1, Math.ceil(samples.length / width));
  context2d.clearRect(0, 0, width, height);
  context2d.fillStyle = "#0e0b20";
  context2d.fillRect(0, 0, width, height);
  context2d.strokeStyle = "#f6bd48";
  context2d.lineWidth = 3;
  context2d.beginPath();
  for (let x = 0; x < width; x += 1) {
    let min = 1;
    let max = -1;
    const offset = x * step;
    for (let index = 0; index < step && offset + index < samples.length; index += 1) {
      const value = samples[offset + index];
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    context2d.moveTo(x, (1 + min) * height / 2);
    context2d.lineTo(x, (1 + max) * height / 2);
  }
  context2d.stroke();
  emptyWaveform.classList.add("hidden");
}

async function decode(blob) {
  const data = await blob.arrayBuffer();
  return getAudioContext().decodeAudioData(data);
}

async function storeRecording(blob) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(blob, RECORDING_KEY);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function loadRecording() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const blob = await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(RECORDING_KEY);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return blob;
}

function stopRecording() {
  if (mediaRecorder?.state === "recording") mediaRecorder.stop();
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || !(window.AudioContext || window.webkitAudioContext)) {
    setStatus("This browser cannot record audio here. Try a current browser.", true);
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = getSupportedMimeType();
    mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    chunks = [];
    mediaRecorder.ondataavailable = ({ data }) => { if (data.size) chunks.push(data); };
    mediaRecorder.onstop = finishRecording;
    mediaRecorder.start();
    startedAt = Date.now();
    timer.textContent = "00:00";
    timerInterval = window.setInterval(() => { timer.textContent = formatTime(Date.now() - startedAt); }, 200);
    const limit = Number(durationSelect.value);
    if (limit) stopTimeout = window.setTimeout(stopRecording, limit * 1000);
    recordButton.classList.add("is-recording");
    recordButton.querySelector(".button-label").textContent = "Stop";
    durationSelect.disabled = true;
    setStatus(limit ? `Recording — stops in ${limit} seconds.` : "Recording — press Stop when you are done.");
    updateButtons();
  } catch (error) {
    setStatus(error.name === "NotAllowedError" ? "Microphone permission was denied. Allow it in your browser settings and try again." : "Could not access your microphone. Check it is connected and available.", true);
  }
}

async function finishRecording() {
  clearInterval(timerInterval);
  clearTimeout(stopTimeout);
  stream?.getTracks().forEach((track) => track.stop());
  recordingBlob = new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" });
  recordButton.classList.remove("is-recording");
  recordButton.querySelector(".button-label").textContent = "Record";
  durationSelect.disabled = false;
  setStatus("Saving your take…");
  try {
    await storeRecording(recordingBlob);
    drawWaveform(await decode(recordingBlob));
    setStatus("Take saved on this device. Play it forward or backwards.");
  } catch (error) {
    recordingBlob = null;
    emptyWaveform.classList.remove("hidden");
    setStatus("The recording could not be saved or decoded on this device.", true);
  }
  updateButtons();
}

async function play(reverse = false) {
  if (!recordingBlob) return;
  try {
    currentSource?.stop();
    setStatus(reverse ? "Reversing your take…" : "Playing your take…");
    const audioBuffer = await decode(recordingBlob);
    if (reverse) {
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) audioBuffer.getChannelData(channel).reverse();
    }
    const context = getAudioContext();
    await context.resume();
    currentSource = context.createBufferSource();
    currentSource.buffer = audioBuffer;
    currentSource.connect(context.destination);
    currentSource.onended = () => { if (currentSource) setStatus("Ready when you are."); currentSource = null; };
    currentSource.start();
  } catch (error) {
    setStatus("This recording could not be played in this browser.", true);
  }
}

recordButton.addEventListener("click", () => mediaRecorder?.state === "recording" ? stopRecording() : startRecording());
playButton.addEventListener("click", () => play(false));
reverseButton.addEventListener("click", () => play(true));
durationSelect.addEventListener("change", () => localStorage.setItem(DURATION_KEY, durationSelect.value));

async function initialize() {
  const savedDuration = localStorage.getItem(DURATION_KEY);
  if (savedDuration && [...durationSelect.options].some((option) => option.value === savedDuration)) durationSelect.value = savedDuration;
  try {
    recordingBlob = await loadRecording();
    if (recordingBlob) {
      drawWaveform(await decode(recordingBlob));
      setStatus("Your latest take is ready to play.");
    }
  } catch (error) {
    setStatus("Could not restore a previous recording.", true);
  }
  updateButtons();
}

initialize();
