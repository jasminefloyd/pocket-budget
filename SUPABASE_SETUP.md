# Supabase Setup Guide for Pocket Budget

This guide will walk you through setting up Supabase for the Pocket Budget application, including database tables, authentication, and environment configuration.

## Prerequisites

1. Create a Supabase account at [supabase.com](https://supabase.com)
2. Create a new project in your Supabase dashboard

## Step 1: Environment Variables

Create a `.env` file in your project root with the following variables:

\`\`\`env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
\`\`\`




## Step 2: Authentication Setup

### Enable Authentication Providers

1. Go to Authentication > Providers in your Supabase dashboard
2. Enable **Email** provider (should be enabled by default)
3. Enable **Google** provider:
   - Go to Google Cloud Console
   - Create OAuth 2.0 credentials
   - Add your Supabase callback URL: `https://your-project-id.supabase.co/auth/v1/callback`
   - Copy Client ID and Client Secret to Supabase

### Configure Authentication Settings

1. Go to Authentication > Settings
2. Set **Site URL** to your app's URL (e.g., `http://localhost:3000` for development)
3. Add redirect URLs if needed

## Step 3: Database Schema

Execute the following SQL commands in your Supabase SQL Editor to create the required tables:

### 1. User Profiles Table

\`\`\`sql
-- Create user_profiles table
CREATE TABLE user_profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email TEXT NOT NULL,
    full_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS (Row Level Security)
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
\`\`\`

### 2. Budgets Table

\`\`\`sql
-- Create budgets table
CREATE TABLE budgets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    category_budgets JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own budgets" ON budgets
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own budgets" ON budgets
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own budgets" ON budgets
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own budgets" ON budgets
    FOR DELETE USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_budgets_updated_at
    BEFORE UPDATE ON budgets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_budgets_user_id ON budgets(user_id);
CREATE INDEX idx_budgets_created_at ON budgets(created_at DESC);
\`\`\`

### 3. Transactions Table

\`\`\`sql
-- Create transactions table
CREATE TABLE transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    budget_id UUID REFERENCES budgets(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    budgeted_amount DECIMAL(10,2),
    category TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    date TEXT NOT NULL, -- Stored as string to match existing format
    receipt_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own transactions" ON transactions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM budgets 
            WHERE budgets.id = transactions.budget_id 
            AND budgets.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create own transactions" ON transactions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM budgets 
            WHERE budgets.id = transactions.budget_id 
            AND budgets.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update own transactions" ON transactions
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM budgets 
            WHERE budgets.id = transactions.budget_id 
            AND budgets.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete own transactions" ON transactions
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM budgets 
            WHERE budgets.id = transactions.budget_id 
            AND budgets.user_id = auth.uid()
        )
    );

-- Create trigger for updated_at
CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_transactions_budget_id ON transactions(budget_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_category ON transactions(category);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);
\`\`\`

### 4. User Categories Table

\`\`\`sql
-- Create user_categories table for custom categories
CREATE TABLE user_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    categories JSONB NOT NULL DEFAULT '{
        "income": [
            {"name": "Salary", "icon": "💼"},
            {"name": "Freelance", "icon": "💻"},
            {"name": "Investment", "icon": "📈"},
            {"name": "Business", "icon": "🏢"},
            {"name": "Gift", "icon": "🎁"}
        ],
        "expense": [
            {"name": "Groceries", "icon": "🛒"},
            {"name": "Rent", "icon": "🏠"},
            {"name": "Transportation", "icon": "🚗"},
            {"name": "Entertainment", "icon": "🎮"},
            {"name": "Bills", "icon": "🧾"},
            {"name": "Shopping", "icon": "🛍️"}
        ]
    }'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE user_categories ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own categories" ON user_categories
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own categories" ON user_categories
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own categories" ON user_categories
    FOR UPDATE USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_user_categories_updated_at
    BEFORE UPDATE ON user_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create index
CREATE INDEX idx_user_categories_user_id ON user_categories(user_id);
\`\`\`

## Step 4: Optional - Create Database Functions

### Function to automatically create user profile on signup

\`\`\`sql
-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function on new user creation
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
\`\`\`

### Function to get budget with transactions

\`\`\`sql
-- Function to get budget with all transactions
CREATE OR REPLACE FUNCTION get_budget_with_transactions(budget_uuid UUID)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'id', b.id,
        'name', b.name,
        'category_budgets', b.category_budgets,
        'created_at', b.created_at,
        'transactions', COALESCE(
            json_agg(
                json_build_object(
                    'id', t.id,
                    'name', t.name,
                    'amount', t.amount,
                    'budgeted_amount', t.budgeted_amount,
                    'category', t.category,
                    'type', t.type,
                    'date', t.date,
                    'receipt_url', t.receipt_url,
                    'created_at', t.created_at
                )
            ) FILTER (WHERE t.id IS NOT NULL),
            '[]'::json
        )
    ) INTO result
    FROM budgets b
    LEFT JOIN transactions t ON b.id = t.budget_id
    WHERE b.id = budget_uuid
    AND b.user_id = auth.uid()
    GROUP BY b.id, b.name, b.category_budgets, b.created_at;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
\`\`\`

## Step 5: Test Your Setup

1. Start your development server: `npm run dev`
2. Try creating an account with email/password
3. Try signing in with Google
4. Create a budget and add some transactions
5. Verify data is being saved in your Supabase dashboard

## Step 6: Production Considerations

### Security
- Review and adjust RLS policies as needed
- Consider adding rate limiting
- Set up proper CORS settings
- Use environment-specific URLs

### Performance
- Add additional indexes based on your query patterns
- Consider using Supabase Edge Functions for complex operations
- Set up database backups

### Monitoring
- Enable Supabase logging
- Set up alerts for errors
- Monitor database performance

## Troubleshooting

### Common Issues

1. **Authentication not working**
   - Check environment variables
   - Verify callback URLs
   - Check browser console for errors

2. **Database queries failing**
   - Verify RLS policies
   - Check user permissions
   - Review SQL syntax in Supabase logs

3. **Google OAuth issues**
   - Verify Google Cloud Console setup
   - Check redirect URIs
   - Ensure OAuth consent screen is configured

### Useful Supabase CLI Commands

\`\`\`bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-id

# Pull remote schema
supabase db pull

# Generate TypeScript types
supabase gen types typescript --project-id your-project-id > types/supabase.ts
\`\`\`

## Next Steps

1. Set up file storage for receipt images (optional)
2. Implement real-time subscriptions for collaborative budgets
3. Add data export functionality
4. Set up automated backups
5. Implement advanced analytics queries

Your Pocket Budget app should now be fully integrated with Supabase! 🎉
