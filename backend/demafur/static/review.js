'use strict';
let key = '', selected = '', generation = 0;
const ringLink = new URLSearchParams(location.search);
const el = id => document.getElementById(id);
const notice = message => { el('notice').textContent = message; };
async function api(path, options = {}) {
  const response = await fetch(path, {...options, headers: {'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', ...options.headers}, cache: 'no-store'});
  if (!response.ok) { let message; try { const body = await response.json(); message = typeof body.detail === 'string' ? body.detail : `Please check your entries (${response.status}).`; } catch { message = `Request failed (${response.status}).`; } throw new Error(message); }
  return response;
}
async function json(path, options) { return (await api(path, options)).json(); }
function node(tag, text, className) { const element = document.createElement(tag); element.textContent = text; if (className) element.className = className; return element; }
function button(text, action) { const element = node('button', text); element.type = 'button'; element.addEventListener('click', () => guarded(element, action)); return element; }
async function guarded(element, action) { element.disabled = true; notice(''); try { await action(); } catch(error) { notice(error.message); } finally { element.disabled = false; } }
async function download(path, filename) { const response = await api(path); const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function detail(id) {
  const version = ++generation; selected = id;
  const delivery = await json(`/v1/deliveries/${encodeURIComponent(id)}`);
  if (version !== generation || !key) return;
  el('detail').hidden = false; el('detail-title').textContent = delivery.id;
  el('risk').textContent = `${delivery.status.replaceAll('_', ' ')} · ${delivery.risk.level.replaceAll('_', ' ')} · heuristic score ${delivery.risk.score}/100 · footage ${delivery.analysis_coverage.replaceAll('_', ' ')}`;
  el('reasons').replaceChildren(...delivery.risk.reasons.map(reason => node('li', reason)));
  el('timeline').replaceChildren(...delivery.timeline.map(event => {
    const item = node('li', `${event.kind.replaceAll('_', ' ')} — ${new Date(event.occurred_at).toLocaleString()}`);
    if (event.explanation) item.append(node('p', event.explanation));
    item.append(node('small', `${event.provenance || 'supplied observation'} · confidence ${event.confidence}`, 'hint'));
    return item;
  }));
  if (!delivery.timeline.length) el('timeline').append(node('li', 'Waiting for a camera event and footage analysis.'));
  el('evidence').disabled = delivery.resolution !== 'missing';
}
async function refresh() {
  const [status, deliveries, jobs] = await Promise.all([json('/v1/integrations/status'), json('/v1/deliveries'), json('/v1/analysis/jobs')]);
  if (!key) return;
  el('ring-link').hidden = !(ringLink.has('nonce') && ringLink.has('time'));
  el('connection').textContent = `Ring: ${status.ring_disabled ? 'disconnected' : status.ring_configured ? 'configured; live verification still required' : 'not configured'}. Vision: ${status.vision_enabled && status.vision_configured ? 'enabled' : 'not configured or disabled'}. Video tools: ${status.ffmpeg_available ? 'available' : 'FFmpeg missing'}.`;
  el('deliveries').replaceChildren(...deliveries.items.map(delivery => {
    const row = node('div', '', 'row'); row.append(button(delivery.id, () => detail(delivery.id)), node('p', `${delivery.status.replaceAll('_', ' ')} · ${delivery.risk.level.replaceAll('_', ' ')}`)); return row;
  }));
  if (!deliveries.items.length) el('deliveries').append(node('p', 'No deliveries yet. Connect Ring and start watching a parcel, or run the documented local event demo.'));
  el('jobs').replaceChildren(...jobs.items.map(job => {
    const row = node('div', '', 'row'); row.append(node('strong', `${job.delivery_id} · ${job.state}`), node('p', new Date(job.occurred_at).toLocaleString()));
    if (job.error) row.append(node('p', `Analysis unavailable: ${job.error.replaceAll('_', ' ')}.`));
    if (job.analysis) { row.append(node('p', job.analysis.summary)); const list = node('ul', ''); job.analysis.limitations.forEach(text => list.append(node('li', text))); row.append(list); }
    if (job.state === 'completed') row.append(button('Download event clip', () => download(`/v1/analysis/jobs/${job.id}/clip`, 'event-clip.mp4')));
    if (job.state === 'failed') row.append(button('Retry analysis', async () => { await json(`/v1/analysis/jobs/${job.id}/retry`, {method:'POST'}); await refresh(); }));
    return row;
  }));
  if (!jobs.items.length) el('jobs').append(node('p', 'No footage has been analyzed yet.'));
  if (selected) await detail(selected);
}
el('login').addEventListener('submit', event => { event.preventDefault(); guarded(event.submitter, async () => {
  key = el('owner-key').value; await refresh(); el('owner-key').value = ''; el('login-panel').hidden = true; el('workspace').hidden = false; el('logout').hidden = false;
}); });
el('logout').addEventListener('click', () => { key = ''; selected = ''; generation++; el('workspace').hidden = true; el('detail').hidden = true; el('login-panel').hidden = false; el('logout').hidden = true; el('deliveries').replaceChildren(); el('jobs').replaceChildren(); notice('Signed out.'); });
el('refresh').addEventListener('click', event => guarded(event.target, refresh));
el('load-devices').addEventListener('click', event => guarded(event.target, async () => {
  const devices = await json('/v1/integrations/ring/devices'); el('device').replaceChildren(node('option', 'Select a camera')); el('device').firstChild.value = '';
  devices.data.forEach(device => { const option = node('option', device.attributes?.name || device.id); option.value = device.id; el('device').append(option); });
  el('capabilities').textContent = JSON.stringify(devices, null, 2);
}));
el('watch').addEventListener('submit', event => { event.preventDefault(); guarded(event.submitter, async () => {
  const result = await json('/v1/integrations/ring/watch', {method:'POST', body:JSON.stringify({device_id:el('device').value, component_id:el('component').value.trim(), delivery_id:el('delivery-name').value.trim()})}); selected = result.delivery_id; await refresh();
}); });
document.querySelectorAll('[data-outcome]').forEach(element => element.addEventListener('click', () => guarded(element, async () => {
  await json(`/v1/deliveries/${encodeURIComponent(selected)}/confirmation`, {method:'POST', body:JSON.stringify({outcome:element.dataset.outcome})}); await refresh();
})));
el('stop-watch').addEventListener('click', event => guarded(event.target, async () => { await json(`/v1/integrations/ring/watch/${encodeURIComponent(selected)}`, {method:'DELETE'}); notice('Camera watch stopped.'); }));
el('evidence').addEventListener('click', event => guarded(event.target, () => download(`/v1/deliveries/${encodeURIComponent(selected)}/evidence.zip`, 'demafur-evidence.zip')));
el('pickup').addEventListener('submit', event => { event.preventDefault(); guarded(event.submitter, async () => { await json('/v1/pickup-windows', {method:'POST', body:JSON.stringify({delivery_id:selected, starts_at:new Date(el('starts').value).toISOString(), ends_at:new Date(el('ends').value).toISOString()})}); notice('Trusted pickup window saved.'); }); });

el('ring-link').addEventListener('click', event => guarded(event.target, async () => { await json('/v1/integrations/ring/link', {method:'POST', body:JSON.stringify({nonce:ringLink.get('nonce'), time:Number(ringLink.get('time'))})}); ringLink.delete('nonce'); ringLink.delete('time'); history.replaceState(null, '', '/review'); await refresh(); notice('Ring account connected. Load cameras and start watching a delivery.'); }));
