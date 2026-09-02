# 🧸 ToyBox — Backend (Node.js + Express + MySQL)

## 📁 Project Folder Structure

```
toybox-backend/
├── server.js               ← Entry point
├── schema.sql              ← Run this first to create the database
├── package.json
├── .env.example            ← Copy to .env and fill values
├── config/
│   └── db.js               ← MySQL connection pool
├── middleware/
│   ├── auth.js             ← JWT verification & role guards
│   └── upload.js           ← Multer image upload config
├── routes/
│   ├── buyers.js           ← Register, login, membership, rentals
│   ├── sellers.js          ← Register, login, listings, requests
│   ├── admin.js            ← OTP login, blacklist, deposits, approvals
│   ├── listings.js         ← CRUD + image upload for toys
│   ├── requests.js         ← Buyer sends enquiry to seller
│   ├── rentals.js          ← Rental creation & return tracking
│   └── deposits.js         ← Deposit transaction history
└── uploads/                ← Toy images stored here (auto-created)
```

---

## ⚙️ Setup Instructions

### 1. Install dependencies
```bash
cd toybox-backend
npm install
```

### 2. Create your .env file
```bash
cp .env.example .env
```
Then open `.env` and fill in:
- Your MySQL password
- A strong JWT secret
- Your Gmail + App Password (for OTP emails)

### 3. Set up the database
Open MySQL and run:
```bash
mysql -u root -p < schema.sql
```
This creates the `toybox_db` database and all tables automatically.

### 4. Start the server
```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm start
```

Server runs at: **http://localhost:5000**

---

## 🔗 API Endpoints

### 👤 Buyers — `/api/buyers`
| Method | Endpoint               | Auth     | Description                    |
|--------|------------------------|----------|--------------------------------|
| POST   | `/register`            | None     | Register new buyer             |
| POST   | `/login`               | None     | Buyer login → returns JWT      |
| GET    | `/profile`             | Buyer    | Get own profile                |
| POST   | `/pay-membership`      | Buyer    | Pay ₹3,500 membership deposit  |
| GET    | `/rentals`             | Buyer    | My active & past rentals       |
| GET    | `/purchases`           | Buyer    | My purchase history            |
| GET    | `/deposit-history`     | Buyer    | Deposit deduction history      |

### 🏪 Sellers — `/api/sellers`
| Method | Endpoint               | Auth     | Description                    |
|--------|------------------------|----------|--------------------------------|
| POST   | `/register`            | None     | Register seller                |
| POST   | `/login`               | None     | Seller login → returns JWT     |
| GET    | `/profile`             | Seller   | Get seller profile             |
| GET    | `/dashboard`           | Seller   | Stats (listings, rentals etc.) |
| GET    | `/my-listings`         | Seller   | All my toy listings            |
| GET    | `/requests`            | Seller   | Buyer enquiries received       |
| PUT    | `/requests/:id`        | Seller   | Accept or reject a request     |

### 📦 Listings — `/api/listings`
| Method | Endpoint               | Auth     | Description                    |
|--------|------------------------|----------|--------------------------------|
| GET    | `/`                    | None     | All approved listings (filter by category, city, type, search) |
| GET    | `/:id`                 | None     | Single listing with images     |
| POST   | `/`                    | Seller   | Create listing + upload photos (multipart/form-data, field: `images`) |
| PUT    | `/:id`                 | Seller   | Update own listing             |
| DELETE | `/:id`                 | Seller   | Remove own listing             |

### 📞 Requests — `/api/requests`
| Method | Endpoint               | Auth     | Description                    |
|--------|------------------------|----------|--------------------------------|
| POST   | `/`                    | Buyer    | Send enquiry to seller         |
| GET    | `/mine`                | Buyer    | My sent requests               |

### 🔑 Rentals — `/api/rentals`
| Method | Endpoint               | Auth     | Description                    |
|--------|------------------------|----------|--------------------------------|
| POST   | `/`                    | Seller   | Confirm rental start           |
| PUT    | `/:id/return`          | Any      | Mark rental as returned        |

### 🛡️ Admin — `/api/admin`
| Method | Endpoint                    | Auth     | Description                  |
|--------|-----------------------------|----------|------------------------------|
| POST   | `/login`                    | None     | Step 1: Email + password → sends OTP |
| POST   | `/verify-otp`               | None     | Step 2: Verify OTP → returns JWT |
| GET    | `/stats`                    | Admin    | Platform KPIs                |
| GET    | `/buyers`                   | Admin    | All buyers (with search)     |
| POST   | `/buyers/:id/blacklist`     | Admin    | Blacklist buyer              |
| POST   | `/buyers/:id/unblacklist`   | Admin    | Unblacklist buyer            |
| POST   | `/deposits/deduct`          | Admin    | Deduct from buyer deposit    |
| GET    | `/listings/pending`         | Admin    | Listings awaiting approval   |
| PUT    | `/listings/:id/status`      | Admin    | Approve / reject listing     |
| GET    | `/sellers`                  | Admin    | All sellers                  |
| PUT    | `/sellers/:id/suspend`      | Admin    | Suspend/unsuspend seller     |

---

## 🔐 How to Use JWT in Frontend

After login, store the token and send it with every protected request:

```javascript
// Store token
localStorage.setItem('token', response.token);

// Use token in requests
fetch('/api/buyers/profile', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token')
  }
})
```

---

## 📸 Uploading Toy Images

Use `multipart/form-data` when creating a listing:

```javascript
const formData = new FormData();
formData.append('name', 'LEGO Classic Set');
formData.append('category', 'Building Blocks');
formData.append('listing_type', 'both');
// ... other fields ...
imageFiles.forEach(file => formData.append('images', file));

fetch('/api/listings', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + token },
  body: formData   // ← Do NOT set Content-Type manually, browser does it
});
```

---

## 🗄️ Database Tables Summary

| Table                   | Purpose                                        |
|-------------------------|------------------------------------------------|
| `buyers`                | Buyer accounts, deposit balance, blacklist     |
| `sellers`               | Seller accounts, store info                    |
| `admins`                | Admin login with OTP                           |
| `toy_listings`          | All toy listings, status, pricing              |
| `toy_images`            | Photos linked to listings (up to 5)            |
| `buyer_requests`        | Buyer enquiries to sellers                     |
| `rentals`               | Active/past rentals, return tracking           |
| `deposit_transactions`  | All deposit credits/deductions with reasons    |
| `purchases`             | Completed toy purchases                        |
| `reviews`               | Buyer reviews for sellers                      |

---

## 🔑 Default Admin Login
- **Email:** admin@toybox.com  
- **Password:** Admin@123  
⚠️ Change the password hash in schema.sql before deploying to production!
