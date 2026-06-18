/**
 * Notification module — sends claim results to stdout and optional webhook.
 */
import { cfg } from './config.js';

/**
 * Send a notification message.
 * @param {string} message - Plain text message
 * @param {object} [opts]
 * @param {'info'|'success'|'warning'|'error'} [opts.level='info']
 */
export async function notify(message, { level = 'info' } = {}) {
  const prefix = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' }[level] || 'ℹ️';
  const formatted = `${prefix} [epic-free-games] ${message}`;

  console.log(formatted);

  if (cfg.webhookUrl) {
    try {
      await sendWebhook(cfg.webhookUrl, formatted);
    } catch (err) {
      console.error(`Failed to send webhook notification: ${err.message}`);
    }
  }
}

/**
 * Send claim summary notification.
 * @param {Array<{ title: string, status: string, reason?: string, url?: string, manualRequired?: boolean, details?: string }>} results
 */
export async function notifyClaimResults(results) {
  if (!results.length) {
    await notify('No free games available this week.', { level: 'info' });
    return;
  }

  const lines = results.map(formatResultLine);
  const claimed = results.filter((r) => r.status === 'claimed').length;
  const total = results.length;

  const hasHardFailure = results.some((r) => isFailureStatus(r.status));
  const hasManual = results.some((r) => r.manualRequired || r.status === 'captcha_blocked');

  const level = hasManual ? 'warning' : hasHardFailure ? 'error' : claimed > 0 ? 'success' : 'info';
  const summary = `Claimed ${claimed}/${total} free games:\n${lines.join('\n')}`;

  await notify(summary, { level });
}

function formatResultLine(result) {
  const icon = getStatusIcon(result.status);
  const extra = [];
  if (result.reason) extra.push(`reason=${result.reason}`);
  if (result.manualRequired) extra.push('manual_required=true');

  const lines = [`${icon} ${result.title} — ${result.status}${extra.length ? ` (${extra.join(', ')})` : ''}`];
  if (result.url) lines.push(`   ${result.url}`);
  if (result.details) lines.push(`   details: ${result.details}`);
  if (result.screenshotPath) lines.push(`   screenshot: ${result.screenshotPath}`);
  return lines.join('\n');
}

function getStatusIcon(status) {
  switch (status) {
    case 'claimed':
      return '🎮';
    case 'already_owned':
      return '📦';
    case 'captcha_blocked':
      return '🧩';
    case 'manual_intervention_required':
      return '✋';
    case 'region_locked':
      return '🌍';
    case 'requires_base_game':
      return '🧱';
    case 'dryrun_skipped':
      return '🏃';
    default:
      return '❌';
  }
}

function isFailureStatus(status) {
  return !['claimed', 'already_owned', 'dryrun_skipped'].includes(status);
}

/**
 * Generic webhook sender (supports JSON POST).
 */
async function sendWebhook(url, text) {
  // PushPlus 微信推送
  if (url.startsWith('pp_')) {
    const resp = await fetch('https://www.pushplus.plus/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: url,
        title: 'Epic免费游戏领取',
        content: text,
      }),
    });
    if (!resp.ok) throw new Error(`PushPlus returned ${resp.status}`);
    return;
  }
  // 其他通用 Webhook
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, message: text }),
  });
  if (!resp.ok) {
    throw new Error(`Webhook returned ${resp.status}`);
  }
}
