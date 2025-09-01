# ID Mapping Corrections

This document explains how to use the ID mapping correction mechanism to fix incorrect mappings in the anime database.

## Overview

The ID mapping correction system allows you to manually fix incorrect ID mappings when the source data from anime-lists is wrong. This is particularly useful for:

- Fixing wrong IMDB IDs
- Correcting TVDB ID mappings
- Updating TMDB ID references
- Fixing any other ID mapping issues

## How It Works

1. **Corrections are stored** in `addon/data/id-mapping-corrections.json`
2. **Corrections are applied** when the ID mapper loads data
3. **Corrections take precedence** over the source data
4. **Corrections persist** across updates to the main anime-lists

## Correction Format

Each correction is a JSON object with the following fields:

```json
{
  "type": "mal",                    // Source ID type (ALWAYS "mal" - MAL IDs are unique)
  "sourceId": "12345",              // The MAL ID that needs correction
  "correctedField": "imdb_id",      // The field to correct (mal_id, themoviedb_id, thetvdb_id, imdb_id, kitsu_id, anidb_id, anilist_id)
  "correctedId": "tt1234567",       // The correct ID value
  "reason": "MAL has wrong IMDB ID", // Optional reason for the correction
  "createdAt": "2024-01-01T00:00:00.000Z" // Timestamp when correction was added
}
```

**Important**: Only MAL IDs are used as the source for corrections because MAL IDs are unique identifiers. Other IDs (TMDB, TVDB, etc.) can have duplicates or conflicts, but MAL IDs are always unique.

## API Endpoints

### Get All Corrections
```bash
GET /api/corrections
Headers: X-Admin-Key: your_admin_key
```

### Add a Correction
```bash
POST /api/corrections/add
Headers: X-Admin-Key: your_admin_key
Content-Type: application/json

{
  "type": "mal",
  "sourceId": "12345",
  "correctedField": "imdb_id",
  "correctedId": "tt1234567",
  "reason": "MAL has wrong IMDB ID"
}
```

### Remove a Correction
```bash
POST /api/corrections/remove
Headers: X-Admin-Key: your_admin_key
Content-Type: application/json

{
  "type": "mal",
  "sourceId": "12345",
  "correctedField": "imdb_id"
}
```

## Examples

### Fix Wrong IMDB ID
If MAL ID 12345 has the wrong IMDB ID, you can correct it:

```json
{
  "type": "mal",
  "sourceId": "12345",
  "correctedField": "imdb_id",
  "correctedId": "tt1234567",
  "reason": "MAL has wrong IMDB ID, corrected to actual IMDB ID"
}
```

### Fix Wrong TVDB ID
If MAL ID 11111 has the wrong TVDB ID, you can correct it:

```json
{
  "type": "mal",
  "sourceId": "11111",
  "correctedField": "thetvdb_id",
  "correctedId": "98765",
  "reason": "MAL has wrong TVDB ID, corrected to actual TVDB ID"
}
```

### Fix Wrong TMDB ID
If MAL ID 11111 has the wrong TMDB ID, you can correct it:

```json
{
  "type": "mal",
  "sourceId": "11111",
  "correctedField": "themoviedb_id",
  "correctedId": "22222",
  "reason": "MAL has wrong TMDB ID, corrected to actual TMDB ID"
}
```

## How Corrections Are Applied

1. When the ID mapper loads data, it reads the corrections file
2. For each mapping item, it checks if there are any applicable corrections
3. If a correction exists, it applies the correction to the mapping item
4. The corrected mapping is then used for all ID resolution

## Important Notes

- **Corrections are applied in memory** when the mapper loads
- **Corrections persist** even when the main anime-lists are updated
- **Corrections take precedence** over the source data
- **Multiple corrections** can be applied to the same source ID
- **Corrections are validated** before being applied

## Troubleshooting

### Correction Not Applied
1. Check that the correction format is correct
2. Verify that the source ID exists in the mapping data
3. Ensure the correction file is readable
4. Check the logs for any error messages

### Correction Applied But Not Working
1. Clear the cache to force reload of mappings
2. Restart the addon to reload corrections
3. Check that the corrected ID is valid
4. Verify that the correction is being applied correctly

## Security

- All correction endpoints require admin authentication
- Use the `X-Admin-Key` header with your `ADMIN_KEY` environment variable
- Corrections are stored locally and not shared with other instances
