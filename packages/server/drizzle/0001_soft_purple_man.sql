CREATE TABLE "areas" (
	"key" text PRIMARY KEY NOT NULL,
	"biome" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
