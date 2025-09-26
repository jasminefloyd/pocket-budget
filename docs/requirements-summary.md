# Pocket Budget Requirements & Feature Summary

## Authentication and User Profiles
- `AuthContext` bootstraps Supabase, tracks initialization/loading, and automatically provisions missing profiles when Supabase returns a `PGRST116` (no row) error while ensuring state updates only run when the provider is mounted.【F:src/contexts/AuthContext.jsx†L17-L200】
- Supabase is configured with PKCE auth, requires environment variables, and supports a demo admin that persists a mock session, drives local storage auth events, and bypasses profile CRUD with in-memory fallbacks.【F:src/lib/supabase.js†L1-L200】

## Core App Flow
- The main app wires authentication into budgets, categories, goals, budget details, AI insights, and category management views, while bootstrapping default income/expense categories and persisting category edits per user.【F:src/App.jsx†L3-L200】
- Loading, login, and install prompt experiences are scoped so that authenticated users see budget data while anonymous users are guided to sign in.【F:src/App.jsx†L141-L200】

## Budget Management Dashboard
- Users can create starter budgets, rename them inline, duplicate existing plans, delete old budgets, and switch to goal management from the primary dashboard.【F:src/screens/BudgetsScreen.jsx†L8-L200】
- Each budget card surfaces overall income, expense, and balance totals, summarises category allocations with pacing indicators, and flags overspending using the pacing engine.【F:src/screens/BudgetsScreen.jsx†L145-L200】【F:src/lib/pacing.js†L1-L200】

## Budget Details & Transactions
- The detail view supports adding and editing transactions via modals, validates required fields, updates Supabase, and keeps local state in sync so aggregate metrics remain current.【F:src/screens/BudgetDetailsScreen.jsx†L8-L111】
- Inline renaming, spending summaries (income, expenses, remaining balance, budgeted totals), and top-category donut charts give quick insight into spending distribution.【F:src/screens/BudgetDetailsScreen.jsx†L113-L200】
- Tabbed tables with pagination separate income and expense transactions, and pacing plus cycle calculations are reused from the shared helper.【F:src/screens/BudgetDetailsScreen.jsx†L177-L200】【F:src/lib/pacing.js†L1-L200】

## Category Management
- Users maintain separate income and expense category lists with a curated emoji icon bank, modal-based creation, inline editing, and safeguards that prevent deleting categories referenced by transactions.【F:src/screens/CategoriesScreen.jsx†L4-L198】

## Savings Goals Module
- Goals load per user, normalize Supabase and demo data, and track metrics like progress, pace, and weekly targets.【F:src/screens/GoalsScreen.jsx†L1-L130】
- Users can create, link, update, and delete goals, attach them to budgets, and record contributions through a calculator keypad that syncs an expense into the linked budget when applicable.【F:src/screens/GoalsScreen.jsx†L200-L400】
- Milestone celebrations with confetti and note-taking for contributions reinforce progress tracking requirements.【F:src/screens/GoalsScreen.jsx†L295-L360】

## AI Financial Insights
- The AI report screen derives totals, savings rate, category trends, and recent spending deltas before feeding them into a simulated AI response that renders budget optimization tips, strengths, growth areas, and spending insights with retry handling.【F:src/screens/AIInsightsScreen.jsx†L1-L200】

## Progressive Web App Install Prompt
- A custom install prompt listens for `beforeinstallprompt`, stores the deferred event, hides itself after dismissal for seven days, and avoids prompting when the app already runs in standalone mode.【F:src/components/InstallPrompt.jsx†L3-L80】

