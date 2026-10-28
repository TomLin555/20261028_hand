import { classifyHand, InteractionController } from './gestures.js';

const $ = id => document.getElementById(id);
const demoSlides = [
  { url: '/static/images/alpine.jpg', title: '山湖之間', description: '把日常留在身後，把寧靜放在眼前。', alt: '山峰與湖泊的風景' },
  { url: '/static/images/forest.jpg', title: '走進森林', description: '沿著光的方向，聽見森林的呼吸。', alt: '陽光穿過高大森林' },
  { url: '/static/images/coast.jpg', title: '海的另一邊', description: '讓浪花帶走思緒，留下一片遼闊。', alt: '海岸與海浪的風景' },
  { url: '/static/images/desert.jpg', title: '沙丘的線條', description: '在安靜的大地上，遇見時間的形狀。', alt: '起伏的沙漠沙丘' },
  { url: '/static/images/mountain.jpg', title: '向山而行', description: '換一個高度，看見不一樣的世界。', alt: '遠方群山與開闊的天空' },
];
let slides = demoSlides, current = 0, objectUrls = [];
const image = $('gallery-image');
const mosaic = $('gallery-mosaic');
const mosaicContext = mosaic.getContext('2d');
const orientations = new WeakMap();
const effects = new WeakMap();
const pad = n => String(n).padStart(2, '0');

function effectState() { return { zoom: 1, mosaic: false, ...effects.get(slides[current]) }; }

function renderMosaic() {
  mosaic.hidden = true;
  if (!effectState().mosaic || !image.complete || !image.naturalWidth) return;
  // Use a genuinely low-resolution bitmap with nearest-neighbour enlargement.
  // Preserve source aspect ratio so object-fit cropping agrees with the photo.
  const ratio = image.naturalWidth / image.naturalHeight;
  mosaic.width = ratio >= 1 ? 48 : Math.max(1, Math.round(48 * ratio));
  mosaic.height = ratio >= 1 ? Math.max(1, Math.round(48 / ratio)) : 48;
  mosaicContext.imageSmoothingEnabled = true;
  mosaicContext.drawImage(image, 0, 0, mosaic.width, mosaic.height);
  mosaic.hidden = false;
}

function renderOrientation() {
  const state = orientations.get(slides[current]) ?? { horizontal: false, vertical: false };
  const effect = effectState();
  image.style.transform = `scale(${(state.horizontal ? -1 : 1) * effect.zoom}, ${(state.vertical ? -1 : 1) * effect.zoom})`;
  mosaic.style.transform = image.style.transform;
  $('flip-horizontal').setAttribute('aria-pressed', String(state.horizontal));
  $('flip-vertical').setAttribute('aria-pressed', String(state.vertical));
  $('reset-orientation').disabled = !state.horizontal && !state.vertical;
  $('orientation-status').textContent = [state.horizontal && '左右翻轉', state.vertical && '上下翻轉'].filter(Boolean).join('・') || '原始方向';
  $('toggle-mosaic').setAttribute('aria-pressed', String(effect.mosaic));
  $('zoom-level').textContent = `${Math.round(effect.zoom * 100)}%`;
  $('zoom-out').disabled = effect.zoom <= .5;
  $('zoom-in').disabled = effect.zoom >= 2;
  $('reset-zoom').disabled = effect.zoom === 1;
  renderMosaic();
}

function toggleMosaic(source = '按鈕') {
  const state = effectState(); state.mosaic = !state.mosaic;
  effects.set(slides[current], state); renderOrientation();
  $('gallery-message').textContent = `${source} · ${state.mosaic ? '馬賽克已開啟' : '馬賽克已關閉'}`;
}

function zoomImage(direction, source = '按鈕') {
  const state = effectState();
  state.zoom = Math.round(Math.min(2, Math.max(.5, state.zoom * (direction === 'in' ? 1.25 : .8))) * 10000) / 10000;
  effects.set(slides[current], state); renderOrientation();
  $('gallery-message').textContent = `${source} · 圖片縮放 ${Math.round(state.zoom * 100)}%`;
}

function flipImage(axis, source = '按鈕') {
  const state = { horizontal: false, vertical: false, ...orientations.get(slides[current]) };
  state[axis] = !state[axis]; orientations.set(slides[current], state); renderOrientation();
  $('gallery-message').textContent = `${source} · ${$('orientation-status').textContent}`;
}

