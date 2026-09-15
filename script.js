/* =========================================================
   舞台演出プランナー script.js  (追加要望②対応版)
   ========================================================= */
'use strict';

const STORAGE_KEY = 'stagePlanner_state_v2';
// 背景色8色（色相順・中央寄せ表示）赤→オレンジ→黄色→緑→青緑→青→ピンク→白
const COLOR_PALETTE = [
  {name:'赤',     hex:'#E26D6C'},
  {name:'オレンジ', hex:'#F4A462'},
  {name:'黄色',   hex:'#FFD166'},
  {name:'緑',     hex:'#95C68A'},
  {name:'青緑',   hex:'#68A1A4'},
  {name:'青',     hex:'#5AA4DE'},
  {name:'ピンク', hex:'#C47297'},
  {name:'白',     hex:'#FFFFFF'}
];
const MIC_CYCLE = ['ワイヤレス1','ワイヤレス2','ワイヤレス3','ワイヤレス4','有線1','有線2','有線3','有線4'];
// 要件⑤：自動割り当ては「ワイヤレス」内のみを循環させる
const AUTO_MIC_CYCLE = ['ワイヤレス1','ワイヤレス2','ワイヤレス3','ワイヤレス4'];
// 要件④：マイクがかぶった際は警告ではなく、マイクごとに固定した強調色で色分けする
const MIC_COLORS = {
  'ワイヤレス1':'#F4A462','ワイヤレス2':'#FFD166','ワイヤレス3':'#95C68A','ワイヤレス4':'#68A1A4',
  '有線1':'#5AA4DE','有線2':'#8974BA','有線3':'#C47297','有線4':'#E26D6C'
};
// 要件⑦：読み上げ音声の種類（男性低音〜女性高音）
const VOICE_CYCLE = ['男1','男2','男3','女1','女2','女3'];
const VOICE_PARAMS = {
  '男1':{pitch:0.55, rate:0.95, gender:'male'},
  '男2':{pitch:0.8,  rate:1.0,  gender:'male'},
  '男3':{pitch:1.05, rate:1.05, gender:'male'},
  '女1':{pitch:1.0,  rate:0.95, gender:'female'},
  '女2':{pitch:1.3,  rate:1.0,  gender:'female'},
  '女3':{pitch:1.6,  rate:1.05, gender:'female'}
};
function textColorFor(hex){
  const h = hex.replace('#','');
  const r=parseInt(h.substring(0,2),16), g=parseInt(h.substring(2,4),16), b=parseInt(h.substring(4,6),16);
  const yiq = (r*299+g*587+b*114)/1000;
  return yiq>=140 ? '#222' : '#fff';
}

// 管理者ログイン：削除・一覧非表示の固定マスターアカウント（要件⑬）
const ROOT_ADMIN = {id:'syoumei', pass:'最高！'};

const STAGE_FOLDER = {anten:'暗転', zensyou:'全照', hansyou:'半照'};
// 要件⑭：「ストロボ独立」（chikachika）は選択肢として完全に削除
const STROBE_FOLDER = {none:'ストロボ✖', static:'ストロボ静止', kurukuru:'ストロボくるくる'};
const STROBE_LABEL_CUE = {static:'◯', kurukuru:'Effect1', none:'なし'};
const STROBE_BTN_LABEL = {static:'ストロボ静止', kurukuru:'ストロボクルクル', none:'ストロボ✖️'};
const EXISTING_STROBE_CYCLE = ['static','kurukuru','none'];
const ORIGINAL_STROBE_CYCLE = ['none','static','kurukuru'];
// 要件③：ストロボ静止／ストロボくるくるは色別ファイルではなく単一ファイルを参照し、
// 色は配役色トグルと同じ色フィルター（オーバーレイ）で表現する
const STROBE_SINGLE_FILE = {static:'静止.png', kurukuru:'くるくる.png'};
// 要件⑥：ラベル名称変更（内部キー既存/独自はそのまま、表示名のみ変更）
const EFFECT_SUBMODE_LABEL = {none:'Effectなし', existing:'ミラーボール', original:'照明職人用'};
const FADE_CYCLE = ['none','in','out'];
const FADE_LABEL = {none:'フェードなし', in:'フェードイン', out:'フェードアウト'};
// 要件⑦：Cue一覧のFader列に割り当てる循環（1→2→…→9→0→1…）
const DIGIT_CYCLE = ['1','2','3','4','5','6','7','8','9','0'];
// 要件⑩：ストロボくるくるの色変化クロスフェード時間（秒）
const KURUKURU_CROSSFADE_SEC = 1;

