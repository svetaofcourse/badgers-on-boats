# Badgers on Boats

A small trip-planning website for collecting guest details, ride coordination, boat matching, food notes, overnight plans, and estimated shared costs.

## Deploy

This app is ready for Render.

Required environment variable:

```text
ADMIN_PIN=your-private-admin-pin
```

Persistent disk:

```text
Mount path: /app/data
Size: 1 GB
```

The app stores signups in `/app/data/state.json`.
