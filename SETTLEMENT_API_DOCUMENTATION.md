# Driver Settlement System - Complete API Documentation

## Overview
This settlement system allows admin/subadmin to manage driver settlements based on expense vs receiving calculations with automatic wallet adjustments.

## Authentication
All endpoints require JWT authentication with appropriate role permissions.

---

## Admin/Subadmin Settlement APIs

### 1. Get Settlement Preview
**GET** `/api/admin/booking/:bookingId/settlement-preview`

Preview settlement calculation without processing.

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "success": true,
  "booking": {
    "_id": "booking_id",
    "status": 1,
    "driver": {
      "_id": "driver_id",
      "name": "Driver Name",
      "drivercode": "D001",
      "wallet": { "balance": 5000 }
    },
    "settlement": {
      "isSettled": false
    }
  },
  "calculation": {
    "expenseTotal": 12000,
    "receivingTotal": 10000,
    "difference": 2000,
    "settlementAmount": 2000,
    "expenseBreakdown": {
      "billingSum": 8000,
      "allowancesSum": 4000,
      "totalExpense": 12000
    },
    "receivingBreakdown": {
      "billingSum": 6000,
      "allowancesSum": 3000,
      "receivedFromCompany": 1000,
      "receivedFromClient": 0,
      "totalReceiving": 10000
    }
  },
  "preview": {
    "currentWalletBalance": 5000,
    "settlementAction": "debit",
    "settlementAbsAmount": 2000,
    "projectedWalletBalance": 3000
  }
}
```

### 2. Process Settlement
**POST** `/api/admin/booking/:bookingId/settle`

Execute settlement for a booking.

**Headers:**
```
Authorization: Bearer <admin_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "customSettlementAmount": 1500,  // Optional: override calculated amount
  "adminAdjustments": 100,         // Optional: admin adjustments
  "notes": "Settlement notes",     // Optional: settlement notes
  "markCompleted": true,           // Optional: mark booking as completed
  "forceSettlement": false         // Optional: force settlement even with insufficient balance
}
```

**Response:**
```json
{
  "success": true,
  "message": "Settlement processed successfully",
  "settlement": {
    "status": "completed",
    "amount": 1500,
    "transactionId": "transaction_id"
  },
  "calculation": {
    "expenseTotal": 12000,
    "receivingTotal": 10000,
    "difference": 2000,
    "settlementAmount": 1500
  },
  "booking": {
    "_id": "booking_id",
    "status": 1,
    "settlement": {
      "isSettled": true,
      "settlementAmount": 1500,
      "settledAt": "2025-09-02T10:30:00Z",
      "settledBy": "admin_id",
      "status": "completed"
    }
  },
  "walletUpdate": {
    "previousBalance": 5000,
    "newBalance": 3500
  }
}
```

### 3. Reverse Settlement
**POST** `/api/admin/booking/:bookingId/reverse-settlement`

Reverse a completed settlement (Admin only).

**Headers:**
```
Authorization: Bearer <admin_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "reason": "Settlement error correction"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Settlement reversed successfully",
  "reversalDetails": {
    "originalAmount": 1500,
    "reversedAt": "2025-09-02T11:00:00Z",
    "reason": "Settlement error correction"
  },
  "walletUpdate": {
    "newBalance": 5000
  }
}
```

### 4. Get Driver Settlements
**GET** `/api/admin/driver/:driverId/settlements`

Get settlement history for a specific driver.

**Query Parameters:**
- `status` (optional): Filter by settlement status
- `limit` (optional): Number of results (default: 50)
- `page` (optional): Page number (default: 1)

**Response:**
```json
{
  "success": true,
  "driver": {
    "_id": "driver_id",
    "name": "Driver Name",
    "drivercode": "D001",
    "wallet": { "balance": 3500 }
  },
  "settlements": [
    {
      "_id": "booking_id",
      "settlement": {
        "isSettled": true,
        "settlementAmount": 1500,
        "settledAt": "2025-09-02T10:30:00Z",
        "status": "completed"
      },
      "createdAt": "2025-09-01T09:00:00Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 1,
    "totalSettlements": 1,
    "limit": 50
  },
  "summary": {
    "totalSettledAmount": 1500,
    "currentWalletBalance": 3500
  }
}
```

### 5. Get Pending Settlements
**GET** `/api/admin/settlements/pending`

Get all bookings with pending settlements.

**Response:**
```json
{
  "success": true,
  "pendingSettlements": [
    {
      "booking": {
        "_id": "booking_id",
        "driver": {
          "_id": "driver_id",
          "name": "Driver Name",
          "wallet": { "balance": 2000 }
        },
        "settlement": {
          "isSettled": false,
          "status": "pending"
        },
        "status": 1
      },
      "calculation": {
        "expenseTotal": 8000,
        "receivingTotal": 6000,
        "difference": 2000,
        "settlementAmount": 2000
      },
      "requiresAction": false
    }
  ],
  "count": 1
}
```

### 6. Settlement Dashboard
**GET** `/api/admin/dashboard/settlements`

Comprehensive settlement dashboard data.

**Response:**
```json
{
  "success": true,
  "dashboard": {
    "statistics": {
      "total": 100,
      "completed": 85,
      "pending": 12,
      "reversed": 3,
      "totalAmount": 150000,
      "completedAmount": 142000
    },
    "pendingSettlements": [
      {
        "_id": "booking_id",
        "driver": {
          "name": "Driver Name",
          "wallet": { "balance": 2000 }
        },
        "calculatedSettlement": 2000,
        "canSettle": true,
        "completedAt": "2025-09-02T10:00:00Z"
      }
    ],
    "recentSettlements": [
      {
        "_id": "booking_id",
        "driver": { "name": "Driver Name" },
        "settlement": {
          "settlementAmount": 1500,
          "settledAt": "2025-09-02T10:30:00Z",
          "settledBy": { "name": "Admin User" }
        }
      }
    ],
    "driverWalletSummary": {
      "totalDrivers": 50,
      "totalWalletBalance": 125000,
      "avgWalletBalance": 2500,
      "negativeWallets": 3
    },
    "alerts": {
      "pendingCount": 12,
      "negativeWalletCount": 3,
      "highValuePending": 2
    }
  }
}
```

### 7. Driver Settlement Analytics
**GET** `/api/admin/driver/:driverId/settlement-analytics`

Detailed analytics for a specific driver.

**Response:**
```json
{
  "success": true,
  "driver": {
    "_id": "driver_id",
    "name": "Driver Name",
    "wallet": { "balance": 3500 }
  },
  "analytics": {
    "settlementTrends": [
      {
        "_id": { "year": 2025, "month": 9 },
        "count": 5,
        "totalSettled": 7500,
        "avgSettlement": 1500
      }
    ],
    "recentTransactions": [
      {
        "_id": "txn_id",
        "amount": 1500,
        "type": "debit",
        "description": "Settlement debit for booking...",
        "createdAt": "2025-09-02T10:30:00Z"
      }
    ],
    "bookingStatistics": {
      "totalBookings": 25,
      "completedBookings": 22,
      "settledBookings": 20,
      "totalSettlementAmount": 30000,
      "avgSettlementAmount": 1500
    },
    "currentWalletBalance": 3500
  }
}
```

---

## Driver/User Settlement APIs

### 1. Get My Settlements
**GET** `/api/user/my-settlements`

Get driver's own settlement history.

**Query Parameters:**
- `status` (optional): 'settled' or 'pending'
- `limit` (optional): Number of results (default: 20)
- `page` (optional): Page number (default: 1)

**Headers:**
```
Authorization: Bearer <driver_token>
```

**Response:**
```json
{
  "success": true,
  "settlements": [
    {
      "_id": "booking_id",
      "settlement": {
        "isSettled": true,
        "settlementAmount": 1500,
        "settledAt": "2025-09-02T10:30:00Z",
        "status": "completed"
      },
      "status": 1,
      "calculatedAmount": 1500,
      "bookingReference": "BK001"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 1,
    "totalCount": 1,
    "limit": 20
  },
  "summary": {
    "totalBookings": 25,
    "settledBookings": 20,
    "totalSettledAmount": 30000,
    "pendingSettlements": 3
  }
}
```

### 2. Get Booking Settlement Details
**GET** `/api/user/booking/:bookingId/settlement`

Get detailed settlement breakdown for a specific booking.

**Response:**
```json
{
  "success": true,
  "booking": {
    "_id": "booking_id",
    "status": 1,
    "settlement": {
      "isSettled": true,
      "settlementAmount": 1500,
      "settledAt": "2025-09-02T10:30:00Z"
    }
  },
  "calculation": {
    "expenseTotal": 12000,
    "receivingTotal": 10000,
    "difference": 2000,
    "expenseBreakdown": {
      "billingItems": [
        { "category": "Fuel", "amount": 3000 },
        { "category": "Toll", "amount": 2000 }
      ],
      "billingSum": 8000,
      "allowances": {
        "dailyAllowance": 2000,
        "outstationAllowance": 1500,
        "nightAllowance": 500
      },
      "allowancesSum": 4000,
      "totalExpense": 12000
    },
    "receivingBreakdown": {
      "billingItems": [
        { "category": "Fuel", "amount": 2500 }
      ],
      "billingSum": 6000,
      "allowances": {
        "dailyAllowance": 1500,
        "outstationAllowance": 1000
      },
      "allowancesSum": 3000,
      "receivedFromCompany": 1000,
      "receivedFromClient": 0,
      "totalReceiving": 10000
    }
  },
  "explanation": {
    "message": "You have spent ₹2000 more than received. This amount will be deducted from your wallet."
  }
}
```

### 3. Get Settlement Transactions
**GET** `/api/user/settlement-transactions`

Get wallet transactions related to settlements.

**Query Parameters:**
- `limit` (optional): Number of results (default: 20)
- `page` (optional): Page number (default: 1)

**Response:**
```json
{
  "success": true,
  "transactions": [
    {
      "_id": "txn_id",
      "amount": 1500,
      "type": "debit",
      "description": "Settlement debit for booking...",
      "balanceAfter": 3500,
      "createdAt": "2025-09-02T10:30:00Z",
      "fromAdminId": {
        "name": "Admin User",
        "role": "admin"
      }
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 1,
    "totalCount": 1,
    "limit": 20
  }
}
```

---

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "message": "Booking already settled",
  "settlement": {
    "isSettled": true,
    "settlementAmount": 1500
  }
}
```

### 403 Forbidden
```json
{
  "message": "Access denied. Admin or subadmin role required."
}
```

### 404 Not Found
```json
{
  "message": "Booking not found"
}
```

### 500 Server Error
```json
{
  "message": "Server error",
  "error": "Detailed error message"
}
```

---

## Settlement Calculation Logic

1. **Expense Total** = Sum of billing items + Sum of allowances
2. **Receiving Total** = Sum of billing items + Sum of allowances + Received from company + Received from client
3. **Settlement Amount** = Expense Total - Receiving Total

**Settlement Actions:**
- **Positive amount**: Driver owes money → Debit from wallet
- **Negative amount**: Company owes driver → Credit to wallet  
- **Zero amount**: No adjustment needed

**Wallet Adjustment Rules:**
- Credits are always processed
- Debits require sufficient wallet balance (unless forced)
- Insufficient balance results in "pending" status
- All transactions are logged with admin reference

---

## Database Schema Updates

### Booking Model Settlement Schema
```javascript
settlement: {
  isSettled: Boolean,
  settlementAmount: Number,
  calculatedAmount: Number,
  adminAdjustments: Number,
  notes: String,
  settledAt: Date,
  settledBy: ObjectId (Admin),
  settledByRole: String,
  status: String, // 'pending', 'completed', 'reversed'
  transactionId: ObjectId (Transaction),
  reversedAt: Date,
  reversedBy: ObjectId (Admin),
  reversalReason: String
}
```

This complete system provides:
- ✅ Settlement calculation and processing
- ✅ Wallet integration with transaction logging
- ✅ Admin/subadmin management interfaces
- ✅ Driver settlement history and details
- ✅ Dashboard and analytics
- ✅ Settlement reversal capabilities
- ✅ Comprehensive API documentation
