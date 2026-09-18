CREATE TABLE "ai_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"default_provider" text DEFAULT 'GOOGLE' NOT NULL,
	"google_api_key" text,
	"google_model" text DEFAULT 'gemini-2.0-flash' NOT NULL,
	"deepseek_api_key" text,
	"deepseek_model" text DEFAULT 'deepseek-chat' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
