# MarkDays

MarkDays is a lightweight, client-side calendar tracker. It uses vanilla JavaScript, HTML, CSS, and IndexedDB; there is no backend, build step, package manager, or runtime dependency.

## Run locally

Service workers require HTTPS or `localhost`; opening `index.html` through a `file://` URL will not enable offline support. Serve this directory from a local development server, for example:

```sh
python -m http.server 8000
```

Then visit `http://localhost:8000`. The app shell is cached on its first successful service-worker installation. IndexedDB data is held separately from the cache and remains on the device/browser profile.

## Deploy to GitHub Pages

Publish the project directory as a static site. All app links are relative, so it can be hosted at a project path such as `https://username.github.io/MarkDays/`. Use HTTPS hosting to enable the service worker and installable PWA behavior.

## Track and back up data

- The first launch creates **My Calendar**. Use **New**, the rename button, and the delete button to manage independent calendars.
- Tap a day to toggle ✓. Long-press on touch devices or right-click on desktop to pick another symbol or remove a mark.
- Export CSV regularly. MarkDays stores data only in this browser; clearing browser data, changing browser profiles, or losing the device can remove it. IndexedDB is not cloud backup.
- Import accepts UTF-8 CSV with `Calendar,Date,Symbol,Note` columns. It validates the complete file before previewing.
- **Merge** preserves current data, matches a calendar by name only if that name identifies exactly one current calendar, and lets you choose whether imported marks replace date conflicts. If legacy data contains duplicate names, the import creates a separately named `(... imported)` calendar rather than guessing which one to change. **Replace all data** clears current calendars only after explicit confirmation.
- Notes from an imported CSV are preserved and re-exported. The v1 interface does not yet provide note editing.

## Offline and icons

The service worker caches the application shell; user data remains in IndexedDB. Increment `CACHE_NAME` in `service-worker.js` when changing cached application assets. The icon is supplied as SVG, which is supported by modern browsers. Some platform install prompts prefer 192×192 and 512×512 PNG icons; PNGs can be generated from `icons/icon.svg` if required by a target store or device.

## Known limitations

- Data is local to a browser and device; there is no synchronization or account recovery.
- Notes can be imported/exported but cannot currently be edited in the app.
- Calendar names must be unique (exact match) so CSV backups can restore calendars without ambiguity.
