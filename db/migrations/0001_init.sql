-- Alieni on Cloudflare D1 (SQLite). Fresh schema for what the alieni-nl site uses.
-- Conventions: ids are TEXT (random UUIDs made in the app), times are ISO-8601 TEXT in UTC,
-- lists are JSON arrays in TEXT, true/false is INTEGER 0/1. There is no row-level security in D1:
-- every permission is checked in the server code (src/lib/server/*), never in the browser.

PRAGMA foreign_keys = ON;

-- ========== Logins (Better Auth) ==========
CREATE TABLE "user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  role TEXT,                                   -- copy of profiles.role for Better Auth hooks; profiles is the source of truth
  twoFactorEnabled INTEGER NOT NULL DEFAULT 0,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL
);
CREATE TABLE "session" (
  id TEXT PRIMARY KEY,
  expiresAt DATE NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX session_user_idx ON "session"(userId);
CREATE TABLE "account" (
  id TEXT PRIMARY KEY,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  accessToken TEXT, refreshToken TEXT, idToken TEXT,
  accessTokenExpiresAt DATE, refreshTokenExpiresAt DATE,
  scope TEXT, password TEXT,
  createdAt DATE NOT NULL, updatedAt DATE NOT NULL
);
CREATE INDEX account_user_idx ON "account"(userId);
CREATE TABLE "verification" (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt DATE NOT NULL,
  createdAt DATE, updatedAt DATE
);
CREATE INDEX verification_identifier_idx ON "verification"(identifier);
CREATE TABLE "twoFactor" (
  id TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  backupCodes TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  verified INTEGER,
  failedVerificationCount INTEGER,
  lockedUntil DATE
);
CREATE INDEX twofactor_user_idx ON "twoFactor"(userId);

-- E-mail addresses that become admin when they sign up.
CREATE TABLE admin_allowlist (
  email TEXT PRIMARY KEY CHECK (email = lower(email)),
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ========== People ==========
CREATE TABLE profiles (
  id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'household' CHECK (role IN ('household','cleaner','business','admin')),
  display_name TEXT NOT NULL,
  city TEXT,
  locale TEXT NOT NULL DEFAULT 'nl' CHECK (locale IN ('nl','en')),
  suspended_at TEXT,                            -- set by an admin: the account cannot sign in or act
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE household_profiles (
  user_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  postcode_area TEXT,
  needs TEXT NOT NULL DEFAULT '[]',
  home_type TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE cleaner_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','hidden','removed')),
  rate_cents INTEGER NOT NULL CHECK (rate_cents >= 1500),          -- the €15 minimum (also checked in code against the setting)
  min_hours REAL NOT NULL DEFAULT 2,
  services TEXT NOT NULL DEFAULT '[]',
  languages TEXT NOT NULL DEFAULT '[]',
  postcode TEXT NOT NULL,                                          -- private: never sent to other people
  postcode_area TEXT,                                              -- public: the 4 digits
  radius_km INTEGER NOT NULL DEFAULT 10,
  lat REAL, lng REAL,                                              -- private: exact point; search uses a ~1 km grid
  about TEXT,
  photo_key TEXT,                                                  -- R2 object key
  verified_jobs_count INTEGER NOT NULL DEFAULT 0,
  job_types TEXT NOT NULL DEFAULT '["household"]',
  kvk_number TEXT,
  experience_years INTEGER,
  work_scope TEXT NOT NULL DEFAULT 'household' CHECK (work_scope IN ('household','commercial','both')),
  work_types TEXT NOT NULL DEFAULT '["household_regular"]',
  works_as TEXT,
  moderated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX cleaner_profiles_status_idx ON cleaner_profiles(status);

CREATE TABLE availability_slots (
  id TEXT PRIMARY KEY,
  cleaner_profile_id TEXT NOT NULL REFERENCES cleaner_profiles(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  block TEXT NOT NULL CHECK (block IN ('morning','afternoon','evening')),
  UNIQUE (cleaner_profile_id, weekday, block)
);

CREATE TABLE business_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  kvk_number TEXT,
  btw_number TEXT,
  business_type TEXT CHECK (business_type IN ('airbnb','hotel','restaurant','office')),
  contact_first_name TEXT,
  contact_last_name TEXT,
  unit_count INTEGER NOT NULL DEFAULT 1 CHECK (unit_count BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE business_units (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address_line TEXT NOT NULL,
  postcode TEXT NOT NULL,
  city TEXT NOT NULL,
  lat REAL, lng REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX business_units_business_idx ON business_units(business_id);

-- ========== Households and cleaners ==========
CREATE TABLE favourites (
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cleaner_profile_id TEXT NOT NULL REFERENCES cleaner_profiles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, cleaner_profile_id)
);

CREATE TABLE meeting_requests (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cleaner_profile_id TEXT NOT NULL REFERENCES cleaner_profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('in_person','video')),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','accepted','rescheduled','declined','met')),
  proposed_weekday INTEGER NOT NULL CHECK (proposed_weekday BETWEEN 1 AND 7),
  proposed_block TEXT NOT NULL CHECK (proposed_block IN ('morning','afternoon','evening')),
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  responded_at TEXT
);
CREATE INDEX meeting_requests_household_idx ON meeting_requests(household_id);
CREATE INDEX meeting_requests_cleaner_idx ON meeting_requests(cleaner_profile_id);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,   -- the customer: a household or a business account
  cleaner_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  meeting_request_id TEXT REFERENCES meeting_requests(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_message_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  checkin_sent_at TEXT,
  UNIQUE (household_id, cleaner_id)
);
CREATE INDEX conversations_cleaner_idx ON conversations(cleaner_id);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  masked INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX messages_conversation_idx ON messages(conversation_id, created_at);

CREATE TABLE connections (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cleaner_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','ended')),
  household_confirmed_at TEXT,
  cleaner_confirmed_at TEXT,
  started_at TEXT,
  first_activated_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (household_id, cleaner_id)
);
CREATE INDEX connections_cleaner_idx ON connections(cleaner_id);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT CHECK (body IS NULL OR length(body) <= 1000),
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (connection_id, author_id)
);
CREATE INDEX reviews_subject_idx ON reviews(subject_id);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('cleaner_profile','message','user','job','review')),
  subject_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT CHECK (details IS NULL OR length(details) <= 2000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved_hidden','resolved_removed','dismissed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved_at TEXT
);
CREATE INDEX reports_status_idx ON reports(status);

-- ========== Business: jobs, quotations, schedules ==========
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business_profiles(id) ON DELETE CASCADE,
  unit_id TEXT REFERENCES business_units(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','filled','expired','removed')),
  space_type TEXT NOT NULL CHECK (space_type IN ('office','shop','airbnb','hospitality','other')),
  size_m2 INTEGER,
  postcode TEXT NOT NULL,
  city TEXT,
  frequency TEXT NOT NULL CHECK (frequency IN ('once','daily','weekly','biweekly','monthly')),
  schedule_note TEXT,
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 2000),
  budget_cents INTEGER NOT NULL,
  weekdays TEXT NOT NULL DEFAULT '[]',
  visit_start TEXT,
  visit_hours REAL,
  start_date TEXT,
  end_date TEXT,
  awarded_response_id TEXT,
  awarded_at TEXT,
  ended_at TEXT,
  ended_by TEXT,
  published_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX jobs_business_idx ON jobs(business_id);
CREATE INDEX jobs_status_idx ON jobs(status);

CREATE TABLE job_responses (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  cleaner_profile_id TEXT NOT NULL REFERENCES cleaner_profiles(id) ON DELETE CASCADE,
  rate_cents INTEGER NOT NULL,
  message TEXT NOT NULL CHECK (length(message) BETWEEN 1 AND 1000),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','accepted','declined','withdrawn')),
  valid_until TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (job_id, cleaner_profile_id)
);

-- Planned and done work (one-off jobs and the visits of regular contracts).
CREATE TABLE work_records (
  id TEXT PRIMARY KEY,
  business_id TEXT REFERENCES business_profiles(id) ON DELETE CASCADE,
  household_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
  cleaner_profile_id TEXT REFERENCES cleaner_profiles(id) ON DELETE SET NULL,
  job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
  service_key TEXT NOT NULL CHECK (service_key IN ('connect','oneoff','contract')),
  reference_table TEXT,
  reference_id TEXT,
  scheduled_start TEXT,
  scheduled_end TEXT,
  started_at TEXT,
  completed_at TEXT,
  business_confirmed_at TEXT,
  outcome TEXT NOT NULL DEFAULT 'scheduled' CHECK (outcome IN ('scheduled','done','no_show','cancelled','disputed')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (reference_table, reference_id)
);
CREATE INDEX work_records_business_idx ON work_records(business_id, scheduled_start);
CREATE INDEX work_records_cleaner_idx ON work_records(cleaner_profile_id, scheduled_start);

-- ========== Site content and settings ==========
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,                         -- JSON
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE service_catalog (
  service_key TEXT PRIMARY KEY CHECK (service_key IN ('connect','oneoff','contract')),
  enabled INTEGER NOT NULL DEFAULT 1,
  business_types TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by TEXT
);

CREATE TABLE site_media (
  slot TEXT PRIMARY KEY CHECK (slot IN ('hero-cleaner','business-airbnb','business-hotel','business-restaurant','business-office')),
  object_key TEXT NOT NULL,
  width INTEGER, height INTEGER,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_by TEXT
);

CREATE TABLE testimonials (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  role TEXT CHECK (role IS NULL OR length(role) <= 80),
  city TEXT CHECK (city IS NULL OR length(city) <= 80),
  quote TEXT NOT NULL CHECK (length(quote) BETWEEN 1 AND 600),
  consent INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (NOT published OR consent)
);

CREATE TABLE admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  subject TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Simple fixed-window rate limits (sign-up, messages, reports), so the free plan is not abused.
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);

INSERT INTO service_catalog (service_key, enabled, sort_order) VALUES ('connect',1,0),('oneoff',1,1),('contract',1,2);
INSERT INTO settings (key, value) VALUES
  ('rate_floor_cents', '1500'),
  ('household_fee_cents', '0'),
  ('banned_words', '[]'),
  ('homepage_video_url', '""'),
  ('business_pricing', '{"model":"per_location","job_post_cents":null,"tiers":[]}'),
  ('signups_paused', 'false');

-- Better Auth's own rate limiter (database storage, because Worker memory is not shared between requests).
CREATE TABLE "rateLimit" (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL,
  lastRequest INTEGER NOT NULL
);