function navigate(action, source = '按鈕') {
  const old = current;
  current = { first: 0, previous: Math.max(0, current - 1), next: Math.min(slides.length - 1, current + 1), last: slides.length - 1 }[action] ?? current;
  renderSlide();
  $('gallery-message').textContent = old === current
    ? (current === 0 ? '已經是第一張圖片' : '已經是最後一張圖片')
    : `${source}切換 · 第 ${current + 1} 張，共 ${slides.length} 張`;
}

function renderSlide() {
  const slide = slides[current];
  if (image.getAttribute('src') !== slide.url) {
    mosaic.hidden = true;
    image.src = slide.url;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) image.animate([{ opacity: 0.5 }, { opacity: 1 }], { duration: 300 });
  }
  image.alt = slide.alt;
  renderOrientation();
  $('image-error').hidden = true;
  $('photo-title').textContent = slide.title;
  $('photo-description').textContent = slide.description;
  $('photo-category').textContent = slides === demoSlides ? 'THE QUIET COLLECTION' : 'YOUR PERSONAL COLLECTION';
  $('photo-counter').textContent = `${pad(current + 1)} / ${pad(slides.length)}`;
  $('current-number').textContent = pad(current + 1);
  $('total-number').textContent = pad(slides.length);
  $('progress-fill').style.width = `${(current + 1) / slides.length * 100}%`;
  $('first').disabled = $('previous').disabled = current === 0;
  $('next').disabled = $('last').disabled = current === slides.length - 1;
  [...$('thumbnails').children].forEach((button, index) => {
    button.classList.toggle('active', index === current);
    button.setAttribute('aria-pressed', String(index === current));
  });
  $('thumbnails').children[current]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function buildThumbnails() {
  const fragment = document.createDocumentFragment();
  slides.forEach((slide, index) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'thumbnail';
    button.setAttribute('aria-label', `第 ${index + 1} 張：${slide.title}`);
    const thumb = document.createElement('img'); thumb.src = slide.url; thumb.alt = ''; thumb.loading = 'lazy';
    button.append(thumb);
    button.addEventListener('click', () => { current = index; renderSlide(); $('gallery-message').textContent = `第 ${index + 1} 張，共 ${slides.length} 張`; });
    fragment.append(button);
  });
  $('thumbnails').replaceChildren(fragment); renderSlide();
}
for (const action of ['first', 'previous', 'next', 'last']) $(action).addEventListener('click', () => navigate(action));
$('flip-horizontal').addEventListener('click', () => flipImage('horizontal'));
$('flip-vertical').addEventListener('click', () => flipImage('vertical'));
$('reset-orientation').addEventListener('click', () => {
  orientations.delete(slides[current]); renderOrientation(); $('gallery-message').textContent = '已還原目前圖片方向';
});
$('toggle-mosaic').addEventListener('click', () => toggleMosaic());
$('zoom-out').addEventListener('click', () => zoomImage('out'));
$('zoom-in').addEventListener('click', () => zoomImage('in'));
$('reset-zoom').addEventListener('click', () => {
  const state = effectState(); state.zoom = 1; effects.set(slides[current], state);
  renderOrientation(); $('gallery-message').textContent = '已還原目前圖片大小';
});
image.addEventListener('load', renderMosaic);
image.addEventListener('error', () => { mosaic.hidden = true; $('image-error').hidden = false; });
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
  const action = { ArrowLeft: 'previous', ArrowRight: 'next', Home: 'first', End: 'last' }[event.key];
  if (action) { event.preventDefault(); navigate(action, '鍵盤'); }
});
function revokeImages() { objectUrls.forEach(url => URL.revokeObjectURL(url)); objectUrls = []; }
$('image-files').addEventListener('change', event => {
  const files = [...event.target.files].filter(file => file.type.startsWith('image/'));
  if (!files.length) { event.target.value = ''; return; }
  revokeImages();
  slides = files.map(file => {
    const url = URL.createObjectURL(file); objectUrls.push(url);
    return { url, title: file.name.replace(/\.[^.]+$/, ''), description: '你的私人映畫 · 圖片僅在此瀏覽器使用', alt: file.name };
  });
  current = 0; buildThumbnails(); $('restore-demo').hidden = false;
  $('gallery-message').textContent = `已匯入 ${files.length} 張圖片`; event.target.value = '';
});
$('restore-demo').addEventListener('click', () => {
  slides = demoSlides; current = 0; buildThumbnails(); revokeImages();
  $('restore-demo').hidden = true; $('gallery-message').textContent = '已回到示範圖片';
});
buildThumbnails();

