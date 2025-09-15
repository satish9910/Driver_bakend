# Money Transfer System - Complete Explanation

## 🎯 Understanding When Money Moves

### 📊 Wallet Balance Meanings
- **Driver wallet: -300** = Driver owes ₹300 to company
- **Driver wallet: +200** = Company owes ₹200 to driver
- **Driver wallet: 0** = Account is balanced

## 💰 Money Transfer Functions Explained

### 1. Company Gives Money to Driver (Advance)
**Function:** `transferMoneyToUser` or `addMoneyToUserWallet`

**When used:** Company gives advance money to driver before trip

**Example:**
```
Before: Driver wallet = 0
Company gives ₹300 advance
After: Driver wallet = -300 (driver now owes ₹300)
```

**API Call:**
```http
POST /api/admin/transfer-money-to-user
{
  "userId": "driver_id",
  "amount": 300,
  "description": "Advance for trip"
}
```

---

### 2. Driver Returns Money to Company
**Function:** `collectMoneyFromDriver`

**When used:** Driver pays back debt to company

**Example:**
```
Before: Driver wallet = -800 (driver owes ₹800)
Driver gives ₹800 cash to company
After: Driver wallet = 0 (debt cleared)
```

**API Call:**
```http
POST /api/admin/collect-money-from-driver
{
  "userId": "driver_id", 
  "amount": 800,
  "description": "Settlement payment"
}
```

---

### 3. Company Pays Driver (Settlement)
**Function:** `deductMoneyFromUserWallet`

**When used:** Company owes money to driver after settlement

**Example:**
```
Before: Driver wallet = +200 (company owes ₹200)
Company gives ₹200 cash to driver
After: Driver wallet = 0 (debt cleared)
```

**API Call:**
```http
POST /api/admin/deduct-money-from-user
{
  "userId": "driver_id",
  "amount": 200, 
  "description": "Settlement payment to driver"
}
```

## 🔄 Complete Settlement Flow Example

### Scenario: Driver Trip Settlement

**Step 1: Initial Advance**
```
Company gives ₹300 advance
API: POST /api/admin/transfer-money-to-user
Result: Driver wallet = -300
```

**Step 2: Driver Does Trip**
```
Trip expenses: ₹1000
Trip receiving: ₹500
Trip settlement: 500 - 1000 = -500
Expected wallet: -300 + (-500) = -800
```

**Step 3: Check Settlement**
```
API: GET /api/admin/booking/:id
Response shows: "Driver gives ₹800 to company"
```

**Step 4: Physical Settlement**
```
Driver comes to office
Driver gives ₹800 cash to company
API: POST /api/admin/collect-money-from-driver
Result: Driver wallet = 0 (settled)
```

## 📱 Real API Response Examples

### When Driver Owes Company
```json
{
  "settlementSummary": {
    "finalWalletBalance": -800,
    "settlementAction": "driver_gives_to_company",
    "actionAmount": 800,
    "actionDescription": "Driver gives ₹800 to company"
  }
}
```
**Action:** Use `collectMoneyFromDriver` API

### When Company Owes Driver
```json
{
  "settlementSummary": {
    "finalWalletBalance": 200,
    "settlementAction": "company_gives_to_driver", 
    "actionAmount": 200,
    "actionDescription": "Company gives ₹200 to driver"
  }
}
```
**Action:** Use `deductMoneyFromUserWallet` API

## 🎯 Business Process Flow

### For Admin/Company:

1. **Give Advance** (before trip)
   ```
   Use: transferMoneyToUser
   Effect: Driver wallet becomes negative (driver owes)
   ```

2. **Check Settlement** (after trip)
   ```
   Use: GET /api/admin/booking/:id
   Shows: Who owes money to whom
   ```

3. **Collect from Driver** (if driver owes)
   ```
   Use: collectMoneyFromDriver
   Physical: Driver gives cash to company
   Effect: Driver wallet increases (less debt)
   ```

4. **Pay to Driver** (if company owes)
   ```
   Use: deductMoneyFromUserWallet
   Physical: Company gives cash to driver
   Effect: Driver wallet decreases (less credit)
   ```

### For Driver:

1. **Receive Advance**
   ```
   Wallet becomes negative
   Meaning: "I owe money to company"
   ```

2. **Do Trip**
   ```
   Fill expense form (what I spent)
   Fill receiving form (what I got from client)
   ```

3. **Check Settlement**
   ```
   Use: GET /api/user/expense-receiving/:bookingId
   Shows: Final amount I need to pay/receive
   ```

4. **Go to Office**
   ```
   If negative: I give money to company
   If positive: Company gives money to me
   ```

## ✅ Summary

- **Negative wallet** = Driver gives money to company
- **Positive wallet** = Company gives money to driver
- **Settlement calculation** = Receiving - Expenses
- **Physical cash exchange** happens in office
- **APIs update wallet** to reflect actual money transfer

This system ensures accurate tracking of all money movements between drivers and company!