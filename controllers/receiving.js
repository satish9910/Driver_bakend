// controllers/receiving.js
import Receiving from '../models/receiving.js';
import Booking from '../models/Booking.js';
import mongoose from 'mongoose';
import Expenses from '../models/expenses.js';
import User from '../models/user.js';
import Transaction from '../models/transectionModel.js';

const numericAllowanceFields = [
    'dailyAllowance',
    'outstationAllowance',
    'earlyStartAllowance',
    'nightAllowance',
    'receivedFromCompany',
    'receivedFromClient',
    'overTime',
    'sundayAllowance',
    'outstationOvernightAllowance',
    'extraDutyAllowance'
];

const coreFields = [
    'dutyStartDate',
    'dutyStartTime',
    'dutyEndDate',
    'dutyEndTime',
    'dutyStartKm',
    'dutyEndKm',
    'dutyType',
    'notes'
];

function toNumber(val, def = 0) {
    if (val === '' || val == null) return def;
    const n = Number(val);
    return Number.isFinite(n) ? n : def;
}

function toDate(val) {
    if (!val) return null;
    const d = (val instanceof Date) ? val : new Date(val);
    return isNaN(d.getTime()) ? null : d;
}

export const upsertReceiving = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { bookingId } = req.body || {};
        if (!bookingId || !mongoose.isValidObjectId(bookingId))
            return res.status(400).json({ message: 'valid bookingId required' });

        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).json({ message: 'Booking not found' });

        // Build update doc
        const update = { userId, bookingId };

        // Core non-numeric fields (some dates)
        coreFields.forEach(f => {
            if (req.body[f] != null) update[f] = req.body[f];
        });

        // Attempt to default from booking if creating new and not supplied (optional)
        if (req.body.useBookingDefaults) {
            if (update.dutyStartDate == null && booking.startDate) update.dutyStartDate = booking.startDate;
            if (update.dutyEndDate == null && booking.endDate) update.dutyEndDate = booking.endDate;
            if (update.dutyType == null && booking.dutyType) update.dutyType = booking.dutyType;
        }

        // Cast date fields
        ['dutyStartDate','dutyEndDate'].forEach(k => {
            if (update[k] != null) {
                const d = toDate(update[k]);
                if (!d) return delete update[k];
                update[k] = d;
            }
        });

        // Numeric allowances
        numericAllowanceFields.forEach(f => {
            if (req.body[f] != null) update[f] = toNumber(req.body[f]);
        });

        // billingItems
        if (req.body.billingItems != null) {
            try {
                const arr = typeof req.body.billingItems === 'string'
                    ? JSON.parse(req.body.billingItems)
                    : req.body.billingItems;
                if (Array.isArray(arr)) {
                    update.billingItems = arr
                        .filter(i => i && i.category && i.amount != null)
                        .map(i => ({
                            category: i.category,
                            amount: toNumber(i.amount),
                            image: i.image || null,
                            note: i.note || ''
                        }));
                }
            } catch {
                return res.status(400).json({ message: 'billingItems invalid JSON' });
            }
        }

        // Compute totalAllowances (since findOneAndUpdate skips save middleware)
        update.totalAllowances = numericAllowanceFields
            .filter(f => !['receivedFromCompany','receivedFromClient'].includes(f)) // exclude receivedFrom... if they should not add
            .reduce((sum, f) => sum + toNumber(update[f] ?? req.body[f]), 0);

        // Validate required fields on create (if record not exists)
        let existing = await Receiving.findOne({ userId, bookingId });
        if (!existing) {
            const requiredOnCreate = [
                'dutyStartDate',
                'dutyStartTime',
                'dutyEndDate',
                'dutyEndTime',
                'dutyStartKm',
                'dutyEndKm',
                'dutyType'
            ];
            const missing = requiredOnCreate.filter(f => update[f] == null);
            if (missing.length) {
                return res.status(400).json({ message: 'Missing required fields', missing });
            }
        }

    const receiving = await Receiving.findOneAndUpdate(
            { userId, bookingId },
            { $set: update },
            { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
        );

        if (!booking.receiving) {
            booking.receiving = receiving._id;
            await booking.save();
        }

        // Compute totals for response
        const receivingBillingSum = (receiving.billingItems || []).reduce((s,i)=> s + (i.amount||0),0);
        const totalReceiving = receivingBillingSum + (receiving.totalAllowances||0) + (receiving.receivedFromCompany||0) + (receiving.receivedFromClient||0);

        // If expense exists perform reconciliation credit/debit (full diff approach)
        let reconciliation = null;
        const expense = await Expenses.findOne({ userId, bookingId });
        if (expense) {
            const expenseBillingSum = (expense.billingItems || []).reduce((s,i)=> s + (i.amount||0),0);
            const totalExpense = expenseBillingSum + (expense.totalAllowances||0);
            const difference = Number((totalExpense - totalReceiving).toFixed(2));
            if (difference !== 0) {
                const user = await User.findById(userId);
                if (user) {
                    if (!user.wallet) user.wallet = { balance: 0 };
                    let txn = null;
                    if (difference > 0) {
                        user.wallet.balance += difference;
                        await user.save();
                        txn = await Transaction.create({
                            userId: user._id,
                            amount: difference,
                            type: 'credit',
                            description: `Auto reconciliation credit (receiving update) booking ${bookingId}`,
                            balanceAfter: user.wallet.balance,
                            category: 'user_wallet'
                        });
                        reconciliation = { action: 'credit', difference, transactionId: txn._id };
                    } else {
                        const debitAmt = Math.abs(difference);
                        if (user.wallet.balance >= debitAmt) {
                            user.wallet.balance -= debitAmt;
                            await user.save();
                            txn = await Transaction.create({
                                userId: user._id,
                                amount: debitAmt,
                                type: 'debit',
                                description: `Auto reconciliation debit (receiving update) booking ${bookingId}`,
                                balanceAfter: user.wallet.balance,
                                category: 'user_wallet'
                            });
                            reconciliation = { action: 'debit', difference, transactionId: txn._id };
                        } else {
                            reconciliation = { action: 'debit_pending', difference, reason: 'Insufficient wallet balance' };
                        }
                    }
                }
            } else {
                reconciliation = { action: 'none', difference: 0 };
            }
        }

        res.json({ message: 'Receiving saved', receiving, totals: { receivingBillingSum, receivingAllowances: receiving.totalAllowances || 0, receivedFromCompany: receiving.receivedFromCompany||0, receivedFromClient: receiving.receivedFromClient||0, totalReceiving }, reconciliation });
    } catch (err) {
        console.error('upsertReceiving error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

export const getReceivingByBooking = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { bookingId } = req.params;
        if (!mongoose.isValidObjectId(bookingId))
            return res.status(400).json({ message: 'Invalid bookingId' });
        const receiving = await Receiving.findOne({ userId, bookingId });
        res.json({ receiving });
    } catch (err) {
        console.error('getReceivingByBooking error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

export default { upsertReceiving, getReceivingByBooking };