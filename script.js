/* =========================================================
   舞台演出プランナー script.js
   ========================================================= */
'use strict';

const STORAGE_KEY = 'stagePlanner_state_v1';
const COLOR_PALETTE = ['#E26D6C','#F4A462','#FFD166','#95C68A','#68A1A4','#5AA4DE','#8974BA','#C47297'];
const MIC_CYCLE = ['ワイヤレス1','ワイヤレス2','ワイヤレス3','ワイヤレス4','有線1','有線2','有線3','有線4'];
const LOGIN_PASSWORD = 'admin1234'; // デモ用固定パスワード

let state = {
  initDone:false,
  bgColorMode:null,       // 'on' | 'off'
  effectType:null,        // 'original' | 'existing' | 'none'（背景色あり時のみ使用）
  strobeType:null,        // 'kurukuru' | 'chikachika' | 'nashi'
  darkMode:false,
  locked:false,
  loggedIn:false,
  cast:[],                // {id,name,actor,mic,color,edit}
  scriptHTML:'',
  gdocUrl:'',
  cues:[],                 // {sec,line,audio,stage,bg,chs,strobe,fade}
  stageState:'zensyou',
  activeColor:null,
  stageItems:[],            // {id,src,x,y}
  versionMemos:[],
  stopwatch:{elapsed:0,running:false},
  adminAssets:{}             // { "img/xxx.jpg": "data:...", "mov/xxx.mov": "data:..." }
};

let swInterval=null, swStart=0;
let gdocIntervalHandle=null;
let isReading=false;

/* ---------------- ユーティリティ ---------------- */
function uid(){return 'id'+Math.random().toString(36).slice(2,9);}
function $(sel){return document.querySelector(sel);}
function $all(sel){return Array.from(document.querySelectorAll(sel));}
function saveState(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){ console.warn('save failed',e); }
}
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){ const loaded = JSON.parse(raw); state = Object.assign(state, loaded); }
  }catch(e){ console.warn('load failed', e); }
}
function resolveAsset(path){
  return (state.adminAssets && state.adminAssets[path]) ? state.adminAssets[path] : path;
}

/* ============================================================
   初期選択モーダル
   ============================================================ */
function applyModalAssets(){
  $all('[data-asset-path]').forEach(el=>{
    const path = el.dataset.assetPath;
    const resolved = resolveAsset(path);
    if(el.tagName==='IMG'){ el.src = resolved; }
    else if(el.tagName==='VIDEO'){ el.src = resolved; if(el.load) el.load(); }
  });
}

function initModalLogic(){
  $all('.choice-btn[data-group]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const group = btn.dataset.group;
      $all(`.choice-btn[data-group="${group}"]`).forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
      if(group==='bgColor'){
        state.bgColorMode = btn.dataset.value;
        const showEffect = state.bgColorMode==='on';
        $('#section-effect-toggle').style.display = showEffect ? 'block' : 'none';
        if(!showEffect){
          state.effectType = null;
          $all('.choice-btn[data-group="effect"]').forEach(b=>b.classList.remove('selected'));
        }
      }
      if(group==='effect') state.effectType = btn.dataset.value;
      if(group==='strobeType') state.strobeType = btn.dataset.value;
      checkModalReady();
    });
  });

  $('#startAppBtn').addEventListener('click', ()=>{
    state.initDone = true;
    $('#initModal').classList.add('hidden');
    saveState();
    applyAllSettingsToUI();
  });

  function adjustLabelFontSize(){
    $all('.choice-img,.choice-video').forEach(media=>{
      const h = media.getBoundingClientRect().height || 110;
      const label = media.parentElement.querySelector('.choice-label');
      if(label) label.style.fontSize = Math.max(10, h/5) + 'px';
    });
  }
  window.addEventListener('resize', adjustLabelFontSize);
  window.addEventListener('load', adjustLabelFontSize);
  setTimeout(adjustLabelFontSize, 300);
}
function checkModalReady(){
  const bgSelected = !!$('.choice-btn.selected[data-group="bgColor"]');
  const strobeSelected = !!$('.choice-btn.selected[data-group="strobeType"]');
  const effectNeeded = state.bgColorMode === 'on';
  const effectSelected = !effectNeeded || !!$('.choice-btn.selected[data-group="effect"]');
  $('#startAppBtn').disabled = !(bgSelected && strobeSelected && effectSelected);
}
function prefillModalSelections(){
  $all('.choice-btn').forEach(b=>b.classList.remove('selected'));
  if(state.bgColorMode){
    const b = $(`.choice-btn[data-group="bgColor"][data-value="${state.bgColorMode}"]`);
    if(b) b.classList.add('selected');
  }
  $('#section-effect-toggle').style.display = state.bgColorMode==='on' ? 'block' : 'none';
  if(state.effectType){
    const b = $(`.choice-btn[data-group="effect"][data-value="${state.effectType}"]`);
    if(b) b.classList.add('selected');
  }
  if(state.strobeType){
    const b = $(`.choice-btn[data-group="strobeType"][data-value="${state.strobeType}"]`);
    if(b) b.classList.add('selected');
  }
  checkModalReady();
}

