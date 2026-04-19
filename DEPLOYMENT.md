# Public Deployment

This app must use public URLs for customer QR scans. LAN IPs and `localhost` will not work for customers on their own mobile internet.

## Recommended setup

- Frontend: Vercel or Netlify
- Backend: Render, Railway, or a VPS
- Database: Neon can stay as-is

## Frontend environment

Set the frontend environment variable from [frontend/.env.example](C:\Users\ashis\OneDrive\Desktop\HotelMST - Copy1\HotelMST\frontend\.env.example):

```env
REACT_APP_API_URL=https://api.example.com/api
```

If you deploy frontend and backend under the same origin with a reverse proxy, `REACT_APP_API_URL` can be omitted and the frontend will use `/api`.

## Backend environment

Set these backend variables:

```env
NODE_ENV=production
PUBLIC_FRONTEND_URL=https://app.example.com
FRONTEND_URL=https://app.example.com
CORS_ORIGINS=https://app.example.com
COOKIE_SAME_SITE=none
COOKIE_SECURE=true
DATABASE_URL=postgresql://...
SESSION_SECRET=replace_with_a_long_random_secret
```

Notes:

- `PUBLIC_FRONTEND_URL` is used for QR code links.
- `CORS_ORIGINS` supports a comma-separated list if you need multiple frontend domains.
- For separate frontend and backend domains, `COOKIE_SAME_SITE=none` and `COOKIE_SECURE=true` are required.

## Deploy flow

1. Create a Render web service from [render.yaml](/C:/Users/ashis/OneDrive/Desktop/HotelMST%20-%20Copy1/HotelMST/render.yaml).
2. Set backend env vars in Render:
   `FRONTEND_URL`, `PUBLIC_FRONTEND_URL`, `CORS_ORIGINS`, `DATABASE_URL`, SMTP values if used.
3. Confirm the backend health check works at `https://your-backend.onrender.com/api/health`.
4. Create a Vercel project for the `frontend` app using [vercel.json](/C:/Users/ashis/OneDrive/Desktop/HotelMST%20-%20Copy1/HotelMST/vercel.json).
5. In Vercel, set `REACT_APP_API_URL=https://your-backend.onrender.com/api`.
6. Set backend `PUBLIC_FRONTEND_URL=https://your-frontend.vercel.app`.
7. Restart backend.
8. Open the hotel admin tables page once to regenerate QR codes.
9. Re-download or reprint QR codes.

## Important

Old printed QR codes will still contain the old URL. Customers must scan newly generated QR codes after deployment.
