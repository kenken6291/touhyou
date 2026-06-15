// ============================================
// 投票アプリ バックエンド（Google Apps Script）
// 無料で全員の票を集計・保存します
// ============================================

// ★必ず変更してください（管理者だけが知っているキー）
const ADMIN_KEY = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');

// ---- 初期データ ----
function getState_() {
  const p = PropertiesService.getScriptProperties();
  const s = p.getProperty('POLL');
  if (!s) {
    const init = {
      title: '📊 次回の懇親会の場所について',
      desc: '次回の集まりの場所について、皆さんの希望を投票してください！',
      deadline: '', // ISO形式の締切日時（空なら無期限）
      nextId: 4,
      options: [
        { id: 1, emoji: '🍶', name: '新橋の居酒屋', votes: 0 },
        { id: 2, emoji: '🍖', name: '銀座のバル', votes: 0 },
        { id: 3, emoji: '☕', name: 'オンライン（Zoom）', votes: 0 }
      ]
    };
    p.setProperty('POLL', JSON.stringify(init));
    return init;
  }
  return JSON.parse(s);
}

function saveState_(st) {
  PropertiesService.getScriptProperties().setProperty('POLL', JSON.stringify(st));
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---- リンクURLの検証（http/https以外は保存しない） ----
function cleanUrl_(u) {
  const url = String(u || '').trim().slice(0, 300);
  return /^https?:\/\//i.test(url) ? url : '';
}

// ---- 取得(投票状況の読み込み) ----
function doGet() {
  return json_({ ok: true, poll: getState_() });
}

// ---- 更新(投票・項目管理・締切設定) ----
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // 同時アクセスでも票が消えないようにロック
  try {
    const req = JSON.parse(e.postData.contents);
    const st = getState_();
    const isAdmin = req.adminKey === ADMIN_KEY;

    switch (req.action) {

      case 'vote': {
        if (st.deadline && new Date() > new Date(st.deadline)) {
          return json_({ ok: false, error: '投票は締め切られました' });
        }
        const o = st.options.find(x => x.id === req.id);
        if (!o) return json_({ ok: false, error: 'その項目は存在しません' });
        o.votes++;
        break;
      }

      case 'unvote': { // 「投票をやり直す」用(自分の1票を取り消す)
        const o = st.options.find(x => x.id === req.id);
        if (o && o.votes > 0) o.votes--;
        break;
      }

      case 'addOption':
        if (!isAdmin) return json_({ ok: false, error: '管理キーが違います' });
        st.options.push({
          id: st.nextId++,
          emoji: (req.emoji || '📌').slice(0, 4),
          name: String(req.name || '').slice(0, 50),
          url: cleanUrl_(req.url),
          votes: 0
        });
        break;

      case 'setOptionUrl': { // 既存項目にリンクを設定（空なら解除）
        if (!isAdmin) return json_({ ok: false, error: '管理キーが違います' });
        const o = st.options.find(x => x.id === req.id);
        if (!o) return json_({ ok: false, error: 'その項目は存在しません' });
        o.url = cleanUrl_(req.url);
        break;
      }

      case 'deleteOption':
        if (!isAdmin) return json_({ ok: false, error: '管理キーが違います' });
        st.options = st.options.filter(x => x.id !== req.id);
        break;

      case 'setDeadline':
        if (!isAdmin) return json_({ ok: false, error: '管理キーが違います' });
        st.deadline = req.deadline || '';
        break;

      case 'setText': // タイトル・説明文の変更
        if (!isAdmin) return json_({ ok: false, error: '管理キーが違います' });
        if (req.title) st.title = String(req.title).slice(0, 60);
        if (req.desc) st.desc = String(req.desc).slice(0, 200);
        break;

      case 'resetVotes':
        if (!isAdmin) return json_({ ok: false, error: '管理キーが違います' });
        st.options.forEach(o => o.votes = 0);
        break;

      default:
        return json_({ ok: false, error: '不明な操作です' });
    }

    saveState_(st);
    return json_({ ok: true, poll: st });

  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}