/* ============================================================
   ログイン / 設定メニュー / 管理者画面
   ============================================================ */
function updateLoginUI(){
  $('#loginBtn').classList.toggle('hidden', state.loggedIn);
  $('#settingsMenuBtn').classList.toggle('hidden', !state.loggedIn);
  if(!state.loggedIn) $('#settingsMenu').classList.add('hidden');
}
$('#loginBtn').addEventListener('click', ()=>{
  $('#loginPasswordInput').value='';
  $('#loginModal').classList.remove('hidden');
});
$('#loginCancelBtn').addEventListener('click', ()=>{ $('#loginModal').classList.add('hidden'); });
$('#loginSubmitBtn').addEventListener('click', ()=>{
  if($('#loginPasswordInput').value === LOGIN_PASSWORD){
    state.loggedIn = true;
    updateLoginUI();
    $('#loginModal').classList.add('hidden');
    saveState();
  }else{
    alert('パスワードが違います。');
  }
});
$('#settingsMenuBtn').addEventListener('click', ()=>{
  $('#settingsMenu').classList.toggle('hidden');
});
$('#logoutBtn').addEventListener('click', ()=>{
  state.loggedIn = false;
  updateLoginUI();
  saveState();
});
$('#reopenInitBtn').addEventListener('click', ()=>{
  $('#settingsMenu').classList.add('hidden');
  prefillModalSelections();
  $('#initModal').classList.remove('hidden');
});
$('#openAdminBtn').addEventListener('click', ()=>{
  $('#settingsMenu').classList.add('hidden');
  $('#adminModal').classList.remove('hidden');
});
$('#adminCloseBtn').addEventListener('click', ()=>{ $('#adminModal').classList.add('hidden'); });

$all('.admin-asset-row').forEach(row=>{
  const path = row.dataset.path;
  const input = row.querySelector('input[type=file]');
  input.addEventListener('change', e=>{
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ev=>{
      state.adminAssets[path] = ev.target.result;
      saveState();
      applyModalAssets();
      applyStageState();
    };
    reader.readAsDataURL(file);
  });
});

// メニュー外クリックで閉じる
document.addEventListener('click', e=>{
  const area = $('.login-area');
  if(area && !area.contains(e.target)){
    $('#settingsMenu').classList.add('hidden');
  }
});

/* ============================================================
   ダーク/ライトモード & 本番ロックモード
   ============================================================ */
function applyAllSettingsToUI(){
  document.body.classList.toggle('dark-mode', state.darkMode);
  document.body.classList.toggle('light-mode', !state.darkMode);
  document.body.classList.toggle('locked', state.locked);
  $('#lockModeToggle').textContent = state.locked ? '🔒 本番モード' : '🔓 練習モード';
  $('#darkModeToggle').textContent = state.darkMode ? '☀' : '🌙';
  $('#scriptEditor').innerHTML = state.scriptHTML || '';
  $('#gdocUrlInput').value = state.gdocUrl || '';
  updateLoginUI();
  applyModalAssets();
  renderCastList();
  renderCueTable();
  renderColorToggles();
  renderStageItems();
  renderVersionMemos();
  applyStageState();
  applyColorFilter();
  setupGdocAutoSync();
}

