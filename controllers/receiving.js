// controllers/receiving.js
// controllers/receiving.js
import Receiving from '../models/receiving.js';
import Booking from '../models/Booking.js';
import DutyInfo from '../models/dutyInfo.js';
import mongoose from 'mongoose';
import Expenses from '../models/expenses.js';

// Updated allowance fields (simplified as requested)
const numericAllowanceFields = [
    'dailyAllowance',
    'outstationAllowance', 
    'nightAllowance'
];

// New receiving fields
const numericReceivingFields = [
    'receivedFromClient',
    'clientAdvanceAmount',
    'clientBonusAmount',
    'incentiveAmount'
];

// All numeric fields combined
const allNumericFields = [...numericAllowanceFields, ...numericReceivingFields];

const coreFields = [
    'notes'
];

function toNumber(val, def = 0) {
    if (val === '' || val == null) return def;
    const n = Number(val);
    return Number.isFinite(n) ? n : def;
}

export const upsertReceiving = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { bookingId } = req.body || {};
        if (!bookingId || !mongoose.isValidObjectId(bookingId))
            return res.status(400).json({ message: 'valid bookingId required' });

        const booking = await Booking.findById(bookingId);
        if (!booking) return res.status(404).json({ message: 'Booking not found' });

        // Check if duty info exists (required)
        const dutyInfo = await DutyInfo.findOne({ userId, bookingId });
        if (!dutyInfo) {
            return res.status(400).json({ 
                message: 'Duty information must be filled first. Please create duty info before filling receiving details.',
                dutyInfoRequired: true
            });
        }

        // Build update doc (only allowances and notes now)
        const update = { userId, bookingId };

        // Core non-numeric fields
        coreFields.forEach(f => {
            if (req.body[f] != null) update[f] = req.body[f];
        });

        // Numeric allowances and receiving fields
        allNumericFields.forEach(f => {
            if (req.body[f] != null) update[f] = toNumber(req.body[f]);
        });

        // Handle billingItems
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

        // Compute totals (allowances + all receiving fields)
        update.totalAllowances = numericAllowanceFields
            .reduce((sum, f) => sum + toNumber(update[f] ?? req.body[f]), 0);
            
        update.totalReceivingAmount = allNumericFields
            .reduce((sum, f) => sum + toNumber(update[f] ?? req.body[f]), 0);

        // Admin tracking if admin is making changes
        if (req.admin) {
            update.lastEditedByAdmin = req.admin.adminId;
            update.lastEditedByRole = req.admin.role;
            update.lastEditedAt = new Date();
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
        const totalReceiving = receivingBillingSum + (receiving.totalReceivingAmount||0);

        // Compute difference with expense for info only
        let reconciliation = null;
        const expense = await Expenses.findOne({ userId, bookingId });
        if (expense) {
            const expenseBillingSum = (expense.billingItems || []).reduce((s,i)=> s + (i.amount||0),0);
            const totalExpense = expenseBillingSum + (expense.totalAllowances||0);
            const difference = Number((totalExpense - totalReceiving).toFixed(2));
            reconciliation = { action: 'none', difference };
        }

        res.json({ 
            message: 'Receiving saved successfully', 
            receiving, 
            dutyInfo: {
                totalKm: dutyInfo.totalKm,
                totalHours: dutyInfo.totalHours,
                totalDays: dutyInfo.totalDays,
                formattedDuration: dutyInfo.formattedDuration,
                dateRange: dutyInfo.dateRange,
                timeRange: dutyInfo.timeRange,
                dutyType: dutyInfo.dutyType
            },
            totals: { 
                receivingBillingSum, 
                receivingAllowances: receiving.totalAllowances || 0,
                receivingAmount: receiving.totalReceivingAmount || 0,
                totalReceiving 
            }, 
            reconciliation 
        });
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
        const dutyInfo = await DutyInfo.findOne({ userId, bookingId });
        
        res.json({ 
            receiving, 
            dutyInfo: dutyInfo ? {
                ...dutyInfo.toObject(),
                calculations: {
                    totalKm: dutyInfo.totalKm,
                    totalHours: dutyInfo.totalHours,
                    totalDays: dutyInfo.totalDays,
                    formattedDuration: dutyInfo.formattedDuration,
                    dateRange: dutyInfo.dateRange,
                    timeRange: dutyInfo.timeRange
                }
            } : null,
            message: dutyInfo ? 'Data retrieved successfully' : 'Duty information not found. Please create duty info first.'
        });
    } catch (err) {
        console.error('getReceivingByBooking error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

export default { upsertReceiving, getReceivingByBooking };