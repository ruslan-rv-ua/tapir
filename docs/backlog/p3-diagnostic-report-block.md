---
slug: diagnostic-report-block
title: "Звіт про проблему збирається вручну: збірку Windows і версію WebView2 взяти нізвідки"
priority: P3
type: idea
status: draft
effort: S
kind: feature
target: 0.3.0
updated: 2026-09-02
a11y: true
depends_on: [about-app-info]
blocks: []
touches:
  - src-tauri/src/commands/app_commands.rs
  - src/components/settings/GeneralTab.tsx
  - src/i18n/messages/uk.json
  - src/i18n/messages/en.json
  - docs/help/uk/troubleshooting.md
  - docs/help/en/troubleshooting.md
gates: [pnpm test, pnpm vite:build, cargo test]
notes:
  - "Винесено з grilling about-app-info 2026-09-02 (Q5): той запис S у 0.1.0, а тут потрібна ще одна команда в Rust."
---

# Звіт про проблему збирається вручну: збірку Windows і версію WebView2 взяти нізвідки

> **Контекст:** хвіст [about-app-info](done/p1-about-app-info.md). Той запис дає версію й
> адресу; цей — решту того, що питають у звіті про проблему, і спосіб віддати все
> одним рухом.

## Опис

Після версії у звіті про проблему зазвичай питають збірку Windows і версію WebView2:
від останньої залежить поведінка скрінрідера, тож для вад доступності вона важить не
менше за версію Tapir. Сьогодні користувач має шукати обидві сам, поза застосунком.

Ідея: у секції «Про програму» (вкладка **Загальні**) під версією показати рядки
«Windows» і «WebView2» і додати кнопку «Скопіювати відомості для звіту», яка кладе в
буфер один блок — версія Tapir, збірка Windows, версія WebView2 — щоб користувач вставив
його в issue без ручного переписування.

Чому не в `about-app-info`: збирання версії WebView2 і збірки Windows тягне окрему
команду в Rust (версія ОС плюс запит до WebView2 Runtime), а той запис — S і стоїть
у 0.1.0.

## Відкриті питання

- Чи показувати рядки видимо, чи лише копіювати блоком. Видимий носій факту потрібен
  за [ADR про видимий носій](../decisions/2026-08-31-visible-carrier-for-announced-facts.md),
  якщо копіювання озвучується як «скопійовано: версія…».
- Звідки брати версію WebView2: `tauri::webview` дає її не напряму; кандидати —
  `GetAvailableCoreWebView2BrowserVersionString` або ключ реєстру клієнта EdgeUpdate.
- Чи додавати до блоку активну мову й тему — вони впливають на репродукцію вад
  інтерфейсу, але подовжують блок.

## Критерії готовності

- [ ] Уточнити після рішень вище
- [ ] `docs/help/{uk,en}/troubleshooting.md`: ескалаційна позиція згадує кнопку
      копіювання замість переліку, що назвати вручну; `en` ≤ 1000 слів
- [ ] NVDA-чекліст: копіювання підтверджується озвученням, рядки читаються в режимі огляду

## Документи

- [about-app-info](done/p1-about-app-info.md) — батьківський запис, дає секцію й команду
  версії, яку цей запис розширює
- [help-troubleshooting](done/p1-help-troubleshooting.md) — ескалаційна позиція довідки
