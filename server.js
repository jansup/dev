const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_API_KEY = '1be0054ad97dae05bf9877a8de89fb3f7f019f3e898eee30b8e94528b038cbc3';
let runtimeApiKeys = String(process.env.DATA_GO_KR_API_KEYS || process.env.DATA_GO_KR_API_KEY || DEFAULT_API_KEY)
  .split(/[,\n]/)
  .map((x) => x.trim())
  .filter(Boolean);
if (!runtimeApiKeys.length) runtimeApiKeys = [DEFAULT_API_KEY];
let keyCursor = 0;

const SOURCE_CONFIG = {
  region: {
    label: '지역별(고용노동부)',
    namespace: '15002274/v1',
    type: 'region',
    sourceUrl: 'https://www.data.go.kr/data/15002274/fileData.do',
  },
  sex: {
    label: '성별(KOSHA)',
    namespace: '15064479/v1',
    type: 'sex',
    sourceUrl: 'https://www.data.go.kr/data/15064479/fileData.do',
  },
  age: {
    label: '연령별(KOSHA)',
    namespace: '15064486/v1',
    type: 'age',
    sourceUrl: 'https://www.data.go.kr/data/15064486/fileData.do',
  },
  industry: {
    label: '업종별(KOSHA)',
    namespace: '15064493/v1',
    type: 'industry',
    sourceUrl: 'https://www.data.go.kr/data/15064493/fileData.do',
  },
};

const specCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function normalizeNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/,/g, '').trim();
  if (!cleaned) return 0;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function extractBestYear(text) {
  const match = String(text || '').match(/(20\d{2})/);
  return match ? Number(match[1]) : 0;
}

function listYearCandidatesFromRow(row) {
  const years = new Set();
  for (const key of Object.keys(row || {})) {
    const m = key.match(/(20\d{2})/);
    if (m) years.add(Number(m[1]));
  }
  return [...years].sort((a, b) => a - b);
}

function pickYearField(row, year, suffixRegex) {
  const target = String(year);
  const keys = Object.keys(row || {});
  return keys.find((k) => k.includes(target) && suffixRegex.test(k));
}

function uniqSorted(arr) {
  return [...new Set((arr || []).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'ko'));
}

async function getSpec(namespace) {
  const now = Date.now();
  const cached = specCache.get(namespace);
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.spec;

  const res = await fetch(`https://infuser.odcloud.kr/oas/docs?namespace=${namespace}`);
  if (!res.ok) {
    throw new Error(`명세 조회 실패 (${res.status})`);
  }
  const text = await res.text();
  const spec = JSON.parse(text);
  specCache.set(namespace, { ts: now, spec });
  return spec;
}

function pickLatestPath(spec) {
  let best = null;
  for (const [pathKey, val] of Object.entries(spec.paths || {})) {
    const summary = val?.get?.summary || '';
    const year = extractBestYear(summary);
    if (!best || year > best.year) {
      best = { pathKey, year, summary };
    }
  }
  if (!best) throw new Error('최신 경로를 찾지 못했습니다.');
  return best;
}

async function fetchAllData(pathKey) {
  if (!runtimeApiKeys.length) {
    throw new Error('서비스키가 없습니다.');
  }

  const all = [];
  const perPage = 100;
  let page = 1;

  while (true) {
    const url = new URL(`https://api.odcloud.kr/api${pathKey}`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('perPage', String(perPage));
    url.searchParams.set('returnType', 'JSON');

    let json = null;
    let success = false;
    let lastErr = '';

    for (let i = 0; i < runtimeApiKeys.length; i += 1) {
      const key = runtimeApiKeys[(keyCursor + i) % runtimeApiKeys.length];
      url.searchParams.set('serviceKey', key);

      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text();
        lastErr = `데이터 조회 실패 (${res.status}): ${body.slice(0, 200)}`;
        continue;
      }

      json = await res.json();
      success = true;
      keyCursor = (keyCursor + i + 1) % runtimeApiKeys.length;
      break;
    }

    if (!success || !json) {
      throw new Error(lastErr || '등록된 모든 서비스키로 조회에 실패했습니다.');
    }

    const rows = Array.isArray(json?.data) ? json.data : [];
    all.push(...rows);

    if (rows.length < perPage) break;
    page += 1;
    if (page > 200) break;
  }

  return all;
}

function normalizeRows(type, rows, requestedYear) {
  const first = rows[0] || {};
  const years = listYearCandidatesFromRow(first);
  const latestYear = years.length ? years[years.length - 1] : null;
  const year = requestedYear || latestYear;

  if (type === 'industry') {
    const normalized = rows.map((r) => {
      const metaKeys = new Set(['대업종', '중업종', '규모']);
      let total = 0;
      for (const [k, v] of Object.entries(r)) {
        if (!metaKeys.has(k)) {
          total += normalizeNumber(v);
        }
      }
      return {
        majorIndustry: r['대업종'] || '',
        minorIndustry: r['중업종'] || '',
        size: r['규모'] || '',
        casualties: total,
      };
    });
    return { normalized, availableYears: years, selectedYear: year };
  }

  const casualtyField = pickYearField(first, year, /재해자수|^20\d{2}$/);
  const deathField = pickYearField(first, year, /사망자수/);
  const categoryField = Object.keys(first).includes('구분') ? '구분' : (Object.keys(first)[0] || '구분');

  const normalized = rows.map((r) => ({
    category: r[categoryField] || '',
    casualties: normalizeNumber(r[casualtyField]),
    deaths: deathField ? normalizeNumber(r[deathField]) : undefined,
  }));

  return { normalized, availableYears: years, selectedYear: year };
}

