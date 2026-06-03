const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const DATA_PATH = path.join(BASE, 'data', 'lessons.csv');
const REPORTS_DIR = path.join(BASE, 'reports');

function parseCSV(content) {
    const lines = content.trim().split(/\r?\n/);
    const headers = lines[0].split(';').map(h => h.trim());
    return lines.slice(1).filter(l => l.trim()).map(line => {
        const values = line.split(';');
        const row = {};
        headers.forEach((h, i) => { row[h] = (values[i] || '').trim(); });
        return row;
    });
}

function groupBy(rows, key) {
    const map = {};
    for (const row of rows) {
        const k = row[key] || '(пусто)';
        if (!map[k]) map[k] = [];
        map[k].push(row);
    }
    return map;
}

function resultTable(rows, groupCol) {
    const results = ['продано', 'отказ', 'follow-up'];
    const grouped = groupBy(rows, groupCol);
    const tableRows = Object.entries(grouped)
        .map(([key, items]) => {
            const c = Object.fromEntries(results.map(r => [r, 0]));
            items.forEach(i => { if (results.includes(i.result)) c[i.result]++; });
            const total = items.length;
            return { key, ...c, всего: total, 'конверсия%': total ? ((c['продано'] / total) * 100).toFixed(1) : '0.0' };
        })
        .sort((a, b) => b.всего - a.всего);

    const cols = [groupCol, ...results, 'всего', 'конверсия%'];
    const header = `| ${cols.join(' | ')} |`;
    const sep    = `| ${cols.map(() => '---').join(' | ')} |`;
    const body   = tableRows.map(r => `| ${cols.map(c => c === groupCol ? r.key : r[c]).join(' | ')} |`).join('\n');
    return [header, sep, body].join('\n');
}

function avgTable(rows, groupCol, fields) {
    const grouped = groupBy(rows, groupCol);
    const cols = [groupCol, ...fields];
    const header = `| ${cols.join(' | ')} |`;
    const sep    = `| ${cols.map(() => '---').join(' | ')} |`;
    const body   = Object.entries(grouped)
        .map(([key, items]) => {
            const avgs = fields.map(f => {
                const vals = items.map(i => parseFloat(i[f])).filter(v => !isNaN(v));
                return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—';
            });
            return `| ${key} | ${avgs.join(' | ')} |`;
        }).join('\n');
    return [header, sep, body].join('\n');
}

function mdTable(rows, cols) {
    const header = `| ${cols.join(' | ')} |`;
    const sep    = `| ${cols.map(() => '---').join(' | ')} |`;
    const body   = rows.map(r => `| ${cols.map(c => r[c] || '').join(' | ')} |`).join('\n');
    return [header, sep, body].join('\n');
}

function toDate(str) {
    if (!str) return null;
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

function main() {
    const rows = parseCSV(fs.readFileSync(DATA_PATH, 'utf-8'));
    const n    = rows.length;
    const sold = rows.filter(r => r.result === 'продано').length;
    const rate = n ? ((sold / n) * 100).toFixed(1) : '0.0';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateStr = today.toISOString().slice(0, 10);

    const overdue = rows.filter(r => {
        const d = toDate(r.followup_date);
        return r.result === 'follow-up' && d && d < today;
    });
    const active = rows.filter(r => {
        const d = toDate(r.followup_date);
        return r.result === 'follow-up' && (!d || d >= today);
    });

    const lines = [
        '# Отчёт по демо-урокам',
        `Сформирован: ${dateStr}  `,
        `Уроков в базе: **${n}** | Продано: **${sold}** | Конверсия: **${rate}%**`,
        '',
        '## По категории возражения',
        '',
        resultTable(rows, 'objection_category'),
        '',
        '## Влияние присутствия ЛПР',
        '',
        resultTable(rows, 'lpr_present'),
        '',
        '## Средние оценки по итогу урока',
        '',
        avgTable(rows, 'result', ['child_engagement', 'parent_interest']),
        '',
    ];

    if (overdue.length) {
        lines.push(`## Просроченные follow-up (${overdue.length}) — нужно связаться сейчас`, '');
        lines.push(mdTable(overdue, ['child_name', 'parent_name', 'followup_date', 'objection_category', 'comment']), '');
    }
    if (active.length) {
        lines.push(`## Активные follow-up (${active.length})`, '');
        lines.push(mdTable(active, ['child_name', 'parent_name', 'followup_date', 'objection_category']), '');
    }

    const report = lines.join('\n');
    console.log(report);

    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const fname = path.join(REPORTS_DIR, `${dateStr}_отчёт.md`);
    fs.writeFileSync(fname, report, 'utf-8');
    console.log(`\nСохранено: ${fname}`);
}

main();
