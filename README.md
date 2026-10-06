# Dakar Life

Jeu gratuit dans le navigateur, inspiré de Lagos Life, situé à Dakar.

- `public/rue.html` + `public/rue.js` : mode **Rue**, conduite 3D en monde ouvert (Three.js) — taxis, cars rapides, Jakarta, clando, police.
- `public/vie.html` : mode **La Vie**, simulation de vie (jauges, emplois, tontine, Tabaski, délestage).
- `public/index.html` : accueil.

Site 100 % statique (offre Vercel Hobby gratuite). L'argent est partagé entre les deux modes via `localStorage`.

Développement local : `cd public && python3 -m http.server`.