$('#darkModeToggle').addEventListener('click', ()=>{
  state.darkMode = !state.darkMode;
  applyAllSettingsToUI();
  saveState();
});
$('#lockModeToggle').addEventListener('click', ()=>{
  state.locked = !state.locked;
  applyAllSettingsToUI();
  saveState();
});

/* ============================================================
   ストップウォッチ / タイマー
   ============================================================ */
function formatSW(ms){
  const totalSec = ms/1000;
  const m = Math.floor(totalSec/60);
  const s = (totalSec%60).toFixed(1);
  return `${String(m).padStart(2,'0')}:${s.padStart(4,'0')}`;
}
function updateSWDisplay(){
  $('#stopwatchDisplay').textContent = formatSW(state.stopwatch.elapsed);
}
$('#swStartBtn').addEventListener('click', ()=>{
  if(state.stopwatch.running) return;
  state.stopwatch.running = true;
  swStart = performance.now() - state.stopwatch.elapsed;
  swInterval = setInterval(()=>{
    state.stopwatch.elapsed = performance.now() - swStart;
    updateSWDisplay();
  }, 100);
});
$('#swStopBtn').addEventListener('click', ()=>{
  state.stopwatch.running = false;
  clearInterval(swInterval);
  saveState();
});
$('#swResetBtn').addEventListener('click', ()=>{
  state.stopwatch.running = false;
  clearInterval(swInterval);
  state.stopwatch.elapsed = 0;
  updateSWDisplay();
  saveState();
});

/* ============================================================
   バージョン管理メモ
   ============================================================ */
$('#versionMemoAddBtn').addEventListener('click', ()=>{
  const val = $('#versionMemoInput').value.trim();
  if(!val) return;
  state.versionMemos.unshift({id:uid(), text:val, date:new Date().toLocaleString('ja-JP')});
  $('#versionMemoInput').value='';
  renderVersionMemos();
  saveState();
});
function renderVersionMemos(){
  const list = $('#versionMemoList');
  list.innerHTML='';
  state.versionMemos.slice(0,20).forEach(m=>{
    const li=document.createElement('li');
    li.textContent = `${m.text}（${m.date}）`;
    list.appendChild(li);
  });
  $('#versionMemoDisplay').textContent = state.versionMemos[0] ? state.versionMemos[0].text : '';
}

/* ============================================================
   配役パネル
   ============================================================ */
$('#castPanelToggle').addEventListener('click', ()=>{
  const panel = $('#castPanel');
  panel.classList.toggle('open');
  panel.classList.toggle('closed');
  $('#castPanelArrow').textContent = panel.classList.contains('open') ? '◀' : '▶';
  renderCastList();
});

function nextMic(){
  if(state.cast.length===0) return MIC_CYCLE[0];
  const last = state.cast[state.cast.length-1].mic;
  const idx = MIC_CYCLE.indexOf(last);
  return MIC_CYCLE[(idx+1) % MIC_CYCLE.length];
}

$('#castAddBtn').addEventListener('click', ()=>{
  const name = $('#newCharName').value.trim();
  const actor = $('#newActorName').value.trim();
  if(!name) return;
  state.cast.push({
    id:uid(), name, actor, mic:nextMic(),
    color: COLOR_PALETTE[state.cast.length % COLOR_PALETTE.length], edit:false
  });
  $('#newCharName').value=''; $('#newActorName').value='';
  renderCastList();
  saveState();
});

