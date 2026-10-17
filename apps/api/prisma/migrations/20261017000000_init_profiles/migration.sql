BEGIN;

CREATE TABLE "public"."profiles" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "profiles_email_normalized" CHECK (
        "email" = lower(btrim("email")) AND length("email") > 0
    )
);

CREATE UNIQUE INDEX "profiles_email_key" ON "public"."profiles"("email");

-- Supabase owns auth.users. Reference it without managing its schema in Prisma.
ALTER TABLE "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey"
    FOREIGN KEY ("id") REFERENCES "auth"."users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Application data will be accessed through Express using server credentials.
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."profiles" FROM PUBLIC, anon, authenticated;

COMMIT;
