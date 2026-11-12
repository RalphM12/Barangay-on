# Liquid glass skin

| File | What it styles | Loaded by |
|------|----------------|-----------|
| `css/glass.src.css` → `css/glass.css` | all dashboards + inner pages (admin, staff, captain, resident) | `shell_head()` in `includes/layout.php` |
| `js/glass.js` | specular light, ripple, staggered entrances, sidebar lens, segmented thumb, count-up, theme cross-fade | `shell_script()` |
| `css/glass-public.css` + `js/glass-public.js` | home, login, register (plain CSS, no build step) | `index.php`, `login.php`, `register.php` |

`glass.src.css` is written with CSS nesting; `glass.css` is the flattened build the browser loads.
After editing the source, rebuild it:

    npx lightningcss-cli --targets "chrome 100, safari 15" assets/css/glass.src.css -o assets/css/glass.css

All colours / blur / shadow strengths are tokens at the top of each stylesheet (`--g-bg`, `--blur`, `--accent` ...).
Motion respects `prefers-reduced-motion`; the glass falls back to solid surfaces for
`prefers-reduced-transparency` and browsers without `backdrop-filter`.