const video = $('camera'), overlay = $('landmarks'), context = overlay.getContext('2d');
const controller = new InteractionController();
let stream = null, worker = null, active = false, starting = false, session = 0;
let frameBusy = false, animationId = null, lastFrame = 0, lastVideoTime = -1, workerTimer = null;
const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
function feedback(message, detected = false) {
  $('gesture-feedback').textContent = message;
  $('feedback-dot').classList.toggle('detected', detected);
  $('gesture-confidence').textContent = detected ? '追蹤中' : '';
}
function draw(hands) {
  if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) {
    overlay.width = video.videoWidth || 640; overlay.height = video.videoHeight || 480;
  }
  context.clearRect(0, 0, overlay.width, overlay.height);
  for (const [index, { landmarks: points }] of hands.entries()) {
    context.strokeStyle = index === 0 ? '#c8f7a0' : '#a0e8f7'; context.lineWidth = 3;
    for (const [a, b] of connections) {
      context.beginPath(); context.moveTo(points[a].x * overlay.width, points[a].y * overlay.height);
      context.lineTo(points[b].x * overlay.width, points[b].y * overlay.height); context.stroke();
    }
    context.fillStyle = '#f6ffef';
    points.forEach(p => { context.beginPath(); context.arc(p.x * overlay.width, p.y * overlay.height, 4, 0, Math.PI * 2); context.fill(); });
  }
}
function stopCamera(message = '攝影機已關閉，仍可使用按鈕控制圖片') {
  session++; active = false; starting = false; frameBusy = false;
  cancelAnimationFrame(animationId); clearTimeout(workerTimer); workerTimer = null;
  worker?.terminate(); worker = null;
  stream?.getTracks().forEach(track => track.stop()); stream = null;
  video.srcObject = null; video.hidden = overlay.hidden = true;
  $('camera-placeholder').hidden = false;
  $('camera-status').textContent = '● 尚未啟動'; $('camera-status').classList.remove('active');
  $('camera-toggle').disabled = false; $('camera-toggle').querySelector('span').textContent = '開啟攝影機';
  controller.reset(); feedback(message);
}
function failCamera(error) {
  console.error('Camera/recognition:', error);
  const messages = {
    NotAllowedError: '攝影機權限未允許，請在網址列的網站權限設定中開啟。',
    NotFoundError: '找不到攝影機，請確認已連接裝置。',
    NotReadableError: '無法讀取攝影機，請關閉其他使用攝影機的程式。',
    SecurityError: '攝影機需要 HTTPS 或 localhost 安全連線。',
  };
  const message = messages[error.name] || '辨識啟動失敗，請確認模型資源已準備、使用較新的瀏覽器，再試一次。';
  stopCamera(message); $('camera-help').textContent = message;
}
function onResult(data) {
  frameBusy = false; clearTimeout(workerTimer);
  const rawHands = data.hands ?? [];
  draw(rawHands);
  const hands = rawHands.map(hand => classifyHand(hand.landmarks, hand.worldLandmarks)).filter(Boolean);
  const hand = hands[0];
  const action = controller.update(hands, data.timestamp);
  const names = { palm: '手掌已就緒，向左或向右移動', index: '食指手勢 · 停留半秒回到第一張', pinky: '小指手勢 · 停留半秒前往最後一張', other: '已偵測到手，請張開手掌或只伸出食指／小指' };
  feedback(hands.length === 2 ? '雙手已就緒 · 先分開再拍手，上下翻轉圖片' : (hand ? names[hand.pose] : '將一隻手放入畫面中'), !!hand);
  if (controller.pinch.active && !action) feedback('指尖縮放中 · 開合拇指與食指，放鬆其餘手指可結束', true);
  else if (controller.fold.busy && !action) feedback('手掌下折 · 立起手掌後可再次切換馬賽克', true);
  if (action === 'toggleMosaic') {
    toggleMosaic('手勢'); feedback('手掌往下折 · 切換馬賽克', true);
  } else if (action === 'zoomIn' || action === 'zoomOut') {
    zoomImage(action === 'zoomIn' ? 'in' : 'out', '手勢');
    feedback(action === 'zoomIn' ? '指尖分開 · 放大圖片' : '指尖捏合 · 縮小圖片', true);
  } else if (action === 'flipHorizontal' || action === 'flipVertical') {
    flipImage(action === 'flipHorizontal' ? 'horizontal' : 'vertical', '手勢');
    feedback(action === 'flipHorizontal' ? '手心／手背翻轉 · 左右翻圖' : '雙手拍手 · 上下翻圖', true);
  } else if (action) {
    navigate(action, '手勢');
    feedback({ first: '食指 · 第一張', last: '小指 · 最後一張', previous: '手掌向左 · 上一張', next: '手掌向右 · 下一張' }[action], true);
  }
}
async function capture(now, token) {
  if (!active || token !== session) return;
  animationId = requestAnimationFrame(time => capture(time, token));
  if (frameBusy || now - lastFrame < 80 || video.readyState < 2 || video.currentTime === lastVideoTime) return;
  frameBusy = true; lastFrame = now; lastVideoTime = video.currentTime;
  try {
    const frame = await createImageBitmap(video);
    if (!active || token !== session) { frame.close(); return; }
    worker.postMessage({ type: 'frame', frame, timestamp: now }, [frame]);
    workerTimer = setTimeout(() => { if (token === session) failCamera(new Error('辨識回應逾時')); }, 15000);
  } catch (error) { if (token === session) failCamera(error); }
}
async function startCamera() {
  if (active || starting) { stopCamera(); return; }
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    failCamera(Object.assign(new Error('安全連線或攝影機 API 不可用'), { name: 'SecurityError' })); return;
  }
  const token = ++session; starting = true;
  $('camera-toggle').querySelector('span').textContent = '取消啟動';
  $('camera-status').textContent = '● 啟動中'; feedback('正在取得攝影機與載入辨識模型…');
  $('camera-help').textContent = '請允許攝影機權限。首次啟動模型可能需要數秒。';
  try {
    const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    if (token !== session) { acquired.getTracks().forEach(track => track.stop()); return; }
    stream = acquired; video.srcObject = acquired; await video.play();
    if (token !== session) return;
    video.hidden = false; $('camera-placeholder').hidden = true;
    await new Promise((resolve, reject) => {
      worker = new Worker('/static/vision-worker.js');
      workerTimer = setTimeout(() => reject(new Error('模型載入逾時')), 45000);
      worker.onmessage = ({ data }) => {
        if (token !== session) return;
        if (data.type === 'ready') { clearTimeout(workerTimer); resolve(); }
        else if (data.type === 'error') {
          if (!active) reject(new Error(data.message)); else failCamera(new Error(data.message));
        } else if (data.type === 'result' && active) onResult(data);
      };
      worker.onerror = event => { if (token !== session) return; if (!active) reject(new Error(event.message)); else failCamera(new Error(event.message)); };
      worker.postMessage({ type: 'init' });
    });
    if (token !== session) return;
    active = true; starting = false; lastFrame = 0; lastVideoTime = -1; overlay.hidden = false;
    stream.getVideoTracks()[0].addEventListener('ended', () => { if (token === session) stopCamera('攝影機已中斷，請重新啟動'); });
    $('camera-status').textContent = '● 辨識中'; $('camera-status').classList.add('active');
    $('camera-toggle').querySelector('span').textContent = '關閉攝影機';
    $('camera-help').textContent = '影像僅在裝置內辨識；關閉攝影機後會立即釋放裝置。';
    feedback('將一隻手放入畫面中');
    animationId = requestAnimationFrame(now => capture(now, token));
  } catch (error) { if (token === session) failCamera(error); }
}
$('camera-toggle').addEventListener('click', startCamera);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && (active || starting)) stopCamera('頁面已切至背景，攝影機已自動關閉');
});
window.addEventListener('pagehide', () => { stopCamera(); revokeImages(); });