function filterRows(type, rows, q, query) {
  const keyword = String(q || '').trim().toLowerCase();

  return rows.filter((row) => {
    if (type === 'industry') {
      const major = String(query.major || '').toLowerCase();
      const minor = String(query.minor || '').toLowerCase();
      const size = String(query.size || '').toLowerCase();

      if (major && !String(row.majorIndustry).toLowerCase().includes(major)) return false;
      if (minor && !String(row.minorIndustry).toLowerCase().includes(minor)) return false;
      if (size && !String(row.size).toLowerCase().includes(size)) return false;

      if (keyword) {
        const haystack = `${row.majorIndustry} ${row.minorIndustry} ${row.size}`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    }

    if (type === 'sex' && query.sex && String(row.category) !== String(query.sex)) return false;
    if (type === 'age' && query.age && !String(row.category).includes(String(query.age))) return false;
    if (type === 'region' && query.region && !String(row.category).includes(String(query.region))) return false;

    if (keyword && !String(row.category).toLowerCase().includes(keyword)) return false;
    return true;
  });
}

function buildFilterOptions(type, normalized) {
  if (type === 'industry') {
    return {
      majorOptions: uniqSorted(normalized.map((x) => x.majorIndustry)),
      minorOptions: uniqSorted(normalized.map((x) => x.minorIndustry)),
      sizeOptions: uniqSorted(normalized.map((x) => x.size)),
    };
  }
  return {
    categoryOptions: uniqSorted(normalized.map((x) => x.category)),
  };
}

function buildTopChart(type, filtered) {
  if (type === 'industry') {
    return [...filtered]
      .sort((a, b) => b.casualties - a.casualties)
      .slice(0, 10)
      .map((x) => ({ label: `${x.majorIndustry}/${x.minorIndustry}`, value: x.casualties }));
  }

  return [...filtered]
    .sort((a, b) => b.casualties - a.casualties)
    .slice(0, 10)
    .map((x) => ({ label: x.category, value: x.casualties }));
}

function buildSeriesFromRow(row) {
  const years = listYearCandidatesFromRow(row);
  return years.map((year) => {
    const casualtyField = pickYearField(row, year, /재해자수|^20\d{2}$/);
    const deathField = pickYearField(row, year, /사망자수/);
    return {
      year,
      casualties: normalizeNumber(row[casualtyField]),
      deaths: deathField ? normalizeNumber(row[deathField]) : undefined,
    };
  });
}

app.get('/api/sources', async (_req, res) => {
  try {
    const list = await Promise.all(
      Object.entries(SOURCE_CONFIG).map(async ([key, cfg]) => {
        const spec = await getSpec(cfg.namespace);
        const latest = pickLatestPath(spec);
        return {
          key,
          label: cfg.label,
          type: cfg.type,
          namespace: cfg.namespace,
          latestYear: latest.year,
          latestSummary: latest.summary,
          sourceUrl: cfg.sourceUrl,
        };
      })
    );
    res.json({ updatedAt: new Date().toISOString(), sources: list });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const source = String(req.query.source || '').trim();
    const cfg = SOURCE_CONFIG[source];
    if (!cfg) {
      return res.status(400).json({ error: 'source는 region|sex|age|industry 중 하나여야 합니다.' });
    }

    const requestedYear = req.query.year ? Number(req.query.year) : null;
    const q = req.query.q || '';

    const spec = await getSpec(cfg.namespace);
    const latest = pickLatestPath(spec);
    const rawRows = await fetchAllData(latest.pathKey);

    const { normalized, availableYears, selectedYear } = normalizeRows(cfg.type, rawRows, requestedYear);
    const filtered = filterRows(cfg.type, normalized, q, req.query);

    res.json({
      source,
      type: cfg.type,
      sourceLabel: cfg.label,
      fetchedAt: new Date().toISOString(),
      latestPath: latest.pathKey,
      latestSummary: latest.summary,
      latestYear: latest.year,
      selectedYear,
      availableYears,
      totalCount: normalized.length,
      filteredCount: filtered.length,
      filterOptions: buildFilterOptions(cfg.type, normalized),
      chartData: buildTopChart(cfg.type, filtered),
      data: filtered,
      sourceUrl: cfg.sourceUrl,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/trend', async (req, res) => {
  try {
    const source = String(req.query.source || '').trim();
    const cfg = SOURCE_CONFIG[source];
    if (!cfg) {
      return res.status(400).json({ error: 'source는 region|sex|age|industry 중 하나여야 합니다.' });
    }
    if (cfg.type === 'industry') {
      return res.status(400).json({ error: '업종별 데이터는 단일 연도 집계로 추이 조회를 지원하지 않습니다.' });
    }

    const categoryQuery = String(req.query.category || '').trim();
    const spec = await getSpec(cfg.namespace);
    const latest = pickLatestPath(spec);
    const rawRows = await fetchAllData(latest.pathKey);

    const first = rawRows[0] || {};
    const categoryField = Object.keys(first).includes('구분') ? '구분' : (Object.keys(first)[0] || '구분');

    let row = rawRows[0] || null;
    if (categoryQuery) {
      const exact = rawRows.find((x) => String(x[categoryField]) === categoryQuery);
      const partial = rawRows.find((x) => String(x[categoryField]).includes(categoryQuery));
      row = exact || partial || row;
    }

    if (!row) {
      return res.status(404).json({ error: '추이 조회 대상 데이터를 찾지 못했습니다.' });
    }

    const category = String(row[categoryField] || '전체');
    const series = buildSeriesFromRow(row);

    res.json({
      source,
      type: cfg.type,
      latestSummary: latest.summary,
      category,
      series,
      fetchedAt: new Date().toISOString(),
      sourceUrl: cfg.sourceUrl,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/*any', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`산업재해 통계 검색 프로그램 실행: http://localhost:${PORT}`);
});
