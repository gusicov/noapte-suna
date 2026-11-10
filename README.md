# Noapte Sună 🍌

Hot potato în 3D pentru până la 4 prieteni, direct în browser. Pasezi o banană care ticăie; cine o ține când explodează, pierde. Pe margine stă **Bamba**, un dihor uriaș: dacă te apropii, te aleargă și te mănâncă.

- **Joacă:** https://gusicov.github.io/noapte-suna/
- Mișcare `WASD`, cameră cu mouse-ul (click pe joc), sprint `Space`, zoom cu rotița.
- Pe telefon: joystick în stânga, cameră în dreapta.

## Cum e construit

| Parte | Unde | Cost |
|---|---|---|
| Jocul (three.js, fără build) | `docs/` → GitHub Pages | 0 |
| Serverul de camere (Node + `ws`) | `server.js` → Render free | 0 |

Serverul gratuit adoarme după ~15 minute fără jucători; primul care intră așteaptă până la un minut să se trezească.

## Local

```bash
npm install
npm start
```

Apoi deschide http://localhost:3000.

## Reguli

- Banana trece la cel pe care îl atingi, dar trebuie ținută minim 0,2 s (și nu se întoarce imediat la cel care ți-a dat-o).
- Bamba: aleargă 2 s la viteza jucătorilor, apoi cu 50% mai încet, iar după 10 s se pune în fund. Scapi dacă te îndepărtezi jumătate de hartă. Stă minim 5 s până pornește după următorul.
- Ultimul rămas în viață câștigă.
