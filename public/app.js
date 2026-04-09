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

function drawBarChart(points, title) {
  const ctx = chartEl.getContext('2d');
  const w = chartEl.width;
  const h = chartEl.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#415a77';
  ctx.font = '14px sans-serif';
  ctx.fillText(title, 16, 24);

  if (!points || points.length === 0) {
    ctx.fillStyle = '#6c757d';
    ctx.fillText('차트 데이터가 없습니다.', 16, 50);
    return;
  }

  const left = 60;
  const right = w - 20;
  const top = 40;
  const bottom = h - 30;
  const maxVal = Math.max(...points.map((p) => Number(p.value || 0)), 1);
  const barAreaW = right - left;
  const barAreaH = bottom - top;
  const barW = Math.max(10, Math.floor(barAreaW / points.length) - 8);

  ctx.strokeStyle = '#d8e2eb';
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.stroke();

  points.forEach((p, i) => {
    const x = left + i * (barAreaW / points.length) + 4;
    const val = Number(p.value || 0);
    const bh = Math.max(1, (val / maxVal) * (barAreaH - 10));
    const y = bottom - bh;

    ctx.fillStyle = '#005f73';
    ctx.fillRect(x, y, barW, bh);

    ctx.fillStyle = '#0d1b2a';
    ctx.font = '10px sans-serif';
    const label = String(p.label || '').slice(0, 10);
    ctx.fillText(label, x, bottom + 12);
  });
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
    showRowsByType(first.type);
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
  drawBarChart(normalized.chartData || [], '재해자수 상위 10개');
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
  drawBarChart(points, `연도별 추이: ${json.category}`);
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
  showRowsByType(meta.type);
  yearEl.placeholder = `예: ${meta.latestYear || 2024}`;
  if (meta.type !== 'region') {
    regionSidoEl.value = '';
    fillRegionDetailOptions(regionCategoryCache, '');
  }
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
    drawBarChart([], '재해자수 상위 10개');
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
