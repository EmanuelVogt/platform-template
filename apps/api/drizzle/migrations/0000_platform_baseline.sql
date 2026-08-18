CREATE SCHEMA "_kernel";
--> statement-breakpoint
CREATE SCHEMA "attachment";
--> statement-breakpoint
CREATE SCHEMA "identity";
--> statement-breakpoint
CREATE SCHEMA "notification";
--> statement-breakpoint
CREATE SCHEMA "tag";
--> statement-breakpoint
CREATE TYPE "identity"."access_profile" AS ENUM('master', 'professional', 'admin');--> statement-breakpoint
CREATE TYPE "identity"."user_status" AS ENUM('pending', 'active');--> statement-breakpoint
CREATE TYPE "identity"."verification_token_type" AS ENUM('email_verify', 'password_reset', 'access_link', 'email_change');--> statement-breakpoint
CREATE TYPE "identity"."auth_event_type" AS ENUM('register', 'login_success', 'login_failed', 'account_locked', 'account_unlocked', 'logout', 'session_revoked', 'sessions_revoked_all', 'session_expired', 'session_ip_changed', 'password_reset_requested', 'password_reset_completed', 'password_changed', 'email_change_requested', 'email_changed', 'email_verified', 'breach_check_skipped', 'rate_limited_burst', 'admin_action', 'access_link_sent', 'access_link_resent', 'password_set', 'device_revoked', 'user_deleted', 'user_restored', 'user_purged', 'access_link_cancelled');--> statement-breakpoint
CREATE TYPE "attachment"."attachment_status" AS ENUM('pending', 'ready', 'deleted');--> statement-breakpoint
CREATE TYPE "attachment"."attachment_visibility" AS ENUM('public', 'authenticated', 'restricted');--> statement-breakpoint
CREATE TYPE "attachment"."attachment_access_action" AS ENUM('download', 'upload', 'delete');--> statement-breakpoint
CREATE TYPE "attachment"."attachment_access_outcome" AS ENUM('allowed', 'denied');--> statement-breakpoint
CREATE TYPE "notification"."notification_channel" AS ENUM('email', 'push');--> statement-breakpoint
CREATE TYPE "notification"."notification_delivery_status" AS ENUM('pending', 'sent', 'failed', 'dead_letter');--> statement-breakpoint
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
CREATE TABLE "identity"."users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"pending_email" text,
	"access_profile" "identity"."access_profile" DEFAULT 'admin' NOT NULL,
	"attends_guests" boolean DEFAULT false NOT NULL,
	"password_hash" text,
	"status" "identity"."user_status" DEFAULT 'active' NOT NULL,
	"pepper_version" integer DEFAULT 1 NOT NULL,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_reset_requested_at" timestamp with time zone,
	"last_verification_requested_at" timestamp with time zone,
	"last_email_change_requested_at" timestamp with time zone,
	"birth_date" date,
	"avatar_attachment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by_user_id" text
);
--> statement-breakpoint
CREATE TABLE "identity"."user_permissions" (
	"user_id" text NOT NULL,
	"permission" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_permissions_user_id_permission_pk" PRIMARY KEY("user_id","permission")
);
--> statement-breakpoint
CREATE TABLE "identity"."user_professional_areas" (
	"user_id" text NOT NULL,
	"area_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_professional_areas_user_id_area_id_pk" PRIMARY KEY("user_id","area_id")
);
--> statement-breakpoint
CREATE TABLE "identity"."user_professional_services" (
	"user_id" text NOT NULL,
	"service_id" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_professional_services_user_id_service_id_pk" PRIMARY KEY("user_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "identity"."user_scheduling_areas" (
	"user_id" text NOT NULL,
	"area_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_scheduling_areas_user_id_area_id_pk" PRIMARY KEY("user_id","area_id")
);
--> statement-breakpoint
CREATE TABLE "identity"."user_professional_schedule_config_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"start_minute" integer,
	"end_minute" integer,
	"reason" text,
	"weekdays" smallint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_professional_schedule_config_blocks_date_range" CHECK ("identity"."user_professional_schedule_config_blocks"."end_date" >= "identity"."user_professional_schedule_config_blocks"."start_date"),
	CONSTRAINT "user_professional_schedule_config_blocks_minute_pair" CHECK (("identity"."user_professional_schedule_config_blocks"."start_minute" is null) = ("identity"."user_professional_schedule_config_blocks"."end_minute" is null)),
	CONSTRAINT "user_professional_schedule_config_blocks_minute_range" CHECK ("identity"."user_professional_schedule_config_blocks"."start_minute" is null or ("identity"."user_professional_schedule_config_blocks"."start_minute" between 0 and 1439 and "identity"."user_professional_schedule_config_blocks"."end_minute" > "identity"."user_professional_schedule_config_blocks"."start_minute" and "identity"."user_professional_schedule_config_blocks"."end_minute" <= 1440)),
	CONSTRAINT "user_professional_schedule_config_blocks_weekdays_range" CHECK ("identity"."user_professional_schedule_config_blocks"."weekdays" between 1 and 127)
);
--> statement-breakpoint
CREATE TABLE "identity"."user_professional_schedule_config_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"day_of_week" smallint NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_professional_schedule_config_slots_type_valid" CHECK ("identity"."user_professional_schedule_config_slots"."type" in ('available', 'lunch', 'break', 'meeting', 'administrative')),
	CONSTRAINT "user_professional_schedule_config_slots_day_range" CHECK ("identity"."user_professional_schedule_config_slots"."day_of_week" between 0 and 6),
	CONSTRAINT "user_professional_schedule_config_slots_start_range" CHECK ("identity"."user_professional_schedule_config_slots"."start_minute" between 0 and 1439),
	CONSTRAINT "user_professional_schedule_config_slots_end_range" CHECK ("identity"."user_professional_schedule_config_slots"."end_minute" > "identity"."user_professional_schedule_config_slots"."start_minute" and "identity"."user_professional_schedule_config_slots"."end_minute" <= 1440)
);
--> statement-breakpoint
CREATE TABLE "identity"."user_professional_schedule_configs" (
	"user_id" text PRIMARY KEY NOT NULL,
	"is_extra" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."professional_default_hours" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"day_of_week" smallint NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "professional_default_hours_type_valid" CHECK ("identity"."professional_default_hours"."type" in ('available', 'lunch', 'break', 'meeting', 'administrative')),
	CONSTRAINT "professional_default_hours_day_range" CHECK ("identity"."professional_default_hours"."day_of_week" between 0 and 6),
	CONSTRAINT "professional_default_hours_start_range" CHECK ("identity"."professional_default_hours"."start_minute" between 0 and 1439),
	CONSTRAINT "professional_default_hours_end_range" CHECK ("identity"."professional_default_hours"."end_minute" > "identity"."professional_default_hours"."start_minute" and "identity"."professional_default_hours"."end_minute" <= 1440)
);
--> statement-breakpoint
CREATE TABLE "identity"."permission_template_permissions" (
	"template_id" text NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "permission_template_permissions_template_id_permission_pk" PRIMARY KEY("template_id","permission")
);
--> statement-breakpoint
CREATE TABLE "identity"."permission_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"cookie_token_hash" text NOT NULL,
	"label" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"remember_me" boolean DEFAULT false NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"device_id" text
);
--> statement-breakpoint
CREATE TABLE "identity"."verification_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "identity"."verification_token_type" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity"."auth_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"actor_user_id" text,
	"event_type" "identity"."auth_event_type" NOT NULL,
	"email_hash" text,
	"ip" text,
	"user_agent" text,
	"correlation_id" text NOT NULL,
	"trace_id" text,
	"span_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachment"."attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum" text,
	"original_filename" text,
	"profile" text DEFAULT 'legacy' NOT NULL,
	"owner_user_id" text,
	"status" "attachment"."attachment_status" DEFAULT 'ready' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "attachment"."attachment_acls" (
	"attachment_id" text PRIMARY KEY NOT NULL,
	"visibility" "attachment"."attachment_visibility" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachment"."attachment_access_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"attachment_id" text NOT NULL,
	"user_id" text,
	"ip" text,
	"user_agent" text,
	"action" "attachment"."attachment_access_action" NOT NULL,
	"outcome" "attachment"."attachment_access_outcome" NOT NULL,
	"correlation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification"."notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"recipient_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"locale" text NOT NULL,
	"seen_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification"."notification_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"notification_id" text,
	"recipient_id" text NOT NULL,
	"type" text NOT NULL,
	"channel" "notification"."notification_channel" NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "notification"."notification_delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tag"."tags" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "identity"."user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."user_professional_areas" ADD CONSTRAINT "user_professional_areas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."user_professional_services" ADD CONSTRAINT "user_professional_services_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."user_scheduling_areas" ADD CONSTRAINT "user_scheduling_areas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."user_professional_schedule_config_blocks" ADD CONSTRAINT "user_professional_schedule_config_blocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."user_professional_schedule_config_slots" ADD CONSTRAINT "user_professional_schedule_config_slots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."user_professional_schedule_configs" ADD CONSTRAINT "user_professional_schedule_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."permission_template_permissions" ADD CONSTRAINT "permission_template_permissions_template_id_permission_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "identity"."permission_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."sessions" ADD CONSTRAINT "sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "identity"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity"."verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment"."attachment_acls" ADD CONSTRAINT "attachment_acls_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "attachment"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "_kernel"."idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "outbox_unpublished_idx" ON "_kernel"."outbox" USING btree ("aggregate_id","next_attempt_at","occurred_at") WHERE "_kernel"."outbox"."published_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "identity"."users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_single_master_idx" ON "identity"."users" USING btree ("access_profile") WHERE "identity"."users"."access_profile" = 'master';--> statement-breakpoint
CREATE INDEX "user_professional_schedule_config_blocks_user_idx" ON "identity"."user_professional_schedule_config_blocks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_professional_schedule_config_slots_user_idx" ON "identity"."user_professional_schedule_config_slots" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "permission_templates_name_unique" ON "identity"."permission_templates" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_user_id_cookie_token_hash_unique" ON "identity"."devices" USING btree ("user_id","cookie_token_hash");--> statement-breakpoint
CREATE INDEX "devices_user_id_idx" ON "identity"."devices" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "identity"."sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "identity"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_device_id_idx" ON "identity"."sessions" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "verification_tokens_token_hash_idx" ON "identity"."verification_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "verification_tokens_user_type_created_idx" ON "identity"."verification_tokens" USING btree ("user_id","type","created_at");--> statement-breakpoint
CREATE INDEX "auth_events_user_id_idx" ON "identity"."auth_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_events_created_at_idx" ON "identity"."auth_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "attachment_access_logs_attachment_idx" ON "attachment"."attachment_access_logs" USING btree ("attachment_id","created_at");--> statement-breakpoint
CREATE INDEX "attachment_access_logs_user_idx" ON "attachment"."attachment_access_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_recipient_created_idx" ON "notification"."notifications" USING btree ("recipient_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "notifications_unseen_idx" ON "notification"."notifications" USING btree ("recipient_id") WHERE "notification"."notifications"."seen_at" is null and "notification"."notifications"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "notification_deliveries_poll_idx" ON "notification"."notification_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_unique" ON "tag"."tags" USING btree (lower("name")) WHERE "tag"."tags"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tags_active_idx" ON "tag"."tags" USING btree ("is_active");