let state = {
  initDone:false,
  bgColorMode:null,        // 'on' | 'off'
  effectOnOff:null,        // 'on' | 'off'（背景色あり時の設定2）
  effectKind:null,         // 'existing' | 'original'
  effectType:null,         // 'none' | 'existing' | 'original'（背景色あり時のみ使用）
  darkMode:false,
  locked:false,
  loggedIn:false,
  admins:[],                // {id,pass}（rootの syoumei は含まない）
  loggedInAdminId:null,     // ログイン中のID（'syoumei' または admins内のid）
  _adminsSeeded:false,      // data.json からの初回読込済みフラグ
  cast:[],                 // {id,name,actor,mic,color,edit}
  scriptHTML:'',
  gdocUrl:'',
  cues:[],                  // {sec,line,audio,stage,bg,effect,strobe,fade,fader,source,stageItemsSnapshot}
  stageState:'zensyou',
  activeColorIndex:null,    // COLOR_PALETTE のインデックス
  strobeOn:false,           // effectType==='none' の場合の単純ON/OFF
  strobeMode:'none',        // effectType==='existing'|'original' の場合の状態
  effectOn:false,           // effectType==='existing' の場合のEffect ON/OFF
  effectSubMode:'none',     // effectType==='original' の場合のEffect状態(none/existing/original)
  fadeMode:'none',          // 'none' | 'in' | 'out'
  fadeDurationSec:1,
  stageItems:[],             // {id,src,x,y}
  stageVideoOverride:'',     // 手動指定したステージ動画（ローカルセッションのみ）
  customEffects:[],          // {id,no,step,sec,colorName,strobeLabel}
  versionMemos:[],           // {id,text,date,snapshot}
  stopwatch:{elapsed:0,running:false},
  adminAssets:{},            // { "img/xxx.png": "data:...", "mov/xxx.mov": "data:..." }
  currentAudioLabel:'-',
  audioSourceCount:0,
  // 要件④：音源を複数管理する（表示順=配列順、name は①②③…を自動採番）
  audioSources:[],           // {id,name,src,startOffset}
  currentAudioTrackId:null,  // 直近に再生／使用したトラック（Cue記録時の「音源」欄に反映）
  // 追加要望⑦：動画タブでアップロードした動画（従来は保存されず消えていた）
  rehearsalVideoSrc:'',
  // 追加要望④⑥⑪⑫：「照明職人用」の現在のNo.（台本/動画/Cueタブの📍Cue記録で自動+1、
  // 照明職人用タブでは手動編集・テスト対象として使用）
  cfxCurrentNo:1
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
function circledNum(n){
  if(n<1) return '-';
  if(n<=20) return String.fromCodePoint(0x2460+n-1);
  return '('+n+')';
}
function currentColorName(){
  if(state.activeColorIndex==null) return null;
  const c = COLOR_PALETTE[state.activeColorIndex];
  return c ? c.name : null;
}
function currentColorHex(){
  if(state.activeColorIndex==null) return null;
  const c = COLOR_PALETTE[state.activeColorIndex];
  return c ? c.hex : null;
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
          state.effectOnOff=null; state.effectKind=null; state.effectType=null;
          $('#section-effect-kind').style.display='none';
          $all('.choice-btn[data-group="effectOnOff"],.choice-btn[data-group="effectKind"]').forEach(b=>b.classList.remove('selected'));
        }
      }
      if(group==='effectOnOff'){
        state.effectOnOff = btn.dataset.value;
        const showKind = state.effectOnOff==='on';
        $('#section-effect-kind').style.display = showKind ? 'block' : 'none';
        if(!showKind){
          state.effectKind=null;
          state.effectType='none';
          $all('.choice-btn[data-group="effectKind"]').forEach(b=>b.classList.remove('selected'));
        }
      }
      if(group==='effectKind'){
        state.effectKind = btn.dataset.value;
        state.effectType = btn.dataset.value; // 'existing' | 'original'
      }
      checkModalReady();
    });
  });

  $('#startAppBtn').addEventListener('click', ()=>{
    state.initDone = true;
    state.strobeOn=false; state.strobeMode='none'; state.effectOn=false; state.effectSubMode='none';
    $('#initModal').classList.add('hidden');
    saveState();
    applyAllSettingsToUI();
  });

  function adjustLabelFontSize(){
    $all('.choice-img').forEach(media=>{
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
  let ready = bgSelected;
  if(state.bgColorMode==='on'){
    const effectOnOffSelected = !!$('.choice-btn.selected[data-group="effectOnOff"]');
    ready = ready && effectOnOffSelected;
    if(state.effectOnOff==='on'){
      const kindSelected = !!$('.choice-btn.selected[data-group="effectKind"]');
      ready = ready && kindSelected;
    }
  }
  $('#startAppBtn').disabled = !ready;
}
function prefillModalSelections(){
  $all('.choice-btn').forEach(b=>b.classList.remove('selected'));
  if(state.bgColorMode){
    const b = $(`.choice-btn[data-group="bgColor"][data-value="${state.bgColorMode}"]`);
    if(b) b.classList.add('selected');
  }
  $('#section-effect-toggle').style.display = state.bgColorMode==='on' ? 'block' : 'none';
  if(state.effectOnOff){
    const b = $(`.choice-btn[data-group="effectOnOff"][data-value="${state.effectOnOff}"]`);
    if(b) b.classList.add('selected');
  }
  $('#section-effect-kind').style.display = (state.bgColorMode==='on' && state.effectOnOff==='on') ? 'block' : 'none';
  if(state.effectKind){
    const b = $(`.choice-btn[data-group="effectKind"][data-value="${state.effectKind}"]`);
    if(b) b.classList.add('selected');
  }
  checkModalReady();
}

/* ============================================================
   設定＞Googleログイン（要件②：学校でGoogle Cloud Consoleが使えないため、
   OAuthクライアントIDによる自動認可の代わりに、外部（OAuth 2.0 Playground等）で
   取得したアクセストークンをご自身で貼り付ける方式に変更）
   ============================================================ */
let googleAccessToken = null; // セキュリティのためlocalStorageには保存しない（セッション限り）

function updateGoogleLoginUI(){
  const loggedIn = !!googleAccessToken;
  $('#googleLoginInputArea').classList.toggle('hidden', loggedIn);
  $('#googleLoginStatusArea').classList.toggle('hidden', !loggedIn);
  $('#googleLoginStatus').textContent = loggedIn
    ? 'Googleアカウント：ログイン中（貼り付けられたアクセストークンを使用中）'
    : 'Googleアカウント：未ログイン';
}
function initGoogleLoginUI(){
  // トークン貼り付け方式のため、特別な初期化処理は不要。
  updateGoogleLoginUI();
}
$('#openGoogleLoginBtn').addEventListener('click', ()=>{
  $('#settingsMenu').classList.add('hidden');
  $('#googleTokenInput').value='';
  updateGoogleLoginUI();
  $('#googleLoginModal').classList.remove('hidden');
});
$('#googleLoginCloseBtn').addEventListener('click', ()=>{ $('#googleLoginModal').classList.add('hidden'); });
$('#googleTokenApplyBtn').addEventListener('click', ()=>{
  const token = $('#googleTokenInput').value.trim();
  if(!token){ alert('アクセストークンを入力してください。'); return; }
  // 受け取った情報を反映し、ログイン済み表示画面へ遷移する
  googleAccessToken = token;
  updateGoogleLoginUI();
});
$('#googleLogoutBtn').addEventListener('click', ()=>{
  googleAccessToken = null;
  updateGoogleLoginUI();
});

/* ============================================================
   ログイン / 設定 / 管理者画面 / フェード秒数
   ============================================================ */
function updateLoginUI(){
  $('#loginBtn').classList.toggle('hidden', state.loggedIn);
  $('#settingsMenuBtn').classList.toggle('hidden', !state.loggedIn);
  $('#initGatedGroup').classList.toggle('hidden', !state.loggedIn);
  if(!state.loggedIn) $('#settingsMenu').classList.add('hidden');
}
$('#loginBtn').addEventListener('click', ()=>{
  $('#loginIdInput').value='';
  $('#loginPasswordInput').value='';
  $('#loginModal').classList.remove('hidden');
});
$('#loginCancelBtn').addEventListener('click', ()=>{ $('#loginModal').classList.add('hidden'); });
$('#loginSubmitBtn').addEventListener('click', ()=>{
  const id = $('#loginIdInput').value.trim();
  const pass = $('#loginPasswordInput').value;
  const matched = (id===ROOT_ADMIN.id && pass===ROOT_ADMIN.pass)
    ? ROOT_ADMIN
    : state.admins.find(a=>a.id===id && a.pass===pass);
  if(matched){
    state.loggedIn = true;
    state.loggedInAdminId = matched.id;
    updateLoginUI();
    renderCueTable(); // 追加要望③：ログイン状態でFader/順番列の表示・編集可否が変わるため再描画
    $('#loginModal').classList.add('hidden');
    saveState();
  }else{
    alert('IDまたはパスワードが違います。');
  }
});
$('#settingsMenuBtn').addEventListener('click', ()=>{
  $('#settingsMenu').classList.toggle('hidden');
});
$('#logoutBtn').addEventListener('click', ()=>{
  state.loggedIn = false;
  state.loggedInAdminId = null;
  // 追加要望②：ログアウトした場合、本番モードは強制解除する
  if(state.locked){
    state.locked = false;
  }
  updateLoginUI();
  applyAllSettingsToUI();
  saveState();
});
$('#reopenInitBtn').addEventListener('click', ()=>{
  prefillModalSelections();
  $('#initModal').classList.remove('hidden');
});
$('#openAdminBtn').addEventListener('click', ()=>{
  $('#settingsMenu').classList.add('hidden');
  $('#adminModal').classList.remove('hidden');
});
$('#adminCloseBtn').addEventListener('click', ()=>{ $('#adminModal').classList.add('hidden'); });

/* ---------- 管理者一覧画面（要件⑬） ---------- */
$('#openAdminUsersBtn').addEventListener('click', ()=>{
  $('#settingsMenu').classList.add('hidden');
  renderAdminUsersTable();
  $('#adminUsersModal').classList.remove('hidden');
});
$('#adminUsersCloseBtn').addEventListener('click', async ()=>{
  await persistAdminsToDataJson();
  $('#adminUsersModal').classList.add('hidden');
});
$('#newAdminAddBtn').addEventListener('click', ()=>{
  const id = $('#newAdminIdInput').value.trim();
  const pass = $('#newAdminPassInput').value;
  if(!id || !pass){ alert('IDとパスワードを入力してください。'); return; }
  if(id===ROOT_ADMIN.id || state.admins.some(a=>a.id===id)){
    alert('そのIDは既に使用されています。'); return;
  }
  state.admins.push({id, pass});
  $('#newAdminIdInput').value=''; $('#newAdminPassInput').value='';
  renderAdminUsersTable();
  saveState();
});
function renderAdminUsersTable(){
  const body = $('#adminUsersTableBody');
  body.innerHTML='';
  const visible = state.admins.filter(a=>a.id!==ROOT_ADMIN.id);
  // 自分の行を最上部に表示
  visible.sort((a,b)=>{
    if(a.id===state.loggedInAdminId) return -1;
    if(b.id===state.loggedInAdminId) return 1;
    return 0;
  });
  visible.forEach(a=>{
    const isSelf = a.id===state.loggedInAdminId;
    const tr = document.createElement('tr');
    if(isSelf) tr.className='admin-user-self-row';

    const idTd = document.createElement('td');
    if(isSelf){
      const idInput = document.createElement('input');
      idInput.type='text'; idInput.value=a.id; idInput.className='admin-user-id-input';
      idInput.addEventListener('change', ()=>{
        const newId = idInput.value.trim();
        if(!newId){ idInput.value=a.id; return; }
        if(newId!==a.id && (newId===ROOT_ADMIN.id || state.admins.some(x=>x.id===newId))){
          alert('そのIDは既に使用されています。'); idInput.value=a.id; return;
        }
        if(state.loggedInAdminId===a.id) state.loggedInAdminId = newId;
        a.id = newId;
        saveState();
        renderAdminUsersTable();
      });
      idTd.appendChild(idInput);
    }else{
      idTd.textContent = a.id;
    }
    tr.appendChild(idTd);

    const passTd = document.createElement('td');
    if(isSelf){
      const passInput = document.createElement('input');
      passInput.type='text'; passInput.value=a.pass; passInput.className='admin-user-pass-input';
      passInput.addEventListener('change', ()=>{ a.pass = passInput.value; saveState(); });
      passTd.appendChild(passInput);
    }else{
      passTd.textContent = '••••••';
    }
    tr.appendChild(passTd);

    const delTd = document.createElement('td');
    const delBtn = document.createElement('button');
    delBtn.textContent='削除'; delBtn.className='del-btn';
    delBtn.addEventListener('click', ()=>{
      if(!confirm(`ID「${a.id}」を削除しますか？`)) return;
      state.admins = state.admins.filter(x=>x.id!==a.id);
      if(state.loggedInAdminId===a.id){
        state.loggedIn=false; state.loggedInAdminId=null; updateLoginUI();
      }
      renderAdminUsersTable();
      saveState();
    });
    delTd.appendChild(delBtn);
    tr.appendChild(delTd);

    body.appendChild(tr);
  });
}

/* ---------- data.json への保存/読込（要件⑬） ---------- */
let adminDataFileHandle = null;
async function loadAdminsFromDataJson(){
  try{
    const res = await fetch('data.json', {cache:'no-store'});
    if(res.ok){
      const json = await res.json();
      if(Array.isArray(json.admins) && !state._adminsSeeded){
        state.admins = json.admins.filter(a=>a && a.id && a.pass && a.id!==ROOT_ADMIN.id);
        state._adminsSeeded = true;
        saveState();
      }
    }
  }catch(e){
    // data.json が存在しない、もしくは file:// 直開きでfetch不可な環境。localStorageの内容をそのまま使用する。
  }
}
async function persistAdminsToDataJson(){
  const payload = JSON.stringify({admins: state.admins}, null, 2);
  try{
    if(!adminDataFileHandle && window.showSaveFilePicker){
      adminDataFileHandle = await window.showSaveFilePicker({
        suggestedName:'data.json',
        types:[{description:'JSON', accept:{'application/json':['.json']}}]
      });
    }
    if(adminDataFileHandle){
      const writable = await adminDataFileHandle.createWritable();
      await writable.write(payload);
      await writable.close();
      return;
    }
  }catch(e){
    console.warn('data.jsonへの保存がキャンセルまたは失敗しました。ダウンロードに切り替えます。', e);
    adminDataFileHandle = null;
  }
  // File System Access API 非対応ブラウザ向けフォールバック：ダウンロード
  const blob = new Blob([payload], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'data.json';
  a.click();
}

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
      updateStagePreviewMedia();
    };
    reader.readAsDataURL(file);
  });
});

// 個別アセット（舞台×ストロボ×色）のアップロード
function populateAdminColorSelect(){
  const sel = $('#adminAssetColor');
  sel.innerHTML='';
  COLOR_PALETTE.forEach(c=>{
    const opt=document.createElement('option'); opt.value=c.name; opt.textContent=c.name; sel.appendChild(opt);
  });
}
// 要件③：ストロボ静止／ストロボくるくるは色別ではなく単一ファイル（静止.png／くるくる.png）
const ADMIN_SINGLE_FILE_MAP = {'ストロボ静止':'静止.png','ストロボくるくる':'くるくる.png'};
function updateAdminAssetPathPreview(){
  const kind=$('#adminAssetKind').value, stage=$('#adminAssetStage').value, strobe=$('#adminAssetStrobe').value, color=$('#adminAssetColor').value;
  const ext = kind==='mov' ? 'mov' : 'png';
  const singleFile = kind!=='mov' && ADMIN_SINGLE_FILE_MAP[strobe];
  $('#adminAssetColor').disabled = !!singleFile;
  const fileName = singleFile || `${color}.${ext}`;
  $('#adminAssetPathPreview').textContent = `保存先: ${kind}/${stage}/${strobe}/${fileName}`;
}
['adminAssetKind','adminAssetStage','adminAssetStrobe','adminAssetColor'].forEach(id=>{
  document.getElementById(id).addEventListener('change', updateAdminAssetPathPreview);
});
$('#adminAssetFile').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  const kind=$('#adminAssetKind').value, stage=$('#adminAssetStage').value, strobe=$('#adminAssetStrobe').value, color=$('#adminAssetColor').value;
  const ext = kind==='mov' ? 'mov' : 'png';
  const singleFile = kind!=='mov' && ADMIN_SINGLE_FILE_MAP[strobe];
  const fileName = singleFile || `${color}.${ext}`;
  const path = `${kind}/${stage}/${strobe}/${fileName}`;
  const reader = new FileReader();
  reader.onload = ev=>{
    state.adminAssets[path] = ev.target.result;
    saveState();
    updateStagePreviewMedia();
    alert('保存しました: '+path);
  };
  reader.readAsDataURL(file);
});

