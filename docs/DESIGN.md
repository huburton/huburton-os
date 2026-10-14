# plateforme — design context

## Identity
Editorial Dev Brutalism. Cross between print newspaper (NY Times, Pentagram editorial) and dev terminal aesthetic (Vim, btop, terminal logs).

## Palette (light default)
- Background: #F2EDE3 (paper), #E8E1D2 (cards), #FAF6EC (hover)
- Foreground: #0A0A0A (text), #4A4A48 (muted), #8A8A87 (faint)
- Borders: #0A0A0A (brutal), #C9C2B0 (subtle separators)
- Accents (semantic): #C0382B red, #2A6F47 green, #D67537 orange, #D4A52A yellow, #26517B blue, #6B4796 violet

## Typography
- Display: Fraunces Variable 900 weight, opsz=144, letter-spacing -2.5%
- Body: JetBrains Mono 400/700, font-feature tnum+ss01 always
- Sizes: display 96-128px, h2 56px, h3 28px, body 14px, small 12px, meta 11px, tag 10px uppercase
- Use Fraunces serif for display + JetBrains Mono everywhere else. NO sans-serif.

## Layout principles
- Brutal borders (1.5px solid black), no rounded corners (except 2px max if needed)
- 8px base spacing scale strictly
- Headers UPPERCASE letter-spacing 0.12em-0.20em
- Counters in square brackets `[ 05 ]`
- ASCII bars for graphs (`▁▂▃▄▅▆▇█`) not lib charts
- No gradients, no shadows, no glassmorphism EXCEPT navbar (intentional micro-touch)

## Forbidden
- Catppuccin colors
- Emoji in product copy
- Tailwind round corners (rounded-md, rounded-xl, etc.)
- Default sans-serif system fonts
- Spinners (use skeleton lines `█████` if loading)
- Modals (always inline editing)

## Animation budget
- Hover background swap 120ms ease-snap
- Drag feedback 0.5 opacity + dashed border
- Page transitions: NONE for v0.1
