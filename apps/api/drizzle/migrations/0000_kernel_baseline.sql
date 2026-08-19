CREATE SCHEMA "_kernel";
--> statement-breakpoint
CREATE TABLE "_kernel"."idempotency_keys" (
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"endpoint" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_scope_key_pk" PRIMARY KEY("scope","key")
);
--> statement-breakpoint
CREATE TABLE "_kernel"."outbox" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_name" text NOT NULL,
	"event_version" integer NOT NULL,
	"aggregate_id" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"correlation_id" text NOT NULL,
	"causation_id" text,
	"tenant_id" text,
	"traceparent" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "_kernel"."outbox_dead" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_name" text NOT NULL,
	"event_version" integer NOT NULL,
	"aggregate_id" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"correlation_id" text NOT NULL,
	"causation_id" text,
	"tenant_id" text,
	"traceparent" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"attempts" integer NOT NULL,
	"last_error" text,
	"dead_lettered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "_kernel"."processed_events" (
	"event_id" text NOT NULL,
	"consumer" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_events_event_id_consumer_pk" PRIMARY KEY("event_id","consumer")
);
--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "_kernel"."idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "outbox_unpublished_idx" ON "_kernel"."outbox" USING btree ("aggregate_id","next_attempt_at","occurred_at") WHERE "_kernel"."outbox"."published_at" is null;