// フェード秒数設定
$('#fadeSecBtn').addEventListener('click', ()=>{
  $('#settingsMenu').classList.add('hidden');
  $('#fadeSecInput').value = state.fadeDurationSec;
  $('#fadeSecModal').classList.remove('hidden');
});
$('#fadeSecCancelBtn').addEventListener('click', ()=>{ $('#fadeSecModal').classList.add('hidden'); });
$('#fadeSecSaveBtn').addEventListener('click', ()=>{
  const v = parseFloat($('#fadeSecInput').value);
  if(!isNaN(v) && v>=0){
    state.fadeDurationSec = v;
    document.documentElement.style.setProperty('--fade-sec', v+'s');
    saveState();
  }
  $('#fadeSecModal').classList.add('hidden');
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
  // 追加要望⑦：保存済みの動画タブの動画を復元する
  if(state.rehearsalVideoSrc && $('#rehearsalVideo').src !== state.rehearsalVideoSrc){
    $('#rehearsalVideo').src = state.rehearsalVideoSrc;
  }
  syncCfxNoInputs();
  document.documentElement.style.setProperty('--fade-sec', (state.fadeDurationSec||1)+'s');
  updateLoginUI();
  applyModalAssets();
  renderCastList();
  renderCueTable();
  renderCustomFxTable();
  renderColorToggles();
  renderStageItems();
  renderVersionMemos();
  updateStrobeUI();
  updateEffectUI();
  updateFadeUI();
  updateStagePreviewMedia();
  setupGdocAutoSync();
  updateCustomFxTabVisibility();
  $('#stageVideoDirectBtn').classList.toggle('active-highlight', !!state.stageVideoOverride);
  renderAudioTracks();
  updateGameHitButtonVisibility();
}

function updateCustomFxTabVisibility(){
  const show = state.effectType==='original';
  const tabBtn = $('#customfxTabBtn');
  tabBtn.classList.toggle('hidden', !show);
  if(!show && tabBtn.classList.contains('active')){
    tabBtn.classList.remove('active');
    $('#tab-customfx').classList.remove('active');
    $('.tab-btn[data-tab="script"]').classList.add('active');
    $('#tab-script').classList.add('active');
  }
}

$('#darkModeToggle').addEventListener('click', ()=>{
  state.darkMode = !state.darkMode;
  applyAllSettingsToUI();
  saveState();
});
$('#lockModeToggle').addEventListener('click', ()=>{
  // 追加要望②：ログアウトしている場合は本番モードを利用不可にする
  if(!state.locked && !state.loggedIn){
    alert('本番モードの利用にはログインが必要です。');
    return;
  }
  state.locked = !state.locked;
  if(state.locked){
    resetGameReflection();
  }
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
  // 追加要望⑤：本番モードでゼロから開始する場合は反映済み（グレー）状態をリセットする
  if(state.locked && state.stopwatch.elapsed<50){
    resetGameReflection();
  }
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
  resetGameReflection();
  saveState();
});

/* ============================================================
   バージョン管理メモ ＆ 復元
   ============================================================ */
function buildSnapshot(){
  return JSON.parse(JSON.stringify({
    cast:state.cast, scriptHTML:state.scriptHTML, cues:state.cues, customEffects:state.customEffects,
    stageState:state.stageState, activeColorIndex:state.activeColorIndex,
    bgColorMode:state.bgColorMode, effectOnOff:state.effectOnOff, effectKind:state.effectKind, effectType:state.effectType,
    strobeOn:state.strobeOn, strobeMode:state.strobeMode, effectOn:state.effectOn, effectSubMode:state.effectSubMode,
    fadeMode:state.fadeMode, fadeDurationSec:state.fadeDurationSec, stageItems:state.stageItems, gdocUrl:state.gdocUrl
  }));
}
$('#versionMemoAddBtn').addEventListener('click', ()=>{
  const val = $('#versionMemoInput').value.trim();
  if(!val) return;
  state.versionMemos.unshift({id:uid(), text:val, date:new Date().toLocaleString('ja-JP'), snapshot:buildSnapshot()});
  $('#versionMemoInput').value='';
  renderVersionMemos();
  saveState();
});
$('#versionMemoListToggleBtn').addEventListener('click', ()=>{
  $('#versionMemoList').classList.toggle('hidden');
});
function renderVersionMemos(){
  const list = $('#versionMemoList');
  list.innerHTML='';
  state.versionMemos.slice(0,20).forEach(m=>{
    const li=document.createElement('li');
    const titleBtn = document.createElement('button');
    titleBtn.className='memo-title-btn';
    titleBtn.textContent = m.text; // 要件⑦：一覧では時刻・日付は表示しない
    titleBtn.addEventListener('click', ()=>{
      if(!m.snapshot) return;
      // 要件⑦：復元前の確認画面でどの時点の履歴かを表示する
      if(confirm(`「${m.text}」（${m.date} 時点）の状態に復元しますか？現在の内容は上書きされます。`)){
        Object.assign(state, m.snapshot);
        applyAllSettingsToUI();
        saveState();
      }
    });
    li.appendChild(titleBtn);
    list.appendChild(li);
  });
  $('#versionMemoDisplay').textContent = state.versionMemos[0] ? state.versionMemos[0].text : '';
}

/* ============================================================
   配役パネル（閉時は非表示のみ。3文字強制切り出しは行わない）
   ============================================================ */
$('#castPanelToggle').addEventListener('click', ()=>{
  const panel = $('#castPanel');
  panel.classList.toggle('open');
  panel.classList.toggle('closed');
  $('#castPanelArrow').textContent = panel.classList.contains('open') ? '◀' : '▶';
  document.body.classList.toggle('cast-open', panel.classList.contains('open'));
  renderCastList();
});

function nextMic(){
  // 要件⑤：自動割り当ては「ワイヤレス1→2→3→4→1…」とワイヤレス内だけを循環する
  return AUTO_MIC_CYCLE[state.cast.length % AUTO_MIC_CYCLE.length];
}

$('#castAddBtn').addEventListener('click', ()=>{
  const name = $('#newCharName').value.trim();
  const actor = $('#newActorName').value.trim();
  if(!name) return;
  state.cast.push({
    id:uid(), name, actor, mic:nextMic(), voice:VOICE_CYCLE[0],
    color: COLOR_PALETTE[state.cast.length % COLOR_PALETTE.length].hex, edit:false
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
  if(closed) return; // 閉じた状態は表示しない（強制3文字切り出しは行わない）

  state.cast.forEach(c=>{
    const row = document.createElement('div');
    row.className='cast-row';
    row.style.borderLeft = `6px solid ${c.color}`;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = c.name;
    nameSpan.title = c.name;
    row.appendChild(nameSpan);

    const actorInput = document.createElement('input');
    actorInput.type='text'; actorInput.value = c.actor||''; actorInput.placeholder='役者名';
    actorInput.className='actor-input';
    actorInput.disabled = !c.edit;
    actorInput.addEventListener('input', e=>{ c.actor = e.target.value; saveState(); });
    row.appendChild(actorInput);

    // 要件④：マイクがかぶった際は警告表示ではなく、マイクごとに固定した強調色で色分けする
    const micColor = MIC_COLORS[c.mic] || '#ccc';
    const micBtn = document.createElement('button');
    micBtn.className='mic-btn' + (micCount[c.mic]>1 ? ' mic-shared' : '');
    micBtn.textContent = c.mic;
    micBtn.style.background = micColor;
    micBtn.style.color = textColorFor(micColor);
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

    // 要件⑦：「変更」ボタンの右横に読み上げ音声切り替えボタンを追加
    const voiceBtn = document.createElement('button');
    voiceBtn.className='voice-btn editable-only';
    if(!c.voice) c.voice = VOICE_CYCLE[0];
    voiceBtn.textContent = 'voice:'+c.voice;
    voiceBtn.title='読み上げ音声の種類を切り替え';
    voiceBtn.addEventListener('click', ()=>{
      const idx = VOICE_CYCLE.indexOf(c.voice);
      c.voice = VOICE_CYCLE[(idx+1)%VOICE_CYCLE.length];
      renderCastList(); saveState();
    });
    row.appendChild(voiceBtn);

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
      const idx = COLOR_PALETTE.findIndex(p=>p.hex===c.color);
      c.color = COLOR_PALETTE[(idx+1)%COLOR_PALETTE.length].hex;
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

// 要件⑧：段落内に改行（<br>）が含まれる場合、その改行ごとに独立した「1行」として
// 扱えるよう、あらかじめ別々の段落要素へ分割しておく（話者割り当て・読み上げ共通で使用）
function normalizeScriptLines(){
  const children = Array.from(scriptEditor.children);
  children.forEach(el=>{
    if(el.nodeType!==1) return;
    if(!/<br\s*\/?>/i.test(el.innerHTML)) return;
    const parts = el.innerHTML.split(/<br\s*\/?>/i);
    if(parts.length<=1) return;
    const frag = document.createDocumentFragment();
    parts.forEach(part=>{
      const newEl = document.createElement(el.tagName);
      newEl.innerHTML = part;
      frag.appendChild(newEl);
    });
    el.replaceWith(frag);
  });
}

// 話者自動マッチング→話者割り当て：「話者名(、・/区切りで複数可)：セリフ」形式を検出
// 要件⑧：改行で話者が切り替わっている場合に誤って複数話者扱いにしないよう、
// マッチング対象は必ず「その行（1つの要素）」単位に正規化してから判定する
$('#autoMatchBtn').addEventListener('click', ()=>{
  normalizeScriptLines();
  state.scriptHTML = scriptEditor.innerHTML;
  const lines = scriptEditor.querySelectorAll('p, div');
  const targets = lines.length ? Array.from(lines) : [scriptEditor];
  let matchedCount = 0;
  targets.forEach(line=>{
    line.querySelectorAll('.speaker-dot').forEach(d=>d.remove());
    const text = (line.textContent || '').replace(/\u200b/g,'');
    // 要件⑨：「：」「:」に加え、全角・半角スペースの組み合わせ（2文字以上連続）でも話者名の区切りと判定する
    const m = text.match(/^\s*([^\s:：]{1,30})(?:[：:]|[ \u3000]{2,})/);
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
  alert(`${matchedCount} 行を割り当てました。`);
});

/* ---------- 読み上げ ---------- */
function getScriptLines(){
  // 要件⑧：読み上げも改行ごとに独立した行として扱う
  normalizeScriptLines();
  state.scriptHTML = scriptEditor.innerHTML;
  const children = Array.from(scriptEditor.children).filter(el=>el.nodeType===1);
  return children.length ? children : [scriptEditor];
}
const SPEAKER_PREFIX_RE = /^\s*[^\s:：]{1,30}(?:[：:]|[ \u3000]{2,})/;

// 要件⑬：ルビ（<ruby><rt>）が付与された箇所は、読み（<rt>）のみを読み上げ対象にし、
// 「漢字＋ふりがな」の二重読み上げを防ぐ
function extractReadableText(lineEl){
  const clone = lineEl.cloneNode(true);
  clone.querySelectorAll('rp').forEach(rp=>rp.remove());
  clone.querySelectorAll('ruby').forEach(ruby=>{
    const rt = ruby.querySelector('rt');
    const reading = rt ? (rt.textContent||'') : (ruby.textContent||'');
    ruby.replaceWith(document.createTextNode(reading));
  });
  return (clone.textContent || '').replace(/\u200b/g,'');
}

// 要件⑪：話者自動マッチングで判定された話者のみに紐づく声で、セリフ本文のみを読み上げる
function findJaVoice(gender){
  const voices = (speechSynthesis.getVoices && speechSynthesis.getVoices()) || [];
  const jaVoices = voices.filter(v=>/^ja/i.test(v.lang));
  if(!jaVoices.length) return null;
  const keyword = gender==='female' ? /female|女/i : /male|男/i;
  return jaVoices.find(v=>keyword.test(v.name)) || jaVoices[0];
}
function voiceParamsForLine(line){
  const speakerNames = (line.dataset.speaker||'').split(',').map(s=>s.trim()).filter(Boolean);
  const char = speakerNames.length ? state.cast.find(c=>c.name===speakerNames[0]) : null;
  const voiceKey = (char && char.voice) ? char.voice : VOICE_CYCLE[0];
  return VOICE_PARAMS[voiceKey] || VOICE_PARAMS[VOICE_CYCLE[0]];
}

// 要件⑫：範囲選択がある場合はその範囲内の行のみを読み上げる（範囲外までは読み進めない）
function getSelectedLineRange(lines){
  const sel = window.getSelection();
  if(!sel || sel.rangeCount===0 || sel.isCollapsed || sel.toString().trim().length===0) return null;
  const range = sel.getRangeAt(0);
  const findLineIndex = node=>{
    while(node && node.parentNode !== scriptEditor && node !== scriptEditor) node = node.parentNode;
    return lines.indexOf(node);
  };
  let startIdx = findLineIndex(range.startContainer);
  let endIdx = findLineIndex(range.endContainer);
  if(startIdx<0) startIdx = 0;
  if(endIdx<0) endIdx = startIdx;
  if(startIdx>endIdx){ const t=startIdx; startIdx=endIdx; endIdx=t; }
  return {startIdx, endIdx};
}

$('#speakRowBtn').addEventListener('click', ()=>{
  if(isReading){
    speechSynthesis.cancel();
    isReading = false;
    $('#speakRowBtn').textContent = '🔊 読み上げ';
    return;
  }
  const lines = getScriptLines();
  const range = getSelectedLineRange(lines);
  const startIndex = range ? range.startIdx : 0;
  const endIndex = range ? range.endIdx : (lines.length-1);

  const queue = [];
  for(let i=startIndex;i<=endIndex;i++){
    const line = lines[i];
    if(line.classList && line.classList.contains('tokaki')) continue;
    if(lines.length>1 && !line.dataset.mic) continue;
    const readable = extractReadableText(line).replace(SPEAKER_PREFIX_RE,'').trim();
    if(readable) queue.push({text:readable, line});
  }
  if(queue.length===0){ alert('読み上げ可能な行がありません（マイク割当・ト書き設定・選択範囲をご確認ください）。'); return; }

  // 音声合成の準備中は「音声生成中」と表示する
  isReading = true;
  $('#speakRowBtn').textContent = '音声生成中';
  let started = false;

  function buildUtterance(item){
    const u = new SpeechSynthesisUtterance(item.text);
    u.lang='ja-JP';
    const params = voiceParamsForLine(item.line);
    u.pitch = params.pitch;
    u.rate = params.rate;
    const voice = findJaVoice(params.gender);
    if(voice) u.voice = voice;
    return u;
  }

  // 要件⑨：全行を最初にまとめて読み込むのではなく、話者（行）ごとに1つずつ読み込んで再生する。
  // 現在の行を再生開始したタイミングで、次の行の読み込み（SpeechSynthesisUtterance生成）を開始する
  // ことで、ストリーミング再生のような逐次進行にする。
  function playSequential(idx, preparedUtterance){
    if(idx>=queue.length){
      isReading=false; $('#speakRowBtn').textContent='🔊 読み上げ';
      return;
    }
    const item = queue[idx];
    const u = preparedUtterance || buildUtterance(item);
    let nextPrepared = null;
    u.onstart = ()=>{
      if(!started){ started = true; $('#speakRowBtn').textContent = '⏹ 停止'; }
      if(idx+1<queue.length){ nextPrepared = buildUtterance(queue[idx+1]); }
    };
    u.onend = ()=>{ playSequential(idx+1, nextPrepared); };
    speechSynthesis.speak(u);
  }
  playSequential(0, null);
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

  // Googleアカウントにログイン済みの場合は Drive API 経由で取得（限定公開ドキュメントでも確実に同期可能）
  if(googleAccessToken){
    try{
      const apiUrl = `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/html`;
      const res = await fetch(apiUrl, {headers:{Authorization:'Bearer '+googleAccessToken}});
      if(!res.ok) throw new Error('Drive API 取得失敗 status:'+res.status);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const body = doc.body ? doc.body.innerHTML : html;
      scriptEditor.innerHTML = body;
      state.scriptHTML = scriptEditor.innerHTML;
      saveState();
      $('#gdocStatus').textContent = 'Googleアカウント経由で同期しました（'+new Date().toLocaleTimeString('ja-JP')+'）';
      return;
    }catch(err){
      if(!silent) console.warn('Drive API同期に失敗。公開URL方式にフォールバックします。', err);
    }
  }

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
    $('#gdocStatus').textContent = googleAccessToken
      ? '同期に失敗しました'
      : '同期に失敗しました（ドキュメントを「ウェブに公開」設定にするか、Googleアカウントにログインしてください）';
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

/* ============================================================
   台本タブ内 音源プレーヤー（要件④：複数音源対応）
   上から順に ①〜 と名前をつけ、⇧⇩で並べ替え、▶/⏸・シーク・秒数表示を持つ
   ============================================================ */
const audioTrackEls = {}; // id -> {audioEl, row}

function circledIndex(i){ return circledNum(i+1); }

function currentTimeSourceFromTracks(){
  // 再生中のトラックがあればその時刻を優先的にCue記録の時間源候補として使う
  const playing = state.audioSources.find(a=>{
    const el = audioTrackEls[a.id] && audioTrackEls[a.id].audioEl;
    return el && !el.paused && !el.ended;
  });
  return playing || null;
}

function addAudioTrack(file){
  const id = uid();
  const url = URL.createObjectURL(file);
  state.audioSources.push({id, name:'', src:url, startOffset:0});
  state.currentAudioTrackId = id;
  state.audioSourceCount = (state.audioSourceCount||0)+1;
  renderAudioTracks();
  saveState();
}
$('#scriptAudioAddInput').addEventListener('change', e=>{
  const files = Array.from(e.target.files||[]);
  files.forEach(addAudioTrack);
  e.target.value='';
});

function renderAudioTracks(){
  const wrap = $('#audioTracksList');
  wrap.innerHTML='';
  state.audioSources.forEach((track, idx)=>{
    const row = document.createElement('div');
    row.className='audio-track-row' + (state.currentAudioTrackId===track.id ? ' audio-track-current':'');

    const nameSpan = document.createElement('span');
    nameSpan.className='audio-track-name';
    nameSpan.textContent = circledIndex(idx);
    nameSpan.title = 'クリックで名前を変更';
    nameSpan.style.cursor='pointer';
    nameSpan.addEventListener('click', ()=>{
      const val = prompt('この音源の名前（省略可）', track.name||'');
      if(val!==null){ track.name = val.trim(); saveState(); renderAudioTracks(); }
    });
    row.appendChild(nameSpan);

    const upBtn = document.createElement('button');
    upBtn.textContent='⇧'; upBtn.title='上へ';
    upBtn.disabled = idx===0;
    upBtn.addEventListener('click', ()=>{
      if(idx===0) return;
      [state.audioSources[idx-1], state.audioSources[idx]] = [state.audioSources[idx], state.audioSources[idx-1]];
      renderAudioTracks(); saveState();
    });
    row.appendChild(upBtn);

    const downBtn = document.createElement('button');
    downBtn.textContent='⇩'; downBtn.title='下へ';
    downBtn.disabled = idx===state.audioSources.length-1;
    downBtn.addEventListener('click', ()=>{
      if(idx===state.audioSources.length-1) return;
      [state.audioSources[idx+1], state.audioSources[idx]] = [state.audioSources[idx], state.audioSources[idx+1]];
      renderAudioTracks(); saveState();
    });
    row.appendChild(downBtn);

    const playBtn = document.createElement('button');
    playBtn.textContent='▶';
    row.appendChild(playBtn);

    const seek = document.createElement('input');
    seek.type='range'; seek.min='0'; seek.max='100'; seek.step='0.1'; seek.value = track.startOffset||0;
    row.appendChild(seek);

    const timeSpan = document.createElement('span');
    timeSpan.className='audio-track-time';
    timeSpan.textContent='0.0 / 0.0秒';
    row.appendChild(timeSpan);

    const delBtn = document.createElement('button');
    delBtn.textContent='✕'; delBtn.title='削除';
    delBtn.addEventListener('click', ()=>{
      const el = audioTrackEls[track.id] && audioTrackEls[track.id].audioEl;
      if(el){ el.pause(); }
      delete audioTrackEls[track.id];
      state.audioSources = state.audioSources.filter(a=>a.id!==track.id);
      if(state.currentAudioTrackId===track.id) state.currentAudioTrackId = null;
      renderAudioTracks(); saveState();
    });
    row.appendChild(delBtn);

    const audioEl = document.createElement('audio');
    audioEl.src = track.src;
    audioEl.preload = 'metadata';
    audioEl.hidden = true;
    row.appendChild(audioEl);

    playBtn.addEventListener('click', ()=>{
      if(audioEl.paused){
        // 追加要望⑨：複数音源が同時に流れてしまう不具合を防ぐため、
        // 再生開始時に他の音源トラックを停止してから再生する
        Object.values(audioTrackEls).forEach(t=>{
          if(t.audioEl && t.audioEl!==audioEl && !t.audioEl.paused){
            t.audioEl.pause();
          }
        });
        $all('.audio-track-row button').forEach(b=>{ if(b.textContent==='⏸️') b.textContent='▶'; });
        if(track.startOffset && audioEl.currentTime===0) audioEl.currentTime = track.startOffset;
        audioEl.play();
        playBtn.textContent='⏸️';
        state.currentAudioTrackId = track.id;
        state.currentAudioLabel = track.name ? track.name : circledIndex(idx);
        $all('.audio-track-row').forEach(r=>r.classList.remove('audio-track-current'));
        row.classList.add('audio-track-current');
        saveState();
      }else{
        audioEl.pause();
        playBtn.textContent='▶';
      }
    });
    audioEl.addEventListener('loadedmetadata', ()=>{
      seek.max = audioEl.duration || 0;
    });
    audioEl.addEventListener('timeupdate', ()=>{
      seek.value = audioEl.currentTime;
      timeSpan.textContent = `${audioEl.currentTime.toFixed(1)} / ${(audioEl.duration||0).toFixed(1)}秒`;
    });
    audioEl.addEventListener('ended', ()=>{ playBtn.textContent='▶'; });
    seek.addEventListener('input', e=>{
      audioEl.currentTime = parseFloat(e.target.value)||0;
      track.startOffset = audioEl.currentTime;
    });

    audioTrackEls[track.id] = {audioEl, row};
    wrap.appendChild(row);
  });
}

/* ============================================================
   配役色トグル（ステージ用8色・色相順・中央寄せ）
   ============================================================ */
function renderColorToggles(){
  const wrap = $('#stageColorToggles');
  wrap.innerHTML='';
  if(state.bgColorMode!=='on'){ wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  COLOR_PALETTE.forEach((col,idx)=>{
    const btn = document.createElement('button');
    btn.className='color-toggle-btn' + (state.activeColorIndex===idx ? ' active':'');
    btn.style.background = col.hex;
    btn.style.color = col.hex;
    btn.title = col.name;
    btn.addEventListener('click', ()=>{
      state.activeColorIndex = (state.activeColorIndex===idx) ? null : idx;
      renderColorToggles();
      updateStagePreviewMedia();
      saveState();
    });
    wrap.appendChild(btn);
  });
}
let lastAppliedFilterColorHex = undefined;
// 要件⑩：ストロボくるくるは単一画像を参照し、色は本関数のオーバーレイのみで表現する。
// 色が変化した瞬間はフェードモードに応じてクロスフェード（フェードイン／フェードアウト）させる。
function crossfadeColorFilter(newColorHex){
  const cur = $('#stageColorFilter');
  const inc = $('#stageColorFilter2');
  const dur = KURUKURU_CROSSFADE_SEC;
  const targetOpacity = newColorHex ? .5 : 0;

  if(state.fadeMode==='none'){
    inc.style.transition='none'; inc.style.opacity=0;
    cur.style.transition='none';
    cur.style.backgroundColor = newColorHex || 'transparent';
    cur.style.opacity = targetOpacity;
    return;
  }
  if(state.fadeMode==='in'){
    // 新規の画像（色）を読み込む際に1秒間かけてフェードイン
    inc.style.transition='none';
    inc.style.backgroundColor = newColorHex || 'transparent';
    inc.style.opacity = 0;
    void inc.offsetWidth; // reflow
    inc.style.transition = `opacity ${dur}s linear`;
    inc.style.opacity = targetOpacity;
    setTimeout(()=>{
      cur.style.transition='none';
      cur.style.backgroundColor = newColorHex || 'transparent';
      cur.style.opacity = targetOpacity;
      inc.style.transition='none';
      inc.style.opacity = 0;
    }, dur*1000);
    return;
  }
  // fadeMode==='out'：現在の色を100→0で1秒フェードアウトすると同時に、新しい色を0→100で1秒フェードインする
  inc.style.transition='none';
  inc.style.backgroundColor = newColorHex || 'transparent';
  inc.style.opacity = 0;
  void inc.offsetWidth;
  cur.style.transition = `opacity ${dur}s linear`;
  inc.style.transition = `opacity ${dur}s linear`;
  cur.style.opacity = 0;
  inc.style.opacity = targetOpacity;
  setTimeout(()=>{
    cur.style.transition='none';
    cur.style.backgroundColor = newColorHex || 'transparent';
    cur.style.opacity = targetOpacity;
    inc.style.transition='none';
    inc.style.opacity = 0;
  }, dur*1000);
}
function applyColorFilter(){
  const filter = $('#stageColorFilter');
  const filter2 = $('#stageColorFilter2');
  const hex = (state.bgColorMode==='on' && state.activeColorIndex!=null) ? currentColorHex() : null;

  if(currentStrobeKey()==='kurukuru'){
    if(hex!==lastAppliedFilterColorHex){
      crossfadeColorFilter(hex);
      lastAppliedFilterColorHex = hex;
    }
    return;
  }
  // ストロボくるくる以外は従来通りの単純な表示（画像自体に色が焼き込まれているため）
  filter2.style.transition='none'; filter2.style.opacity=0;
  if(!hex){
    filter.style.transition='';
    filter.style.opacity=0;
  }else{
    filter.style.transition='';
    filter.style.backgroundColor = hex;
    filter.style.opacity = .5;
  }
  lastAppliedFilterColorHex = hex;
}

/* ============================================================
   ストロボ / Effect / フェード（背景色ありモード時の演出制御）
   ============================================================ */
function currentStrobeKey(){
  if(state.bgColorMode!=='on') return 'none';
  if(state.effectType==='none') return state.strobeOn ? 'static' : 'none';
  return state.strobeMode || 'none';
}
function isEffectActive(){
  if(state.bgColorMode!=='on') return false;
  if(state.effectType==='none') return false;
  if(state.effectType==='existing') return !!state.effectOn;
  if(state.effectType==='original') return state.effectSubMode!=='none';
  return false;
}
function updateStrobeUI(){
  const btn = $('#strobeToggleBtn');
  if(state.bgColorMode!=='on'){ btn.classList.add('hidden'); return; }
  btn.classList.remove('hidden');
  if(state.effectType==='none'){
    btn.textContent = 'ストロボ';
    btn.classList.toggle('active-state', !!state.strobeOn);
  }else{
    btn.textContent = STROBE_BTN_LABEL[state.strobeMode] || 'ストロボ✖️';
    btn.classList.toggle('active-state', !!state.strobeMode && state.strobeMode!=='none');
  }
}
$('#strobeToggleBtn').addEventListener('click', ()=>{
  if(state.bgColorMode!=='on') return;
  if(state.effectType==='none'){
    state.strobeOn = !state.strobeOn;
  }else{
    const cycle = state.effectType==='existing' ? EXISTING_STROBE_CYCLE : ORIGINAL_STROBE_CYCLE;
    const idx = cycle.indexOf(state.strobeMode);
    state.strobeMode = cycle[(idx+1+cycle.length)%cycle.length];
  }
  updateStrobeUI();
  updateStagePreviewMedia();
  saveState();
});

function updateEffectUI(){
  const btn = $('#effectToggleBtn');
  if(state.bgColorMode!=='on' || !state.effectType || state.effectType==='none'){
    btn.classList.add('hidden');
    $('#customEffectAddRow').classList.add('hidden');
    return;
  }
  btn.classList.remove('hidden');
  if(state.effectType==='existing'){
    btn.textContent='Effect';
    btn.classList.toggle('active-state', !!state.effectOn);
  }else if(state.effectType==='original'){
    btn.textContent = EFFECT_SUBMODE_LABEL[state.effectSubMode] || 'Effectなし';
    btn.classList.toggle('active-state', state.effectSubMode!=='none');
  }
  const showCustomRow = state.effectType==='original' && state.effectSubMode==='original';
  $('#customEffectAddRow').classList.toggle('hidden', !showCustomRow);
  if(showCustomRow) prefillCfxDefaults();
}
$('#effectToggleBtn').addEventListener('click', ()=>{
  if(state.effectType==='existing'){
    state.effectOn = !state.effectOn;
  }else if(state.effectType==='original'){
    const cyc = ['none','existing','original'];
    const idx = cyc.indexOf(state.effectSubMode);
    state.effectSubMode = cyc[(idx+1)%cyc.length];
  }
  updateEffectUI();
  updateStagePreviewMedia();
  saveState();
});

function updateFadeUI(){
  $('#fadeModeBtn').textContent = FADE_LABEL[state.fadeMode] || 'フェードなし';
  $('#fadeModeBtn').classList.toggle('active-state', state.fadeMode!=='none');
}
$('#fadeModeBtn').addEventListener('click', ()=>{
  const idx = FADE_CYCLE.indexOf(state.fadeMode);
  state.fadeMode = FADE_CYCLE[(idx+1)%FADE_CYCLE.length];
  updateFadeUI();
  saveState();
});

/* ---------- 独自Effect 記録（要件④⑥⑪⑬） ---------- */
// 「照明職人用」の現在のNo.は、ステージ側の入力(#cfxNo)と照明職人用タブの入力(#cfxCurrentNoInput)の
// 2箇所に表示され、常にstate.cfxCurrentNoと同期する。
function syncCfxNoInputs(){
  const v = state.cfxCurrentNo || 1;
  $('#cfxNo').value = v;
  $('#cfxCurrentNoInput').value = v;
}
function setCfxCurrentNo(v){
  state.cfxCurrentNo = (!isNaN(v) && v>=1) ? v : 1;
  syncCfxNoInputs();
  saveState();
}
function prefillCfxDefaults(){
  // 追加要望④：No.は「照明職人用」タブでの手動編集・Cue記録時の自動加算でのみ変化させる
  // （保存のたびに次の空き番号へ自動で変える処理は行わない）
  syncCfxNoInputs();
  if(!$('#cfxStep').value) $('#cfxStep').value = 1;
  if(!$('#cfxSec').value) $('#cfxSec').value = 0.1;
}
$('#cfxNo').addEventListener('change', ()=> setCfxCurrentNo(parseInt($('#cfxNo').value,10)));
$('#cfxCurrentNoInput').addEventListener('change', ()=> setCfxCurrentNo(parseInt($('#cfxCurrentNoInput').value,10)));
$('#cfxSaveBtn').addEventListener('click', ()=>{
  const no = parseInt($('#cfxNo').value,10) || state.cfxCurrentNo || 1;
  const step = parseInt($('#cfxStep').value,10) || 1;
  const sec = parseFloat($('#cfxSec').value) || 0.1;
  const colorName = currentColorName() || '-';
  const strobeLabel = STROBE_LABEL_CUE[state.strobeMode] || 'なし';
  state.customEffects.push({id:uid(), no, step, sec, colorName, strobeLabel});
  // 追加要望④：保存時に増加するのは「ステップ」のみ。No.はここでは変えない。
  $('#cfxStep').value = step+1;
  renderCustomFxTable();
  saveState();
});
/* ---------- 独自Effect テスト再生（要件⑪⑫） ---------- */
let cfxPlayTimer = null;
function playCustomEffectSequence(no, opts){
  opts = opts || {};
  if(cfxPlayTimer){ clearTimeout(cfxPlayTimer); cfxPlayTimer = null; }
  const steps = state.customEffects.filter(e=>e.no===no).sort((a,b)=>a.step-b.step);
  if(!steps.length) return false;
  let i = 0;
  function playNext(){
    if(i>=steps.length){ cfxPlayTimer = null; return; }
    const st = steps[i];
    applyCustomFxToStage(st);
    i++;
    if(i<steps.length){
      const waitSec = opts.useStepSec ? (parseFloat(st.sec)||0.1) : (opts.intervalSec||0.2);
      cfxPlayTimer = setTimeout(playNext, waitSec*1000);
    }else{
      cfxPlayTimer = null;
    }
  }
  playNext();
  return true;
}
$('#cfxTestBtn').addEventListener('click', ()=>{
  const no = parseInt($('#cfxCurrentNoInput').value,10);
  const sec = parseFloat($('#cfxTestSecInput').value) || 0.2;
  if(isNaN(no)){ alert('No.を入力してください。'); return; }
  const ok = playCustomEffectSequence(no, {intervalSec:sec, useStepSec:false});
  if(!ok) alert(`No.${no} に登録されたステップが見つかりません。`);
});
function renderCustomFxTable(){
  const body = $('#customFxTableBody');
  body.innerHTML='';
  state.customEffects.forEach((e,idx)=>{
    const tr=document.createElement('tr');
    // 追加要望⑬：照明職人用の表を直接クリックして数値（no/step/sec）を手動編集できるようにする
    const NUMERIC_FIELDS = {no:'int', step:'int', sec:'float'};
    ['no','step','sec','colorName','strobeLabel'].forEach(f=>{
      const td=document.createElement('td');
      td.textContent = e[f];
      if(!state.locked && NUMERIC_FIELDS[f]){
        td.contentEditable = 'true';
        td.addEventListener('blur', ()=>{
          const raw = (td.textContent||'').trim();
          const v = NUMERIC_FIELDS[f]==='int' ? parseInt(raw,10) : parseFloat(raw);
          if(!isNaN(v)){
            e[f] = v;
            saveState();
          }
          td.textContent = e[f];
        });
      }
      tr.appendChild(td);
    });
    const applyTd=document.createElement('td');
    const applyBtn=document.createElement('button');
    applyBtn.textContent='反映'; applyBtn.className='apply-btn';
    applyBtn.addEventListener('click', ()=>{ applyCustomFxToStage(e); });
    applyTd.appendChild(applyBtn);
    tr.appendChild(applyTd);
    const delTd=document.createElement('td');
    if(!state.locked){
      const delBtn=document.createElement('button');
      delBtn.textContent='✕'; delBtn.className='del-btn';
      delBtn.addEventListener('click', ()=>{ state.customEffects.splice(idx,1); renderCustomFxTable(); saveState(); });
      delTd.appendChild(delBtn);
    }
    tr.appendChild(delTd);
    body.appendChild(tr);
  });
}

/* ============================================================
   ステージ状態（暗転/全照/50%）＆ 背景メディア表示（画像 or 動画）
   ============================================================ */
$all('.stage-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    state.stageState = btn.dataset.stage;
    updateStagePreviewMedia();
    saveState();
  });
});

function applyStrobeClasses(){
  const preview = $('#stagePreview');
  const k = currentStrobeKey();
  preview.classList.toggle('strobe-kurukuru', k==='kurukuru');
}

function setMediaWithFade(el, newSrc, afterSet){
  const dur = state.fadeDurationSec || 1;
  if(state.fadeMode==='none'){
    el.style.transition='none';
    el.src = newSrc;
    el.style.opacity=1;
    if(afterSet) afterSet();
    return;
  }
  el.style.transition = `opacity ${dur}s ease`;
  if(state.fadeMode==='out'){
    el.style.opacity=0;
    setTimeout(()=>{
      el.src = newSrc;
      if(afterSet) afterSet();
      requestAnimationFrame(()=>{ el.style.opacity=1; });
    }, dur*1000);
  } else { // 'in'
    el.style.opacity=0;
    el.src = newSrc;
    if(afterSet) afterSet();
    requestAnimationFrame(()=>{ requestAnimationFrame(()=>{ el.style.opacity=1; }); });
  }
}

function updateStagePreviewMedia(){
  const imgEl = $('#stageBgImg');
  const videoEl = $('#stageBgVideo');

  if(state.stageVideoOverride){
    videoEl.classList.remove('hidden');
    imgEl.classList.add('hidden');
    if(videoEl.src !== state.stageVideoOverride){
      videoEl.src = state.stageVideoOverride;
      videoEl.load && videoEl.load();
      videoEl.play && videoEl.play().catch(()=>{});
    }
    applyColorFilter();
    applyStrobeClasses();
    return;
  }

  // 追加要望⑩：Effectが「照明職人用」で、まだ色（ステップ）が選択されていない状態のときは
  // 「Effectなし」用のプレースホルダー画像を表示する
  if(state.bgColorMode==='on' && state.effectType==='original' && state.effectSubMode==='original' && !currentColorName()){
    const resolved = resolveAsset('img/choice_backgroundX.jpg');
    videoEl.classList.add('hidden');
    imgEl.onerror = ()=>{ imgEl.classList.add('hidden'); };
    imgEl.onload = ()=>{ imgEl.classList.remove('hidden'); };
    setMediaWithFade(imgEl, resolved, ()=>{ videoEl.classList.add('hidden'); });
    applyColorFilter();
    applyStrobeClasses();
    return;
  }

  if(state.bgColorMode==='on' && currentColorName()){
    const useVideo = isEffectActive();
    const folder = useVideo ? 'mov' : 'img';
    const stageFolder = STAGE_FOLDER[state.stageState];
    const strobeKey = currentStrobeKey();
    const strobeFolder = STROBE_FOLDER[strobeKey];
    const colorName = currentColorName();
    const ext = useVideo ? 'mov' : 'png';
    // 要件③：ストロボ静止／ストロボくるくるは色別ファイルを使わず単一ファイルを参照し、
    // 色は applyColorFilter() のオーバーレイで表現する
    const singleFile = !useVideo && STROBE_SINGLE_FILE[strobeKey];
    const path = singleFile
      ? `${folder}/${stageFolder}/${strobeFolder}/${singleFile}`
      : `${folder}/${stageFolder}/${strobeFolder}/${colorName}.${ext}`;
    const resolved = resolveAsset(path);

    if(useVideo){
      videoEl.onerror = ()=>{ videoEl.classList.add('hidden'); };
      setMediaWithFade(videoEl, resolved, ()=>{
        videoEl.classList.remove('hidden');
        imgEl.classList.add('hidden');
        videoEl.load && videoEl.load();
        videoEl.play && videoEl.play().catch(()=>{});
      });
    }else{
      imgEl.onerror = ()=>{ imgEl.classList.add('hidden'); };
      imgEl.onload = ()=>{ imgEl.classList.remove('hidden'); };
      setMediaWithFade(imgEl, resolved, ()=>{ videoEl.classList.add('hidden'); });
    }
  }else{
    const map = {anten:'img/anten.jpg', zensyou:'img/zensyou.jpg', hansyou:'img/hansyou.jpg'};
    const path = map[state.stageState];
    const resolved = resolveAsset(path);
    imgEl.onerror = ()=>{
      imgEl.classList.add('hidden');
      $('#stagePreview').style.background = state.stageState==='anten' ? '#000' : state.stageState==='hansyou' ? '#555' : '#ddd';
    };
    imgEl.onload = ()=>{ imgEl.classList.remove('hidden'); };
    setMediaWithFade(imgEl, resolved, ()=>{ videoEl.classList.add('hidden'); });
  }
  applyColorFilter();
  applyStrobeClasses();
}

$('#stageVideoDirectBtn').addEventListener('click', ()=>{
  if(state.stageVideoOverride){
    // 要件⑪：指定中に再度押すと指定を終了する
    state.stageVideoOverride = '';
    $('#stageVideoDirectBtn').classList.remove('active-highlight');
    updateStagePreviewMedia();
    saveState();
  }else{
    $('#stageVideoInput').click();
  }
});
$('#stageVideoInput').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  state.stageVideoOverride = URL.createObjectURL(file);
  $('#stageVideoDirectBtn').classList.add('active-highlight');
  updateStagePreviewMedia();
  saveState();
});

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

/* 要件⑭：ドラッグ&ドロップの代わりに「タップ（クリック）して選択→移動先をタップ」で配置する方式。
   スマホのスクロール操作と競合せず、PC・スマホのどちらでも同じ操作感で快適に動かせる。 */
let selectedStageItemId = null;

function renderStageItems(){
  const layer = $('#stageItemsLayer');
  layer.innerHTML='';
  state.stageItems.forEach(item=>{
    const el = document.createElement('div');
    el.className='stage-item' + (item.id===selectedStageItemId ? ' selected' : '');
    el.style.left = item.x+'px';
    el.style.top = item.y+'px';
    el.dataset.itemId = item.id;
    const img = document.createElement('img');
    img.src = item.src;
    el.appendChild(img);
    if(item.id===selectedStageItemId && !state.locked){
      const removeBtn = document.createElement('button');
      removeBtn.className='stage-item-remove-btn';
      removeBtn.textContent='✖';
      removeBtn.title='このアイテムを削除';
      removeBtn.addEventListener('click', ev=>{
        ev.stopPropagation();
        state.stageItems = state.stageItems.filter(i=>i.id!==item.id);
        if(selectedStageItemId===item.id) selectedStageItemId=null;
        renderStageItems();
        saveState();
      });
      el.appendChild(removeBtn);
    }
    el.addEventListener('click', e=>{
      if(state.locked) return;
      e.stopPropagation();
      selectedStageItemId = (selectedStageItemId===item.id) ? null : item.id;
      renderStageItems();
      updateStagePreviewSelectingClass();
    });
    layer.appendChild(el);
  });
  updateStagePreviewSelectingClass();
}
function updateStagePreviewSelectingClass(){
  $('#stagePreview').classList.toggle('item-selecting', !!selectedStageItemId);
}
$('#stagePreview').addEventListener('click', e=>{
  if(state.locked || !selectedStageItemId) return;
  if(e.target.closest('.stage-item')) return; // アイテム自体のタップは選択切替（上のハンドラ）に任せる
  const item = state.stageItems.find(i=>i.id===selectedStageItemId);
  if(!item) return;
  const rect = $('#stagePreview').getBoundingClientRect();
  const itemSize = 60; // .stage-item の width/height と合わせる
  item.x = e.clientX - rect.left - itemSize/2;
  item.y = e.clientY - rect.top - itemSize/2;
  renderStageItems();
  saveState();
});

/* ============================================================
   動画再生 & Cue記録
   ============================================================ */
const video = $('#rehearsalVideo');
$('#videoInput').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev=>{
    // 追加要望⑦：動画タブの動画もdata URLとしてstateに保存し、ZIP出力/読込・再読込後も保持する
    state.rehearsalVideoSrc = ev.target.result;
    video.src = state.rehearsalVideoSrc;
    saveState();
  };
  reader.readAsDataURL(file);
});
video.addEventListener('timeupdate', ()=>{
  $('#currentVideoTime').textContent = video.currentTime.toFixed(1)+'秒';
});

function currentTimeSource(){
  if(!video.paused && !video.ended) return video.currentTime;
  const playingTrack = Object.values(audioTrackEls).find(t=>t.audioEl && !t.audioEl.paused && !t.audioEl.ended);
  if(playingTrack) return playingTrack.audioEl.currentTime;
  return video.currentTime || 0;
}
function currentLineText(){
  // 要件⑨：読み上げ中の行を自動取得する仕組みは廃止し、常に選択範囲のみを記録する
  const sel = window.getSelection();
  if(sel && sel.toString().trim().length>0) return sel.toString().trim();
  return '';
}
// 要件⑦：Cue一覧の並び順に沿って Fader 列へ 1→2→…→9→0 を再割当てする
function reassignFaderFrom(startIndex, startDigit){
  let cursor = startDigit ? DIGIT_CYCLE.indexOf(startDigit) : 0;
  if(cursor<0) cursor = 0;
  for(let i=startIndex;i<state.cues.length;i++){
    state.cues[i].fader = DIGIT_CYCLE[cursor % DIGIT_CYCLE.length];
    cursor++;
  }
}

function recordCue(sec, source){
  const strobeKey = currentStrobeKey();
  const strobeLabel = (state.effectType==='none' || !state.effectType)
    ? (strobeKey==='static' ? '◯' : 'なし')
    : (STROBE_LABEL_CUE[strobeKey] || 'なし');
  // 追加要望⑥：Effectが「照明職人用」の場合は◯ではなく、その時点の「No.」を保存する。
  // 保存後、次回の記録に備えてNo.を1つ増加させる（追加要望④）。
  let effectMark = '';
  if(state.effectType==='original'){
    if(state.effectSubMode==='original'){
      effectMark = String(state.cfxCurrentNo || 1);
      state.cfxCurrentNo = (state.cfxCurrentNo || 1) + 1;
      syncCfxNoInputs();
    }else if(state.effectSubMode==='existing'){
      effectMark = '◯';
    }
  }
  const stageLabelMap = {anten:'暗転', zensyou:'全照', hansyou:'半照'};
  const cue = {
    id: uid(),
    sec: (typeof sec==='number') ? sec.toFixed(1) : String(sec||0),
    line: currentLineText(),
    audio: state.currentAudioLabel || '-',
    stage: stageLabelMap[state.stageState] || state.stageState,
    bg: currentColorName() || '',
    effect: effectMark,
    strobe: strobeLabel,
    fade: FADE_LABEL[state.fadeMode] || 'フェードなし',
    fader: '1',
    source: source || 'cue',
    // 要件⑬：反映で画像配置も復元できるよう、記録時点の配置アイテムをスナップショットとして保持する
    // （一覧の表示項目には出さない隠しデータ）
    stageItemsSnapshot: JSON.parse(JSON.stringify(state.stageItems||[]))
  };
  state.cues.push(cue);
  state.cues.sort((a,b)=>parseFloat(a.sec)-parseFloat(b.sec));
  reassignFaderFrom(0);
  renderCueTable();
  saveState();
}
$('#videoCueBtn').addEventListener('click', ()=> recordCue(video.currentTime, 'video'));
$('#scriptCueBtn').addEventListener('click', ()=> recordCue(currentTimeSource(), 'script'));
$('#cueTabAddBtn').addEventListener('click', ()=> recordCue(currentTimeSource(), 'cue'));

/* ---------- Cue/独自Effect一覧の内容をステージ画面へ上書き反映（要件⑤） ---------- */
function applyCueToStage(cue){
  const stageRevMap = {'暗転':'anten','全照':'zensyou','半照':'hansyou'};
  if(stageRevMap[cue.stage]) state.stageState = stageRevMap[cue.stage];

  if(state.bgColorMode==='on'){
    if(cue.bg){
      const idx = COLOR_PALETTE.findIndex(c=>c.name===cue.bg);
      state.activeColorIndex = idx>=0 ? idx : null;
    }else{
      state.activeColorIndex = null;
    }
    if(state.effectType==='none'){
      state.strobeOn = (cue.strobe==='◯');
    }else{
      const revKey = Object.keys(STROBE_LABEL_CUE).find(k=>STROBE_LABEL_CUE[k]===cue.strobe);
      state.strobeMode = revKey || 'none';
    }
    if(state.effectType==='existing'){
      state.effectOn = !!cue.effect;
    }else if(state.effectType==='original'){
      state.effectSubMode = cue.effect ? 'original' : 'none';
      // 追加要望⑫：Effect欄にNo.（数字）が記録されている場合、そのNo.に登録済みの
      // ステップ列を、各ステップに記録された秒数どおりに高速で順送り再生する
      const cueNo = parseInt(cue.effect, 10);
      if(cue.effect && !isNaN(cueNo)){
        playCustomEffectSequence(cueNo, {useStepSec:true});
      }
    }
  }
  const revFadeKey = Object.keys(FADE_LABEL).find(k=>FADE_LABEL[k]===cue.fade);
  state.fadeMode = revFadeKey || 'none';

  // 要件⑬：反映時に配置アイテム（画像配置）も一緒に復元する（一覧には表示しない隠しデータ）
  if(Array.isArray(cue.stageItemsSnapshot)){
    state.stageItems = JSON.parse(JSON.stringify(cue.stageItemsSnapshot));
    selectedStageItemId = null;
    renderStageItems();
  }

  renderColorToggles();
  updateStrobeUI();
  updateEffectUI();
  updateFadeUI();
  updateStagePreviewMedia();
  saveState();
}
function applyCustomFxToStage(fx){
  if(state.bgColorMode==='on'){
    const idx = COLOR_PALETTE.findIndex(c=>c.name===fx.colorName);
    state.activeColorIndex = idx>=0 ? idx : null;
    if(state.effectType!=='none'){
      const revKey = Object.keys(STROBE_LABEL_CUE).find(k=>STROBE_LABEL_CUE[k]===fx.strobeLabel);
      state.strobeMode = revKey || 'none';
    }
  }
  renderColorToggles();
  updateStrobeUI();
  updateStagePreviewMedia();
  saveState();
}

const CUE_TBODY_IDS = ['cueTableBody_script','cueTableBody_video','cueTableBody_cue'];
const CUE_FIELDS = ['sec','line','audio','stage','bg','effect','strobe','fade'];
const FADER_HEADER_IDS = {cueTableBody_script:'faderHeader_script', cueTableBody_video:'faderHeader_video', cueTableBody_cue:'faderHeader_cue'};

// 追加要望③：ログインしていない場合、Fader列は「順番」列（並び替え用の通常の数字）になる
function ensureOrderNums(){
  let changed=false;
  state.cues.forEach((c,i)=>{ if(c.orderNum==null){ c.orderNum=i+1; changed=true; } });
  if(changed) saveState();
}
function applyOrderNumChange(cue, newVal){
  cue.orderNum = newVal;
  let safety=0, dup;
  while((dup = state.cues.find(o=>o!==cue && o.orderNum===cue.orderNum)) && safety<200){
    dup.orderNum = dup.orderNum + 1;
    safety++;
  }
  state.cues.sort((a,b)=>(a.orderNum||0)-(b.orderNum||0));
}

// 追加要望⑤：本番モードでのCue反映状況（グレー表示済みか）の管理
function ensureCueIds(){ state.cues.forEach(c=>{ if(!c.id) c.id = uid(); }); }
function resetGameReflection(){ gameReflectedIds = new Set(); renderCueTable(); }
function isReflected(cue){ return !!(cue.id && gameReflectedIds.has(cue.id)); }
function markReflected(cue){ if(cue.id) gameReflectedIds.add(cue.id); }
function findNextCueByDigit(key){
  ensureCueIds();
  return state.cues.find(c=> !isReflected(c) && c.fader===key);
}
function findNextCueAny(){
  ensureCueIds();
  return state.cues.find(c=> !isReflected(c));
}
function reflectCueForGame(cue){
  if(!cue) return;
  applyCueToStage(cue);
  markReflected(cue);
  renderCueTable();
}

function renderCueTable(){
  ensureCueIds();
  // 表示前に、fader未設定の行があれば連番を振っておく
  if(state.cues.some(c=>!c.fader)) reassignFaderFrom(0);
  if(!state.loggedIn) ensureOrderNums();

  CUE_TBODY_IDS.forEach(id=>{
    const body = document.getElementById(id);
    if(!body) return;

    // 追加要望③：ログイン状態に応じてヘッダー表示を「Fader」⇔「順番」に切り替える
    const headerEl = document.getElementById(FADER_HEADER_IDS[id]);
    if(headerEl) headerEl.textContent = state.loggedIn ? 'Fader' : '順番';

    body.innerHTML='';
    state.cues.forEach((c,idx)=>{
      const tr = document.createElement('tr');
      tr.className='cue-row';
      // 追加要望⑤：本番モードで反映済みの行はグレー表示にする
      if(state.locked && isReflected(c)) tr.classList.add('cue-row-reflected');

      // 追加要望②③：本番モード中は編集不可。ログインしていない場合は「順番」として
      // 編集可能な連番にし、編集後は自動で並び替え・重複時は既存側を+1する。
      const faderTd = document.createElement('td');
      faderTd.className = 'fader-cell';
      if(state.locked){
        faderTd.textContent = c.fader || '';
        faderTd.contentEditable = 'false';
      }else if(state.loggedIn){
        faderTd.textContent = c.fader || '';
        faderTd.contentEditable = 'true';
        faderTd.addEventListener('blur', ()=>{
          const v = (faderTd.textContent||'').trim();
          if(DIGIT_CYCLE.includes(v)){
            reassignFaderFrom(idx, v);
            renderCueTable();
            saveState();
          }else{
            faderTd.textContent = c.fader || '';
          }
        });
      }else{
        faderTd.textContent = c.orderNum!=null ? String(c.orderNum) : String(idx+1);
        faderTd.contentEditable = 'true';
        faderTd.addEventListener('blur', ()=>{
          const v = parseInt((faderTd.textContent||'').trim(),10);
          if(!isNaN(v) && v>0){
            applyOrderNumChange(c, v);
            renderCueTable();
            saveState();
          }else{
            faderTd.textContent = c.orderNum!=null ? String(c.orderNum) : String(idx+1);
          }
        });
      }
      tr.appendChild(faderTd);

      CUE_FIELDS.forEach(f=>{
        const td = document.createElement('td');
        td.textContent = c[f];
        if(!state.locked){
          td.contentEditable = 'true';
          td.addEventListener('blur', ()=>{ c[f]=td.textContent; saveState(); });
        }
        tr.appendChild(td);
      });
      const applyTd = document.createElement('td');
      const applyBtn = document.createElement('button');
      applyBtn.textContent='反映'; applyBtn.className='apply-btn';
      applyBtn.addEventListener('click', ev=>{
        ev.stopPropagation();
        if(state.locked){ reflectCueForGame(c); } else { applyCueToStage(c); }
      });
      applyTd.appendChild(applyBtn);
      tr.appendChild(applyTd);
      const delTd = document.createElement('td');
      if(!state.locked){
        const delBtn = document.createElement('button');
        delBtn.textContent='✕'; delBtn.className='del-btn';
        delBtn.addEventListener('click', ev=>{ ev.stopPropagation(); state.cues.splice(idx,1); reassignFaderFrom(0); renderCueTable(); saveState(); });
        delTd.appendChild(delBtn);
      }
      tr.appendChild(delTd);
      tr.addEventListener('click', ()=>{
        // 追加要望⑤：本番モード中は行クリックでそのCueを反映（グレー行も再反映可能）
        if(state.locked){ reflectCueForGame(c); }
        else{ video.currentTime = parseFloat(c.sec)||0; }
      });
      body.appendChild(tr);
    });
  });
}

/* ============================================================
   CSV出力（UTF-8 BOM付き）
   ============================================================ */
$('#exportCsvBtn').addEventListener('click', ()=>{
  const headers = ['Fader','秒数','セリフ','音源','舞台','背景','Effect','ストロボ','フェード'];
  const rows = state.cues.map(c=>[c.fader,c.sec,c.line,c.audio,c.stage,c.bg,c.effect,c.strobe,c.fade]);
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
   要件⑤⑫：ZIP エクスポート / インポート
   （音源・動画・配置アイテム画像などのバイナリデータも、その時点のデータベース上の
   　情報としてまとめて1つのZIPファイルに出力／復元できるようにする）
   ============================================================ */
function blobToDataUrl(blob){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = ()=>resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
async function externalizeToZip(zip, counterRef, url, hintExt){
  if(!url || typeof url!=='string') return url;
  if(!(url.startsWith('data:') || url.startsWith('blob:'))) return url; // 既存の相対パス等はそのまま
  try{
    const blob = await (await fetch(url)).blob();
    counterRef.n++;
    let ext = hintExt;
    if(!ext){
      const m = /data:[^;]+\/([a-zA-Z0-9.+-]+)/.exec(url);
      ext = m ? m[1].split('+')[0] : 'bin';
    }
    const name = `asset_${counterRef.n}.${ext}`;
    zip.file('assets/'+name, blob);
    return 'zipasset:assets/'+name;
  }catch(e){
    console.warn('アセットの同梱に失敗しました', e);
    return url;
  }
}
async function exportStateAsZip(){
  if(!window.JSZip){ alert('ZIP機能の読み込みに失敗しました（lib/jszip.min.js）。'); return; }
  const zip = new JSZip();
  const cloned = JSON.parse(JSON.stringify(state));
  const counterRef = {n:0};

  // 管理者アセット（img/xxx.png 等）は本来のパスのままZIPへ同梱する
  const adminPaths = Object.keys(state.adminAssets||{});
  for(const path of adminPaths){
    try{
      const blob = await (await fetch(state.adminAssets[path])).blob();
      zip.file(path, blob);
    }catch(e){ console.warn('管理者アセットの同梱に失敗', path, e); }
  }
  cloned.adminAssets = {};
  cloned._adminAssetPaths = adminPaths;

  for(const item of (cloned.stageItems||[])){
    item.src = await externalizeToZip(zip, counterRef, item.src, 'png');
  }
  for(const cue of (cloned.cues||[])){
    if(Array.isArray(cue.stageItemsSnapshot)){
      for(const item of cue.stageItemsSnapshot){
        item.src = await externalizeToZip(zip, counterRef, item.src, 'png');
      }
    }
  }
  for(const track of (cloned.audioSources||[])){
    track.src = await externalizeToZip(zip, counterRef, track.src, 'mp3');
  }
  cloned.stageVideoOverride = await externalizeToZip(zip, counterRef, cloned.stageVideoOverride, 'mp4');
  // 追加要望⑦：動画タブの動画もZIPに同梱する
  cloned.rehearsalVideoSrc = await externalizeToZip(zip, counterRef, cloned.rehearsalVideoSrc, 'mp4');

  zip.file('data.json', JSON.stringify(cloned, null, 2));
  const blob = await zip.generateAsync({type:'blob'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'stage_planner_data.zip';
  a.click();
}
async function resolveZipAsset(zip, marker){
  if(typeof marker!=='string' || !marker.startsWith('zipasset:')) return marker;
  const path = marker.slice('zipasset:'.length);
  const f = zip.file(path);
  if(!f) return marker;
  const blob = await f.async('blob');
  return await blobToDataUrl(blob);
}
async function importStateFromZip(file){
  if(!window.JSZip){ alert('ZIP機能の読み込みに失敗しました（lib/jszip.min.js）。'); return; }
  const zip = await JSZip.loadAsync(file);
  const dataFile = zip.file('data.json');
  if(!dataFile){ alert('ZIP内にdata.jsonが見つかりません。'); return; }
  const json = JSON.parse(await dataFile.async('string'));

  for(const item of (json.stageItems||[])) item.src = await resolveZipAsset(zip, item.src);
  for(const cue of (json.cues||[])){
    if(Array.isArray(cue.stageItemsSnapshot)){
      for(const item of cue.stageItemsSnapshot) item.src = await resolveZipAsset(zip, item.src);
    }
  }
  for(const track of (json.audioSources||[])) track.src = await resolveZipAsset(zip, track.src);
  json.stageVideoOverride = await resolveZipAsset(zip, json.stageVideoOverride);
  // 追加要望⑦：動画タブの動画を復元する
  json.rehearsalVideoSrc = await resolveZipAsset(zip, json.rehearsalVideoSrc);

  json.adminAssets = json.adminAssets || {};
  const paths = json._adminAssetPaths || [];
  for(const path of paths){
    const f = zip.file(path);
    if(f){
      const blob = await f.async('blob');
      json.adminAssets[path] = await blobToDataUrl(blob);
    }
  }
  delete json._adminAssetPaths;

  state = Object.assign(state, json);
  applyAllSettingsToUI();
  saveState();
  alert('読み込みが完了しました。');
}
$('#exportJsonBtn').addEventListener('click', ()=>{
  exportStateAsZip().catch(err=>alert('ZIP出力に失敗しました: '+err.message));
});
$('#importJsonInput').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;
  importStateFromZip(file).catch(err=>alert('ZIPの読み込みに失敗しました: '+err.message));
  e.target.value='';
});

/* ============================================================
   印刷 / PDF
   ============================================================ */
$('#printBtn').addEventListener('click', ()=>{
  const printArea = $('#printArea');
  printArea.innerHTML = `<h1>台本・キューシート</h1>` + scriptEditor.innerHTML +
    `<h2>キューシート一覧</h2>` +
    `<table border="1" style="width:100%;border-collapse:collapse;">
      <tr><th>Fader</th><th>秒数</th><th>セリフ</th><th>音源</th><th>舞台</th><th>背景</th><th>Effect</th><th>ストロボ</th><th>フェード</th></tr>
      ${state.cues.map(c=>`<tr><td>${c.fader||''}</td><td>${c.sec}</td><td>${c.line}</td><td>${c.audio}</td><td>${c.stage}</td><td>${c.bg}</td><td>${c.effect}</td><td>${c.strobe}</td><td>${c.fade}</td></tr>`).join('')}
    </table>`;
  window.print();
});

/* ============================================================
   追加要望①②⑤：本番モード
   Cue一覧で反映する順序は上から順（state.cues の並び順）。数字キーはFader列の
   数字と一致する、まだグレー表示になっていない最初のCueを反映する。縦画面用の
   大型ボタン（#gameHitBtn）はキーボード代わりとして、まだグレー表示になっていない
   最初のCueを反映する。一度反映した行はグレー表示になるが、グレーの行をクリック
   すれば再度反映でき、その次からは通常どおりグレーでない行から順に反映される。
   ============================================================ */
let gameReflectedIds = new Set();
function updateGameHitButtonVisibility(){
  const show = state.locked && state.cues.length>0;
  $('#gameHitBtn').classList.toggle('game-active', show);
}
document.addEventListener('keydown', e=>{
  if(!state.locked || e.repeat) return;
  const key = e.key;
  if(!DIGIT_CYCLE.includes(key)) return;
  const active = document.activeElement;
  if(active && (active.isContentEditable || active.tagName==='INPUT' || active.tagName==='TEXTAREA')) return;
  const cue = findNextCueByDigit(key);
  if(cue) reflectCueForGame(cue);
});
$('#gameHitBtn').addEventListener('click', e=>{
  e.preventDefault();
  if(!state.locked) return;
  const cue = findNextCueAny();
  if(cue) reflectCueForGame(cue);
});

/* ============================================================
   自動保存
   ============================================================ */
setInterval(saveState, 30000);
window.addEventListener('beforeunload', saveState);

/* ============================================================
   初期化
   ============================================================ */
document.addEventListener('DOMContentLoaded', async ()=>{
  loadState();
  await loadAdminsFromDataJson();
  populateAdminColorSelect();
  updateAdminAssetPathPreview();
  applyModalAssets();
  initModalLogic();
  initGoogleLoginUI();
  updateGoogleLoginUI();
  if(state.initDone){
    $('#initModal').classList.add('hidden');
    applyAllSettingsToUI();
  }else{
    prefillModalSelections();
  }
  updateLoginUI();
  updateSWDisplay();
});

