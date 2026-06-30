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
- SUPABASE_URL
- SUPABASE_KEY

> Use the Supabase project URL and a server-side key. If you are not using row-level security, the anon key will work, but a service role key is safer for full backend writes.

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

## 7. Supabase schema

Create these tables in your Supabase project before running the app:

```sql
create table accounts (
  user_id uuid primary key,
  username text unique not null,
  display_name text not null,
  password_hash text not null,
  role text not null default 'public'
);

create table users (
  user_id uuid primary key,
  name text not null,
  total_points int not null default 0,
  report_count int not null default 0,
  critical_count int not null default 0
);

create table reports (
  id uuid primary key,
  title text not null,
  description text not null,
  original_title text,
  lat double precision not null,
  lng double precision not null,
  category text,
  severity text,
  department text,
  ai_summary text,
  priority_tag text,
  estimated_repair_hours text,
  ai_confidence text,
  emoji text,
  is_duplicate_risk boolean,
  offline_triage boolean,
  status text not null,
  timeline jsonb,
  upvotes int not null default 0,
  upvoted_by jsonb,
  points_awarded int,
  reporter_id uuid,
  reporter_name text,
  created_at timestamptz not null default now(),
  image text
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  type text not null,
  report_id uuid,
  created_at timestamptz not null default now()
);
```
