// PaperReady settings.
// After the Supabase backend is set up, paste the two values below.
// Leave them empty to run in demo mode (sample questions, no AI).
window.PAPERREADY_CONFIG = {
  // Example: "https://abcdefgh.supabase.co/functions/v1/generate-quiz"
  QUIZ_FUNCTION_URL: "https://ghcrcajzfyqyvqugcrxj.supabase.co/functions/v1/generate-quiz",
  // Supabase "publishable" (anon) key. Safe to put in the app.
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoY3JjYWp6ZnlxeXZxdWdjcnhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwMDI2OTcsImV4cCI6MjExMDU3ODY5N30.IflGmrukhM6mVNSaFip_UrclVp-xLU97MkVdaLBq0-Y",
  // Free AI quizzes per day
  FREE_QUIZZES_PER_DAY: 5,
  // Max PDF pages per quiz on the free plan
  FREE_PDF_PAGES: 20,
  // Premium plan shown in the app
  PREMIUM_PRICE: "$2 / month",
  PREMIUM_PDF_PAGES: 100,
  // Set to true once Google Play billing is connected
  PAYMENTS_LIVE: false
};