function renderCastList(){
  const wrap = $('#castList');
  wrap.innerHTML='';
  const micCount = {};
  state.cast.forEach(c=>{ micCount[c.mic] = (micCount[c.mic]||0)+1; });
  const closed = $('#castPanel').classList.contains('closed');

  state.cast.forEach(c=>{
    const row = document.createElement('div');
    row.className='cast-row';
    row.style.borderLeft = `6px solid ${c.color}`;

    const nameSpan = document.createElement('span');
    // ※強制的な3文字切り出しは行わない。閉じた状態はCSSのoverflow/ellipsisのみで隠す。
    nameSpan.textContent = c.name;
    nameSpan.title = c.name;
    row.appendChild(nameSpan);

    if(!closed){
      const actorInput = document.createElement('input');
      actorInput.type='text'; actorInput.value = c.actor||''; actorInput.placeholder='役者名';
      actorInput.disabled = !c.edit;
      actorInput.addEventListener('input', e=>{ c.actor = e.target.value; saveState(); });
      row.appendChild(actorInput);

      const micBtn = document.createElement('button');
      micBtn.className='mic-btn' + (micCount[c.mic]>1 ? ' duplicate' : '');
      micBtn.textContent = c.mic;
      micBtn.addEventListener('click', ()=>{
        const idx = MIC_CYCLE.indexOf(c.mic);
        c.mic = MIC_CYCLE[(idx+1)%MIC_CYCLE.length];
        renderCastList(); saveState();
      });
      row.appendChild(micBtn);

      const editBtn = document.createElement('button');
      editBtn.className='del-btn editable-only';
      editBtn.textContent = c.edit ? '確定':'変更';
      editBtn.addEventListener('click', ()=>{
        c.edit = !c.edit;
        renderCastList(); saveState();
      });
      row.appendChild(editBtn);

      if(c.edit){
        const nameInput = document.createElement('input');
        nameInput.type='text'; nameInput.value=c.name; nameInput.style.width='70px';
        nameInput.addEventListener('input', e=>{ c.name = e.target.value; saveState(); });
        row.insertBefore(nameInput, row.firstChild);
        row.removeChild(nameSpan);
      }

      const colorBtn = document.createElement('button');
      colorBtn.className='color-swatch-btn';
      colorBtn.style.background = c.color;
      colorBtn.addEventListener('click', ()=>{
        const idx = COLOR_PALETTE.indexOf(c.color);
        c.color = COLOR_PALETTE[(idx+1)%COLOR_PALETTE.length];
        renderCastList(); saveState();
      });
      row.appendChild(colorBtn);

      const delBtn = document.createElement('button');
      delBtn.className='del-btn editable-only';
      delBtn.textContent='✕';
      delBtn.addEventListener('click', ()=>{
        state.cast = state.cast.filter(x=>x.id!==c.id);
        renderCastList(); saveState();
      });
      row.appendChild(delBtn);
    }

    wrap.appendChild(row);
  });
}

/* ============================================================
   タブ切替
   ============================================================ */
$all('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    $all('.tab-btn').forEach(b=>b.classList.remove('active'));
    $all('.tab-pane').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    $('#tab-'+btn.dataset.tab).classList.add('active');
  });
});

/* ============================================================
   台本エディタ（リッチテキスト / ルビ / ト書き / 自動マッチング）
   ============================================================ */
const scriptEditor = $('#scriptEditor');
scriptEditor.addEventListener('input', ()=>{ state.scriptHTML = scriptEditor.innerHTML; saveState(); });
scriptEditor.addEventListener('paste', ()=>{
  setTimeout(()=>{ state.scriptHTML = scriptEditor.innerHTML; saveState(); }, 0);
});

$('#rubyBtn').addEventListener('click', ()=>{
  const sel = window.getSelection();
  if(!sel || sel.rangeCount===0 || sel.toString().length===0){ alert('ルビを振る文字を選択してください'); return; }
  const furigana = prompt('ふりがなを入力してください');
  if(furigana===null) return;
  const range = sel.getRangeAt(0);
  const ruby = document.createElement('ruby');
  ruby.textContent = range.toString();
  const rt = document.createElement('rt');
  rt.textContent = furigana;
  ruby.appendChild(rt);
  range.deleteContents();
  range.insertNode(ruby);
  state.scriptHTML = scriptEditor.innerHTML;
  saveState();
});

