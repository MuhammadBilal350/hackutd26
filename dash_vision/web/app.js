'use strict';
const $ = id => document.getElementById(id);
let mode = 'upload', selectedFile = null, stream = null, busy = false, ready = false;
let timer = null, generation = 0, lastResult = null, starting = false;
const status = (message, error = false) => { $('status').textContent = message; $('status').classList.toggle('error', error); };
function clearReport() {
  lastResult = null;
  $('report').hidden = true;
  $('empty').hidden = false;
  $('timestamp').textContent = 'AWAITING A READING';
}
function updateControls() {
  $('analyze').disabled = !ready || busy || (mode === 'upload' ? !selectedFile : !stream);
  $('analyze-label').textContent = busy ? 'Analyzing…' : mode === 'camera' ? 'Capture & analyze' : 'Analyze dashboard';
  $('start-camera').disabled = starting || !!stream;
  $('stop-camera').disabled = !stream && !starting;
  $('auto-live').disabled = !stream;
}
function stopCamera() {
  generation++;
  clearTimeout(timer);
  $('auto-live').checked = false;
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null;
  $('camera').srcObject = null;
  $('camera').hidden = true;
  $('camera-placeholder').hidden = false;
  $('live-badge').hidden = true;
  updateControls();
}
function switchMode(next) {
  generation++;
  clearReport();
  stopCamera();
  mode = next;
  for (const name of ['upload', 'camera']) {
    $(`${name}-tab`).setAttribute('aria-selected', String(name === next));
    $(`${name}-pane`).hidden = name !== next;
  }
  status(next === 'upload' ? 'Choose a photo, then analyze.' : 'Start your camera to capture a dashboard.');
  updateControls();
}
$('upload-tab').onclick = () => switchMode('upload');
$('camera-tab').onclick = () => switchMode('camera');
// Keyboard support for the two source tabs.
for (const name of ['upload', 'camera']) $(`${name}-tab`).onkeydown = event => {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const next = event.key === 'Home' ? 'upload' : event.key === 'End' ? 'camera' : mode === 'upload' ? 'camera' : 'upload';
    switchMode(next); $(`${next}-tab`).focus();
  }
};
function selectPhoto(file) {
  generation++;
  if (!file) return;
  clearReport();
  selectedFile = null;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) {
    $('filename').textContent = 'Choose another photo';
    status('Use a JPG, PNG or WebP image smaller than 12 MB.', true);
  } else {
    selectedFile = file;
    $('filename').textContent = file.name;
    status('Photo ready. Add vehicle details, then analyze.');
  }
  updateControls();
}
$('photo').onchange = event => selectPhoto(event.target.files[0]);
for (const eventName of ['dragenter', 'dragover']) $('dropzone').addEventListener(eventName, event => {event.preventDefault(); $('dropzone').classList.add('dragover');});
for (const eventName of ['dragleave', 'drop']) $('dropzone').addEventListener(eventName, event => {event.preventDefault(); $('dropzone').classList.remove('dragover');});
$('dropzone').addEventListener('drop', event => selectPhoto(event.dataTransfer.files[0]));
$('start-camera').onclick = async () => {
  if (starting || stream) return;
  if (!navigator.mediaDevices?.getUserMedia) return status('Camera access needs localhost and a supported browser. You can still upload a photo.', true);
  starting = true;
  const requestGeneration = generation;
  updateControls(); status('Waiting for camera permission…');
  try {
    const acquired = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}}, audio: false});
    if (requestGeneration !== generation || mode !== 'camera') { acquired.getTracks().forEach(track => track.stop()); return; }
    stream = acquired;
    $('camera').srcObject = stream;
    await $('camera').play();
    $('camera').hidden = false; $('camera-placeholder').hidden = true; $('live-badge').hidden = false;
    stream.getVideoTracks()[0].onended = () => {stopCamera(); status('Camera disconnected. Start it again or upload a photo.', true);};
    status('Camera is live. Capture a reading or enable auto-analysis.');
  } catch (error) {
    stopCamera();
    status(error.name === 'NotAllowedError' ? 'Camera permission denied. Allow camera access in your browser or upload a photo.' : 'Camera unavailable. Close other camera apps, or upload a photo.', true);
  } finally { starting = false; updateControls(); }
};
$('stop-camera').onclick = () => {stopCamera(); status('Camera stopped.');};
async function cameraBlob() {
  const video = $('camera');
  if (!video.videoWidth || video.readyState < 2) throw new Error('Camera is still starting. Try again in a moment.');
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(video.videoWidth, 1600);
  canvas.height = Math.round(video.videoHeight * canvas.width / video.videoWidth);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not capture this frame.')), 'image/jpeg', .9));
}
function metadata() {
  for (const id of ['miles', 'year']) if (!$(`${id}`).reportValidity()) throw new Error('Check the vehicle details.');
  return new URLSearchParams({miles: $('miles').value, year: $('year').value, unit: $('unit').value, hybrid: String($('hybrid').checked)});
}
function scheduleLive() {
  clearTimeout(timer);
  if ($('auto-live').checked && stream && mode === 'camera') timer = setTimeout(analyze, 2000);
}
async function analyze() {
  if (busy || !ready) return;
  const requestGeneration = generation;
  busy = true; updateControls();
  try {
    const query = metadata();
    const blob = mode === 'camera' ? await cameraBlob() : selectedFile;
    if (!blob) throw new Error('Choose a dashboard photo first.');
    status('Reading the indicators. Keep the dashboard in view…');
    const response = await fetch(`/api/analyze?${query}`, {method: 'POST', headers: {'Content-Type': blob.type}, body: blob});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not analyze this image.');
    if (requestGeneration !== generation) return;
    render(result);
    status($('auto-live').checked ? 'Live analysis active. Next reading in 2 seconds.' : 'Reading complete. Your stats are ready.');
  } catch (error) {
    if (requestGeneration === generation) {status(error.message || 'Connection lost. Check the local server.', true); $('auto-live').checked = false;}
  } finally {busy = false; updateControls(); scheduleLive();}
}
$('analyze').onclick = analyze;
$('auto-live').onchange = () => {if ($('auto-live').checked) analyze(); else {clearTimeout(timer); status('Auto-analysis paused. Camera preview is still live.');}};
for (const id of ['miles', 'year', 'unit', 'hybrid']) $(id).addEventListener('input', () => {
  generation++;
  clearReport();
  status('Vehicle details updated. Analyze again for a new reading.');
});
function node(tag, className, text) {const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element;}
function render(result) {
  lastResult = result;
  const r = result.reliability;
  $('empty').hidden = true; $('report').hidden = false;
  $('timestamp').textContent = `UPDATED ${new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'})}`;
  $('score').textContent = r.score; $('grade').textContent = `Grade ${r.grade}`; $('ring-grade').textContent = r.grade;
  $('score-ring').style.setProperty('--progress', `${r.score}%`);
  $('score-description').textContent = r.odometer_miles === null ? 'Mileage not supplied · estimate is less certain' : `${r.odometer_miles.toLocaleString()} mi${r.generation ? ' · Toyota Camry ' + r.generation : ''}`;
  $('drive').textContent = {yes: 'No detected restriction', limited: 'Use caution', no: 'Do not drive'}[r.drive_safe];
  $('severity').textContent = `Highest detected severity: ${r.worst_severity}`;
  const money = value => '$' + value.toLocaleString();
  $('repair').textContent = r.est_repair_cost_usd[1] ? r.est_repair_cost_usd.map(money).join(' – ') : 'No fault cost detected';
  $('report-warning').hidden = !r.warning; $('report-warning').textContent = r.warning || '';
  $('light-count').textContent = `${result.reading.lights.length} FOUND`;
  $('lights').replaceChildren();
  for (const light of result.reading.lights) {
    const row = node('div', 'indicator'), dot = node('span', 'dot');
    dot.style.background = {red:'#ff9b87',amber:'#f0c77e',blue:'#8bbced',green:'#b7efcf'}[light.color] || '#b7efcf';
    row.append(dot, node('strong', '', light.name), node('small', '', `${light.confidence} confidence`)); $('lights').append(row);
  }
  if (!result.reading.lights.length) $('lights').append(node('p', 'no-lights', 'No confident indicator matches. A clear, straight-on photo with the engine running works best. This does not confirm vehicle health.'));
  $('performance').replaceChildren();
  for (const [key, value] of Object.entries(r.performance_impact)) {
    const row = node('div', 'performance-row'), bar = node('div', 'bar'), fill = node('span');
    fill.style.width = `${value.level / 4 * 100}%`; bar.append(fill);
    row.append(node('span', '', key.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase())), bar, node('span', '', value.label)); $('performance').append(row);
  }
  $('actions').replaceChildren();
  for (const action of r.actions.length ? r.actions : ['No fault-specific action from this reading. Check the owner’s manual and have concerns inspected by a qualified mechanic.']) $('actions').append(node('li', '', action));
  $('limitations').textContent = result.limitations;
}
$('download').onclick = () => {
  if (!lastResult) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(lastResult, null, 2)], {type: 'application/json'}));
  const link = node('a'); link.href = url; link.download = 'camry-vision-stats.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
document.addEventListener('visibilitychange', () => {if (document.hidden) stopCamera();});
window.addEventListener('pagehide', stopCamera);
async function checkHealth() {
  try {
    const response = await fetch('/api/health');
    if (!response.ok) throw new Error('Server unavailable');
    const health = await response.json();
    ready = health.ready;
    $('connection').textContent = health.error ? 'Detector unavailable' : ready ? 'Offline detector ready' : 'Warming up detector';
    $('connection-dot').classList.toggle('ready', ready);
    if (health.error) status('Detector could not load. Restart the local server.', true);
  } catch {ready = false; $('connection').textContent = 'Server disconnected'; $('connection-dot').classList.remove('ready');}
  updateControls(); setTimeout(checkHealth, ready ? 10000 : 1500);
}
checkHealth();
