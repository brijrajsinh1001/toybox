-- ═══════════════════════════════════════════════════
--  TOYBOX DATABASE SCHEMA
--  Run this file in MySQL to set up the entire DB
--  Command: mysql -u root -p < schema.sql
-- ═══════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS toybox_db;
USE toybox_db;

-- ─────────────────────────────────────────────────────
--  1. BUYERS
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS buyers (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  first_name      VARCHAR(80)  NOT NULL,
  last_name       VARCHAR(80)  NOT NULL,
  email           VARCHAR(150) NOT NULL UNIQUE,
  mobile          VARCHAR(15)  NOT NULL,
  city            VARCHAR(80)  NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  -- Membership / Deposit
  membership_paid BOOLEAN      DEFAULT FALSE,
  deposit_balance DECIMAL(10,2) DEFAULT 0.00,
  -- Status
  is_blacklisted  BOOLEAN      DEFAULT FALSE,
  blacklist_reason VARCHAR(255) DEFAULT NULL,
  blacklisted_at  DATETIME     DEFAULT NULL,
  is_active       BOOLEAN      DEFAULT TRUE,
  created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────
--  2. SELLERS
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sellers (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  first_name    VARCHAR(80)  NOT NULL,
  last_name     VARCHAR(80)  NOT NULL,
  store_name    VARCHAR(150) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  mobile        VARCHAR(15)  NOT NULL,
  city          VARCHAR(80)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  avg_rating    DECIMAL(3,2) DEFAULT 0.00,
  total_reviews INT          DEFAULT 0,
  is_active     BOOLEAN      DEFAULT TRUE,
  is_suspended  BOOLEAN      DEFAULT FALSE,
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────
--  3. ADMINS
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  otp_code      VARCHAR(10)  DEFAULT NULL,
  otp_expires   DATETIME     DEFAULT NULL,
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────
--  4. TOY LISTINGS
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS toy_listings (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  seller_id     INT          NOT NULL,
  name          VARCHAR(150) NOT NULL,
  category      VARCHAR(80)  NOT NULL,
  age_group     VARCHAR(30)  NOT NULL,
  brand         VARCHAR(80)  DEFAULT NULL,
  condition_tag VARCHAR(50)  NOT NULL,
  description   TEXT         NOT NULL,
  listing_type  ENUM('rent','buy','both') NOT NULL,
  rent_price    DECIMAL(10,2) DEFAULT NULL,   -- per day
  buy_price     DECIMAL(10,2) DEFAULT NULL,
  city          VARCHAR(80)  NOT NULL,
  area          VARCHAR(100) DEFAULT NULL,
  pickup_note   VARCHAR(255) DEFAULT NULL,
  status        ENUM('pending','approved','rejected','removed') DEFAULT 'pending',
  is_available  BOOLEAN      DEFAULT TRUE,
  views         INT          DEFAULT 0,
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────
--  5. TOY IMAGES
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS toy_images (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  listing_id INT          NOT NULL,
  filename   VARCHAR(255) NOT NULL,
  is_primary BOOLEAN      DEFAULT FALSE,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (listing_id) REFERENCES toy_listings(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────
--  6. BUYER REQUESTS (Buyer contacts seller)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS buyer_requests (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  buyer_id     INT          NOT NULL,
  seller_id    INT          NOT NULL,
  listing_id   INT          NOT NULL,
  request_type ENUM('rent','buy') NOT NULL,
  message      TEXT         NOT NULL,
  status       ENUM('pending','accepted','rejected','completed') DEFAULT 'pending',
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (buyer_id)   REFERENCES buyers(id)       ON DELETE CASCADE,
  FOREIGN KEY (seller_id)  REFERENCES sellers(id)      ON DELETE CASCADE,
  FOREIGN KEY (listing_id) REFERENCES toy_listings(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────
--  7. RENTALS (Tracking active rentals)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rentals (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  buyer_id     INT          NOT NULL,
  seller_id    INT          NOT NULL,
  listing_id   INT          NOT NULL,
  request_id   INT          NOT NULL,
  rent_per_day DECIMAL(10,2) NOT NULL,
  start_date   DATE         NOT NULL,
  due_date     DATE         NOT NULL,
  returned_at  DATETIME     DEFAULT NULL,
  status       ENUM('active','returned','overdue','cancelled') DEFAULT 'active',
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (buyer_id)   REFERENCES buyers(id)       ON DELETE CASCADE,
  FOREIGN KEY (seller_id)  REFERENCES sellers(id)      ON DELETE CASCADE,
  FOREIGN KEY (listing_id) REFERENCES toy_listings(id) ON DELETE CASCADE,
  FOREIGN KEY (request_id) REFERENCES buyer_requests(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────
--  8. DEPOSIT TRANSACTIONS (Deductions & Refunds)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deposit_transactions (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  buyer_id    INT           NOT NULL,
  amount      DECIMAL(10,2) NOT NULL,         -- positive = credit, negative = deduction
  type        ENUM('membership_paid','damage_deduction','non_return_forfeiture','refund','manual_deduction') NOT NULL,
  reason      TEXT          DEFAULT NULL,
  rental_id   INT           DEFAULT NULL,
  done_by     INT           DEFAULT NULL,     -- admin id
  created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (buyer_id)  REFERENCES buyers(id)  ON DELETE CASCADE,
  FOREIGN KEY (rental_id) REFERENCES rentals(id) ON DELETE SET NULL,
  FOREIGN KEY (done_by)   REFERENCES admins(id)  ON DELETE SET NULL
);

-- ─────────────────────────────────────────────────────
--  9. REVIEWS (Buyer reviews seller after transaction)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  buyer_id   INT          NOT NULL,
  seller_id  INT          NOT NULL,
  listing_id INT          NOT NULL,
  rating     TINYINT      NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT         DEFAULT NULL,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (buyer_id)   REFERENCES buyers(id)       ON DELETE CASCADE,
  FOREIGN KEY (seller_id)  REFERENCES sellers(id)      ON DELETE CASCADE,
  FOREIGN KEY (listing_id) REFERENCES toy_listings(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────
--  10. PURCHASES
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchases (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  buyer_id   INT           NOT NULL,
  seller_id  INT           NOT NULL,
  listing_id INT           NOT NULL,
  amount     DECIMAL(10,2) NOT NULL,
  status     ENUM('pending','completed','disputed') DEFAULT 'pending',
  created_at DATETIME      DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (buyer_id)   REFERENCES buyers(id)       ON DELETE CASCADE,
  FOREIGN KEY (seller_id)  REFERENCES sellers(id)      ON DELETE CASCADE,
  FOREIGN KEY (listing_id) REFERENCES toy_listings(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────
--  DEFAULT ADMIN SEED
--  Password: Admin@123 (change after first login!)
-- ─────────────────────────────────────────────────────
INSERT INTO admins (name, email, password_hash)
VALUES ('Super Admin', 'admin@toybox.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy');
-- ^ bcrypt hash of "Admin@123" — CHANGE THIS IN PRODUCTION

-- ─────────────────────────────────────────────────────
--  USEFUL VIEWS
-- ─────────────────────────────────────────────────────

-- Active listings with seller info and primary image
CREATE OR REPLACE VIEW v_listings AS
SELECT
  tl.*,
  s.store_name, s.mobile AS seller_mobile,
  s.avg_rating AS seller_rating,
  ti.filename AS primary_image
FROM toy_listings tl
JOIN sellers s ON tl.seller_id = s.id
LEFT JOIN toy_images ti ON ti.listing_id = tl.id AND ti.is_primary = TRUE
WHERE tl.status = 'approved' AND tl.is_available = TRUE;

-- Buyer deposit summary
CREATE OR REPLACE VIEW v_buyer_deposits AS
SELECT
  b.id, b.first_name, b.last_name, b.email, b.city,
  b.membership_paid, b.deposit_balance, b.is_blacklisted
FROM buyers b;


-- ─────────────────────────────────────────────────────
--  11. DAMAGE REPORTS
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS damage_reports (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  buyer_id     INT           NOT NULL,
  rental_id    INT           DEFAULT NULL,
  txn_id       VARCHAR(80)   NOT NULL,
  toy_name     VARCHAR(150)  NOT NULL,
  seller_name  VARCHAR(150)  DEFAULT NULL,
  report_type  VARCHAR(50)   NOT NULL,
  damage_type  VARCHAR(50)   NOT NULL,
  severity     ENUM('minor','mod','major') NOT NULL,
  description  TEXT          NOT NULL,
  status       ENUM('pending','reviewed','resolved','rejected') DEFAULT 'pending',
  admin_note   TEXT          DEFAULT NULL,
  created_at   DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (buyer_id)  REFERENCES buyers(id)  ON DELETE CASCADE,
  FOREIGN KEY (rental_id) REFERENCES rentals(id) ON DELETE SET NULL
);

-- ─────────────────────────────────────────────────────
--  12. DAMAGE PHOTOS
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS damage_photos (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  report_id  INT          NOT NULL,
  filename   VARCHAR(255) NOT NULL,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (report_id) REFERENCES damage_reports(id) ON DELETE CASCADE
);
