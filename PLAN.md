# Sonos UI — Build Plan
_Last updated: 2026-05-16_

## Goal
Daily-use Sonos controller for Indy Hall staff. Deployed at `sonos.indyhall.org` (Tailscale: `100.88.157.74:2650`). PWA-installable on iOS/Android.

---

## Completed

- [x] SQLite state layer (`server/db.ts`) — instant reads, background pollers, restart-persistent
- [x] PWA manifest + apple-touch-icon (iOS installable)
- [x] Album art CORS proxy (`/api/art`)
- [x] UPnP GENA subscriptions → SSE real-time volume push
- [x] Per-room volume/mute via UPnP SOAP (no CLI round-trip)
- [x] Queue tab with album art (50-track deep)
- [x] Group master volume slider (proportional scaling)
- [x] Server refactor: UPnP extracted to `server/upnp.ts`
- [x] Favorites fixed: adds `--name Controller` flag, normalizes nested CLI response to flat array (34 favorites now load with art)
- [x] Scenes removed entirely (no scenes exist; dead tab removed)
- [x] Now Playing idle state: "Open Favorites" CTA when nothing is playing

---

## Needs Live Testing
_(requires something to be actively playing)_

- [ ] Now Playing display: track title, artist, album, album art render correctly
- [ ] Transport controls: play/pause/next/prev actually work
- [ ] SSE volume push: volume change in Sonos app reflects in UI within ~1s without refresh
- [ ] Open Favorite: tapping a favorite actually starts it in the active room

---

## Needs Group Testing
_(requires 2+ rooms grouped)_

- [ ] Group master volume slider: proportional scaling works across rooms
- [ ] Party mode: joins all rooms to Controller
- [ ] Dissolve: breaks group apart (confirm-tap guard works)
- [ ] Join/unjoin individual rooms

---

## Known Decisions
- **Scope:** Daily use for staff — polish matters
- **Scenes:** Removed (no scenes saved in the Sonos system)
- **Storage:** SQLite (`server/state.db`) — DB is source of truth. API reads are instant (sub-ms). Background pollers keep DB current: rooms every 60s, favorites every 5min, now_playing every 10s + live via watch stream.
- **Architecture:** Bun server on Mac Mini → Sonos CLI + UPnP direct. SSE for browser push. First load is instant after first-ever cold start.