$('#tokakiBtn').addEventListener('click', ()=>{
  const sel = window.getSelection();
  if(!sel || sel.rangeCount===0){ return; }
  let node = sel.anchorNode;
  while(node && node.nodeType!==1) node = node.parentNode;
  if(node && node!==scriptEditor){
    node.classList.toggle('tokaki');
    node.dataset.tokaki = node.classList.contains('tokaki') ? '1':'';
    state.scriptHTML = scriptEditor.innerHTML;
    saveState();
  }
});

// 話者自動マッチング：「話者名(、・/区切りで複数可)：セリフ」形式を検出
$('#autoMatchBtn').addEventListener('click', ()=>{
  const lines = scriptEditor.querySelectorAll('p, div');
  const targets = lines.length ? Array.from(lines) : [scriptEditor];
  let matchedCount = 0;
  targets.forEach(line=>{
    // 前回のドットをクリア
    line.querySelectorAll('.speaker-dot').forEach(d=>d.remove());
    const text = (line.textContent || '').replace(/\u200b/g,'');
    const m = text.match(/^\s*([^\s:：]{1,30})[：:]/);
    if(m){
      const namesRaw = m[1];
      const names = namesRaw.split(/[、・\/]/).map(s=>s.trim()).filter(Boolean);
      const matchedChars = [];
      names.forEach(n=>{
        const char = state.cast.find(c=> c.name===n || (c.name && (c.name.startsWith(n) || n.startsWith(c.name))));
        if(char) matchedChars.push(char);
      });
      if(matchedChars.length){
        line.classList.add('speaker-highlight');
        line.style.borderLeft = `4px solid ${matchedChars[0].color}`;
        line.dataset.speaker = matchedChars.map(c=>c.name).join(',');
        line.dataset.mic = matchedChars[0].mic;
        matchedChars.forEach(c=>{
          const dot = document.createElement('span');
          dot.className='speaker-dot';
          dot.style.background = c.color;
          dot.title = c.name;
          line.insertBefore(dot, line.firstChild);
        });
        matchedCount++;
      }
    }
  });
  state.scriptHTML = scriptEditor.innerHTML;
  saveState();
  alert(`${matchedCount} 行を自動マッチングしました。`);
});

/* ---------- 読み上げ（選択範囲から開始 / 再クリックで停止） ---------- */
function getScriptLines(){
  const children = Array.from(scriptEditor.children).filter(el=>el.nodeType===1);
  return children.length ? children : [scriptEditor];
}
$('#speakRowBtn').addEventListener('click', ()=>{
  if(isReading){
    speechSynthesis.cancel();
    isReading = false;
    $('#speakRowBtn').textContent = '🔊 読み上げ';
    return;
  }
  const lines = getScriptLines();
  const sel = window.getSelection();
  let startIndex = 0;
  if(sel && sel.rangeCount>0 && !sel.isCollapsed && sel.toString().trim().length>0){
    let node = sel.anchorNode;
    while(node && node.parentNode !== scriptEditor && node !== scriptEditor) node = node.parentNode;
    const idx = lines.indexOf(node);
    if(idx>=0) startIndex = idx;
  }
  const queue = [];
  for(let i=startIndex;i<lines.length;i++){
    const line = lines[i];
    if(line.classList && line.classList.contains('tokaki')) continue;
    if(lines.length>1 && !line.dataset.mic) continue; // マイク未割当行は読み上げ漏れチェックのためスキップ
    const text = (line.textContent||'').replace(/^[^：:]*[：:]/,'').trim();
    if(text) queue.push(text);
  }
  if(queue.length===0){ alert('読み上げ可能な行がありません（マイク割当・ト書き設定をご確認ください）。'); return; }
  isReading = true;
  $('#speakRowBtn').textContent = '⏹ 停止';
  queue.forEach((text, i)=>{
    const u = new SpeechSynthesisUtterance(text);
    u.lang='ja-JP';
    if(i===queue.length-1){
      u.onend = ()=>{ isReading=false; $('#speakRowBtn').textContent='🔊 読み上げ'; };
    }
    speechSynthesis.speak(u);
  });
});

