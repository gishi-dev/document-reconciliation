const token = document.body.dataset.workspace;
const $ = id => document.getElementById(id);
let docs = [], selected = null, imageUrl = null, busy = false, dirty = false;
const message = text => { $('message').textContent = text; };
async function api(path, options = {}) {
  const response = await fetch('/api/' + path, {...options, headers: {...options.headers, 'X-Workspace': token}});
  if (!response.ok) {
    let error;
    try { error = (await response.json()).error; } catch { error = '作業期限切れ、または処理できない入力です。再読み込みしてください。'; }
    throw new Error(error);
  }
  return response;
}
async function run(action) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button').forEach(b => { b.disabled = true; });
  try { await action(); } catch (e) { message(e.message); }
  finally { busy = false; document.querySelectorAll('button').forEach(b => { b.disabled = false; }); updateControls(); }
}
function updateControls() {
  $('export').disabled = dirty || !docs.some(d => d.confirmed && !d.excluded);
  const doc = docs.find(d => d.id === selected);
  $('confirm').disabled = dirty || !doc || doc.excluded || !!doc.result.errors.length;
}
function render() {
  dirty = false;
  $('count').textContent = docs.length;
  $('list').replaceChildren();
  for (const doc of docs) {
    const button = document.createElement('button');
    button.className = 'document' + (doc.id === selected ? ' active' : '');
    button.textContent = `${doc.name}\n${doc.excluded ? '除外' : doc.confirmed ? '確認済み' : '未確認'} · ${doc.result.state}${doc.result.errors.length ? ' · 要修正' : ''}`;
    button.onclick = () => {
      if (dirty) { message('編集内容を保存してから書類を切り替えてください。'); return; }
      selected = doc.id; render();
    };
    $('list').append(button);
  }
  const doc = docs.find(d => d.id === selected);
  $('detail').hidden = !doc; $('empty').hidden = !!doc;
  if (!doc) { updateControls(); return; }
  $('filename').textContent = doc.name;
  $('confirmed').textContent = doc.excluded ? '対象外' : doc.confirmed ? '確認済み' : '未確認';
  for (const [field, value] of Object.entries(doc.values)) {
    $('edit').elements.namedItem(field).value = value;
    const evidence = doc.evidence[field];
    document.querySelector(`[data-evidence="${field}"]`).textContent = evidence ? `根拠 p${evidence.page}：${evidence.text}` : '根拠：未取得';
  }
  $('edit').elements.namedItem('reason').value = doc.reason;
  $('page').replaceChildren();
  doc.pages.forEach((p, i) => { const option = document.createElement('option'); option.value = i; option.textContent = `${i + 1}ページ / ${p.method}`; $('page').append(option); });
  $('result').textContent = `台帳：${doc.result.state}${doc.result.expected !== null ? ` / 予定金額 ${doc.result.expected.toLocaleString()}円` : ' / 一致する台帳が1件に決まりません'}`;
  $('result').className = doc.result.state === '一致' ? 'match' : 'mismatch';
  $('errors').textContent = doc.result.errors.join('。');
  $('exclude').textContent = doc.excluded ? '対象に戻す' : '対象から除外';
  showPage(); updateControls();
}
async function showPage() {
  const doc = docs.find(d => d.id === selected), page = Number($('page').value);
  if (!doc) return;
  $('text').textContent = doc.pages[page].text || '文字を取得できませんでした。元ページを確認して入力してください。';
  $('method').textContent = doc.pages[page].method;
  $('preview').removeAttribute('src');
  try {
    const response = await api(`image/${doc.id}/${page + 1}`);
    const blob = await response.blob();
    if (selected !== doc.id || Number($('page').value) !== page) return;
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = URL.createObjectURL(blob); $('preview').src = imageUrl;
  } catch (e) { message(e.message); }
}
async function load(form) {
  const data = await (await api('load', {method: 'POST', body: form})).json();
  docs = data.docs; selected ||= docs[0]?.id; render(); message(data.message);
}
$('samples').onclick = () => run(async () => { if (dirty) throw new Error('編集内容を保存してください。'); message('PDFを読み取り中です…'); const form = new FormData(); form.set('sample', 'yes'); await load(form); });
$('upload').onchange = () => run(async () => { if (dirty) throw new Error('編集内容を保存してください。'); if (!$('upload').files[0]) return; message('PDFを読み取り中です…'); const form = new FormData(); form.set('pdf', $('upload').files[0]); await load(form); $('upload').value = ''; });
$('page').onchange = showPage;
$('edit').oninput = () => { dirty = true; $('confirmed').textContent = '編集中・保存と再確認が必要'; updateControls(); };
async function act(action, extra = {}) {
  const data = await (await api(`document/${selected}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action, ...extra})})).json();
  docs = data.docs; render(); message(action === 'confirm' ? '確認済みにしました。' : '更新しました。内容を確認してください。');
}
$('edit').onsubmit = e => { e.preventDefault(); run(async () => { const values = {}; for (const input of $('edit').querySelectorAll('input')) values[input.name] = input.value; await act('save', {values, reason: $('edit').elements.namedItem('reason').value}); }); };
$('confirm').onclick = () => run(() => act('confirm'));
$('exclude').onclick = () => run(async () => { if (dirty) throw new Error('編集内容を保存してください。'); await act('exclude'); });
$('clear').onclick = () => run(async () => { await api('clear', {method: 'POST'}); docs = []; selected = null; if (imageUrl) URL.revokeObjectURL(imageUrl); render(); message('作業中の書類を削除しました。'); });
$('export-form').onsubmit = e => {
  if (dirty || busy || !docs.some(d => d.confirmed && !d.excluded)) {
    e.preventDefault(); message('保存・再確認した書類を選んでください。');
  }
};
render();
