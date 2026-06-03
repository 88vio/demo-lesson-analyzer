import pandas as pd
from datetime import date, datetime
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(BASE, "data", "lessons.csv")
REPORTS_DIR = os.path.join(BASE, "reports")

RESULTS = ['продано', 'отказ', 'follow-up']


def load():
    df = pd.read_csv(DATA_PATH, sep=';')
    df['date'] = pd.to_datetime(df['date'], errors='coerce')
    df['followup_date'] = pd.to_datetime(df['followup_date'], errors='coerce')
    return df


def result_table(df, group_col):
    tbl = df.groupby(group_col)['result'].value_counts().unstack(fill_value=0)
    for r in RESULTS:
        if r not in tbl.columns:
            tbl[r] = 0
    tbl = tbl[[c for c in RESULTS if c in tbl.columns]]
    tbl['всего'] = tbl.sum(axis=1)
    tbl['конверсия%'] = (tbl.get('продано', 0) / tbl['всего'] * 100).round(1)
    return tbl.sort_values('всего', ascending=False)


def main():
    df = load()
    n = len(df)
    sold = (df['result'] == 'продано').sum()
    rate = round(sold / n * 100, 1) if n else 0

    today = pd.Timestamp(date.today())

    overdue = df[
        (df['result'] == 'follow-up') &
        df['followup_date'].notna() &
        (df['followup_date'] < today)
    ][['child_name', 'parent_name', 'followup_date', 'objection_category', 'comment']]

    active = df[
        (df['result'] == 'follow-up') &
        (df['followup_date'].isna() | (df['followup_date'] >= today))
    ][['child_name', 'parent_name', 'followup_date', 'objection_category']]

    lines = [
        "# Отчёт по демо-урокам",
        f"Сформирован: {datetime.today().strftime('%Y-%m-%d')}  ",
        f"Уроков в базе: **{n}** | Продано: **{sold}** | Конверсия: **{rate}%**",
        "",
        "## По категории возражения",
        "",
        result_table(df, 'objection_category').to_markdown(),
        "",
        "## Влияние присутствия ЛПР",
        "",
        result_table(df, 'lpr_present').to_markdown(),
        "",
        "## Средние оценки по итогу урока",
        "",
        df.groupby('result')[['child_engagement', 'parent_interest']].mean().round(1).to_markdown(),
        "",
    ]

    if not overdue.empty:
        lines += [
            f"## Просроченные follow-up ({len(overdue)}) — нужно связаться сейчас",
            "",
            overdue.to_markdown(index=False),
            "",
        ]

    if not active.empty:
        lines += [
            f"## Активные follow-up ({len(active)})",
            "",
            active.to_markdown(index=False),
            "",
        ]

    report = "\n".join(lines)
    print(report)

    os.makedirs(REPORTS_DIR, exist_ok=True)
    fname = os.path.join(REPORTS_DIR, f"{datetime.today().strftime('%Y-%m-%d')}_отчёт.md")
    with open(fname, 'w', encoding='utf-8') as f:
        f.write(report)
    print(f"\nСохранено: {fname}")


if __name__ == "__main__":
    main()
