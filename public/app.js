const sourceEl = document.getElementById('source');
const yearEl = document.getElementById('year');
const qEl = document.getElementById('q');
const regionSidoEl = document.getElementById('region-sido');
const regionEl = document.getElementById('region');
const sexEl = document.getElementById('sex');
const ageEl = document.getElementById('age');
const majorEl = document.getElementById('major');
const minorEl = document.getElementById('minor');
const sizeEl = document.getElementById('size');

const ageListEl = document.getElementById('age-list');
const majorListEl = document.getElementById('major-list');
const minorListEl = document.getElementById('minor-list');
const sizeListEl = document.getElementById('size-list');

const rowsMap = {
  region: document.getElementById('region-row'),
  sex: document.getElementById('sex-row'),
  age: document.getElementById('age-row'),
  major: document.getElementById('major-row'),
  minor: document.getElementById('minor-row'),
  size: document.getElementById('size-row'),
  year: document.getElementById('year-row'),
};

const metaEl = document.getElementById('meta');
const theadEl = document.getElementById('thead');
const tbodyEl = document.getElementById('tbody');
const chartEl = document.getElementById('chart');

let sourceMeta = [];
let lastResult = null;
let regionCategoryCache = [];
let lastChartPayload = null;
const typeControlMap = {
  region: [regionSidoEl, regionEl],
  sex: [sexEl],
  age: [ageEl],
  industry: [majorEl, minorEl, sizeEl],
};