/* ---------- Googleドキュメント自動同期（一方向：あちら→こちら） ---------- */
function extractGoogleDocId(url){
  const m = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}
async function syncGoogleDoc(silent){
  const url = $('#gdocUrlInput').value.trim();
  state.gdocUrl = url;
  saveState();
  if(!url){ $('#gdocStatus').textContent=''; return; }
  const id = extractGoogleDocId(url);
  if(!id){ $('#gdocStatus').textContent='URLが正しくありません'; return; }
  const exportUrl = `https://docs.google.com/document/d/${id}/export?format=html`;
  try{
    const res = await fetch(exportUrl, {mode:'cors'});
    if(!res.ok) throw new Error('取得失敗 status:'+res.status);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const body = doc.body ? doc.body.innerHTML : html;
    scriptEditor.innerHTML = body;
    state.scriptHTML = scriptEditor.innerHTML;
    saveState();
    $('#gdocStatus').textContent = '同期しました（'+new Date().toLocaleTimeString('ja-JP')+'）';
  }catch(err){
    $('#gdocStatus').textContent = '同期に失敗しました（ドキュメントを「ウェブに公開」設定にしてください）';
    if(!silent) console.warn(err);
  }
}
$('#gdocSyncBtn').addEventListener('click', ()=>{ syncGoogleDoc(false); setupGdocAutoSync(); });
function setupGdocAutoSync(){
  if(gdocIntervalHandle) clearInterval(gdocIntervalHandle);
  if(state.gdocUrl){
    gdocIntervalHandle = setInterval(()=>syncGoogleDoc(true), 60000);
  }
}

/* ---------- 台本タブ内 音源プレーヤー ---------- */
const scriptAudioPlayer = $('#scriptAudioPlayer');
$('#scriptAudioInput').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  scriptAudioPlayer.src = URL.createObjectURL(file);
});
$('#scriptAudioPlayPause').addEventListener('click', ()=>{
  if(scriptAudioPlayer.paused){ scriptAudioPlayer.play(); $('#scriptAudioPlayPause').textContent='⏸'; }
  else { scriptAudioPlayer.pause(); $('#scriptAudioPlayPause').textContent='▶'; }
});
scriptAudioPlayer.addEventListener('loadedmetadata', ()=>{
  $('#scriptAudioSeek').max = scriptAudioPlayer.duration || 0;
});
scriptAudioPlayer.addEventListener('timeupdate', ()=>{
  $('#scriptAudioSeek').value = scriptAudioPlayer.currentTime;
  $('#scriptAudioTime').textContent = `${scriptAudioPlayer.currentTime.toFixed(1)} / ${(scriptAudioPlayer.duration||0).toFixed(1)}秒`;
});
$('#scriptAudioSeek').addEventListener('input', e=>{
  scriptAudioPlayer.currentTime = parseFloat(e.target.value)||0;
});

/* ============================================================
   配役色トグル（ステージ用8色）
   ============================================================ */
function renderColorToggles(){
  const wrap = $('#stageColorToggles');
  wrap.innerHTML='';
  COLOR_PALETTE.forEach(col=>{
    const btn = document.createElement('button');
    btn.className='color-toggle-btn' + (state.activeColor===col ? ' active':'');
    btn.style.background = col;
    btn.style.color = col;
    btn.addEventListener('click', ()=>{
      state.activeColor = (state.activeColor===col) ? null : col;
      renderColorToggles();
      applyColorFilter();
      saveState();
    });
    wrap.appendChild(btn);
  });
}
function applyColorFilter(){
  const filter = $('#stageColorFilter');
  if(state.bgColorMode==='off' || !state.activeColor){
    filter.style.opacity=0;
    return;
  }
  filter.style.backgroundColor = state.activeColor;
  filter.style.opacity = .55;
}

/* ============================================================
   ストロボ
   ============================================================ */
let strobeActive=false;
$('#strobeToggleBtn').addEventListener('click', ()=>{
  if(state.strobeType==='nashi'){ alert('初期設定でストロボが「なし」に設定されています。'); return; }
  strobeActive = !strobeActive;
  $('#stagePreview').classList.toggle('strobing', strobeActive);
});

