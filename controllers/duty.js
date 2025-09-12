// controllers/duty.js
import DutyInfo from '../models/dutyInfo.js';
import Booking from '../models/Booking.js';
import mongoose from 'mongoose';

// Helper function to validate duty data
const validateDutyData = (data) => {
  const errors = [];
  
  if (!data.dutyStartDate) errors.push('Duty start date is required');
  if (!data.dutyStartTime) errors.push('Duty start time is required');
  if (!data.dutyEndDate) errors.push('Duty end date is required');
  if (!data.dutyEndTime) errors.push('Duty end time is required');
  if (data.dutyStartKm === undefined || data.dutyStartKm === null) errors.push('Duty start KM is required');
  if (data.dutyEndKm === undefined || data.dutyEndKm === null) errors.push('Duty end KM is required');
  if (!data.dutyType) errors.push('Duty type is required');
  
  // Validate date format
  if (data.dutyStartDate && isNaN(new Date(data.dutyStartDate).getTime())) {
    errors.push('Invalid start date format');
  }
  if (data.dutyEndDate && isNaN(new Date(data.dutyEndDate).getTime())) {
    errors.push('Invalid end date format');
  }
  
  // Validate KM values
  if (data.dutyStartKm !== undefined && (isNaN(data.dutyStartKm) || data.dutyStartKm < 0)) {
    errors.push('Start KM must be a valid positive number');
  }
  if (data.dutyEndKm !== undefined && (isNaN(data.dutyEndKm) || data.dutyEndKm < 0)) {
    errors.push('End KM must be a valid positive number');
  }
  if (data.dutyStartKm !== undefined && data.dutyEndKm !== undefined && data.dutyEndKm < data.dutyStartKm) {
    errors.push('End KM cannot be less than start KM');
  }
  
  return errors;
};

// User: Create or update duty information
export const upsertDutyInfo = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { bookingId, ...dutyData } = req.body;

    // Validation
    if (!bookingId || !mongoose.isValidObjectId(bookingId)) {
      return res.status(400).json({ message: 'Valid bookingId is required' });
    }

    // Verify booking exists and user has access
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Check if user is the driver for this booking
    if (booking.driver && booking.driver.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Not authorized to manage duty info for this booking' });
    }

    // Validate duty data
    const validationErrors = validateDutyData(dutyData);
    if (validationErrors.length > 0) {
      return res.status(400).json({ message: 'Validation failed', errors: validationErrors });
    }

    // Prepare duty info data
    const updateData = {
      userId,
      bookingId,
      ...dutyData,
      dutyStartDate: new Date(dutyData.dutyStartDate),
      dutyEndDate: new Date(dutyData.dutyEndDate),
      dutyStartKm: Number(dutyData.dutyStartKm),
      dutyEndKm: Number(dutyData.dutyEndKm),
      createdByRole: 'user'
    };

    // Upsert duty info
    const dutyInfo = await DutyInfo.findOneAndUpdate(
      { userId, bookingId },
      { $set: updateData },
      { 
        new: true, 
        upsert: true, 
        setDefaultsOnInsert: true, 
        runValidators: true 
      }
    );

    res.status(200).json({
      message: 'Duty information saved successfully',
      dutyInfo,
      calculations: {
        totalKm: dutyInfo.totalKm,
        totalHours: dutyInfo.totalHours,
        totalDays: dutyInfo.totalDays,
        formattedDuration: dutyInfo.formattedDuration,
        dateRange: dutyInfo.dateRange,
        timeRange: dutyInfo.timeRange
      }
    });

  } catch (error) {
    console.error('Error creating/updating duty info:', error);
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Duty information already exists for this booking' });
    }
    res.status(500).json({ error: 'Server error' });
  }
};

