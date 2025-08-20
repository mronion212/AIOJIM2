# <img src="https://raw.githubusercontent.com/cedya77/aiometadata/dev/public/logo.png" alt="AIOMetadata Logo" width="48" height="48" style="vertical-align:middle;"> AIOMetadata: The Ultimate Stremio Metadata Addon

**AIOMetadata** is a next-generation, power-user-focused metadata addon for [Stremio](https://www.stremio.com/). It aggregates and enriches movie, series, and anime metadata from multiple sources (TMDB, TVDB, MyAnimeList, AniList, IMDb, TVmaze, Fanart.tv, MDBList, and more), giving you full control over catalog sources, artwork, and search.

---

## 🚀 Features

- **Multi-Source Metadata**: Choose your preferred provider for each type (movie, series, anime) — TMDB, TVDB, MAL, AniList, IMDb, TVmaze, etc.
- **Rich Artwork**: High-quality posters, backgrounds, and logos from TMDB, TVDB, Fanart.tv, AniList, and more, with language-aware selection and fallback.
- **Anime Power**: Deep anime support with MAL, AniList, Kitsu, AniDB, and TVDB/IMDb mapping, including studio, genre, decade, and schedule catalogs.
- **Custom Catalogs**: Add, reorder, and delete catalogs (including MDBList, streaming, and custom lists) in a sortable UI.
- **Streaming Catalogs**: Integrate streaming provider catalogs (Netflix, Disney+, etc.) with region and monetization filters.
- **Dynamic Search**: Enable/disable search engines per type (movie, series, anime) and use AI-powered search (Gemini) if desired.
- **User Config & Passwords**: Secure, per-user configuration with password and optional addon password protection. Trusted UUIDs for seamless re-login.
- **Global & Self-Healing Caching**: Redis-backed, ETag-aware, and self-healing cache for fast, reliable metadata and catalog responses.
- **Advanced ID Mapping**: Robust mapping between all major ID systems (MAL, TMDB, TVDB, IMDb, AniList, AniDB, Kitsu, TVmaze).
- **Modern UI**: Intuitive React/Next.js configuration interface with drag-and-drop, tooltips, and instant feedback.

---

## 🛠️ Installation

### 1. Hosted Instance

Visit your hosted instance's `/configure` page.  
Configure your catalogs, providers, and preferences.  
Save your config and install the generated Stremio addon URL.

### 2. Self-Hosting (Docker)

```bash
git clone https://github.com/cedya77/aiometadata.git
cd aiometadata
cp .env.example .env   # Edit with your API keys and settings
docker compose up -d
```

Or, standalone:

```bash
docker run -d \
  --name aiometadata \
  -p 1337:1337 \
  -e TMDB_API=your_tmdb_key \
  -e TVDB_API_KEY=your_tvdb_key \
  -e FANART_API_KEY=your_fanart_key \
  -e HOST_NAME=https://your-host:1337 \
  -e REDIS_URL=redis://your_redis:6379 \
  cedya77/aiometadata:latest
```

---

## ⚙️ Configuration

- **Catalogs**: Add, remove, and reorder catalogs (TMDB, TVDB, MAL, AniList, MDBList, streaming, etc.).
- **Providers**: Set preferred metadata and artwork provider for each type.
- **Search**: Enable/disable search engines per type; enable AI search with Gemini API key.
- **Integrations**: Connect MDBList and more for personal lists.
- **Security**: Set user and (optional) addon password for config protection.

All configuration is managed via the `/configure` UI and saved per-user (UUID) in the database.

---

## 🔌 API & Endpoints

- `/stremio/:userUUID/:compressedConfig/manifest.json` — Stremio manifest (per-user config)
- `/api/config/save` — Save user config (POST)
- `/api/config/load/:userUUID` — Load user config (POST)
- `/api/config/update/:userUUID` — Update user config (PUT)
- `/api/config/is-trusted/:uuid` — Check if UUID is trusted (GET)
- `/api/cache/*` — Cache health and admin endpoints
- `/poster/:type/:id` — Poster proxy with fallback and RPDB support
- `/resize-image` — Image resize proxy
- `/api/image/blur` — Image blur proxy

---

## 🧩 Supported Providers

- **Movies/Series**: TMDB, TVDB, IMDb, TVmaze
- **Anime**: MyAnimeList (MAL), AniList, Kitsu, AniDB, TVDB, IMDb
- **Artwork**: TMDB, TVDB, Fanart.tv, AniList, RPDB
- **Personal Lists**: MDBList, MAL, AniList
- **Streaming**: Netflix, Disney+, Amazon, and more (via TMDB watch providers)

---

## 🧑‍💻 Development

```bash
# Backend
npm run dev:server

# Frontend
npm run dev
```

- Edit `/addon` for backend, `/configure` for frontend.
- Uses Redis for caching, SQLite/PostgreSQL for config storage.

---

## 📄 License

Apache 2.0 — see [LICENSE](LICENSE).

---

## 🙏 Credits

- [Stremio](https://www.stremio.com/)
- [TMDB](https://www.themoviedb.org/)
- [TVDB](https://thetvdb.com/)
- [MyAnimeList](https://myanimelist.net/)
- [AniList](https://anilist.co/)
- [Fanart.tv](https://fanart.tv/)
- [MDBList](https://mdblist.com/)
- [RPDB](https://rpdb.net/)

**Special thanks to [MrCanelas](https://github.com/mrcanelas), the original developer of the TMDB Addon for Stremio, whose work inspired and laid the groundwork for this project.**

---

## ⚠️ Disclaimer

This addon aggregates metadata from third-party sources. Data accuracy and availability are not guaranteed.



 