/* ============================================================
   ステージ状態（暗転/全照/50%）
   ============================================================ */
$all('.stage-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    state.stageState = btn.dataset.stage;
    applyStageState();
    saveState();
  });
});
function applyStageState(){
  const map = {anten:'img/anten.jpg', zensyou:'img/zensyou.jpg', hansyou:'img/hansyou.jpg'};
  const path = map[state.stageState];
  const img = $('#stageBgImg');
  img.src = resolveAsset(path);
  img.onerror = ()=>{
    img.style.display='none';
    $('#stagePreview').style.background = state.stageState==='anten' ? '#000' : state.stageState==='hansyou' ? '#555' : '#ddd';
  };
  img.onload = ()=>{ img.style.display='block'; };
}

/* ============================================================
   ステージアイテム（ドラッグ&ドロップ配置）
   ============================================================ */
$('#stageItemInput').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev=>{
    state.stageItems.push({id:uid(), src:ev.target.result, x:20, y:20});
    renderStageItems();
    saveState();
  };
  reader.readAsDataURL(file);
});

function renderStageItems(){
  const layer = $('#stageItemsLayer');
  layer.innerHTML='';
  state.stageItems.forEach(item=>{
    const el = document.createElement('div');
    el.className='stage-item';
    el.style.left = item.x+'px';
    el.style.top = item.y+'px';
    const img = document.createElement('img');
    img.src = item.src;
    el.appendChild(img);
    makeDraggable(el, item);
    layer.appendChild(el);
  });
}
function makeDraggable(el, item){
  let dragging=false, offX=0, offY=0;
  el.addEventListener('pointerdown', e=>{
    if(state.locked) return;
    dragging=true;
    offX = e.offsetX; offY = e.offsetY;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', e=>{
    if(!dragging) return;
    const parentRect = el.parentElement.getBoundingClientRect();
    item.x = e.clientX - parentRect.left - offX;
    item.y = e.clientY - parentRect.top - offY;
    el.style.left = item.x+'px';
    el.style.top = item.y+'px';
  });
  el.addEventListener('pointerup', ()=>{ dragging=false; saveState(); });
}

/* ============================================================
   動画再生 & Cue記録
   ============================================================ */
const video = $('#rehearsalVideo');
$('#videoInput').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  video.src = URL.createObjectURL(file);
});
video.addEventListener('timeupdate', ()=>{
  $('#currentVideoTime').textContent = video.currentTime.toFixed(1)+'秒';
});

function recordCue(sec){
  const cue = {
    sec: (sec||0).toFixed ? sec.toFixed(1) : String(sec),
    line:'', audio:'', stage: state.stageState,
    bg: state.activeColor || '', chs: $('#strobeChs').value,
    strobe: strobeActive ? 'ON':'OFF', fade: $('#fadeSeconds').value
  };
  state.cues.push(cue);
  state.cues.sort((a,b)=>parseFloat(a.sec)-parseFloat(b.sec));
  renderCueTable();
  saveState();
}
$('#captureCueBtn').addEventListener('click', ()=> recordCue(video.currentTime));
$('#scriptCueBtn').addEventListener('click', ()=> recordCue(scriptAudioPlayer.currentTime || 0));
$('#cueTabAddBtn').addEventListener('click', ()=> recordCue(0));

const CUE_TBODY_IDS = ['cueTableBody_script','cueTableBody_video','cueTableBody_cue'];
function renderCueTable(){
  CUE_TBODY_IDS.forEach(id=>{
    const body = document.getElementById(id);
    if(!body) return;
    body.innerHTML='';
    state.cues.forEach((c,idx)=>{
      const tr = document.createElement('tr');
      tr.className='cue-row';
      const fields = ['sec','line','audio','stage','bg','chs','strobe','fade'];
      fields.forEach(f=>{
        const td = document.createElement('td');
        td.textContent = c[f];
        td.contentEditable = 'true';
        td.addEventListener('blur', ()=>{ c[f]=td.textContent; saveState(); });
        tr.appendChild(td);
      });
      const delTd = document.createElement('td');
      const delBtn = document.createElement('button');
      delBtn.textContent='✕'; delBtn.className='del-btn';
      delBtn.addEventListener('click', ev=>{ ev.stopPropagation(); state.cues.splice(idx,1); renderCueTable(); saveState(); });
      delTd.appendChild(delBtn);
      tr.appendChild(delTd);
      tr.addEventListener('click', ()=>{ video.currentTime = parseFloat(c.sec)||0; });
      body.appendChild(tr);
    });
  });
}