// User: Get duty information by booking ID
export const getDutyInfoByBooking = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { bookingId } = req.params;

    if (!mongoose.isValidObjectId(bookingId)) {
      return res.status(400).json({ message: 'Invalid bookingId' });
    }

    const dutyInfo = await DutyInfo.findOne({ userId, bookingId })
      .populate('bookingId', 'bookingNumber startDate endDate dutyType')
      .populate('userId', 'name email mobile');

    if (!dutyInfo) {
      return res.status(404).json({ message: 'Duty information not found' });
    }

    res.json({
      dutyInfo,
      calculations: {
        totalKm: dutyInfo.totalKm,
        totalHours: dutyInfo.totalHours,
        totalDays: dutyInfo.totalDays,
        formattedDuration: dutyInfo.formattedDuration,
        dateRange: dutyInfo.dateRange,
        timeRange: dutyInfo.timeRange
      }
    });

  } catch (error) {
    console.error('Error fetching duty info:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// User: Get all duty information for current user
export const getUserDutyInfo = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { limit = 20, page = 1 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const dutyInfoList = await DutyInfo.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('bookingId', 'bookingNumber startDate endDate dutyType')
      .populate('userId', 'name email mobile');

    const totalCount = await DutyInfo.countDocuments({ userId });

    res.json({
      dutyInfoList,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalItems: totalCount,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching user duty info:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Admin: Get all duty information (with filters)
export const getAllDutyInfo = async (req, res) => {
  try {
    const { limit = 20, page = 1, userId, bookingId, dutyType } = req.query;
    
    // Build query
    const query = {};
    if (userId && mongoose.isValidObjectId(userId)) query.userId = userId;
    if (bookingId && mongoose.isValidObjectId(bookingId)) query.bookingId = bookingId;
    if (dutyType) query.dutyType = dutyType;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const dutyInfoList = await DutyInfo.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('bookingId', 'bookingNumber startDate endDate dutyType')
      .populate('userId', 'name email mobile')
      .populate('createdByAdmin', 'name email')
      .populate('lastEditedByAdmin', 'name email');

    const totalCount = await DutyInfo.countDocuments(query);

    res.json({
      dutyInfoList,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalItems: totalCount,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching all duty info:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Admin: Update duty information
export const adminUpdateDutyInfo = async (req, res) => {
  try {
    const adminId = req.admin.adminId;
    const adminRole = req.admin.role;
    const { dutyInfoId } = req.params;
    const updateData = req.body;

    if (!mongoose.isValidObjectId(dutyInfoId)) {
      return res.status(400).json({ message: 'Invalid duty info ID' });
    }

    // Find duty info
    const dutyInfo = await DutyInfo.findById(dutyInfoId);
    if (!dutyInfo) {
      return res.status(404).json({ message: 'Duty information not found' });
    }

    // Validate update data if provided
    if (Object.keys(updateData).length > 0) {
      const validationErrors = validateDutyData({ ...dutyInfo.toObject(), ...updateData });
      if (validationErrors.length > 0) {
        return res.status(400).json({ message: 'Validation failed', errors: validationErrors });
      }
    }

    // Prepare update with admin tracking
    const update = {
      ...updateData,
      lastEditedByAdmin: adminId,
      lastEditedByRole: adminRole,
      lastEditedAt: new Date()
    };

    // Handle date conversions if provided
    if (updateData.dutyStartDate) update.dutyStartDate = new Date(updateData.dutyStartDate);
    if (updateData.dutyEndDate) update.dutyEndDate = new Date(updateData.dutyEndDate);
    if (updateData.dutyStartKm !== undefined) update.dutyStartKm = Number(updateData.dutyStartKm);
    if (updateData.dutyEndKm !== undefined) update.dutyEndKm = Number(updateData.dutyEndKm);

    // Update duty info
    const updatedDutyInfo = await DutyInfo.findByIdAndUpdate(
      dutyInfoId,
      { $set: update },
      { new: true, runValidators: true }
    ).populate('bookingId', 'bookingNumber startDate endDate dutyType')
     .populate('userId', 'name email mobile');

    res.json({
      message: 'Duty information updated successfully',
      dutyInfo: updatedDutyInfo,
      calculations: {
        totalKm: updatedDutyInfo.totalKm,
        totalHours: updatedDutyInfo.totalHours,
        totalDays: updatedDutyInfo.totalDays,
        formattedDuration: updatedDutyInfo.formattedDuration,
        dateRange: updatedDutyInfo.dateRange,
        timeRange: updatedDutyInfo.timeRange
      }
    });

  } catch (error) {
    console.error('Error updating duty info (admin):', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Admin: Delete duty information
export const adminDeleteDutyInfo = async (req, res) => {
  try {
    const { dutyInfoId } = req.params;

    if (!mongoose.isValidObjectId(dutyInfoId)) {
      return res.status(400).json({ message: 'Invalid duty info ID' });
    }

    const dutyInfo = await DutyInfo.findByIdAndDelete(dutyInfoId);
    if (!dutyInfo) {
      return res.status(404).json({ message: 'Duty information not found' });
    }

    res.json({
      message: 'Duty information deleted successfully',
      deletedDutyInfo: dutyInfo
    });

  } catch (error) {
    console.error('Error deleting duty info (admin):', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get duty info by ID (both user and admin can use)
export const getDutyInfoById = async (req, res) => {
  try {
    const { dutyInfoId } = req.params;

    if (!mongoose.isValidObjectId(dutyInfoId)) {
      return res.status(400).json({ message: 'Invalid duty info ID' });
    }

    const dutyInfo = await DutyInfo.findById(dutyInfoId)
      .populate('bookingId', 'bookingNumber startDate endDate dutyType')
      .populate('userId', 'name email mobile')
      .populate('createdByAdmin', 'name email')
      .populate('lastEditedByAdmin', 'name email');

    if (!dutyInfo) {
      return res.status(404).json({ message: 'Duty information not found' });
    }

    // Check access permissions
    if (req.user && req.user.userId.toString() !== dutyInfo.userId._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to view this duty information' });
    }

    res.json({
      dutyInfo,
      calculations: {
        totalKm: dutyInfo.totalKm,
        totalHours: dutyInfo.totalHours,
        totalDays: dutyInfo.totalDays,
        formattedDuration: dutyInfo.formattedDuration,
        dateRange: dutyInfo.dateRange,
        timeRange: dutyInfo.timeRange
      }
    });

  } catch (error) {
    console.error('Error fetching duty info by ID:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export default {
  // User endpoints
  upsertDutyInfo,
  getDutyInfoByBooking,
  getUserDutyInfo,
  getDutyInfoById,
  
  // Admin endpoints
  getAllDutyInfo,
  adminUpdateDutyInfo,
  adminDeleteDutyInfo
};