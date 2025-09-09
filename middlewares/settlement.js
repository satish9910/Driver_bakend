// middlewares/settlement.js
import Booking from "../models/Booking.js";

/**
 * Middleware to validate settlement permissions
 */
export const validateSettlementAccess = async (req, res, next) => {
  try {
    const { role } = req.user;
    const { bookingId } = req.params;

    if (!['admin', 'subadmin'].includes(role)) {
      return res.status(403).json({ message: 'Access denied. Admin or subadmin role required.' });
    }

    if (bookingId) {
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        return res.status(404).json({ message: 'Booking not found' });
      }

      // Store booking in request for later use
      req.booking = booking;
    }

    next();
  } catch (error) {
    console.error('Settlement access validation error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Middleware to check if booking can be settled
 */
export const validateSettlementEligibility = async (req, res, next) => {
  try {
    const booking = req.booking;

    if (!booking) {
      return res.status(400).json({ message: 'Booking not found in request context' });
    }

    if (!booking.driver) {
      return res.status(400).json({ message: 'Cannot settle booking without assigned driver' });
    }

    if (booking.settlement && booking.settlement.isSettled) {
      return res.status(400).json({ 
        message: 'Booking already settled',
        settlement: booking.settlement
      });
    }

    // Check if both expense and receiving exist for proper calculation
    if (!booking.primaryExpense && (!booking.expenses || booking.expenses.length === 0)) {
      return res.status(400).json({ 
        message: 'Cannot settle booking without expense records',
        suggestion: 'Add expense records before settlement'
      });
    }

    next();
  } catch (error) {
    console.error('Settlement eligibility validation error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