/* ============================================================
   CSV出力（UTF-8 BOM付き）
   ============================================================ */
$('#exportCsvBtn').addEventListener('click', ()=>{
  const headers = ['秒数','セリフ','音源','舞台','背景','chs','ストロボ','フェード'];
  const rows = state.cues.map(c=>[c.sec,c.line,c.audio,c.stage,c.bg,c.chs,c.strobe,c.fade]);
  let csv = headers.join(',') + '\n';
  rows.forEach(r=>{
    csv += r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',') + '\n';
  });
  const bom = new Uint8Array([0xEF,0xBB,0xBF]);
  const blob = new Blob([bom, csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'stage_cue_sheet.csv';
  a.click();
  $('#settingsMenu').classList.add('hidden');
});

/* ============================================================
   JSON エクスポート / インポート
   ============================================================ */
$('#exportJsonBtn').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'stage_planner_data.json';
  a.click();
});
$('#importJsonInput').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev=>{
    try{
      const loaded = JSON.parse(ev.target.result);
      state = Object.assign(state, loaded);
      applyAllSettingsToUI();
      saveState();
      alert('読み込みが完了しました。');
    }catch(err){ alert('JSONの読み込みに失敗しました: '+err.message); }
  };
  reader.readAsText(file);
});

/* ============================================================
   印刷 / PDF
   ============================================================ */
$('#printBtn').addEventListener('click', ()=>{
  const printArea = $('#printArea');
  printArea.innerHTML = `<h1>台本・キューシート</h1>` + scriptEditor.innerHTML +
    `<h2>キューシート一覧</h2>` +
    `<table border="1" style="width:100%;border-collapse:collapse;">
      <tr><th>秒数</th><th>セリフ</th><th>音源</th><th>舞台</th><th>背景</th><th>chs</th><th>ストロボ</th><th>フェード</th></tr>
      ${state.cues.map(c=>`<tr><td>${c.sec}</td><td>${c.line}</td><td>${c.audio}</td><td>${c.stage}</td><td>${c.bg}</td><td>${c.chs}</td><td>${c.strobe}</td><td>${c.fade}</td></tr>`).join('')}
    </table>`;
  window.print();
});

/* ============================================================
   QRコード生成
   ============================================================ */
$('#qrBtn').addEventListener('click', ()=>{
  const holder = $('#qrCanvasHolder');
  holder.innerHTML='';
  const dataStr = JSON.stringify({cast:state.cast.map(c=>c.name), cues:state.cues.length});
  if(window.QRCode){
    QRCode.toCanvas(document.createElement('canvas'), dataStr, {width:220}, (err, canvas)=>{
      if(err){ holder.textContent='QR生成に失敗しました'; return; }
      holder.appendChild(canvas);
    });
  }else{
    holder.textContent='QRライブラリの読み込みに失敗しました。';
  }
  $('#qrModal').classList.remove('hidden');
});
$('#qrCloseBtn').addEventListener('click', ()=>{ $('#qrModal').classList.add('hidden'); });

/* ============================================================
   自動保存
   ============================================================ */
setInterval(saveState, 30000);
window.addEventListener('beforeunload', saveState);

/* ============================================================
   初期化
   ============================================================ */
document.addEventListener('DOMContentLoaded', ()=>{
  loadState();
  applyModalAssets();
  initModalLogic();
  if(state.initDone){
    $('#initModal').classList.add('hidden');
    applyAllSettingsToUI();
  }else{
    prefillModalSelections();
  }
  updateLoginUI();
  updateSWDisplay();
});
