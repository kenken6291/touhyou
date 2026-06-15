/**
 * 投票コメント保存用 GAS（既存の投票用 code.gs とは別プロジェクトでOK）
 *
 * ■ 事前準備
 * 1. 保存先スプレッドシートを開き、URL中のIDをコピー
 *    https://docs.google.com/spreadsheets/d/【ここがID】/edit
 * 2. 下の SPREADSHEET_ID に貼り付ける
 *    （スプレッドシートに「拡張機能 > Apps Script」で紐付けて作る場合は
 *      SpreadsheetApp.getActiveSpreadsheet() を使うので ID 不要 → 下の補足参照）
 */

SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
const SHEET_NAME = 'コメント';
const MAX_COMMENT_LENGTH = 500;

/**
 * フロントエンドからの POST を受け取る
 * 受信形式: JSON文字列 { "target": "投票対象名", "comment": "コメント本文" }
 */
function doPost(e) {
  // 同時書き込みの競合を防ぐ
  const lock = LockService.getScriptLock();
  lock.waitLock(10 * 1000);

  try {
    // text/plain で送られてくる JSON をパース
    const data = JSON.parse(e.postData.contents);

    const target  = String(data.target  || '').trim();
    let   comment = String(data.comment || '').trim();

    // 簡易バリデーション
    if (!target || !comment) {
      return jsonResponse({ status: 'error', message: '投票対象とコメントは必須です' });
    }
    if (comment.length > MAX_COMMENT_LENGTH) {
      comment = comment.substring(0, MAX_COMMENT_LENGTH);
    }

    // シート取得（なければヘッダー付きで自動作成）
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(['タイムスタンプ', '投票対象', 'コメント']);
    }

    // 末尾に追記
    sheet.appendRow([new Date(), target, comment]);

    return jsonResponse({ status: 'ok' });

  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message });
  } finally {
    lock.releaseLock();
  }
}

/**
 * 動作確認用（ブラウザでWebアプリURLを直接開くと最新コメントを返す）
 * 将来「コメント一覧表示」機能を作るときにもそのまま使えます
 */
function doGet(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) {
      return jsonResponse({ status: 'ok', comments: [] });
    }
    // ヘッダーを除く最新50件
    const numRows = Math.min(sheet.getLastRow() - 1, 50);
    const startRow = sheet.getLastRow() - numRows + 1;
    const values = sheet.getRange(startRow, 1, numRows, 3).getValues();

    const comments = values.map(function(row) {
      return { timestamp: row[0], target: row[1], comment: row[2] };
    }).reverse(); // 新しい順

    return jsonResponse({ status: 'ok', comments: comments });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message });
  }
}

/**
 * JSONレスポンスを返す共通関数
 * ※ GASでは setHeader で CORS ヘッダーは付けられないが、
 *    「全員」公開のWebアプリ + ContentService なら
 *    Google側が自動で CORS を許可するため、これでOK
 */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ─────────────────────────────────────────────
 * 【補足】スプレッドシートに直接紐付けて作る場合
 * （スプレッドシートの「拡張機能 > Apps Script」から作成した場合）
 * SpreadsheetApp.openById(SPREADSHEET_ID) の2箇所を
 * SpreadsheetApp.getActiveSpreadsheet() に置き換えれば
 * SPREADSHEET_ID の設定は不要です。
 * ───────────────────────────────────────────── */
