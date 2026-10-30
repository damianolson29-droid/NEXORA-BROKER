


"use strict";

// ========================================
// NEXORA — SUPABASE CLIENT
// Demo balances only — no real cryptocurrency sent
// ========================================

const SUPABASE_URL =
  "https://fookafzcsnlmxjlormlf.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable__QTEEc_XvGKt_TMj1P9D1w_No7_sQXo";

// Check that Supabase JS loaded first.
if (!window.supabase) {
  throw new Error(
    "Supabase library missing. Load supabase-js before supabase.js."
  );
}

// Create one shared client.
window.nexoraSupabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

// ========================================
// NEXORA API
// ========================================

window.Nexora = {
  client: window.nexoraSupabase,

  // Require a real email/password account session.
  async getCurrentUser() {
    const { data, error } =
      await this.client.auth.getSession();

    if (error) throw error;

    const user = data.session?.user;

    if (!user) {
      throw new Error(
        "Please log in to your NEXORA account."
      );
    }

    if (user.is_anonymous) {
      throw new Error(
        "Please log in with your email and password."
      );
    }

    return user;
  },

  // Register a new email/password account.
  async signUp(email, password, fullName = "") {
    const { data, error } =
      await this.client.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim()
          }
        }
      });

    if (error) throw error;

    return data;
  },

  // Sign in to an existing account.
  async signIn(email, password) {
    const { data, error } =
      await this.client.auth.signInWithPassword({
        email: email.trim(),
        password
      });

    if (error) throw error;

    if (!data.user) {
      throw new Error("Login did not return a user.");
    }

    if (data.user.is_anonymous) {
      throw new Error(
        "Please use an email/password account."
      );
    }

    return data.user;
  },

  // Sign out.
  async signOut() {
    const { error } =
      await this.client.auth.signOut();

    if (error) throw error;
  },

  // Load the current user's balances.
  async getBalances() {
    const user = await this.getCurrentUser();

    const { data, error } = await this.client
      .from("nexora_balances")
      .select("asset, balance")
      .eq("user_id", user.id)
      .order("asset", { ascending: true });

    if (error) throw error;

    console.log("NEXORA authenticated user:", user.id);
    console.log("NEXORA balance rows:", data?.length ?? 0);

    return data ?? [];
  },

  // Load the current user's withdrawal history.
  async getTransactions() {
  const user = await this.getCurrentUser();

  const [withdrawalsResult, fundingResult] = await Promise.all([
    this.client
      .from("nexora_withdrawals")
      .select("id, asset, amount, destination, status, created_at")
      .eq("user_id", user.id),

    this.client
      .from("nexora_account_funding")
      .select("id, asset, amount, reference, status, created_at")
      .eq("user_id", user.id)
  ]);

  if (withdrawalsResult.error) throw withdrawalsResult.error;
  if (fundingResult.error) throw fundingResult.error;

  console.log("Funding records:", fundingResult.data);
  console.log("Withdrawal records:", withdrawalsResult.data);

  const withdrawals = (withdrawalsResult.data ?? []).map(item => ({
    ...item,
    type: "withdrawal"
  }));

  const funding = (fundingResult.data ?? []).map(item => ({
    ...item,
    type: "account_funded"
  }));

  return [...withdrawals, ...funding].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );
},

  // Submit a withdrawal request through the database RPC.
  async requestWithdrawal({
    asset,
    amount,
    destination
  }) {
    await this.getCurrentUser();

    const supportedAssets = ["BTC", "ETH", "USDT", "USD"];

    if (!supportedAssets.includes(asset)) {
      throw new Error("Unsupported asset.");
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Enter a valid withdrawal amount.");
    }

    if (
      typeof destination !== "string" ||
      destination.trim().length < 6
    ) {
      throw new Error(
        "Enter a valid demo destination."
      );
    }

    const { data, error } = await this.client.rpc(
      "nexora_request_withdrawal",
      {
        p_asset: asset,
        p_amount: amount,
        p_destination: destination.trim()
      }
    );

    if (error) throw error;

    return data;
  }
};
