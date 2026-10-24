CREATE TABLE "animals" (
	"id" integer PRIMARY KEY NOT NULL,
	"species" text NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crops" (
	"k" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objects" (
	"id" integer PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world" (
	"id" integer PRIMARY KEY NOT NULL,
	"day" integer NOT NULL,
	"time_ms" integer NOT NULL,
	"next_id" integer NOT NULL,
	"season_override" text,
	"terrain" jsonb NOT NULL,
	"drops" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
