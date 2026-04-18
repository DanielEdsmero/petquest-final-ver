# 🐾 Pet Quest — Companion Chronicles (Supabase Edition)

A gamified task manager with real authentication, persistent cloud data, and an admin analytics dashboard.

---

## 1. Supabase Setup (Do This First)

### Step 1 — Create a free Supabase project
1. Go to **https://supabase.com** → click **Start your project**
2. Sign in with GitHub or email
3. Click **New Project** and fill in:
   - Project name: `pet-quest`
   - Database password: save it somewhere safe
   - Region: closest to you
4. Click **Create new project** — wait ~2 minutes ⏳

### Step 2 — Run the database schema
1. In Supabase dashboard → click **SQL Editor** in the left sidebar
2. Click **New query** (the + button)
3. Open `supabase-schema.sql` from this project folder
4. Copy ALL of it, paste into the SQL editor
5. Click the green **Run** button → you should see "Success" ✅

This creates all 5 tables, security rules, the auto-profile trigger, and the admin analytics views in one shot.

### Step 3 — Get your API keys
1. Click **Project Settings** (gear icon, bottom-left)
2. Click **API**
3. Copy these two values:
   - **Project URL** (looks like `https://abcdefg.supabase.co`)
   - **anon public** key (long JWT string)

### Step 4 — Add keys to the project
1. In the pet-quest folder, copy `.env.example` to `.env.local`:
   ```
   cp .env.example .env.local
   ```
2. Open `.env.local` and paste your real values:
   ```
   VITE_SUPABASE_URL=https://YOUR-ID.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

### Step 5 — (Optional) Turn off email confirmation
For testing, go to **Authentication → Providers → Email** and toggle OFF "Confirm email". Otherwise new users must click a confirmation link.

---

## 2. Making Yourself Admin

1. Run the app (`npm run dev`) and register a normal account
2. Complete pet selection so your profile is saved
3. In Supabase → **Table Editor** → **profiles** table
4. Find your row → click the pencil icon → change `role` from `user` to `admin` → Save

You'll now see a golden **Admin** button in the dashboard nav that takes you to `/admin`.

**Or via SQL Editor:**
```sql
update profiles set role = 'admin'
where id = (select id from auth.users where email = 'your@email.com');
```

---

## 3. Run Locally

```bash
npm install
cp .env.example .env.local   # then fill in your keys
npm run dev
# Open http://localhost:5173
```

---

## 4. Deploy to Vercel

```bash
npm i -g vercel
vercel --prod
```

Or via Vercel dashboard: import from GitHub, add your two env vars (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`), and deploy. The `vercel.json` handles SPA routing automatically.

---

## 5. Project Structure

```
pet-quest/
├── .env.example              <- copy to .env.local, add your Supabase keys
├── supabase-schema.sql       <- paste into Supabase SQL Editor
├── vercel.json               <- SPA routing rules
└── src/
    ├── lib/supabase.js       <- Supabase client
    ├── context/GameContext   <- all state management + DB sync
    ├── data/                 <- pets.js, accessories.js
    ├── components/           <- PetAvatar, StatBar, TaskList, Notifications
    └── pages/
        ├── LoginPage         <- real Supabase auth (login + register)
        ├── PetSelectPage     <- choose your companion
        ├── DashboardPage     <- main game HUD
        ├── AccessoriesPage   <- buy & equip items
        └── AdminPage         <- charts + full player analytics
```

---

## 6. Database Tables

| Table | What it stores |
|-------|---------------|
| `profiles` | username, role (user/admin), points, selected pet |
| `pet_stats` | hunger, cleanliness, happiness per user |
| `tasks` | text, completed flag, created_at, completed_at |
| `owned_accessories` | items each user has purchased |
| `equipped_accessories` | active item per slot per user |

**Admin views:**
- `user_analytics` — efficiency, procrastination, avg completion time per player
- `daily_completions` — tasks completed per day per player
