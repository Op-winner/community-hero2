# Vercel deployment guide for Community Hero

## 1. Prepare the project

- Make sure the project folder contains:
  - backend/server.js
  - backend/package.json
  - backend/vercel.json
  - frontend/ folder

## 2. Create a Vercel project

1. Go to https://vercel.com and sign in.
2. Click New Project.
3. Import this repository.
4. In the project settings, set the Root Directory to backend.
5. Vercel will detect the Node app automatically.

## 3. Add environment variables

In Vercel Project Settings > Environment Variables, add:

- GEMINI_API_KEY (optional, but recommended)
- ADMIN_SIGNUP_CODE (optional, default is MAYOR2026)

## 4. Update the frontend base URL

Before deploying, replace the placeholder in:

- frontend/app.js
- frontend/mayor.js

with your real Vercel domain, for example:

https://community-hero.vercel.app

## 5. Deploy

Click Deploy.

Once deployment finishes, open the Vercel URL.

## 6. Important note about the frontend

The current frontend is static HTML/CSS/JS and is not being built by Vercel as a separate app.
For the simplest deployment, keep the frontend files inside the backend deployment as static assets served by Express.

If you later want a separate frontend deployment, I can help split the app into:
- frontend repo/app for Vercel static hosting
- backend API on Vercel Functions