async function apiGetJson(url, retries = 2) {
  let lastErr;
  for (let i = 0; i <= retries; i += 1) {
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `요청 실패 (${res.status})`);
      return json;
    } catch (err) {
      lastErr = err;
      if (i < retries) {
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

function showRowsByType(type) {
  Object.values(rowsMap).forEach((row) => row.hidden = true);
  rowsMap.year.hidden = false;

  if (type === 'region') rowsMap.region.hidden = false;
  if (type === 'sex') rowsMap.sex.hidden = false;
  if (type === 'age') rowsMap.age.hidden = false;
  if (type === 'industry') {
    rowsMap.major.hidden = false;
    rowsMap.minor.hidden = false;
    rowsMap.size.hidden = false;
  }
}

function setEnabledByType(type) {
  const allControls = [regionSidoEl, regionEl, sexEl, ageEl, majorEl, minorEl, sizeEl];
  const enabled = new Set(typeControlMap[type] || []);
  allControls.forEach((el) => {
    el.disabled = !enabled.has(el);
  });
}

function clearAllConditionValues() {
  yearEl.value = '';
  qEl.value = '';

  regionSidoEl.value = '';
  fillRegionDetailOptions(regionCategoryCache, '');
  regionEl.value = '';

  sexEl.value = '';
  ageEl.value = '';
  majorEl.value = '';
  minorEl.value = '';
  sizeEl.value = '';
}

function applySourceMode(type) {
  showRowsByType(type);
  setEnabledByType(type);
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('ko-KR');
}

function setFriendlyError(prefix, err) {
  const msg = String(err?.message || err || '');
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    metaEl.textContent = `${prefix}: 서버에 연결할 수 없습니다. 서버 실행 후 다시 시도해 주세요. (npm start)`;
    return;
  }
  metaEl.textContent = `${prefix}: ${msg}`;
}

function setDatalist(el, list) {
  el.innerHTML = (list || []).map((x) => `<option value="${x}"></option>`).join('');
}

function normalizeRegionName(raw) {
  return String(raw || '').replace(/\s+/g, '');
}

function mapRegionToSido(raw) {
  const n = normalizeRegionName(raw);

  if (n.startsWith('서울')) return '서울';

  if (['중부청', '인천북부', '부천', '의정부', '고양', '경기', '성남', '안양', '안산', '평택'].includes(n)) {
    return '인천·경기';
  }

  if (['강원', '강릉', '원주', '태백', '영월'].includes(n)) return '강원';

  if (['부산청', '부산동부', '부산북부', '창원', '울산', '양산', '진주', '통영'].includes(n)) {
    return '부산·울산·경남';
  }

  if (['대구청', '대구서부', '포항', '구미', '영주', '안동'].includes(n)) return '대구·경북';

  if (['광주청', '전주', '익산', '군산', '목포', '여수'].includes(n)) return '광주·전라';

  if (['대전청', '청주', '천안', '충주', '보령', '서산'].includes(n)) return '대전·충청';

  if (n.startsWith('제주')) return '제주';

  return '기타';
}

function buildRegionItems(categories) {
  return (categories || []).map((raw) => ({
    raw,
    label: normalizeRegionName(raw),
    sido: mapRegionToSido(raw),
  }));
}

function fillRegionSidoOptions(items) {
  const sidos = [...new Set((items || []).map((x) => x.sido).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ko'));
  regionSidoEl.innerHTML = ['<option value="">시/도 선택</option>']
    .concat(sidos.map((s) => `<option value="${s}">${s}</option>`))
    .join('');
}

function fillRegionDetailOptions(items, selectedSido = '') {
  const list = (items || [])
    .filter((x) => !selectedSido || x.sido === selectedSido)
    .sort((a, b) => a.label.localeCompare(b.label, 'ko'));

  regionEl.innerHTML = ['<option value="">세부지역 선택</option>']
    .concat(list.map((x) => `<option value="${x.raw}">${x.label}</option>`))
    .join('');
}

function applyFilterOptions(type, filterOptions) {
  regionCategoryCache = [];
  fillRegionSidoOptions([]);
  fillRegionDetailOptions([]);

  setDatalist(ageListEl, []);
  setDatalist(majorListEl, []);
  setDatalist(minorListEl, []);
  setDatalist(sizeListEl, []);

  if (type === 'industry') {
    setDatalist(majorListEl, filterOptions.majorOptions || []);
    setDatalist(minorListEl, filterOptions.minorOptions || []);
    setDatalist(sizeListEl, filterOptions.sizeOptions || []);
    return;
  }

  const list = filterOptions.categoryOptions || [];
  if (type === 'region') {
    regionCategoryCache = buildRegionItems(list);
    fillRegionSidoOptions(regionCategoryCache);
    fillRegionDetailOptions(regionCategoryCache);
  }
  if (type === 'age') setDatalist(ageListEl, list);
}

function buildTopChartForRegion(data) {
  return [...data]
    .sort((a, b) => Number(b.casualties || 0) - Number(a.casualties || 0))
    .slice(0, 10)
    .map((x) => ({ label: normalizeRegionName(x.category), value: Number(x.casualties || 0) }));
}

function applyRegionSidoClientFilterIfNeeded(result) {
  if (!result || result.type !== 'region') return result;
  if (regionEl.value) return result;
  if (!regionSidoEl.value) return result;

  const filtered = (result.data || []).filter((x) => mapRegionToSido(x.category) === regionSidoEl.value);
  return {
    ...result,
    data: filtered,
    filteredCount: filtered.length,
    chartData: buildTopChartForRegion(filtered),
  };
}

const CHART_COLORS = ['#005a9c', '#0e77c6', '#58a6e7', '#83c0f2', '#2f8f9d', '#6ca8af', '#4f6fad', '#7f8cc9'];

function fmtNum(v) {
  return Number(v || 0).toLocaleString('ko-KR');
}

function ellipsize(text, maxLen) {
  const t = String(text || '');
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(1, maxLen - 1))}…`;
}

function getChartCtx() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const width = chartEl.clientWidth || 900;
  const height = 260;
  if (chartEl.width !== Math.floor(width * dpr) || chartEl.height !== Math.floor(height * dpr)) {
    chartEl.width = Math.floor(width * dpr);
    chartEl.height = Math.floor(height * dpr);
  }
  const ctx = chartEl.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: width, h: height };
}

function clearChart(title) {
  const { ctx, w, h } = getChartCtx();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2b3e56';
  ctx.font = '700 13px "Noto Sans KR", sans-serif';
  ctx.fillText(title, 14, 20);
  return { ctx, w, h };
}

function drawEmptyChart(title = '차트') {
  const { ctx } = clearChart(title);
  ctx.fillStyle = '#6c7a8a';
  ctx.font = '12px "Noto Sans KR", sans-serif';
  ctx.fillText('표시할 데이터가 없습니다.', 14, 44);
}

function drawVerticalBars(points, title) {
  if (!points?.length) return drawEmptyChart(title);
  const { ctx, w, h } = clearChart(title);
  const left = 44;
  const right = w - 14;
  const top = 34;
  const bottom = h - 82;
  const maxVal = Math.max(...points.map((p) => Number(p.value || 0)), 1);
  const slot = (right - left) / points.length;
  const barW = Math.max(8, slot - 8);
  const rotate = slot < 56;
  const labelAngle = rotate ? -Math.PI / 4.5 : 0;

  ctx.strokeStyle = '#d8dfe7';
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.stroke();

  points.forEach((p, i) => {
    const val = Number(p.value || 0);
    const bh = Math.max(1, ((bottom - top - 8) * val) / maxVal);
    const x = left + i * slot + (slot - barW) / 2;
    const y = bottom - bh;
    ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
    ctx.fillRect(x, y, barW, bh);

    ctx.fillStyle = '#1f2937';
    ctx.font = '600 10px "Noto Sans KR", sans-serif';
    const valueText = fmtNum(val);
    const valueWidth = ctx.measureText(valueText).width;
    const valueY = Math.max(30, y - 4);
    ctx.fillText(valueText, x + Math.max(0, (barW - valueWidth) / 2), valueY);

    const label = String(p.label || '');
    ctx.save();
    // 라벨을 2단 높이로 교차 배치해 밀집 구간 겹침을 방지
    const staggerY = rotate ? (i % 2 === 0 ? 16 : 28) : (i % 2 === 0 ? 14 : 26);
    ctx.translate(x + barW / 2, bottom + staggerY);
    ctx.rotate(labelAngle);
    ctx.fillStyle = '#334155';
    ctx.font = '11px "Noto Sans KR", sans-serif';
    if (rotate) {
      ctx.textAlign = 'left';
      ctx.fillText(label, 0, 0);
    } else {
      const short = ellipsize(label, 8);
      ctx.textAlign = 'center';
      ctx.fillText(short, 0, 0);
    }
    ctx.restore();
  });
}

function drawHorizontalBars(points, title) {
  if (!points?.length) return drawEmptyChart(title);
  const { ctx, w, h } = clearChart(title);
  const left = 110;
  const right = w - 26;
  const top = 32;
  const bottom = h - 10;
  const maxVal = Math.max(...points.map((p) => Number(p.value || 0)), 1);
  const slot = (bottom - top) / points.length;
  const barH = Math.max(8, slot - 6);

  points.forEach((p, i) => {
    const val = Number(p.value || 0);
    const bw = ((right - left) * val) / maxVal;
    const y = top + i * slot + (slot - barH) / 2;
    ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
    ctx.fillRect(left, y, bw, barH);

    ctx.fillStyle = '#334155';
    ctx.font = '11px "Noto Sans KR", sans-serif';
    ctx.fillText(ellipsize(p.label, 10), 8, y + barH - 1);

    const valueText = fmtNum(val);
    const valueWidth = ctx.measureText(valueText).width;
    if (bw > valueWidth + 12) {
      ctx.fillStyle = '#ffffff';
      ctx.fillText(valueText, left + bw - valueWidth - 6, y + barH - 1);
    } else {
      ctx.fillStyle = '#1f2937';
      ctx.fillText(valueText, Math.min(right - valueWidth, left + bw + 4), y + barH - 1);
    }
  });
}

function drawDonut(points, title) {
  if (!points?.length) return drawEmptyChart(title);
  const { ctx, w, h } = clearChart(title);
  const total = points.reduce((s, p) => s + Number(p.value || 0), 0) || 1;
  const cx = Math.min(130, w * 0.3);
  const cy = h * 0.58;
  const outer = 72;
  const inner = 40;
  let start = -Math.PI / 2;

  points.forEach((p, i) => {
    const ratio = Number(p.value || 0) / total;
    const end = start + ratio * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, outer, start, end);
    ctx.closePath();
    ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
    ctx.fill();
    start = end;
  });

  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  ctx.fillStyle = '#334155';
  ctx.font = '600 11px "Noto Sans KR", sans-serif';
  points.forEach((p, i) => {
    const y = 48 + i * 18;
    const x = Math.max(220, w * 0.52);
    ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
    ctx.fillRect(x, y - 9, 10, 10);
    ctx.fillStyle = '#334155';
    ctx.fillText(`${ellipsize(p.label, 8)}: ${fmtNum(p.value)}`, x + 16, y);
  });
}

function drawLineChart(points, title) {
  if (!points?.length) return drawEmptyChart(title);
  const { ctx, w, h } = clearChart(title);
  const left = 50;
  const right = w - 20;
  const top = 34;
  const bottom = h - 36;
  const maxVal = Math.max(...points.map((p) => Number(p.value || 0)), 1);
  const stepX = points.length > 1 ? (right - left) / (points.length - 1) : 0;
  const maxLabels = Math.max(1, Math.floor((right - left) / 50));
  const skip = Math.max(1, Math.ceil(points.length / maxLabels));

  ctx.strokeStyle = '#d8dfe7';
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.stroke();

  ctx.strokeStyle = '#005a9c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = left + i * stepX;
    const y = bottom - ((bottom - top - 4) * Number(p.value || 0)) / maxVal;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.lineWidth = 1;

  points.forEach((p, i) => {
    const x = left + i * stepX;
    const y = bottom - ((bottom - top - 4) * Number(p.value || 0)) / maxVal;
    ctx.fillStyle = '#005a9c';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1f2937';
    ctx.font = '600 10px "Noto Sans KR", sans-serif';
    const valueText = fmtNum(p.value);
    const shift = i % 2 === 0 ? -8 : -18;
    ctx.fillText(valueText, x - ctx.measureText(valueText).width / 2, Math.max(28, y + shift));
    if (i % skip === 0) {
      ctx.fillStyle = '#334155';
      ctx.font = '11px "Noto Sans KR", sans-serif';
      ctx.fillText(String(p.label), x - 10, bottom + 12);
    }
  });
}

function drawChartByDataType(result) {
  if (!result) return drawEmptyChart('통계 차트');
  lastChartPayload = { mode: 'type', result };
  const type = result.type;
  if (type === 'sex') {
    const pts = (result.data || []).map((x) => ({ label: x.category, value: x.casualties }));
    return drawDonut(pts, '성별 재해자 비중');
  }
  if (type === 'age') {
    const pts = (result.data || []).map((x) => ({ label: x.category, value: x.casualties }));
    return drawVerticalBars(pts, '연령대별 재해자수');
  }
  if (type === 'region') {
    const pts = (result.chartData || []).map((x) => ({ label: x.label, value: x.value }));
    return drawHorizontalBars(pts, '지역별 재해자수 상위');
  }
  if (type === 'industry') {
    const pts = (result.chartData || []).map((x) => ({ label: x.label, value: x.value }));
    return drawHorizontalBars(pts, '업종별 재해자수 상위');
  }
  return drawVerticalBars(result.chartData || [], '재해자수');
}

function renderTable(type, data) {
  if (type === 'industry') {
    theadEl.innerHTML = '<tr><th>대업종</th><th>중업종</th><th>규모</th><th>재해자수(합산)</th></tr>';
    tbodyEl.innerHTML = data.map((r) => `
      <tr>
        <td>${r.majorIndustry}</td>
        <td>${r.minorIndustry}</td>
        <td>${r.size}</td>
        <td>${Number(r.casualties).toLocaleString()}</td>
      </tr>
    `).join('');
    return;
  }

  const hasDeaths = data.some((x) => x.deaths !== undefined);
  theadEl.innerHTML = hasDeaths
    ? '<tr><th>구분</th><th>재해자수</th><th>사망자수</th></tr>'
    : '<tr><th>구분</th><th>재해자수</th></tr>';

  tbodyEl.innerHTML = data.map((r) => {
    const categoryLabel = type === 'region' ? normalizeRegionName(r.category) : r.category;
    const deathsTd = hasDeaths ? `<td>${Number(r.deaths || 0).toLocaleString()}</td>` : '';
    return `<tr><td>${categoryLabel}</td><td>${Number(r.casualties).toLocaleString()}</td>${deathsTd}</tr>`;
  }).join('');
}

function pickTrendCategory(metaType) {
  if (metaType === 'sex' && sexEl.value) return sexEl.value;
  if (metaType === 'region') {
    if (regionEl.value) return regionEl.value;
    if (regionSidoEl.value) return regionSidoEl.value.includes('·') ? regionSidoEl.value.split('·')[0] : regionSidoEl.value;
  }
  if (metaType === 'age' && ageEl.value.trim()) return ageEl.value.trim();
  return '';
}

async function loadSources() {
  const json = await apiGetJson('/api/sources');

  sourceMeta = json.sources;
  sourceEl.innerHTML = sourceMeta.map((s) => `<option value="${s.key}">${s.label}</option>`).join('');

  const first = sourceMeta[0];
  if (first) {
    yearEl.placeholder = `예: ${first.latestYear || 2024}`;
    applySourceMode(first.type);
  }
}

async function searchStats() {
  const source = sourceEl.value;
  const meta = sourceMeta.find((s) => s.key === source);
  if (!meta) return;

  const params = new URLSearchParams();
  params.set('source', source);
  if (yearEl.value) params.set('year', yearEl.value);
  if (qEl.value.trim()) params.set('q', qEl.value.trim());

  if (meta.type === 'region') {
    if (regionEl.value) params.set('region', regionEl.value);
  }
  if (meta.type === 'sex' && sexEl.value) params.set('sex', sexEl.value);
  if (meta.type === 'age' && ageEl.value.trim()) params.set('age', ageEl.value.trim());
  if (meta.type === 'industry') {
    if (majorEl.value.trim()) params.set('major', majorEl.value.trim());
    if (minorEl.value.trim()) params.set('minor', minorEl.value.trim());
    if (sizeEl.value.trim()) params.set('size', sizeEl.value.trim());
  }

  const json = await apiGetJson(`/api/stats?${params.toString()}`);

  const normalized = applyRegionSidoClientFilterIfNeeded(json);
  lastResult = normalized;

  const sourceLink = `<a href="${normalized.sourceUrl}" target="_blank" rel="noreferrer">원본 보기</a>`;
  metaEl.innerHTML = [
    `최신명세: ${normalized.latestSummary}`,
    `선택연도: ${normalized.selectedYear || '해당없음'}`,
    `조회건수: ${normalized.filteredCount.toLocaleString()} / ${normalized.totalCount.toLocaleString()}`,
    `조회시각: ${formatDateTime(normalized.fetchedAt)}`,
    sourceLink,
  ].join(' | ');

  applyFilterOptions(normalized.type, normalized.filterOptions || {});
  renderTable(normalized.type, normalized.data);
  drawChartByDataType(normalized);
}

async function loadTrend() {
  const source = sourceEl.value;
  const meta = sourceMeta.find((s) => s.key === source);
  if (!meta) return;
  if (meta.type === 'industry') {
    metaEl.textContent = '업종별 데이터는 단일 연도 집계로 추이 조회를 지원하지 않습니다.';
    return;
  }

  const params = new URLSearchParams();
  params.set('source', source);
  const category = pickTrendCategory(meta.type);
  if (category) params.set('category', category);

  const json = await apiGetJson(`/api/trend?${params.toString()}`);

  const points = json.series.map((x) => ({ label: String(x.year), value: x.casualties }));
  lastChartPayload = { mode: 'trend', points, title: `연도별 추이: ${json.category}` };
  drawLineChart(points, `연도별 추이: ${json.category}`);
}

function exportCsv() {
  if (!lastResult || !Array.isArray(lastResult.data) || lastResult.data.length === 0) {
    metaEl.textContent = '다운로드할 데이터가 없습니다.';
    return;
  }

  let header = [];
  let rows = [];

  if (lastResult.type === 'industry') {
    header = ['대업종', '중업종', '규모', '재해자수'];
    rows = lastResult.data.map((r) => [r.majorIndustry, r.minorIndustry, r.size, r.casualties]);
  } else {
    const hasDeaths = lastResult.data.some((x) => x.deaths !== undefined);
    header = hasDeaths ? ['구분', '재해자수', '사망자수'] : ['구분', '재해자수'];
    rows = lastResult.data.map((r) => {
      const categoryLabel = lastResult.type === 'region' ? normalizeRegionName(r.category) : r.category;
      return hasDeaths ? [categoryLabel, r.casualties, r.deaths || 0] : [categoryLabel, r.casualties];
    });
  }

  const csv = [header, ...rows]
    .map((line) => line.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `industrial_accident_${lastResult.source}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

sourceEl.addEventListener('change', () => {
  const meta = sourceMeta.find((s) => s.key === sourceEl.value);
  if (!meta) return;
  applySourceMode(meta.type);
  clearAllConditionValues();
  yearEl.placeholder = `예: ${meta.latestYear || 2024}`;
});

regionSidoEl.addEventListener('change', () => {
  fillRegionDetailOptions(regionCategoryCache, regionSidoEl.value);
});

document.getElementById('search').addEventListener('click', async () => {
  try {
    await searchStats();
  } catch (e) {
    setFriendlyError('오류', e);
    tbodyEl.innerHTML = '';
    drawEmptyChart('재해자수 차트');
  }
});

document.getElementById('reset-filters').addEventListener('click', async () => {
  try {
    const meta = sourceMeta.find((s) => s.key === sourceEl.value);
    clearAllConditionValues();
    if (meta) applySourceMode(meta.type);
    await searchStats();
  } catch (e) {
    setFriendlyError('오류', e);
  }
});

document.getElementById('refresh').addEventListener('click', async () => {
  try {
    await loadSources();
    await searchStats();
  } catch (e) {
    setFriendlyError('오류', e);
  }
});

document.getElementById('trend').addEventListener('click', async () => {
  try {
    await loadTrend();
  } catch (e) {
    setFriendlyError('오류', e);
  }
});

document.getElementById('download').addEventListener('click', exportCsv);

(async function init() {
  try {
    await loadSources();
    await searchStats();
  } catch (e) {
    setFriendlyError('초기화 오류', e);
  }
})();

window.addEventListener('resize', () => {
  if (!lastChartPayload) return;
  if (lastChartPayload.mode === 'type') {
    drawChartByDataType(lastChartPayload.result);
    return;
  }
  if (lastChartPayload.mode === 'trend') {
    drawLineChart(lastChartPayload.points, lastChartPayload.title);
  }
});
